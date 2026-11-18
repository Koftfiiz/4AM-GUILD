(() => {
  let rounds = [];
  let portfolios = [];
  let submissions = [];
  let requests = [];
  let editPermissions = [];
  let patchRoster = [];
  let selectedRoundId = "";
  let showArchivedRounds = false;
  let busy = false;

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const management = () => typeof isManagement === "function" && isManagement();
  const memberName = (id) => {
    const member = (allMembers || []).find(m => m.user_id === id);
    return member && typeof getMemberName === "function" ? getMemberName(member) : (member?.character_name || id);
  };
  const dateLabel = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return String(date.getDate()).padStart(2,"0") + "/" +
      String(date.getMonth()+1).padStart(2,"0") + "/" +
      date.getFullYear() + " " +
      String(date.getHours()).padStart(2,"0") + ":" +
      String(date.getMinutes()).padStart(2,"0");
  };
  const parseRoundDateTime = (value,label) => {
    const match = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!match) throw new Error("กรุณาระบุ" + label + "ในรูปแบบ dd/mm/yyyy HH:mm");
    const [,d,m,y,h,min] = match;
    const date = new Date(Number(y),Number(m)-1,Number(d),Number(h),Number(min),0,0);
    if (date.getFullYear()!==Number(y) || date.getMonth()!==Number(m)-1 ||
        date.getDate()!==Number(d) || date.getHours()!==Number(h) || date.getMinutes()!==Number(min)) {
      throw new Error("วันที่หรือเวลา" + label + "ไม่ถูกต้อง");
    }
    return date;
  };
  const isRoundEditable = (round) => round && round.status === "open" &&
    Date.now() >= new Date(round.starts_at).getTime() &&
    Date.now() <= new Date(round.closes_at).getTime();

  function ensureRoot() {
    const page = $("page-portfolio");
    if (!page) return null;
    let root = $("portfolio-tracker-root");
    if (root) return root;
    root = document.createElement("section");
    root.id = "portfolio-tracker-root";
    root.className = "portfolio-tracker-root";
    const intro = page.querySelector(".page-intro");
    if (intro) intro.insertAdjacentElement("afterend", root);
    else page.prepend(root);
    return root;
  }

  function injectStyles() {
    if ($("portfolio-tracker-styles")) return;
    const style = document.createElement("style");
    style.id = "portfolio-tracker-styles";
    style.textContent = [
      ".portfolio-tracker-root{display:grid;gap:18px;margin:0 0 22px;color:#f4f4f5}",
      ".portfolio-tracker-panel{padding:20px;border:1px solid rgba(232,51,63,.24);border-radius:14px;background:linear-gradient(145deg,rgba(25,12,16,.97),rgba(8,7,9,.99))}",
      ".portfolio-tracker-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px}",
      ".portfolio-tracker-heading h3{margin:4px 0;color:#fff;font-size:19px}",
      ".portfolio-tracker-heading p,.portfolio-tracker-muted{margin:4px 0;color:#aaa;font-size:15px;line-height:1.55}",
      ".portfolio-tracker-form{display:grid;grid-template-columns:minmax(180px,1.4fr) repeat(2,minmax(150px,1fr)) auto;gap:10px;align-items:end}",
      ".portfolio-tracker-form label{display:grid;gap:7px;color:#ccc;font-size:15px}",
      ".portfolio-tracker-form input{width:100%;min-width:0;min-height:43px;padding:9px 11px;border:1px solid rgba(232,51,63,.45);border-radius:8px;background:#10090c;color:#fff;color-scheme:dark;font-size:15px}",
      ".portfolio-tracker-round-list{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}",
      ".portfolio-tracker-round{padding:10px 13px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:rgba(255,255,255,.025);color:#eee;cursor:pointer;font-size:15px}",
      ".portfolio-tracker-round.is-active{border-color:#e8333f;background:rgba(232,51,63,.13);color:#fff}",
      ".portfolio-tracker-round.is-archived{opacity:.82;border-style:dashed}",
      ".portfolio-tracker-round-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0 14px}",
      ".portfolio-tracker-danger{border-color:rgba(232,51,63,.55)!important;color:#ff9da5!important}",
      ".portfolio-tracker-archived-label{display:inline-block;margin-left:6px;color:#ff9da5;font-size:15px}",
      ".portfolio-tracker-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}",
      ".portfolio-tracker-stat{padding:14px;border:1px solid rgba(232,51,63,.2);border-radius:10px;background:rgba(255,255,255,.025)}",
      ".portfolio-tracker-stat strong{display:block;font-size:25px;color:#fff}",
      ".portfolio-tracker-stat span{color:#bbb;font-size:15px}",
      ".portfolio-tracker-table-wrap{overflow-x:auto}",
      ".portfolio-tracker-table{width:100%;min-width:780px;border-collapse:collapse}",
      ".portfolio-tracker-table th,.portfolio-tracker-table td{padding:12px 10px;border-bottom:1px solid rgba(255,255,255,.09);text-align:left;vertical-align:middle;font-size:15px}",
      ".portfolio-tracker-table th{color:#f08a92;font-weight:800;white-space:nowrap}",
      ".portfolio-tracker-pill{display:inline-flex;align-items:center;padding:5px 9px;border-radius:30px;font-size:15px;font-weight:700;white-space:nowrap}",
      ".portfolio-tracker-pill.is-complete{color:#9ce6bd;background:rgba(62,170,120,.12);border:1px solid rgba(62,170,120,.32)}",
      ".portfolio-tracker-pill.is-partial{color:#ffb1b8;background:rgba(232,51,63,.1);border:1px solid rgba(232,51,63,.3)}",
      ".portfolio-tracker-pill.is-empty{color:#bbb;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.12)}",
      ".portfolio-tracker-detail{display:grid;gap:10px;margin-top:14px}",
      ".portfolio-tracker-detail-item{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(255,255,255,.025)}",
      ".portfolio-tracker-own{display:grid;gap:12px}",
      ".portfolio-tracker-own-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}",
      ".portfolio-tracker-own-card{padding:14px;border:1px solid rgba(232,51,63,.2);border-radius:10px;background:rgba(255,255,255,.025)}",
      ".portfolio-tracker-own-card strong{display:block;font-size:20px;color:#fff}",
      ".portfolio-tracker-own-card span{display:block;margin-top:5px;color:#bbb;font-size:15px}",
      ".portfolio-tracker-note{padding:13px;border-left:3px solid #e8333f;border-radius:7px;background:rgba(232,51,63,.07);color:#ddd;font-size:15px;line-height:1.6}",
      ".portfolio-tracker-request{display:grid;gap:9px;padding:13px;border:1px solid rgba(232,51,63,.28);border-radius:10px;background:rgba(232,51,63,.055)}",
      ".portfolio-tracker-request p{margin:0;color:#bbb;font-size:15px;line-height:1.5}",
      ".portfolio-tracker-request textarea{width:100%;min-height:76px;padding:10px;border:1px solid rgba(232,51,63,.35);border-radius:8px;background:#10090c;color:#fff;font-size:15px}",
      ".portfolio-tracker-actions{display:flex;gap:8px;flex-wrap:wrap}",
      ".portfolio-tracker-submit-list{display:grid;gap:10px}",
      ".portfolio-tracker-submit-row{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;padding:14px;border:1px solid rgba(232,51,63,.22);border-radius:10px;background:rgba(255,255,255,.025)}",
      ".portfolio-tracker-submit-info{display:grid;gap:5px;min-width:180px;flex:1}",
      ".portfolio-tracker-submit-info p{margin:0;color:#aaa;font-size:15px}",
      ".portfolio-tracker-submit-controls{display:flex;align-items:end;gap:8px;flex-wrap:wrap}",
      ".portfolio-tracker-submit-controls label{display:grid;gap:6px;color:#ccc;font-size:15px}",
      ".portfolio-tracker-submit-controls select{min-width:190px;max-width:100%;min-height:40px;padding:8px 10px;border:1px solid rgba(232,51,63,.4);border-radius:8px;background:#10090c;color:#fff;font-size:15px}",
      ".portfolio-tracker-empty{padding:20px;border:1px dashed rgba(255,255,255,.16);border-radius:9px;color:#aaa;text-align:center;font-size:15px}",
      "@media(max-width:760px){.portfolio-tracker-form{grid-template-columns:1fr 1fr}.portfolio-tracker-form label:first-child{grid-column:1/-1}.portfolio-tracker-form button{grid-column:1/-1}.portfolio-tracker-own-grid{grid-template-columns:1fr}.portfolio-tracker-stats{grid-template-columns:1fr 1fr}}"
    ].join("");
    document.head.appendChild(style);
  }

  async function loadData() {
    const [roundResult, portfolioResult, requestResult, permissionResult, submissionResult] = await Promise.all([
      supabaseClient.from("portfolio_update_rounds").select("*").order("created_at",{ascending:false}),
      supabaseClient.from("portfolios").select(
        "id,member_id,title,game_class,portfolio_type,created_at,updated_at," +
        "portfolio_versions(id,version_number,version_name,round_id,patch_label,created_at," +
        "portfolio_version_images(id,section_key,image_url,sort_order))"
      ).order("created_at",{ascending:false}),
      supabaseClient.from("portfolio_update_edit_requests").select("*").order("created_at",{ascending:false}),
      supabaseClient.from("portfolio_update_edit_permissions").select("*").eq("member_id",currentUser.id),
      supabaseClient.from("portfolio_patch_submissions").select("id,round_id,portfolio_id,version_id,member_id,submitted_at,updated_at").order("submitted_at",{ascending:false})
    ]);
    const failure = [roundResult,portfolioResult,requestResult,permissionResult,submissionResult].find(result => result.error);
    if (failure) throw failure.error;
    rounds = roundResult.data || [];
    requests = requestResult.data || [];
    editPermissions = permissionResult.data || [];
    submissions = submissionResult.data || [];
    portfolios = (portfolioResult.data || []).map(portfolio => ({
      ...portfolio,
      portfolio_versions: (portfolio.portfolio_versions || []).map(version => ({
        ...version,
        portfolio_version_images: version.portfolio_version_images || []
      }))
    }));
    if (!selectedRoundId || !rounds.some(round => round.id === selectedRoundId)) {
      const preferred = rounds.find(round => !round.archived_at) || rounds[0];
      selectedRoundId = preferred?.id || "";
      showArchivedRounds = !!preferred?.archived_at;
    }
    await loadRosterForRound(selectedRoundId);
  }

  async function loadRosterForRound(roundId) {
    if (!roundId) { patchRoster = []; return; }
    const {data,error}=await supabaseClient.from("portfolio_patch_roster")
      .select("round_id,member_id,character_name,game_class,nickname,discord_name,roster_source")
      .eq("round_id",roundId).order("character_name").limit(100);
    if(error)throw error;
    patchRoster=data||[];
  }

  function submissionForFolder(portfolioId, roundId) {
    return submissions.find(item => item.portfolio_id === portfolioId && item.round_id === roundId) || null;
  }

  function roundStats(roundId) {
    const members = patchRoster.filter(row=>row.round_id===roundId).map(row=>({
      user_id:row.member_id,character_name:row.character_name,game_class:row.game_class,
      nickname:row.nickname,discord_name:row.discord_name,active:true,roster_source:row.roster_source
    }));
    let completeMembers = 0;
    const detail = members.map(member => {
      const own = portfolios.filter(portfolio => portfolio.member_id === member.user_id);
      const submitted = own.filter(portfolio => !!submissionForFolder(portfolio.id, roundId));
      const missing = own.filter(portfolio => !submissionForFolder(portfolio.id, roundId))
        .map(portfolio => portfolio.title || "แฟ้มไม่มีชื่อ");
      const isComplete = own.length > 0 && submitted.length === own.length;
      if (isComplete) completeMembers++;
      return {
        member, portfolios: own, submitted: submitted.length, total: own.length,
        missing, status: isComplete ? "complete" : (submitted.length ? "partial" : "empty")
      };
    });
    const totalFolders = detail.reduce((sum,row)=>sum+row.total,0);
    const submittedFolders = detail.reduce((sum,row)=>sum+row.submitted,0);
    return {
      detail, complete:completeMembers, total:members.length,
      incomplete:members.length-completeMembers,
      totalFolders, submittedFolders,
      pendingFolders:totalFolders-submittedFolders
    };
  }

  function pill(status,label) {
    const labels = {complete:"อัปเดตครบแล้ว",partial:"ยังไม่ครบ",empty:"ยังไม่ได้อัปเดต"};
    return '<span class="portfolio-tracker-pill is-' + status + '">' + esc(label || labels[status]) + '</span>';
  }

  function progressCell(item,noneLabel) {
    if (item.total === 0) return pill("empty",noneLabel || "ไม่มี Build");
    const status = item.updated === item.total ? "complete" : item.updated ? "partial" : "empty";
    return pill(status,item.updated + "/" + item.total + " รายการ");
  }

  function openMemberPortfolio(memberId) {
    if (!memberId) return;
    currentPortfolioMemberId = memberId;
    portfolioClassFilter = "all";
    portfolioManageMode = false;
    openGuildPage("portfolio");
    void renderPortfolios();
  }

  function render() {
    const root = ensureRoot();
    if (!root) return;
    injectStyles();

    const selected = rounds.find(round => round.id === selectedRoundId);
    const visibleRounds = rounds.filter(round => showArchivedRounds ? !!round.archived_at : !round.archived_at);
    const stats = selected ? roundStats(selected.id) : null;
    const rosterOwnRow = stats ? stats.detail.find(row => row.member.user_id === currentUser?.id) : null;
    const ownFolders = selected ? portfolios.filter(portfolio=>portfolio.member_id===currentUser?.id) : [];
    const ownRow = rosterOwnRow || (selected && currentUser ? {
      member:{user_id:currentUser.id},portfolios:ownFolders,total:ownFolders.length,
      submitted:ownFolders.filter(portfolio=>!!submissionForFolder(portfolio.id,selected.id)).length
    } : null);
    const memberInRoster = !!selected && patchRoster.some(row=>row.round_id===selected.id&&row.member_id===currentUser?.id);
    const rosterSnapshotReady = !!selected?.roster_snapshot_at;
    const canSubmitForRoster = !rosterSnapshotReady || memberInRoster;
    const ownPermission = selected ? editPermissions.find(permission =>
      permission.round_id === selected.id && new Date(permission.expires_at).getTime() > Date.now()
    ) : null;
    const editable = !!selected && !selected.archived_at && (isRoundEditable(selected) || !!ownPermission);
    const canRequestLate = !!selected && !selected.archived_at && !editable &&
      (selected.status === "closed" || Date.now() > new Date(selected.closes_at).getTime());
    const pendingRequest = selected ? requests.find(request =>
      request.round_id === selected.id && request.member_id === currentUser?.id && request.status === "pending"
    ) : null;

    const managementPanel = management()
      ? '<section class="portfolio-tracker-panel">' +
        '<div class="portfolio-tracker-heading"><div><span class="panel-kicker">PORTFOLIO SCHEDULE</span><h3>จัดการรอบส่งแฟ้มผลงาน</h3><p>กำหนดช่วงเปิดรับและติดตามรายการ Version ที่สมาชิกเลือกส่ง</p></div>' +
        '<span class="portfolio-tracker-pill is-complete">Management</span></div>' +
        '<form id="pt-create-round" class="portfolio-tracker-form">' +
        '<label>ชื่อ Patch / รอบ<input name="round_name" maxlength="120" required placeholder="เช่น Patch 2.1.1 (เดือนพฤศจิกายน)"></label>' +
        '<label>วันและเวลาเริ่ม<input name="starts_at" type="text" data-activity-datetime-input readonly autocomplete="off" placeholder="dd/mm/yyyy HH:mm" required></label>' +
        '<label>วันและเวลาปิดรับ<input name="closes_at" type="text" data-activity-datetime-input readonly autocomplete="off" placeholder="dd/mm/yyyy HH:mm" required></label>' +
        '<button class="btn btn-primary" type="submit">＋ สร้างรอบใหม่</button></form>' +
        '<p class="portfolio-tracker-muted">สมาชิกสร้างและเพิ่ม Version ในแฟ้มได้ตลอดเวลา การส่ง Patch เป็นขั้นตอนแยกต่างหาก โดยเลือก Version ที่ต้องการส่งเอง</p></section>'
      : "";

    const roundButtons = visibleRounds.map(round =>
      '<button type="button" class="portfolio-tracker-round ' +
      (round.id === selectedRoundId ? "is-active" : "") +
      (round.archived_at ? " is-archived" : "") +
      '" data-pt-round="' + esc(round.id) + '">' + esc(round.round_name) + ' · ' +
      (round.archived_at ? "เก็บเข้าคลัง" : (round.status === "open" ? "เปิดรับ" : "ปิดรับ")) +
      '</button>'
    ).join("");

    const managementStats = management() && stats ? (
      '<div class="portfolio-tracker-stats">' +
      '<div class="portfolio-tracker-stat"><strong>' + stats.total + '</strong><span>สมาชิกทั้งหมด</span></div>' +
      '<div class="portfolio-tracker-stat"><strong>' + stats.submittedFolders + '/' + stats.totalFolders + '</strong><span>แฟ้มที่ส่งแล้ว</span></div>' +
      '<div class="portfolio-tracker-stat"><strong>' + stats.pendingFolders + '</strong><span>แฟ้มที่ยังไม่ส่ง</span></div></div>' +
      '<div class="portfolio-tracker-table-wrap"><table class="portfolio-tracker-table"><thead><tr><th>สมาชิก</th><th>แฟ้มทั้งหมด</th><th>ส่งแล้ว</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>' +
      stats.detail.map(row =>
        '<tr><td><strong>' + esc(memberName(row.member.user_id)) + '</strong></td>' +
        '<td>' + row.total + '</td><td>' + row.submitted + '/' + row.total + '</td>' +
        '<td>' + pill(row.status, row.total === 0 ? "ยังไม่มีแฟ้ม" : row.submitted + "/" + row.total + " แฟ้ม") + '</td>' +
        '<td><button class="btn btn-outline btn-sm" type="button" data-pt-member="' + esc(row.member.user_id) + '">ดูรายละเอียด</button></td></tr>'
      ).join("") +
      '</tbody></table></div><div id="pt-member-detail" class="portfolio-tracker-detail"></div>'
    ) : "";

    const requestQueue = management() && selected ? (
      '<h4 style="margin:22px 0 10px;color:#f08a92">คำขอส่ง Patch ล่าช้า</h4><div class="portfolio-tracker-requests">' +
      (requests.filter(request => request.round_id === selected.id && request.status === "pending").map(request =>
        '<div class="portfolio-tracker-request"><strong>' + esc(memberName(request.member_id)) + '</strong><p>' +
        esc(request.reason) + '</p><div class="portfolio-tracker-actions">' +
        '<button class="btn btn-primary btn-sm" type="button" data-pt-approve-request="' + esc(request.id) + '">อนุมัติ 24 ชั่วโมง</button>' +
        '<button class="btn btn-outline btn-sm" type="button" data-pt-reject-request="' + esc(request.id) + '">ปฏิเสธ</button>' +
        '</div></div>'
      ).join("") || '<p class="portfolio-tracker-muted">ไม่มีคำขอที่รออนุมัติ</p>') + '</div>'
    ) : "";

    const ownFoldersHtml = ownRow && ownRow.portfolios.length
      ? '<div class="portfolio-tracker-submit-list">' + ownRow.portfolios.map(portfolio => {
          const versions = [...(portfolio.portfolio_versions || [])].sort((a,b) => Number(b.version_number) - Number(a.version_number));
          const submission = submissionForFolder(portfolio.id, selected.id);
          const selectedVersionId = submission?.version_id || versions[0]?.id || "";
          const chosen = versions.find(version => version.id === submission?.version_id);
          const statusHtml = submission
            ? '<span class="portfolio-tracker-pill is-complete">ส่งแล้ว · Version ' + esc(chosen?.version_number ?? "—") + (chosen?.version_name && chosen.version_name !== ("Version " + chosen.version_number) ? ' · ' + esc(chosen.version_name) : '') + '</span>' +
              '<p class="portfolio-tracker-muted">ส่งครั้งแรก ' + esc(dateLabel(submission.submitted_at)) +
              (submission.updated_at && submission.updated_at !== submission.submitted_at ? ' · เปลี่ยนรายการล่าสุด ' + esc(dateLabel(submission.updated_at)) : '') + '</p>'
            : '<span class="portfolio-tracker-pill is-empty">ยังไม่ได้ส่ง</span>';
          const options = versions.map(version =>
            '<option value="' + esc(version.id) + '" ' + (version.id === selectedVersionId ? "selected" : "") + '>' +
            'Version ' + esc(version.version_number) + (version.version_name && version.version_name !== ("Version " + version.version_number) ? ' · ' + esc(version.version_name) : '') + ' · ' + esc(dateLabel(version.created_at)) + '</option>'
          ).join("") || '<option value="">ยังไม่มี Version</option>';
          return '<div class="portfolio-tracker-submit-row"><div class="portfolio-tracker-submit-info">' +
            '<strong>' + esc(portfolio.title || "แฟ้มไม่มีชื่อ") + '</strong><p>' +
            esc(portfolio.game_class || "ไม่ระบุคลาส") + ' · ' + esc(portfolio.portfolio_type || "Portfolio") + '</p>' +
            statusHtml + '</div><div class="portfolio-tracker-submit-controls">' +
            '<label>เลือก Version<select data-pt-version-select="' + esc(portfolio.id) + '" ' +
            (!editable || !canSubmitForRoster || !versions.length ? "disabled" : "") + '>' + options + '</select></label>' +
            '<button type="button" class="btn btn-primary btn-sm" data-pt-submit="' + esc(portfolio.id) + '" ' +
            (!editable || !canSubmitForRoster || !versions.length ? "disabled" : "") + '>' +
            (!canSubmitForRoster ? "ไม่อยู่ใน Roster 4AM" : submission ? "เปลี่ยนเวอร์ชันที่ส่ง" : "ส่งเวอร์ชันนี้เข้าระบบ") + '</button></div></div>';
        }).join("") + '</div>'
      : '<div class="portfolio-tracker-empty">คุณยังไม่มีแฟ้ม Portfolio สามารถสร้างแฟ้มและ Version ได้ทุกเวลา แล้วกลับมาเลือกส่งเข้ารอบนี้ได้</div>';

    const latePermissionNote = ownPermission && !isRoundEditable(selected)
      ? '<div class="portfolio-tracker-note">คุณได้รับอนุญาตให้ส่งหรือเปลี่ยน Version ในรอบนี้ถึง ' + esc(dateLabel(ownPermission.expires_at)) + '</div>'
      : "";
    const rosterEligibilityNote = selected && rosterSnapshotReady && !memberInRoster
      ? '<div class="portfolio-tracker-note">รอบนี้ใช้ 4AM Patch Roster และบัญชีของคุณไม่ได้อยู่ในรายชื่อ Snapshot จึงไม่สามารถส่ง Version ในรอบนี้ได้</div>'
      : "";
    const lateRequestPanel = !editable && canRequestLate
      ? '<div class="portfolio-tracker-request"><strong>รอบนี้ปิดรับการส่งแล้ว</strong>' +
        '<p class="portfolio-tracker-muted">หากต้องการส่งหรือเปลี่ยน Version หลังปิดรอบ สามารถส่งคำขอให้ Management อนุมัติสิทธิ์ได้</p>' +
        (pendingRequest
          ? '<span class="portfolio-tracker-pill is-partial">ส่งคำขอแล้ว · รออนุมัติ</span>'
          : '<form id="pt-edit-request"><textarea name="reason" maxlength="1000" required placeholder="ระบุเหตุผลที่ต้องการส่ง Patch ล่าช้า..."></textarea><button class="btn btn-outline btn-sm" type="submit">ส่งคำขออนุญาตส่งล่าช้า</button></form>') +
        '</div>'
      : "";
    const archivedNote = selected && selected.archived_at
      ? '<div class="portfolio-tracker-note">รอบนี้ถูกเก็บเข้าคลังแล้ว จึงไม่สามารถส่งหรือเปลี่ยน Version ได้</div>'
      : "";

    const selectedRoundHtml = selected
      ? '<div class="portfolio-tracker-heading"><div><strong>' + esc(selected.round_name) + '</strong><p>เริ่ม ' +
        dateLabel(selected.starts_at) + ' · ปิดรับ ' + dateLabel(selected.closes_at) + '</p></div>' +
        (management()
          ? '<div class="portfolio-tracker-actions"><button id="pt-toggle-round" class="btn btn-outline btn-sm" type="button" ' +
            (selected.archived_at ? "disabled" : "") + '>' +
            (selected.status === "open" ? "ปิดรอบรับส่ง" : "เปิดรอบอีกครั้ง") + '</button>' +
            (selected.archived_at
              ? '<button id="pt-restore-round" class="btn btn-outline btn-sm" type="button">กู้คืนรอบ</button>'
              : '<button id="pt-archive-round" class="btn btn-outline btn-sm" type="button">เก็บเข้าคลัง</button>') +
            '</div>'
          : "") +
        '</div>' + managementStats + requestQueue +
        '<div class="portfolio-tracker-own"><h4>แฟ้ม Portfolio ของคุณในรอบนี้</h4>' +
        ownFoldersHtml + latePermissionNote + rosterEligibilityNote +
        '<div><button type="button" class="btn btn-outline" data-pt-open-portfolio="' + esc(currentUser?.id || "") + '">ไปยังแฟ้ม Portfolio</button></div>' +
        lateRequestPanel + archivedNote + '</div>'
      : '<div class="portfolio-tracker-empty">เลือกหรือสร้างรอบ Patch เพื่อดูสถานะการส่งผลงาน</div>';

    root.innerHTML = managementPanel +
      '<section class="portfolio-tracker-panel">' +
      '<div class="portfolio-tracker-heading"><div><span class="panel-kicker">SUBMISSION TRACKER</span>' +
      '<h3>ติดตามการส่งแฟ้มเข้ารอบตรวจ</h3>' +
      '<p>หนึ่งแฟ้มส่งได้หนึ่ง Version ต่อรอบ และเปลี่ยน Version ที่เลือกได้ก่อนปิดรับหรือภายในเวลาที่ได้รับอนุญาต</p></div>' +
      '<button id="pt-refresh" class="btn btn-outline btn-sm" type="button">รีเฟรช</button></div>' +
      '<div class="portfolio-tracker-round-list">' +
      (roundButtons || '<div class="portfolio-tracker-empty">' + (showArchivedRounds ? "ยังไม่มีรอบที่เก็บเข้าคลัง" : "ยังไม่มีรอบ Patch") + '</div>') +
      (management() ? '<div class="portfolio-tracker-round-tools"><button id="pt-toggle-archived" class="btn btn-outline btn-sm" type="button">' +
        (showArchivedRounds ? "← กลับไปรอบที่ใช้งาน" : "ดูรอบที่เก็บเข้าคลัง") + '</button></div>' : "") +
      '</div>' + selectedRoundHtml + '</section>';

    bindEvents(root);
  }

  function renderMemberDetail(root,memberId,roundId) {
    const host = root.querySelector("#pt-member-detail");
    if (!host) {
      console.error("[Portfolio Tracker] ไม่พบพื้นที่แสดงรายละเอียดสมาชิก");
      alert("ไม่พบพื้นที่แสดงรายละเอียดสมาชิก กรุณารีเฟรชหน้าแล้วลองอีกครั้ง");
      return;
    }
    if (!roundId) {
      host.innerHTML = '<div class="portfolio-tracker-empty">กรุณาเลือกรอบ Patch ก่อนดูรายละเอียดสมาชิก</div>';
      return;
    }
    const row = roundStats(roundId).detail.find(item => String(item.member.user_id) === String(memberId));
    if (!row) {
      host.innerHTML = '<div class="portfolio-tracker-empty">ไม่พบข้อมูลสมาชิกในรอบ Patch นี้ กรุณารีเฟรชข้อมูลแล้วลองอีกครั้ง</div>';
      console.warn("[Portfolio Tracker] ไม่พบสมาชิกในข้อมูลรอบ", { memberId, roundId });
      return;
    }
    const items = row.portfolios.map(portfolio => {
      const submission = submissionForFolder(portfolio.id,roundId);
      const version = (portfolio.portfolio_versions || []).find(item=>item.id===submission?.version_id);
      const label = portfolio.portfolio_type === "cultivation_skills" ? "คัมภีร์หู่เฉียน / ขั้นสกิล" :
        portfolio.portfolio_type === "pve" ? "PvE Build" : "PvP Build";
      const state = submission
        ? "ส่งแล้ว · Version " + (version?.version_number ?? "ไม่พบ Version") + (version?.version_name && version.version_name !== ("Version " + version.version_number) ? " · " + version.version_name : "")
        : "ยังไม่ได้ส่ง";
      return '<div class="portfolio-tracker-detail-item"><div><strong>' + esc(label + " · " + (portfolio.title || "แฟ้มผลงาน")) +
        '</strong><p class="portfolio-tracker-muted">' + esc(portfolio.game_class || "ไม่ระบุอาชีพ") + ' · ' + esc(state) +
        (submission ? ' · ' + esc(dateLabel(submission.submitted_at)) : "") + '</p></div>' +
        '<button type="button" class="btn btn-outline btn-sm" data-pt-open-portfolio="' + esc(memberId) + '">เปิดแฟ้ม</button></div>';
    }).join("");
    host.innerHTML = '<div class="portfolio-tracker-detail-item"><strong>' + esc(memberName(memberId)) +
      '</strong><span>' + pill(row.status,row.submitted + "/" + row.total + " แฟ้ม") + '</span></div>' +
      (items || '<div class="portfolio-tracker-empty">สมาชิกยังไม่มีแฟ้ม Portfolio</div>') +
      (management() && !rounds.find(item=>item.id===roundId)?.archived_at &&
        (rounds.find(item=>item.id===roundId)?.status === "closed" || Date.now() > new Date(rounds.find(item=>item.id===roundId)?.closes_at).getTime())
        ? '<div class="portfolio-tracker-detail-item"><span class="portfolio-tracker-muted">อนุญาตให้สมาชิกส่งหรือเปลี่ยน Version หลังปิดรอบได้ 24 ชั่วโมง</span>' +
          '<button type="button" class="btn btn-primary btn-sm" data-pt-grant-member="' + esc(memberId) + '">อนุญาตส่งล่าช้า 24 ชั่วโมง</button></div>'
        : '');

    host.querySelectorAll("[data-pt-open-portfolio]").forEach(button =>
      button.addEventListener("click",() => openMemberPortfolio(button.dataset.ptOpenPortfolio))
    );
    host.querySelector("[data-pt-grant-member]")?.addEventListener("click",async event => {
      if (!management()) return;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const expiresAt = await grantEdit(memberId,roundId,24);
        alert("อนุญาตส่ง Patch ล่าช้าถึง " + dateLabel(expiresAt));
        await loadData();
        render();
      } catch(error) {
        button.disabled = false;
        alert("อนุญาตไม่สำเร็จ: " + error.message);
      }
    });
  }

  async function grantEdit(memberId, roundId, hours = 24) {
    const expiresAt = new Date(Date.now() + hours * 3600000).toISOString();
    const {error} = await supabaseClient.from("portfolio_update_edit_permissions").upsert({
      round_id:roundId,
      member_id:memberId,
      granted_by:currentUser.id,
      expires_at:expiresAt
    },{onConflict:"round_id,member_id"});
    if (error) throw error;
    return expiresAt;
  }

  function bindEvents(root) {
    // Bind directly to each freshly-rendered member button. This avoids relying
    // on bubbling through app navigation/layout wrappers.
    root.querySelectorAll("[data-pt-member]").forEach(button => {
      button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        const memberId = button.getAttribute("data-pt-member");
        const host = root.querySelector("#pt-member-detail");
        if (host) host.innerHTML = '<div class="portfolio-tracker-muted">กำลังเปิดรายละเอียดสมาชิก…</div>';
        try {
          renderMemberDetail(root, memberId, selectedRoundId);
        } catch (error) {
          console.error("[Portfolio Tracker] เปิดรายละเอียดสมาชิกไม่สำเร็จ", error);
          if (host) {
            host.innerHTML = '<div class="portfolio-tracker-empty">เปิดรายละเอียดไม่สำเร็จ: ' +
              esc(error?.message || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ") + '</div>';
          } else {
            alert("เปิดรายละเอียดสมาชิกไม่สำเร็จ: " + (error?.message || "กรุณารีเฟรชหน้าแล้วลองอีกครั้ง"));
          }
        }
      };
    });

    root.querySelector("#pt-create-round")?.addEventListener("submit",async event => {
      event.preventDefault();
      if (!management()) return;
      const form = new FormData(event.currentTarget);
      let starts,closes;
      try {
        starts = parseRoundDateTime(form.get("starts_at"),"วันและเวลาเริ่ม");
        closes = parseRoundDateTime(form.get("closes_at"),"วันและเวลาปิดรับ");
      } catch(error) { alert(error.message); return; }
      if (!(closes > starts)) { alert("วันและเวลาปิดรับต้องอยู่หลังวันและเวลาเริ่มต้น"); return; }
      const {data,error} = await supabaseClient.from("portfolio_update_rounds").insert({
        round_name:String(form.get("round_name")).trim(),
        starts_at:starts.toISOString(),
        closes_at:closes.toISOString(),
        created_by:currentUser.id
      }).select("id").single();
      if (error) { alert("สร้างรอบไม่สำเร็จ: " + error.message); return; }
      selectedRoundId = data.id;
      await loadData();
      render();
    });

    root.querySelector("#pt-toggle-archived")?.addEventListener("click",() => {
      showArchivedRounds = !showArchivedRounds;
      const firstVisible = rounds.find(round => showArchivedRounds ? !!round.archived_at : !round.archived_at);
      selectedRoundId = firstVisible?.id || "";
      render();
    });

    root.querySelector("#pt-archive-round")?.addEventListener("click",async() => {
      if (!management() || !selectedRoundId) return;
      const round = rounds.find(item => item.id === selectedRoundId);
      if (!round || round.archived_at) return;
      if (!confirm('เก็บรอบ “' + round.round_name + '” เข้าคลังใช่หรือไม่? รอบนี้จะหายจากรายการที่ใช้งาน แต่ประวัติ Version และรูปภาพจะยังอยู่ครบ')) return;
      const {error} = await supabaseClient.from("portfolio_update_rounds").update({archived_at:new Date().toISOString(),archived_by:currentUser.id}).eq("id",selectedRoundId);
      if (error) { alert("เก็บรอบเข้าคลังไม่สำเร็จ: " + error.message); return; }
      showArchivedRounds = true;
      await loadData();
      render();
    });

    root.querySelector("#pt-restore-round")?.addEventListener("click",async() => {
      if (!management() || !selectedRoundId) return;
      const {error} = await supabaseClient.from("portfolio_update_rounds").update({archived_at:null,archived_by:null}).eq("id",selectedRoundId);
      if (error) { alert("กู้คืนรอบไม่สำเร็จ: " + error.message); return; }
      showArchivedRounds = false;
      await loadData();
      render();
    });

    root.querySelectorAll("[data-pt-submit]").forEach(button =>
      button.addEventListener("click",async() => {
        if (!currentUser) {
          alert("กรุณาเข้าสู่ระบบก่อนส่ง Version");
          return;
        }
        const activeRound = rounds.find(round => round.id === selectedRoundId);
        if (!activeRound) {
          alert("ไม่พบรอบ Patch ที่เลือก กรุณารีเฟรชหน้าเว็บ");
          return;
        }
        const activePermission = editPermissions.find(permission =>
          permission.round_id === activeRound.id &&
          new Date(permission.expires_at).getTime() > Date.now()
        );
        const canSubmitNow = !activeRound.archived_at &&
          (isRoundEditable(activeRound) || !!activePermission);
        if (!canSubmitNow) {
          alert(activeRound.archived_at
            ? "รอบ Patch นี้ถูกเก็บเข้าคลังแล้ว ไม่สามารถส่งหรือเปลี่ยน Version ได้"
            : "รอบ Patch นี้ยังไม่เปิดรับหรือปิดรับแล้ว กรุณาตรวจสอบช่วงเวลารับสมัครหรือขออนุญาต Management");
          return;
        }
        const portfolioId = button.dataset.ptSubmit;
        const select = root.querySelector('[data-pt-version-select="' + portfolioId + '"]');
        const versionId = select?.value;
        if (!versionId) { alert("กรุณาเลือก Version ที่ต้องการส่ง"); return; }
        const portfolio = portfolios.find(item=>item.id===portfolioId);
        if (!portfolio || portfolio.member_id!==currentUser.id) { alert("ไม่พบแฟ้มผลงานของคุณ"); return; }
        const existing = submissionForFolder(portfolioId,selectedRoundId);
        const version = (portfolio.portfolio_versions || []).find(item=>item.id===versionId);
        const prompt = existing
          ? "ต้องการเปลี่ยน Version ที่ส่งของแฟ้ม “" + portfolio.title + "” เป็น Version " + version?.version_number + " ใช่หรือไม่?"
          : "ยืนยันส่ง Version " + version?.version_number + " ของแฟ้ม “" + portfolio.title + "” เข้ารอบ Patch นี้ใช่หรือไม่?";
        if (!confirm(prompt)) return;
        button.disabled = true;
        const originalLabel = button.textContent;
        button.textContent = "กำลังส่ง...";
        try {
          const {error} = await supabaseClient.rpc("submit_portfolio_patch",{
            target_round_id:selectedRoundId,
            target_portfolio_id:portfolioId,
            target_version_id:versionId
          });
          if (error) throw error;
          await loadData();
          render();
          alert(existing ? "เปลี่ยน Version ที่ส่งเรียบร้อยแล้ว" : "ส่ง Version เข้ารอบ Patch เรียบร้อยแล้ว");
        } catch(error) {
          button.disabled = false;
          button.textContent = originalLabel;
          alert("ส่ง Version ไม่สำเร็จ: " + (error.message || "Unknown error"));
        }
      })
    );

    root.querySelector("#pt-refresh")?.addEventListener("click",async() => {
      try { await loadData(); render(); } catch(error) { alert(error.message); }
    });
    root.querySelectorAll("[data-pt-round]").forEach(button =>
      button.addEventListener("click",async() => {
        selectedRoundId=button.dataset.ptRound;
        try { await loadRosterForRound(selectedRoundId); render(); }
        catch(error) { alert("โหลด Patch Roster ไม่สำเร็จ: "+(error.message||"Unknown error")); }
      })
    );
    root.querySelector("#pt-toggle-round")?.addEventListener("click",async() => {
      if (!management() || !selectedRoundId) return;
      const round = rounds.find(item => item.id === selectedRoundId);
      const next = round.status === "open" ? "closed" : "open";
      if (!confirm(next === "closed" ? "ยืนยันปิดรอบนี้?" : "ยืนยันเปิดรอบนี้อีกครั้ง?")) return;
      const {error} = await supabaseClient.from("portfolio_update_rounds").update({status:next}).eq("id",selectedRoundId);
      if (error) { alert(error.message); return; }
      await loadData();
      render();
    });
    root.querySelectorAll("[data-pt-open-portfolio]").forEach(button =>
      button.addEventListener("click",() => openMemberPortfolio(button.dataset.ptOpenPortfolio))
    );

    root.querySelector("#pt-edit-request")?.addEventListener("submit",async event => {
      event.preventDefault();
      if (!selectedRoundId || !currentUser) return;
      const reason = String(new FormData(event.currentTarget).get("reason") || "").trim();
      if (!reason) { alert("กรุณาระบุเหตุผลที่ต้องการแก้ไข"); return; }
      const {error} = await supabaseClient.from("portfolio_update_edit_requests").insert({
        round_id:selectedRoundId,
        member_id:currentUser.id,
        reason
      });
      if (error) { alert("ส่งคำขอแก้ไขไม่สำเร็จ: " + error.message); return; }
      await loadData();
      render();
    });

    root.querySelectorAll("[data-pt-grant-member]").forEach(button =>
      button.addEventListener("click",async() => {
        if (!management()) return;
        try {
          const expiresAt = await grantEdit(button.dataset.ptGrantMember,selectedRoundId,24);
          alert("อนุญาตส่ง Patch ล่าช้าถึง " + dateLabel(expiresAt));
          await loadData();
          render();
        } catch(error) { alert("อนุญาตแก้ไขไม่สำเร็จ: " + error.message); }
      })
    );

    root.querySelectorAll("[data-pt-approve-request]").forEach(button =>
      button.addEventListener("click",async() => {
        if (!management()) return;
        const request = requests.find(item => item.id === button.dataset.ptApproveRequest);
        if (!request) return;
        try {
          const expiresAt = await grantEdit(request.member_id,request.round_id,24);
          const {error} = await supabaseClient.from("portfolio_update_edit_requests")
            .update({status:"approved",reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()})
            .eq("id",request.id);
          if (error) throw error;
          alert("อนุมัติคำขอแล้ว · ส่ง Patch ล่าช้าได้ถึง " + dateLabel(expiresAt));
          await loadData();
          render();
        } catch(error) { alert("อนุมัติคำขอไม่สำเร็จ: " + error.message); }
      })
    );

    root.querySelectorAll("[data-pt-reject-request]").forEach(button =>
      button.addEventListener("click",async() => {
        if (!management()) return;
        const {error} = await supabaseClient.from("portfolio_update_edit_requests")
          .update({status:"rejected",reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()})
          .eq("id",button.dataset.ptRejectRequest);
        if (error) { alert("ปฏิเสธคำขอไม่สำเร็จ: " + error.message); return; }
        await loadData();
        render();
      })
    );
  }

  async function loadPortfolioTracker() {
    if (!currentUser || !currentMember) return;
    if (busy) return;
    busy = true;
    try {
      await loadData();
      render();
    } catch(error) {
      const root = ensureRoot();
      if (!root) return;
      injectStyles();
      root.innerHTML = '<section class="portfolio-tracker-panel"><div class="portfolio-tracker-heading"><div><span class="panel-kicker">PORTFOLIO PATCH TRACKER</span><h3>ระบบตรวจสอบแฟ้มประจำรอบ</h3><p>ไม่สามารถโหลดข้อมูลได้</p></div></div><div class="portfolio-tracker-empty">' +
        esc(error.message || "Unknown error") + '</div><button id="pt-refresh" class="btn btn-outline" type="button">ลองอีกครั้ง</button></section>';
      root.querySelector("#pt-refresh")?.addEventListener("click",loadPortfolioTracker);
    } finally {
      busy = false;
    }
  }

  window.loadPortfolioTracker = loadPortfolioTracker;
  window.addEventListener("4am:app-ready",loadPortfolioTracker);
  if (currentUser && currentMember) loadPortfolioTracker();
})();

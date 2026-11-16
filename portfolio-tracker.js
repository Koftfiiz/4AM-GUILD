(() => {
  let rounds = [];
  let portfolios = [];
  let requests = [];
  let editPermissions = [];
  let selectedRoundId = "";
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
      ".portfolio-tracker-empty{padding:20px;border:1px dashed rgba(255,255,255,.16);border-radius:9px;color:#aaa;text-align:center;font-size:15px}",
      "@media(max-width:760px){.portfolio-tracker-form{grid-template-columns:1fr 1fr}.portfolio-tracker-form label:first-child{grid-column:1/-1}.portfolio-tracker-form button{grid-column:1/-1}.portfolio-tracker-own-grid{grid-template-columns:1fr}.portfolio-tracker-stats{grid-template-columns:1fr 1fr}}"
    ].join("");
    document.head.appendChild(style);
  }

  async function loadData() {
    const [roundResult, portfolioResult, requestResult, permissionResult] = await Promise.all([
      supabaseClient.from("portfolio_update_rounds").select("*").order("created_at",{ascending:false}),
      supabaseClient.from("portfolios").select(
        "id,member_id,title,game_class,portfolio_type,created_at,updated_at," +
        "portfolio_versions(id,version_number,round_id,patch_label,created_at," +
        "portfolio_version_images(id,section_key,image_url,sort_order))"
      ).order("created_at",{ascending:false}),
      supabaseClient.from("portfolio_update_edit_requests").select("*").order("created_at",{ascending:false}),
      supabaseClient.from("portfolio_update_edit_permissions").select("*").eq("member_id",currentUser.id)
    ]);
    const failure = [roundResult,portfolioResult,requestResult,permissionResult].find(result => result.error);
    if (failure) throw failure.error;
    rounds = roundResult.data || [];
    requests = requestResult.data || [];
    editPermissions = permissionResult.data || [];
    portfolios = (portfolioResult.data || []).map(portfolio => ({
      ...portfolio,
      portfolio_versions: (portfolio.portfolio_versions || []).map(version => ({
        ...version,
        portfolio_version_images: version.portfolio_version_images || []
      }))
    }));
    if (!selectedRoundId || !rounds.some(round => round.id === selectedRoundId)) {
      selectedRoundId = rounds[0]?.id || "";
    }
  }

  function versionForRound(portfolio, roundId) {
    return (portfolio.portfolio_versions || [])
      .filter(version => version.round_id === roundId)
      .sort((a,b) => Number(b.version_number)-Number(a.version_number))[0] || null;
  }

  function sectionUpdated(portfolio, roundId, sectionKey) {
    const version = versionForRound(portfolio,roundId);
    return !!version && (version.portfolio_version_images || []).some(image => image.section_key === sectionKey);
  }

  function roundStats(roundId) {
    const members = (allMembers || []).filter(member => member.active !== false);
    let complete = 0;
    const detail = members.map(member => {
      const own = portfolios.filter(portfolio => portfolio.member_id === member.user_id);
      const cultivationFolders = own.filter(portfolio => portfolio.portfolio_type === "cultivation_skills");
      const pvpFolders = own.filter(portfolio => portfolio.portfolio_type === "pvp");
      const cultivationTotal = Math.max(1,cultivationFolders.length);
      const skillsTotal = Math.max(1,cultivationFolders.length);
      const cultivationUpdated = cultivationFolders.filter(portfolio => sectionUpdated(portfolio,roundId,"cultivation")).length;
      const skillsUpdated = cultivationFolders.filter(portfolio => sectionUpdated(portfolio,roundId,"hero_skills")).length;
      const pvpUpdated = pvpFolders.filter(portfolio => {
        const version = versionForRound(portfolio,roundId);
        return !!version && (version.portfolio_version_images || []).length > 0;
      }).length;
      const missing = [];
      if (!cultivationFolders.length) {
        missing.push("สร้างแฟ้มคัมภีร์หู่เฉียน / ขั้นสกิล");
      } else {
        if (cultivationUpdated < cultivationTotal) missing.push("อัปเดตคัมภีร์หู่เฉียน");
        if (skillsUpdated < skillsTotal) missing.push("อัปเดตขั้นสกิล");
      }
      pvpFolders.forEach(portfolio => {
        if (!versionForRound(portfolio,roundId)) missing.push("PvP Build: " + (portfolio.title || "ไม่มีชื่อ Build"));
      });
      const isComplete = cultivationUpdated === cultivationTotal &&
        skillsUpdated === skillsTotal && pvpUpdated === pvpFolders.length;
      if (isComplete) complete++;
      return {
        member, portfolios:own, cultivationFolders, pvpFolders,
        cultivation:{updated:cultivationUpdated,total:cultivationTotal},
        skills:{updated:skillsUpdated,total:skillsTotal},
        pvp:{updated:pvpUpdated,total:pvpFolders.length},
        missing,status:isComplete?"complete":(cultivationUpdated+skillsUpdated+pvpUpdated>0?"partial":"empty")
      };
    });
    return {
      detail,complete,total:members.length,
      incomplete:members.length-complete,
      totalPvp:pvpFoldersTotal(detail)
    };
  }

  function pvpFoldersTotal(rows) {
    return rows.reduce((sum,row)=>sum+row.pvp.total,0);
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
    const stats = selected ? roundStats(selected.id) : null;
    const ownRow = stats?.detail.find(row => row.member.user_id === currentUser?.id);
    const editable = !!selected && (isRoundEditable(selected) ||
      editPermissions.some(permission => permission.round_id === selected.id && new Date(permission.expires_at).getTime() > Date.now()));
    const pendingRequest = selected ? requests.find(request =>
      request.round_id === selected.id && request.member_id === currentUser?.id && request.status === "pending"
    ) : null;
    const ownPermission = selected ? editPermissions.find(permission =>
      permission.round_id === selected.id && new Date(permission.expires_at).getTime() > Date.now()
    ) : null;

    root.innerHTML =
      (management() ? (
        '<section class="portfolio-tracker-panel">' +
          '<div class="portfolio-tracker-heading"><div><span class="panel-kicker">PORTFOLIO PATCH SCHEDULE</span><h3>จัดการรอบอัปเดตแฟ้มผลงาน</h3><p>กำหนดช่วง Patch และติดตามเวอร์ชันจากแฟ้ม Portfolio โดยอัตโนมัติ</p></div>' +
          '<span class="portfolio-tracker-pill is-complete">Management</span></div>' +
          '<form id="pt-create-round" class="portfolio-tracker-form">' +
            '<label>ชื่อ Patch / รอบ<input name="round_name" maxlength="120" required placeholder="เช่น Patch 2.1.1 (เดือนพฤศจิกายน)"></label>' +
            '<label>วันและเวลาเริ่ม<input name="starts_at" type="text" data-activity-datetime-input readonly autocomplete="off" placeholder="dd/mm/yyyy HH:mm" required></label>' +
            '<label>วันและเวลาปิดรับ<input name="closes_at" type="text" data-activity-datetime-input readonly autocomplete="off" placeholder="dd/mm/yyyy HH:mm" required></label>' +
            '<button class="btn btn-primary" type="submit">＋ สร้างรอบใหม่</button>' +
          '</form>' +
          '<p class="portfolio-tracker-muted">ระบบจะนับเวอร์ชันที่สร้างในช่วงวันและเวลาของรอบนี้ โดยอิงเวลาไทยจากฐานข้อมูล และเก็บประวัติเวอร์ชันก่อนหน้าไว้</p>' +
        '</section>'
      ) : "") +
      '<section class="portfolio-tracker-panel">' +
        '<div class="portfolio-tracker-heading"><div><span class="panel-kicker">PATCH VERSION TRACKER</span><h3>ติดตามการอัปเดต Portfolio</h3><p>ตรวจจาก Version ที่บันทึกในแฟ้มหลัก ไม่ต้องอัปโหลดรูปซ้ำในหน้านี้</p></div>' +
        '<button id="pt-refresh" class="btn btn-outline btn-sm" type="button">รีเฟรช</button></div>' +
        '<div class="portfolio-tracker-round-list">' +
          (rounds.map(round => '<button type="button" class="portfolio-tracker-round ' + (round.id===selectedRoundId?"is-active":"") +
            '" data-pt-round="' + esc(round.id) + '">' + esc(round.round_name) + ' · ' + (round.status==="open"?"เปิดรับ":"ปิดรับ") + '</button>').join("") ||
            '<div class="portfolio-tracker-empty">ยังไม่มีรอบอัปเดตแฟ้มผลงาน</div>') +
        '</div>' +
        (selected ? (
          '<div class="portfolio-tracker-heading"><div><strong>' + esc(selected.round_name) + '</strong><p>เริ่ม ' + dateLabel(selected.starts_at) + ' · ปิดรับ ' + dateLabel(selected.closes_at) + '</p></div>' +
          (management() ? '<button id="pt-toggle-round" class="btn btn-outline btn-sm" type="button">' + (selected.status==="open"?"ปิดรอบรับข้อมูล":"เปิดรอบอีกครั้ง") + '</button>' : "") +
          '</div>' +
          (management() ? (
            '<div class="portfolio-tracker-stats">' +
              '<div class="portfolio-tracker-stat"><strong>' + stats.total + '</strong><span>สมาชิกทั้งหมด</span></div>' +
              '<div class="portfolio-tracker-stat"><strong>' + stats.complete + '</strong><span>อัปเดตครบแล้ว</span></div>' +
              '<div class="portfolio-tracker-stat"><strong>' + stats.totalPvp + '</strong><span>PvP Build ที่ต้องติดตาม</span></div>' +
            '</div>' +
            '<div class="portfolio-tracker-table-wrap"><table class="portfolio-tracker-table"><thead><tr><th>สมาชิก</th><th>คัมภีร์หู่เฉียน</th><th>ขั้นสกิล</th><th>PvP Build</th><th>สถานะรวม</th><th>จัดการ</th></tr></thead><tbody>' +
              stats.detail.map(row =>
                '<tr><td><strong>' + esc(memberName(row.member.user_id)) + '</strong></td>' +
                '<td>' + progressCell(row.cultivation,"ไม่มีแฟ้ม") + '</td>' +
                '<td>' + progressCell(row.skills,"ไม่มีแฟ้ม") + '</td>' +
                '<td>' + progressCell(row.pvp,"ไม่มี Build") + '</td>' +
                '<td>' + pill(row.status) + '</td>' +
                '<td><button class="btn btn-outline btn-sm" type="button" data-pt-member="' + esc(row.member.user_id) + '">ดูรายละเอียด</button></td></tr>'
              ).join("") +
            '</tbody></table></div>' +
            '<div id="pt-member-detail" class="portfolio-tracker-detail"></div>' +
            '<h4 style="margin:22px 0 10px;color:#f08a92">คำขอแก้ไขหลังปิดรอบ</h4>' +
            '<div class="portfolio-tracker-requests">' +
              (requests.filter(request => request.round_id === selected.id && request.status === "pending").map(request =>
                '<div class="portfolio-tracker-request"><strong>' + esc(memberName(request.member_id)) + '</strong><p>' +
                esc(request.reason) + '</p><div class="portfolio-tracker-actions">' +
                '<button class="btn btn-primary btn-sm" type="button" data-pt-approve-request="' + esc(request.id) + '">อนุมัติ 24 ชั่วโมง</button>' +
                '<button class="btn btn-outline btn-sm" type="button" data-pt-reject-request="' + esc(request.id) + '">ปฏิเสธ</button>' +
                '</div></div>'
              ).join("") || '<p class="portfolio-tracker-muted">ไม่มีคำขอที่รออนุมัติ</p>') +
            '</div>'
          ) : "") +
          '<div class="portfolio-tracker-own">' +
            '<h4>ความคืบหน้า Portfolio ของคุณ</h4>' +
            (ownRow ? (
              '<div class="portfolio-tracker-own-grid">' +
                '<div class="portfolio-tracker-own-card"><strong>' + ownRow.cultivation.updated + '/' + ownRow.cultivation.total + '</strong><span>คัมภีร์หู่เฉียน</span></div>' +
                '<div class="portfolio-tracker-own-card"><strong>' + ownRow.skills.updated + '/' + ownRow.skills.total + '</strong><span>ขั้นสกิล</span></div>' +
                '<div class="portfolio-tracker-own-card"><strong>' + ownRow.pvp.updated + '/' + ownRow.pvp.total + '</strong><span>PvP Build</span></div>' +
              '</div>' +
              (ownRow.missing.length ? '<div class="portfolio-tracker-note">รายการที่ยังต้องอัปเดต: ' + ownRow.missing.map(esc).join(" · ") + '</div>' :
                '<div class="portfolio-tracker-note">แฟ้ม Portfolio ของคุณมีเวอร์ชันในรอบนี้ครบตามรายการที่มีอยู่แล้ว</div>')
            ) : '<div class="portfolio-tracker-empty">ไม่พบข้อมูลสมาชิกที่เข้าสู่ระบบ</div>') +
            (ownPermission && !isRoundEditable(selected) ? '<div class="portfolio-tracker-note">คุณได้รับอนุญาตให้แก้ไขรอบนี้ถึง ' + esc(dateLabel(ownPermission.expires_at)) + '</div>' : '') +
            '<div><button type="button" class="btn btn-primary" data-pt-open-portfolio="' + esc(currentUser?.id || "") + '">ไปยังแฟ้ม Portfolio เพื่อเพิ่มเวอร์ชัน</button></div>' +
            (!editable ? (
              '<div class="portfolio-tracker-request">' +
                '<strong>รอบนี้ปิดรับการแก้ไขแล้ว</strong>' +
                '<p class="portfolio-tracker-muted">หากต้องการเพิ่มหรือแก้ไข Build ในรอบนี้ สามารถส่งคำขอให้ฝ่ายบริหารอนุมัติสิทธิ์แก้ไขได้</p>' +
                (pendingRequest ? '<span class="portfolio-tracker-pill is-partial">ส่งคำขอแล้ว · รออนุมัติ</span>' :
                  '<form id="pt-edit-request"><textarea name="reason" maxlength="1000" required placeholder="ระบุเหตุผลที่ต้องการแก้ไข..."></textarea><button class="btn btn-outline btn-sm" type="submit">ส่งคำขอแก้ไข</button></form>') +
              '</div>'
            ) : '') +
          '</div>' +
          '<div class="portfolio-tracker-note">หมายเหตุ: การเพิ่ม Version ใหม่ต้องทำจากแฟ้มหลักเดิมในหน้า Portfolio ระบบจะเก็บรูปและข้อมูลเวอร์ชันเก่าไว้ หากรอบปิดแล้ว Version จะเชื่อมกับรอบเดิมได้เมื่อได้รับอนุญาตแก้ไขจากฝ่ายบริหาร</div>'
        ) : '<div class="portfolio-tracker-empty">เลือกหรือสร้างรอบ Patch เพื่อดูสถานะการอัปเดต</div>') +
      '</section>';

    bindEvents(root);
  }

  function renderMemberDetail(root,memberId,roundId) {
    const row = roundStats(roundId).detail.find(item => item.member.user_id === memberId);
    const host = root.querySelector("#pt-member-detail");
    if (!row || !host) return;
    const items = row.portfolios.map(portfolio => {
      const version = versionForRound(portfolio,roundId);
      const label = portfolio.portfolio_type === "cultivation_skills" ? "คัมภีร์หู่เฉียน / ขั้นสกิล" :
        portfolio.portfolio_type === "pve" ? "PvE Build" : "PvP Build";
      const state = version ? "มี Version ในรอบนี้ · Version " + version.version_number : "ยังไม่มี Version ในรอบนี้";
      return '<div class="portfolio-tracker-detail-item"><div><strong>' + esc(label + " · " + (portfolio.title || "แฟ้มผลงาน")) +
        '</strong><p class="portfolio-tracker-muted">' + esc(portfolio.game_class || "ไม่ระบุอาชีพ") + ' · ' + esc(state) +
        (version ? ' · ' + esc(dateLabel(version.created_at)) : "") + '</p></div>' +
        '<button type="button" class="btn btn-outline btn-sm" data-pt-open-portfolio="' + esc(memberId) + '">เปิดแฟ้ม</button></div>';
    }).join("");
    host.innerHTML = '<div class="portfolio-tracker-detail-item"><strong>' + esc(memberName(memberId)) +
      '</strong><span>' + pill(row.status) + '</span></div>' +
      (items || '<div class="portfolio-tracker-empty">สมาชิกยังไม่มีแฟ้ม Portfolio</div>') +
      '<div class="portfolio-tracker-detail-item"><span class="portfolio-tracker-muted">อนุญาตให้สมาชิกเพิ่ม Version ในรอบนี้ได้ 24 ชั่วโมง</span>' +
      '<button type="button" class="btn btn-primary btn-sm" data-pt-grant-member="' + esc(memberId) + '">อนุญาตแก้ไข 24 ชั่วโมง</button></div>';
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

    root.querySelector("#pt-refresh")?.addEventListener("click",async() => {
      try { await loadData(); render(); } catch(error) { alert(error.message); }
    });
    root.querySelectorAll("[data-pt-round]").forEach(button =>
      button.addEventListener("click",() => { selectedRoundId = button.dataset.ptRound; render(); })
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
    root.querySelectorAll("[data-pt-member]").forEach(button =>
      button.addEventListener("click",() => renderMemberDetail(root,button.dataset.ptMember,selectedRoundId))
    );
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
          alert("อนุญาตแก้ไขถึง " + dateLabel(expiresAt));
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
          alert("อนุมัติคำขอแล้ว · แก้ไขได้ถึง " + dateLabel(expiresAt));
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

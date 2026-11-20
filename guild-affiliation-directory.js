(() => {
  "use strict";

  const PAGE = "member-management";
  const LEGACY_PAGE = "guild-directory";
  const PAGE_SIZE = 50;
  const cache = new Map();
  const state = { search:"", guild:"all", gameClass:"all", recordType:"all", healthFilter:"all", page:0, rows:[], suspendedRows:[], total:0, counts:null, busy:false };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const $ = id => document.getElementById(id);
  const isAllowed = () => !!currentUser && !!currentMember && currentMember.active === true &&
    currentMember.membership_status === "active" && typeof isManagement === "function" && isManagement();
  const canAssign = () => isAllowed() && typeof canManageMemberProfiles === "function" &&
    canManageMemberProfiles() && !(typeof isRolePreviewActive === "function" && isRolePreviewActive());

  function formatBangkokDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone:"Asia/Bangkok",day:"2-digit",month:"2-digit",year:"numeric",
      hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    }).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value || "";
    return get("day")+"/"+get("month")+"/"+get("year")+" "+get("hour")+":"+get("minute");
  }

  function styles() {
    if ($("guild-directory-styles")) return;
    const style = document.createElement("style");
    style.id = "guild-directory-styles";
    style.textContent = [
      ".gd-root{display:grid;gap:16px;color:var(--text)}.gd-root[hidden]{display:none!important}",
      ".gd-panel{padding:22px;margin-bottom:20px;border:1px solid var(--line);border-radius:8px;background:rgba(12,8,10,.92)}",
      ".gd-panel.gd-member-list-panel{background:radial-gradient(ellipse at 7% 0%,#00beff55,transparent 35%),radial-gradient(ellipse at 38% 0%,#aa4cff44,transparent 38%),radial-gradient(ellipse at 96% 16%,#ff46b544,transparent 34%),radial-gradient(ellipse at 72% 100%,#ffbc4840,transparent 38%),linear-gradient(145deg,#17121f,#090a11 72%);border-color:#a58bdf88;box-shadow:inset 0 0 55px #8955ff22,0 0 30px #4997ff20}",
      ".gd-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px}",
      ".gd-head h2{font-size:20px;margin:2px 0}.gd-muted{color:var(--muted);font-size:15px;line-height:1.55}",
      ".gd-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}",
      ".gd-stat{padding:13px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.025)}",
      ".gd-stat span{display:block;color:#aaa;font-size:15px}.gd-stat strong{display:block;font-size:24px;margin-top:3px}",
      ".gd-toolbar{display:grid;grid-template-columns:minmax(220px,1.6fr) repeat(2,minmax(135px,1fr)) auto;gap:9px;margin-bottom:14px}",
      ".gd-field{width:100%;min-width:0;min-height:43px;padding:9px 11px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text);font:15px var(--font)}",
      ".gd-field:focus-visible,.gd-button:focus-visible{outline:2px solid #ff6674;outline-offset:2px}",
      ".gd-table-wrap{overflow:auto}.gd-table{width:100%;min-width:1050px;border-collapse:collapse}",
      ".gd-table th,.gd-table td{padding:12px 10px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:middle;font-size:15px}",
      ".gd-suspended-panel{border-color:rgba(229,72,88,.42);background:linear-gradient(180deg,rgba(229,72,88,.055),rgba(12,8,10,.92))}.gd-suspended-panel h2{color:#ff8793}.gd-suspended-count{display:inline-flex;padding:7px 11px;border:1px solid rgba(229,72,88,.45);border-radius:99px;color:#ff9da5;font-size:15px;font-weight:800}.gd-suspended-table{min-width:760px}",
      ".gd-table th{color:var(--red-bright,#e54858);font-weight:800;white-space:nowrap}.gd-name{font-weight:800}.gd-sub{display:block;color:#aaa;font-size:15px}",
      ".gd-member-list-panel .gd-table th{color:#DDF5FF;text-shadow:0 0 10px rgba(157,218,255,.18)}",
      ".gd-pill{display:inline-flex;align-items:center;padding:5px 9px;border:1px solid rgba(255,255,255,.14);border-radius:99px;font-size:15px;font-weight:800;white-space:nowrap}",
      ".gd-pill.am{background:rgba(217,54,67,.12);border-color:rgba(217,54,67,.42);color:#ff9da5}.gd-pill.pm{background:rgba(118,92,190,.13);border-color:rgba(118,92,190,.42);color:#cbbcff}",
      ".gd-pill.none{background:rgba(255,255,255,.04);color:#bbb}.gd-pill.manual{color:#ff9da5;border-color:rgba(217,54,67,.42);background:rgba(217,54,67,.12)}",
      ".gd-button{min-height:39px;padding:8px 12px;border:1px solid var(--line);border-radius:6px;background:rgba(255,255,255,.03);color:var(--text);font:600 15px var(--font);cursor:pointer}",
      ".gd-button.primary{background:linear-gradient(110deg,#7d1824,#c22b3b);border-color:var(--red-bright);color:#fff}.gd-button:disabled{opacity:.45;cursor:not-allowed}",
      ".gd-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.gd-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px}",
      ".gd-inline-select{min-height:34px;padding:5px 7px;font-size:15px;border-radius:5px}.gd-class-display{display:inline-flex;align-items:center;gap:7px;color:var(--class-color,#aaa);font-weight:850;white-space:nowrap}.gd-class-display img{width:25px;height:25px;object-fit:contain;filter:drop-shadow(0 0 4px color-mix(in srgb,var(--class-color,#aaa) 35%,transparent))}.gd-member-actions{gap:6px;flex-wrap:nowrap}.gd-member-actions .btn{min-height:30px;padding:5px 9px;font-size:15px;white-space:nowrap}.gd-member-actions .member-row-remove{display:inline-grid;place-items:center;width:30px;min-width:30px;height:30px;padding:0;border:0;background:transparent;color:#ff5968;font-size:27px;line-height:1;cursor:pointer}.gd-member-actions .manual-member-toggle-btn.is-suspend{color:#fff;background:linear-gradient(135deg,#8f1e2b,#c52b3c);border:1px solid rgba(255,143,151,.72)}.gd-member-actions .manual-member-toggle-btn.is-activate{color:#ffe8b5;background:linear-gradient(135deg,#55401c,#80602a);border:1px solid rgba(232,190,112,.72)}",
      ".gd-empty{padding:28px;text-align:center;color:#aaa;font-size:15px}.gd-modal{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:16px}",
      ".gd-dialog{width:min(560px,100%);max-height:88vh;overflow:auto;padding:21px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--text);box-shadow:0 24px 70px #000a}",
      ".gd-dialog h2{margin:0 0 4px;font-size:20px}.gd-dialog label{display:grid;gap:6px;margin:14px 0;color:#ddd;font-size:15px}",
      ".gd-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.gd-status{min-height:22px;color:#ff9da5;font-size:15px}",
      ".gd-modal[hidden]{display:none}.gd-history-list{display:grid;gap:9px;max-height:min(55vh,520px);overflow:auto}",
      ".gd-history-item{padding:12px;border:1px solid var(--line);border-radius:7px;background:rgba(255,255,255,.025)}.gd-history-item strong{font-size:16px}.gd-history-item p{margin:5px 0 0;color:#aaa;font-size:15px;line-height:1.5}",
      ".gd-detail-history-section{margin-top:18px}.gd-detail-history-section h3{margin:0 0 10px;color:var(--red-bright,#e54858);font-size:17px}.gd-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.gd-detail{padding:12px;border:1px solid var(--line);border-radius:7px;background:rgba(255,255,255,.025);min-width:0}.gd-detail span{display:block;color:#aaa;font-size:15px;margin-bottom:5px}.gd-detail strong{display:block;color:#fff;font-size:15px;overflow-wrap:anywhere}",
      ".gd-record-status{display:inline-flex;align-items:center;padding:4px 9px;border:1px solid rgba(76,211,127,.3);border-radius:999px;background:rgba(76,211,127,.08);color:#83e6a5;font-size:15px;font-weight:850;white-space:nowrap}",
      ".gd-record-status.is-inactive{border-color:rgba(229,72,88,.3);background:rgba(229,72,88,.08);color:#f08c96}",
      ".gd-record-status.is-manual{border-color:rgba(76,211,127,.3);background:rgba(76,211,127,.08);color:#83e6a5}",
      ".gd-sequence{text-align:center;font-weight:800;color:#aaa}",
      ".gd-class-panel{display:grid;gap:10px}.gd-legacy-quality-host{display:grid;gap:10px}",
      ".gd-root .manual-member-quality-strip{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}",
      ".gd-root .manual-member-class-summary{display:flex;flex-wrap:wrap;gap:9px}",
      ".gd-root .member-admin-quality-card{min-height:78px;padding:12px;border:1px solid rgba(232,51,63,.25);border-radius:11px;background:rgba(255,255,255,.025);color:#fff;text-align:left;cursor:pointer}",
      ".gd-root .member-admin-quality-card span{display:block;color:#aaa;font-size:15px}.gd-root .member-admin-quality-card strong{display:block;margin-top:5px;font-size:23px}",
      ".gd-root .member-admin-quality-card.is-active{border-color:#e54858;background:rgba(229,72,88,.12)}",
      "@media(max-width:900px){.gd-root .manual-member-quality-strip{grid-template-columns:repeat(3,minmax(0,1fr))}}",
      "@media(max-width:520px){.gd-root .manual-member-quality-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}",

      "@media(max-width:900px){.gd-toolbar{grid-template-columns:repeat(2,minmax(0,1fr))}.gd-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}",
      "@media(max-width:520px){.gd-toolbar{grid-template-columns:1fr}.gd-panel{padding:14px}.gd-stats{gap:8px}.gd-stat strong{font-size:21px}.gd-detail-grid{grid-template-columns:1fr}}"
    ].join("");
    document.head.appendChild(style);
  }

  if (typeof PAGE_TITLES !== "undefined") PAGE_TITLES[PAGE] = "ศูนย์จัดการสมาชิก";

  function ensurePage() {
    const page = $("page-member-management");
    if (!page || $("member-admin-affiliation-panel")) return;
    const legacyQuality = page.querySelector("#manual-member-quality-strip");
    const legacyClassHeading = page.querySelector(".manual-member-class-summary-heading");
    const legacyClassSummary = page.querySelector("#manual-member-class-summary");
    page.querySelector(".member-admin-overview")?.classList.add("hidden");
    page.querySelector(".manual-member-list-panel")?.classList.add("hidden");
    const addTrigger = $("manual-member-add-trigger");
    if (addTrigger) addTrigger.classList.add("gd-add-member-trigger");
    // Keep the shared section navigation visible for switching between the
    // public directory and this management-only center.
    page.insertAdjacentHTML("beforeend", `
      <section id="member-admin-affiliation-panel" class="gd-root" aria-label="ศูนย์จัดการสมาชิก">
        <div class="gd-head"><div><span class="section-kicker">MEMBER MANAGEMENT CENTER</span><h2>ศูนย์จัดการสมาชิก</h2><p class="gd-muted">จัดการข้อมูลสมาชิก สังกัดกิลด์</p></div></div>
        <section class="gd-legacy-quality-host" id="gd-quality-host" aria-label="สรุปสถานะสมาชิก"></section>
        <section class="gd-panel gd-class-panel"><div id="gd-class-heading-host"></div><div id="gd-class-summary-host"></div></section>
        <section class="gd-panel gd-member-list-panel">
          <div class="gd-head"><div><h2>รายชื่อสมาชิกทั้งหมด</h2><p class="gd-muted">ค้นหา กรอง และจัดการข้อมูลสมาชิกจากรายการเดียว</p></div><button class="gd-button" id="gd-refresh" type="button">↻ รีเฟรช</button></div>
          <form class="gd-toolbar" id="gd-filter-form">
            <input class="gd-field" id="gd-search" type="search" maxlength="80" placeholder="ค้นหาชื่อตัวละคร ชื่อเล่น หรือ Discord..." aria-label="ค้นหาชื่อตัวละคร ชื่อเล่น หรือ Discord">
            <select class="gd-field" id="gd-guild" aria-label="สังกัดกิลด์"><option value="all">ทั้งหมด</option><option value="4AM">4AM</option><option value="4PM">4PM</option><option value="unassigned">ไม่ระบุสังกัด</option></select>
            <select class="gd-field" id="gd-class" aria-label="คลาสตัวละคร"><option value="all">ทุกคลาส</option><option>Ironclad</option><option>Bloodstrom</option><option>Celestune</option><option>Numina</option><option>Sylph</option><option>Nightwaker</option><option>Dragonsvelte</option><option>Mystech</option></select>
            
            <button class="gd-button primary" type="submit">ค้นหา</button>
          </form>
          <div class="gd-table-wrap"><table class="gd-table"><thead><tr>
            <th>ลำดับ</th><th>ตัวละคร</th><th>คลาส</th><th>ตำแหน่งกิลด์</th><th>Discord Health</th><th>สังกัดกิลด์</th><th>สถานะสมาชิก</th><th>ออนไลน์</th><th>วันที่เข้าระบบ</th><th>จัดการ</th>
          </tr></thead><tbody id="gd-rows"><tr><td colspan="10" class="gd-empty">กำลังโหลดข้อมูลสมาชิก...</td></tr></tbody></table></div>
          <div class="gd-pagination"><span class="gd-muted" id="gd-page-label" aria-live="polite">—</span><div class="gd-actions"><button class="gd-button" id="gd-prev" type="button">← ก่อนหน้า</button><button class="gd-button" id="gd-next" type="button">ถัดไป →</button></div></div>
        </section>
        <section class="gd-panel gd-suspended-panel" aria-labelledby="gd-suspended-title">
          <div class="gd-head"><div><h2 id="gd-suspended-title">โซนสมาชิกที่ถูกระงับ</h2><p class="gd-muted">แยกจากรายชื่อสมาชิกปกติ และยังสามารถตรวจสอบหรือเปิดใช้งานกลับได้</p></div><span class="gd-suspended-count" id="gd-suspended-count">0 รายชื่อ</span></div>
          <div class="gd-table-wrap"><table class="gd-table gd-suspended-table"><thead><tr><th>ลำดับ</th><th>ตัวละคร</th><th>คลาส</th><th>สถานะสมาชิก</th><th>วันที่เข้าระบบ</th><th>จัดการ</th></tr></thead><tbody id="gd-suspended-rows"><tr><td colspan="6" class="gd-empty">กำลังโหลดข้อมูลสมาชิกที่ถูกระงับ...</td></tr></tbody></table></div>
        </section>
      </section>
      <div class="gd-modal" id="gd-modal" hidden><form class="gd-dialog" id="gd-assign-form" role="dialog" aria-modal="true" aria-labelledby="gd-assign-title"><h2 id="gd-assign-title">เปลี่ยนสังกัดกิลด์</h2><p class="gd-muted" id="gd-member-label"></p><label>สังกัดใหม่<select class="gd-field" id="gd-new-guild" required><option value="">เลือกสังกัด</option><option value="4AM">4AM</option><option value="4PM">4PM</option><option value="unassigned">ยังไม่ระบุสังกัด</option></select></label><label>เหตุผลในการเปลี่ยนสังกัด<input class="gd-field" id="gd-reason" maxlength="500" required placeholder="ระบุเหตุผล"></label><p class="gd-status" id="gd-assign-status" role="status" aria-live="polite"></p><div class="gd-dialog-actions"><button class="gd-button" id="gd-cancel" type="button">ยกเลิก</button><button class="gd-button primary" id="gd-save" type="submit">บันทึกข้อมูล</button></div></form></div>
`);
    if (legacyQuality) $("gd-quality-host")?.append(legacyQuality);
    if (legacyClassHeading) $("gd-class-heading-host")?.append(legacyClassHeading);
    if (legacyClassSummary) $("gd-class-summary-host")?.append(legacyClassSummary);
    styles();
    bindEvents();
  }

  function keyForRequest() { return JSON.stringify([state.search,state.guild,state.gameClass,state.recordType,state.page]); }

  function enrichDirectoryRows(rows) {
    const accounts = new Map((typeof allMembers !== "undefined" ? allMembers : []).map(member => [String(member.user_id), member]));
    const manuals = typeof manualGuildMembers !== "undefined" ? manualGuildMembers : [];
    const manualById = new Map(manuals.map(member => [String(member.id), member]));
    return (rows || []).map(row => {
      const account = row.record_type === "account";
      const source = account ? (accounts.get(String(row.member_id)) || {}) : (manualById.get(String(row.manual_member_id)) || {});
      const linkedManual = account ? manuals.find(member => String(member.linked_user_id || "") === String(row.member_id)) : null;
      const discordAccount = account && typeof discordAccountDirectory !== "undefined" ? discordAccountDirectory.get(String(row.member_id)) : null;
      const merged = { ...source, ...row };
      merged.game_uid = source.game_uid || linkedManual?.game_uid || null;
      merged.guild_position = source.guild_position || linkedManual?.guild_position || null;
      merged.discord_user_id = source.discord_user_id || linkedManual?.discord_user_id || discordAccount?.discord_user_id || null;
      merged.discord_username = source.discord_username || linkedManual?.discord_username || discordAccount?.discord_username || null;
      merged.discord_global_name = source.discord_global_name || linkedManual?.discord_global_name || discordAccount?.discord_global_name || null;
      merged.discord_connection_status = discordAccount?.discord_connection_status || null;
      merged.created_at = source.created_at || row.created_at || null;
      merged._recordType = row.record_type;
      merged.user_id = row.member_id || null;
      merged.linked_user_id = row.record_type === "manual" ? source.linked_user_id : null;
      merged.discordHealth = typeof getMemberAdminDiscordHealth === "function" ? getMemberAdminDiscordHealth(merged) : {key:"unknown",label:"ตรวจสอบไม่ได้",tone:"muted"};
      merged.online = account && typeof isGuildMemberOnline === "function" ? isGuildMemberOnline(row.member_id) : false;
      return merged;
    });
  }

  function renderStats(counts) {
    const values = [["สมาชิกทั้งหมด",counts?.all??0],["สมาชิก 4AM",counts?.["4AM"]??0],["สมาชิก 4PM",counts?.["4PM"]??0],["ยังไม่ระบุสังกัด",counts?.unassigned??0]];
    const target = $("gd-stats"); if (!target) return;
    target.innerHTML = values.map(([label,value]) => '<article class="gd-stat"><span>'+esc(label)+'</span><strong>'+Number(value).toLocaleString("th-TH")+'</strong></article>').join("");
  }

  function renderRows() {
    const tbody = $("gd-rows");
    if (!tbody) return;
    const filteredRows = state.rows.filter(row => {
      if (state.healthFilter === "incomplete") return !row.game_uid || !row.nickname || !row.guild_position;
      return state.healthFilter === "all" || row.discordHealth?.key === state.healthFilter;
    });
    if (!filteredRows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="gd-empty">ไม่พบสมาชิกที่ตรงกับเงื่อนไข</td></tr>';
    } else {
      tbody.innerHTML = filteredRows.map((row,index) => {
        const identity = row.member_id || row.manual_member_id;
        const guildClass = row.guild_code === "4AM" ? "am" : row.guild_code === "4PM" ? "pm" : "none";
        const guildLabel = row.guild_code || "ยังไม่ระบุสังกัด";
        const cls = typeof getClassInfo === "function" ? getClassInfo(row.game_class) : null;
        const statusLabel = row.record_type === "manual" ? "Manual" : (row.active === false ? "Inactive" : "Active");
        const statusClass = row.record_type === "manual" ? "is-manual" : (row.active === false ? "is-inactive" : "is-active");
        const health = row.discordHealth || {label:"ตรวจสอบไม่ได้",tone:"muted"};
        const presence = row.record_type === "account" && typeof renderGuildPresenceStatus === "function"
          ? renderGuildPresenceStatus(row.member_id)
          : '<span class="guild-presence-status is-offline"><span class="guild-presence-dot"></span>ออฟไลน์</span>';
        const accountLabel = row.record_type === "account" ? "เชื่อมต่อแล้ว" : "ยังไม่มีบัญชีผู้ใช้งาน";
        const classCell = '<span class="gd-class-display" style="--class-color:'+esc(cls?.color||"var(--muted)")+'">'+
          (cls?.iconPath?'<img src="'+esc(cls.iconPath)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'')+
          '<span>'+esc(row.game_class||"—")+'</span></span>';
        const positionCell = canAssign()
          ? '<select class="gd-field gd-inline-select gd-position-select" data-gd-position="'+esc(identity)+'" data-gd-kind="'+esc(row.record_type)+'"><option value="">ยังไม่ได้กำหนด</option>'+(typeof GUILD_POSITIONS!=="undefined"?GUILD_POSITIONS:[]).map(position=>'<option value="'+esc(position)+'" '+(row.guild_position===position?'selected':'')+'>'+esc(position)+'</option>').join("")+'</select>'
          : esc(row.guild_position||"ยังไม่ได้กำหนด");
        const affiliationCell = canAssign()
          ? '<select class="gd-field gd-inline-select gd-affiliation-select" data-gd-affiliation="'+esc(identity)+'" data-gd-kind="'+esc(row.record_type)+'" aria-label="เปลี่ยนสังกัดของ '+esc(row.character_name||"สมาชิก")+'"><option value="unassigned" '+(!row.guild_code?'selected':'')+'>ยังไม่ระบุสังกัด</option><option value="4AM" '+(row.guild_code==="4AM"?'selected':'')+'>4AM</option><option value="4PM" '+(row.guild_code==="4PM"?'selected':'')+'>4PM</option></select>'
          : '<span class="gd-pill '+guildClass+'">'+esc(guildLabel)+'</span>';
        const actions = '<div class="gd-actions gd-member-actions">'+
          '<button class="btn btn-outline btn-sm" type="button" data-gd-view="'+esc(identity)+'" data-gd-kind="'+esc(row.record_type)+'">ดูข้อมูล</button>'+
          '<button class="btn btn-outline btn-sm" type="button" data-gd-edit="'+esc(identity)+'" data-gd-kind="'+esc(row.record_type)+'">แก้ไข</button>'+
          '<button class="btn btn-sm manual-member-toggle-btn '+(row.active===false?'is-activate':'is-suspend')+'" type="button" data-gd-toggle="'+esc(identity)+'" data-gd-kind="'+esc(row.record_type)+'">'+(row.active===false?'เปิดใช้งาน':'ระงับ')+'</button>'+
          '<button class="member-row-remove" type="button" data-gd-remove="'+esc(identity)+'" data-gd-kind="'+esc(row.record_type)+'" aria-label="นำสมาชิกออกจากกิลด์" title="นำสมาชิกออกจากกิลด์">−</button></div>';
        return '<tr><td class="gd-sequence">'+(state.page*PAGE_SIZE+index+1).toLocaleString("th-TH")+'</td>'+
          '<td><span class="gd-name">'+esc(row.character_name||"—")+'</span><span class="gd-sub">ชื่อเล่น: '+esc(row.nickname||"—")+' · '+accountLabel+'</span></td>'+
          '<td>'+classCell+'</td><td>'+positionCell+'</td>'+
          '<td><span class="member-admin-health-pill is-'+esc(health.tone||"muted")+'">'+esc(health.label||"ตรวจสอบไม่ได้")+'</span></td>'+
          '<td>'+affiliationCell+'</td><td><span class="gd-record-status '+statusClass+'">'+esc(statusLabel)+'</span></td>'+
          '<td>'+presence+'</td><td>'+esc(formatBangkokDateTime(row.created_at))+'</td><td>'+actions+'</td></tr>';
      }).join("");
    }
    const pages=Math.max(1,Math.ceil(state.total/PAGE_SIZE));
    const visibleTotal = state.healthFilter === "all" ? state.total : filteredRows.length;
    $("gd-page-label").textContent="แสดง "+(filteredRows.length?state.page*PAGE_SIZE+1:0)+"–"+Math.min((state.page+1)*PAGE_SIZE,visibleTotal)+" จาก "+visibleTotal+" รายชื่อ · หน้า "+(state.page+1)+" / "+pages;
    $("gd-prev").disabled=state.page<=0||state.busy;
    $("gd-next").disabled=(state.page+1)*PAGE_SIZE>=state.total||state.busy;
  }

  async function loadSuspendedMembers() {
    const target=$("gd-suspended-rows"), count=$("gd-suspended-count");
    try {
      const results=await Promise.all([
        supabaseClient.from("guild_members").select("user_id,character_name,game_class,nickname,discord_name,role,active,membership_status,created_at,game_uid,guild_position").or("active.eq.false,membership_status.neq.active"),
        supabaseClient.from("guild_manual_members").select("id,character_name,game_class,nickname,discord_name,active,created_at,guild_position,linked_user_id").eq("active",false)
      ]);
      if(results[0].error)throw results[0].error; if(results[1].error)throw results[1].error;
      const rows=[...(results[0].data||[]).map(x=>({...x,record_type:"account",member_id:x.user_id})),...(results[1].data||[]).filter(x=>!x.linked_user_id).map(x=>({...x,record_type:"manual",manual_member_id:x.id,membership_status:"suspended"}))];
      state.suspendedRows=enrichDirectoryRows(rows);
      if(count)count.textContent=rows.length.toLocaleString("th-TH")+" รายชื่อ";
      if(!target)return;
      if(!rows.length){target.innerHTML='<tr><td colspan="6" class="gd-empty">ไม่มีสมาชิกที่ถูกระงับ</td></tr>';return;}
      target.innerHTML=state.suspendedRows.map((row,i)=>{
        const id=row.member_id||row.manual_member_id, account=row.record_type==="account"?"เชื่อมต่อแล้ว":"ยังไม่มีบัญชีผู้ใช้งาน";
        const actions='<div class="gd-actions gd-member-actions"><button class="btn btn-outline btn-sm" type="button" data-gd-view="'+esc(id)+'" data-gd-kind="'+row.record_type+'">ดูข้อมูล</button><button class="btn btn-outline btn-sm" type="button" data-gd-edit="'+esc(id)+'" data-gd-kind="'+row.record_type+'">แก้ไข</button><button class="btn btn-sm manual-member-toggle-btn is-activate" type="button" data-gd-toggle="'+esc(id)+'" data-gd-kind="'+row.record_type+'">เปิดใช้งาน</button><button class="member-row-remove" type="button" data-gd-remove="'+esc(id)+'" data-gd-kind="'+row.record_type+'" aria-label="นำสมาชิกออกจากกิลด์">−</button></div>';
        return '<tr><td class="gd-sequence">'+(i+1).toLocaleString("th-TH")+'</td><td><span class="gd-name">'+esc(row.character_name||"—")+'</span><span class="gd-sub">ชื่อเล่น: '+esc(row.nickname||"—")+' · '+account+'</span></td><td>'+esc(row.game_class||"—")+'</td><td><span class="gd-record-status is-inactive">ถูกระงับ</span></td><td>'+esc(formatBangkokDateTime(row.created_at))+'</td><td>'+actions+'</td></tr>';
      }).join("");
    } catch(error) { console.error("[Member Management Center] Suspended members:",error); if(target)target.innerHTML='<tr><td colspan="6" class="gd-empty">ไม่สามารถโหลดข้อมูลสมาชิกที่ถูกระงับได้: '+esc(error.message||"Unknown error")+'</td></tr>'; if(count)count.textContent="—"; }
  }
  async function loadDirectory(force=false) {
    if (!isAllowed()) return;
    const tbody=$("gd-rows");
    if (state.busy) return;
    const key=keyForRequest(),cached=cache.get(key);
    if(!force&&cached&&Date.now()-cached.at<45_000){Object.assign(state,{rows:enrichDirectoryRows(cached.data.items||[]),total:cached.data.total||0,counts:cached.data.counts||null});renderStats(state.counts);renderRows();await loadSuspendedMembers();return;}
    state.busy=true;
    if(tbody)tbody.innerHTML='<tr><td colspan="10" class="gd-empty">กำลังโหลดข้อมูลสมาชิก...</td></tr>';
    try{
      const {data,error}=await supabaseClient.rpc("get_guild_member_directory",{
        p_search:state.search||null,p_guild_filter:state.guild,p_class_filter:state.gameClass,
        p_record_type:state.recordType,p_limit:PAGE_SIZE,p_offset:state.page*PAGE_SIZE
      });
      if(error)throw error;
      Object.assign(state,{rows:enrichDirectoryRows(data?.items||[]),total:Number(data?.total||0),counts:data?.counts||{}});
      cache.set(key,{at:Date.now(),data});renderStats(state.counts);renderRows();await loadSuspendedMembers();
    }catch(error){
      console.error("[Member Management Center]",error);
      if(tbody)tbody.innerHTML='<tr><td colspan="10" class="gd-empty">ไม่สามารถโหลดข้อมูลสมาชิกได้: '+esc(error.message||"Unknown error")+'</td></tr>';
    }finally{
      state.busy=false;renderRows();
      if(directoryRealtimePending){directoryRealtimePending=false;queueDirectoryRealtimeRefresh();}
    }
  }

  let directoryRealtimeChannel=null,directoryRealtimeTimer=null,directoryRealtimePending=false;
  function queueDirectoryRealtimeRefresh(){
    const page=$("page-member-management");
    if(!page||page.classList.contains("hidden"))return;
    if(directoryRealtimeTimer)window.clearTimeout(directoryRealtimeTimer);
    directoryRealtimeTimer=window.setTimeout(()=>{directoryRealtimeTimer=null;if(state.busy){directoryRealtimePending=true;return;}cache.clear();void loadDirectory(true);},250);
  }
  window.setGuildAffiliationRealtime=function(active){
    if(!active){
      if(directoryRealtimeTimer)window.clearTimeout(directoryRealtimeTimer);
      directoryRealtimeTimer=null;directoryRealtimePending=false;
      if(directoryRealtimeChannel){void supabaseClient.removeChannel(directoryRealtimeChannel);directoryRealtimeChannel=null;}
      return;
    }
    if(directoryRealtimeChannel)return;
    directoryRealtimeChannel=supabaseClient.channel("member-management-center-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"guild_member_affiliations"},queueDirectoryRealtimeRefresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"guild_members"},queueDirectoryRealtimeRefresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"guild_manual_members"},queueDirectoryRealtimeRefresh)
      .subscribe();
  };

  let editing=null,detailRow=null;
  function openDetail(identity,kind){
    const row=[...state.rows,...state.suspendedRows].find(item=>String(item.member_id||item.manual_member_id)===String(identity)&&(!kind||item.record_type===kind));
    const drawer=$("member-admin-profile-drawer"),content=$("member-admin-profile-content");
    if(!row||!drawer||!content)return;
    detailRow=row;
    const health=row.discordHealth||{label:"ตรวจสอบไม่ได้"};
    const accountLabel=row.record_type==="account"?"เชื่อมต่อแล้ว":"ยังไม่มีบัญชีผู้ใช้งาน";
    const rowHtml=(label,value)=>'<div class="member-admin-profile-row"><span>'+esc(label)+'</span><strong>'+esc(value||"—")+'</strong></div>';
    const classInfo=typeof getClassInfo==="function"?getClassInfo(row.game_class):null;
    content.innerHTML=
      '<div class="member-admin-profile-identity">'+(classInfo?.iconPath?'<img src="'+esc(classInfo.iconPath)+'" alt="">':'<span class="member-admin-profile-avatar">◈</span>')+
      '<div><h4>'+esc(row.character_name||"ไม่ระบุชื่อ")+'</h4><span style="color:'+esc(classInfo?.color||"#ff8a96")+'">'+esc(row.game_class||"ยังไม่ระบุคลาส")+'</span><p class="member-admin-health-detail">'+esc(row.nickname||"—")+' · '+accountLabel+'</p></div></div>'+
      '<section class="member-admin-profile-section"><h4>ข้อมูลตัวละคร</h4>'+rowHtml("ตัวละคร",row.character_name)+rowHtml("UID ตัวละคร",row.game_uid)+rowHtml("คลาส",row.game_class)+rowHtml("ตำแหน่งกิลด์",row.guild_position)+rowHtml("สังกัดปัจจุบัน",row.guild_code||"ยังไม่ระบุสังกัด")+'</section>'+
      '<section class="member-admin-profile-section"><h4>ข้อมูลส่วนตัวสมาชิก</h4>'+rowHtml("ชื่อเล่น",row.nickname)+rowHtml("สถานะบัญชี",accountLabel)+rowHtml("สถานะสมาชิก",row.record_type==="manual"?"Manual":(row.active===false?"Inactive":"Active"))+rowHtml("ออนไลน์",row.online?"ออนไลน์":"ออฟไลน์")+rowHtml("วันที่เข้าระบบ",formatBangkokDateTime(row.created_at))+rowHtml("เริ่มสังกัดเมื่อ",formatBangkokDateTime(row.affiliation_started_at))+'</section>'+
      '<section class="member-admin-profile-section"><h4>ข้อมูลบัญชี Discord</h4><div class="member-admin-health-pill is-'+esc(health.tone||"muted")+'">'+esc(health.label||"ตรวจสอบไม่ได้")+'</div>'+rowHtml("Discord",row.discord_name)+rowHtml("Discord Username",row.discord_username)+rowHtml("Discord Global Name",row.discord_global_name)+rowHtml("Discord User ID",row.discord_user_id)+'</section>'+
      '<section class="member-admin-profile-section"><h4>ประวัติสังกัดกิลด์</h4><div id="member-admin-affiliation-history" class="gd-history-list" aria-live="polite"><p class="gd-muted">กำลังโหลดประวัติ...</p></div></section>';
    $("member-admin-profile-title").textContent=row.character_name||"ข้อมูลสมาชิก";
    drawer.classList.remove("hidden");
    document.body.classList.add("member-admin-drawer-open");
    void loadQuickViewHistory(row);
  }
  function closeDetail(){
    $("member-admin-profile-drawer")?.classList.add("hidden");
    document.body.classList.remove("member-admin-drawer-open");
    detailRow=null;
  }

  async function loadQuickViewHistory(row){
    const target=$("member-admin-affiliation-history");
    if(!target)return;
    target.innerHTML='<p class="gd-muted">กำลังโหลดประวัติ...</p>';
    try{
      const kind=row.record_type;
      const identity=kind==="account"?row.member_id:row.manual_member_id;
      const {data,error}=await supabaseClient.from("guild_affiliation_events")
        .select("id,old_guild_code,new_guild_code,change_reason,actor_display_name,created_at")
        .eq(kind==="account"?"user_id":"manual_member_id",identity)
        .order("created_at",{ascending:false}).limit(50);
      if(error)throw error;
      if((data||[]).length){
        target.innerHTML=data.map(item=>{
          const oldLabel=item.old_guild_code||"ยังไม่ระบุสังกัด";
          const newLabel=item.new_guild_code==="unassigned"?"ยังไม่ระบุสังกัด":(item.new_guild_code||"ยังไม่ระบุสังกัด");
          return '<article class="gd-history-item"><strong>'+esc(oldLabel)+' → '+esc(newLabel)+'</strong>'+
            '<p>ดำเนินการโดย: '+esc(item.actor_display_name||"—")+'</p>'+
            '<p>วันที่ดำเนินการ: '+esc(formatBangkokDateTime(item.created_at))+'</p>'+
            '<p>เหตุผลในการเปลี่ยนสังกัด: '+esc(item.change_reason||"—")+'</p></article>';
        }).join("");
        return;
      }
      let legacy=supabaseClient.from("guild_member_affiliations")
        .select("id,started_at,ended_at,change_reason,guilds(code)")
        .order("started_at",{ascending:false}).limit(50);
      legacy=kind==="account"?legacy.eq("user_id",identity):legacy.eq("manual_member_id",identity);
      const fallback=await legacy;
      if(fallback.error)throw fallback.error;
      target.innerHTML=(fallback.data||[]).length?fallback.data.map(item=>
        '<article class="gd-history-item"><strong>สังกัด: '+esc(item.guilds?.code||"ยังไม่ระบุสังกัด")+'</strong>'+
        '<p>ดำเนินการโดย: ไม่พบข้อมูลย้อนหลัง</p>'+
        '<p>วันที่ดำเนินการ: '+esc(formatBangkokDateTime(item.started_at))+'</p>'+
        '<p>เหตุผลในการเปลี่ยนสังกัด: '+esc(item.change_reason||"ไม่พบข้อมูลย้อนหลัง")+'</p>'+
        '<p>สิ้นสุด: '+esc(item.ended_at?formatBangkokDateTime(item.ended_at):"ปัจจุบัน")+'</p></article>'
      ).join(""):'<p class="gd-muted">ยังไม่มีประวัติการเปลี่ยนสังกัด</p>';
    }catch(error){
      target.innerHTML='<p class="gd-status">ไม่สามารถโหลดประวัติได้: '+esc(error.message||"Unknown error")+'</p>';
    }
  }

  function openAssign(identity,kind,initialCode){
    if(!canAssign()){alert("คุณไม่มีสิทธิ์ดำเนินการนี้");return;}
    const row=[...state.rows,...state.suspendedRows].find(item=>String(item.member_id||item.manual_member_id)===String(identity));
    if(!row)return;editing=row;
    $("gd-member-label").textContent=(row.character_name||"—")+" · "+(row.game_class||"—");
    $("gd-new-guild").value=initialCode||row.guild_code||"unassigned";$("gd-reason").value="";$("gd-assign-status").textContent="";
    $("gd-modal").hidden=false;$("gd-new-guild").focus();
  }
  function closeAssign(){$("gd-modal").hidden=true;editing=null;renderRows();}
  async function saveAssign(event){
    event.preventDefault();if(!editing||!canAssign())return;
    const guildCode=$("gd-new-guild").value;if(!guildCode){$("gd-assign-status").textContent="กรุณาเลือกสังกัด";return;}
    const reason=$("gd-reason").value.trim();if(!reason){$("gd-assign-status").textContent="กรุณาระบุเหตุผลในการเปลี่ยนสังกัด";$("gd-reason").focus();return;}
    const button=$("gd-save");button.disabled=true;button.textContent="กำลังบันทึก...";
    try{
      const {error}=await supabaseClient.rpc("set_guild_member_affiliation",{
        p_guild_code:guildCode,p_user_id:editing.record_type==="account"?editing.member_id:null,
        p_manual_member_id:editing.record_type==="manual"?editing.manual_member_id:null,
        p_reason:reason
      });
      if(error)throw error;
      cache.clear();closeAssign();closeDetail();await loadDirectory(true);
      // Refresh the public member directory immediately after an affiliation change.
      // Do not rely only on Realtime delivery: the public page may be open in another tab.
      if(typeof loadMembers==="function")await loadMembers(true);
    }catch(error){$("gd-assign-status").textContent=error.message||"ไม่สามารถบันทึกข้อมูลได้";}
    finally{button.disabled=false;button.textContent="บันทึกข้อมูล";}
  }

  function bindEvents(){
    $("gd-filter-form")?.addEventListener("submit",event=>{event.preventDefault();state.search=$("gd-search").value.trim();state.guild=$("gd-guild").value;state.gameClass=$("gd-class").value;state.recordType="all";state.page=0;void loadDirectory(true);});
    $("manual-member-class-summary")?.addEventListener("click",event=>{
      const button=event.target.closest("[data-manual-member-class]");if(!button)return;
      event.preventDefault();event.stopImmediatePropagation();
      state.gameClass=button.dataset.manualMemberClass||"all";
      $("gd-class").value=state.gameClass;state.page=0;void loadDirectory(true);
    },true);
    $("manual-member-quality-strip")?.addEventListener("click",event=>{
      const button=event.target.closest("[data-quality-filter]");if(!button)return;
      event.preventDefault();event.stopImmediatePropagation();
      state.healthFilter=button.dataset.qualityFilter||"all";state.page=0;renderRows();
      $("manual-member-quality-strip").querySelectorAll("[data-quality-filter]").forEach(item=>item.classList.toggle("is-active",item===button));
    },true);
    $("gd-prev")?.addEventListener("click",()=>{if(state.page>0){state.page--;void loadDirectory();}});
    $("gd-next")?.addEventListener("click",()=>{if((state.page+1)*PAGE_SIZE<state.total){state.page++;void loadDirectory();}});
    $("gd-refresh")?.addEventListener("click",()=>{cache.clear();void loadDirectory(true);});
    $("gd-cancel")?.addEventListener("click",closeAssign);
    $("gd-modal")?.addEventListener("click",event=>{if(event.target===$("gd-modal"))closeAssign();});
    $("gd-assign-form")?.addEventListener("submit",saveAssign);
    $("member-admin-profile-drawer")?.addEventListener("click",event=>{if(event.target.closest("[data-member-admin-drawer-close]"))closeDetail();});
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&detailRow)closeDetail();});
    $("member-admin-affiliation-panel")?.addEventListener("click",event=>{
      const view=event.target.closest("[data-gd-view]");
      const edit=event.target.closest("[data-gd-edit]");
      const toggle=event.target.closest("[data-gd-toggle]");
      const remove=event.target.closest("[data-gd-remove]");
      const identity=view?.dataset.gdView||edit?.dataset.gdEdit||toggle?.dataset.gdToggle||remove?.dataset.gdRemove;
      const kind=view?.dataset.gdKind||edit?.dataset.gdKind||toggle?.dataset.gdKind||remove?.dataset.gdKind;
      const row=identity?[...state.rows,...state.suspendedRows].find(item=>String(item.member_id||item.manual_member_id)===String(identity)&&item.record_type===kind):null;
      if(toggle){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const shouldActivate=toggle.textContent.trim()==="เปิดใช้งาน";
        void (async()=>{
          if(!isAllowed())return;
          toggle.disabled=true;
          try{
            let query;
            if(kind==="manual"){
              query=supabaseClient.from("guild_manual_members")
                .update({active:shouldActivate})
                .eq("id",identity)
                .is("linked_user_id",null)
                .select("id")
                .single();
            }else if(kind==="account"){
              query=supabaseClient.from("guild_members")
                .update({active:shouldActivate,membership_status:shouldActivate?"active":"suspended"})
                .eq("user_id",identity)
                .select("user_id")
                .single();
            }else{
              throw new Error("ไม่รู้จักประเภทบัญชีสมาชิก");
            }
            const {data,error}=await query;
            if(error)throw error;
            if(!data)throw new Error("ไม่พบข้อมูลสมาชิกที่ต้องการเปลี่ยนสถานะ");
            cache.clear();
            await loadDirectory(true);
            if(typeof loadMembers==="function")await loadMembers(true);
          }catch(error){
            console.error("[Member Management Center] Change member status:",error);
            const diagnostic=[error?.message,error?.code?("Code: "+error.code):"",error?.details?("Details: "+error.details):"",error?.hint?("Hint: "+error.hint):""].filter(Boolean).join("\n");
            alert((shouldActivate?"เปิดใช้งาน":"ระงับ")+"สมาชิกไม่สำเร็จ: "+(diagnostic||"กรุณาลองอีกครั้ง"));
            toggle.disabled=false;
          }
        })();
        return;
      }
      if(!row)return;
      if(view){
        openDetail(identity,kind);
      }else if(edit){
        if(kind==="account"&&typeof editLinkedGuildMember==="function")void editLinkedGuildMember(identity);
        else if(kind==="manual"&&typeof editManualGuildMember==="function")void editManualGuildMember(identity);
      }else if(remove&&typeof removeGuildMemberRecord==="function"){
        void removeGuildMemberRecord(kind,identity);
      }
    });
    $("member-admin-affiliation-panel")?.addEventListener("change",async event=>{
      const affiliation=event.target.closest("[data-gd-affiliation]");
      if(affiliation){
        const identity=affiliation.dataset.gdAffiliation,kind=affiliation.dataset.gdKind;
        const row=[...state.rows,...state.suspendedRows].find(item=>String(item.member_id||item.manual_member_id)===String(identity)&&item.record_type===kind);
        if(!row)return;
        const selected=affiliation.value;
        if(selected===(row.guild_code||"unassigned"))return;
        openAssign(identity,kind,selected);
        return;
      }
      const position=event.target.closest("[data-gd-position]");
      if(position){
        if(!canAssign())return;
        const identity=position.dataset.gdPosition,kind=position.dataset.gdKind;
        const row=[...state.rows,...state.suspendedRows].find(item=>String(item.member_id||item.manual_member_id)===String(identity)&&item.record_type===kind);
        if(!row)return;
        const previous=row.guild_position;
        position.disabled=true;
        try{
          const value=position.value||null;
          const query=kind==="manual"
            ? supabaseClient.from("guild_manual_members").update({guild_position:value}).eq("id",identity)
            : supabaseClient.from("guild_members").update({guild_position:value}).eq("user_id",identity);
          const {error}=await query;if(error)throw error;
          cache.clear();
          if(typeof loadManualMemberManagement==="function")window.memberManagementLoadPromise=loadManualMemberManagement();
          await Promise.resolve(window.memberManagementLoadPromise);
          await loadDirectory(true);
        }catch(error){
          alert("ไม่สามารถบันทึกตำแหน่งกิลด์ได้: "+(error.message||"Unknown error"));
          position.value=previous||"";
        }finally{position.disabled=false;}
      }
    });
  }

  async function activate(){
    ensurePage();if(!isAllowed())return;
    const page=$("page-member-management");
    if(page&&!page.classList.contains("hidden")){
      window.setGuildAffiliationRealtime?.(true);
      await Promise.resolve(window.memberManagementLoadPromise);
      await loadDirectory();
    }
  }

  const originalOpen=window.openGuildPage||openGuildPage;
  window.openGuildPage=function(pageName,...args){
    const legacyRoute=pageName===LEGACY_PAGE;let target=legacyRoute?PAGE:pageName;
    if(target===PAGE&&!isAllowed())target="dashboard";
    if(target!==PAGE)window.setGuildAffiliationRealtime?.(false);
    originalOpen.call(this,target,...args);
    if(target===PAGE){ensurePage();activate();}
  };

  ensurePage();
  window.addEventListener("4am:app-ready",()=>{ensurePage();if(typeof syncManagementMenuVisibility==="function")syncManagementMenuVisibility();activate();});
})();
(() => {
  "use strict";

  const PAGE = "member-management";
  const LEGACY_PAGE = "guild-directory";
  const PAGE_SIZE = 50;
  const cache = new Map();
  const state = { search:"", guild:"all", gameClass:"all", recordType:"all", healthFilter:"all", page:0, rows:[], total:0, counts:null, busy:false };
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
      ".gd-root{display:grid;gap:16px;color:#f4f4f5}.gd-root[hidden]{display:none!important}",
      ".gd-panel{padding:18px;border:1px solid rgba(232,51,63,.22);border-radius:14px;background:linear-gradient(145deg,#21191c,#121214)}",
      ".gd-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px}",
      ".gd-head h2{font-size:20px;margin:2px 0}.gd-muted{color:#aaa;font-size:15px;line-height:1.55}",
      ".gd-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}",
      ".gd-stat{padding:13px;border:1px solid rgba(232,51,63,.18);border-radius:11px;background:rgba(255,255,255,.025)}",
      ".gd-stat span{display:block;color:#aaa;font-size:15px}.gd-stat strong{display:block;font-size:24px;margin-top:3px}",
      ".gd-toolbar{display:grid;grid-template-columns:minmax(220px,1.6fr) repeat(3,minmax(135px,1fr)) auto;gap:9px;margin-bottom:14px}",
      ".gd-field{width:100%;min-width:0;min-height:43px;padding:9px 11px;border:1px solid rgba(232,51,63,.32);border-radius:9px;background:#101012;color:#fff;font-size:15px}",
      ".gd-field:focus-visible,.gd-button:focus-visible{outline:2px solid #ff6674;outline-offset:2px}",
      ".gd-table-wrap{overflow:auto}.gd-table{width:100%;min-width:1050px;border-collapse:collapse}",
      ".gd-table th,.gd-table td{padding:12px 10px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:middle;font-size:15px}",
      ".gd-table th{color:#f08a92;font-weight:800;white-space:nowrap}.gd-name{font-weight:800}.gd-sub{display:block;color:#aaa;font-size:15px}",
      ".gd-pill{display:inline-flex;align-items:center;padding:5px 9px;border:1px solid rgba(255,255,255,.14);border-radius:99px;font-size:15px;font-weight:800;white-space:nowrap}",
      ".gd-pill.am{background:rgba(217,54,67,.12);border-color:rgba(217,54,67,.42);color:#ff9da5}.gd-pill.pm{background:rgba(118,92,190,.13);border-color:rgba(118,92,190,.42);color:#cbbcff}",
      ".gd-pill.none{background:rgba(255,255,255,.04);color:#bbb}.gd-pill.manual{color:#ff9da5;border-color:rgba(217,54,67,.42);background:rgba(217,54,67,.12)}",
      ".gd-button{min-height:39px;padding:8px 12px;border:1px solid rgba(255,255,255,.16);border-radius:9px;background:#29292f;color:#fff;font-size:15px;font-weight:700;cursor:pointer}",
      ".gd-button.primary{background:#d93643;border-color:#d93643}.gd-button:disabled{opacity:.45;cursor:not-allowed}",
      ".gd-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.gd-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px}",
      ".gd-empty{padding:28px;text-align:center;color:#aaa;font-size:15px}.gd-modal{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:16px}",
      ".gd-dialog{width:min(560px,100%);max-height:88vh;overflow:auto;padding:21px;border:1px solid rgba(232,51,63,.4);border-radius:16px;background:#1c1c21;box-shadow:0 24px 70px #000a}",
      ".gd-dialog h2{margin:0 0 4px;font-size:20px}.gd-dialog label{display:grid;gap:6px;margin:14px 0;color:#ddd;font-size:15px}",
      ".gd-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.gd-status{min-height:22px;color:#ff9da5;font-size:15px}",
      ".gd-modal[hidden]{display:none}.gd-history-list{display:grid;gap:9px;max-height:min(55vh,520px);overflow:auto}",
      ".gd-history-item{padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#151519}.gd-history-item strong{font-size:16px}.gd-history-item p{margin:5px 0 0;color:#aaa;font-size:15px;line-height:1.5}",
      ".gd-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.gd-detail{padding:12px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:#151519;min-width:0}.gd-detail span{display:block;color:#aaa;font-size:15px;margin-bottom:5px}.gd-detail strong{display:block;color:#fff;font-size:15px;overflow-wrap:anywhere}",
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
      "@media(max-width:520px){.gd-root .manual-member-quality-strip{grid-template-columns:repeat(2,minmax(0,1fr))}"

      "@media(max-width:900px){.gd-toolbar{grid-template-columns:repeat(2,minmax(0,1fr))}.gd-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}",
      "@media(max-width:520px){.gd-toolbar{grid-template-columns:1fr}.gd-panel{padding:14px}.gd-stats{gap:8px}.gd-stat strong{font-size:21px}.gd-detail-grid{grid-template-columns:1fr}}"
    ].join("");
    document.head.appendChild(style);
  }

  if (typeof PAGE_TITLES !== "undefined") PAGE_TITLES[LEGACY_PAGE] = "จัดการรายชื่อสมาชิก";

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
        <div class="gd-head"><div><span class="section-kicker">MEMBER MANAGEMENT CENTER</span><h2>ศูนย์จัดการสมาชิก</h2><p class="gd-muted">จัดการข้อมูลสมาชิก สังกัดกิลด์</p></div><button class="gd-button" id="gd-refresh" type="button">↻ รีเฟรช</button></div>
        <section class="gd-legacy-quality-host" id="gd-quality-host" aria-label="สรุปสถานะสมาชิก"></section>
        <section class="gd-panel gd-class-panel"><div id="gd-class-heading-host"></div><div id="gd-class-summary-host"></div></section>
        <section class="gd-panel">
          <div class="gd-head"><div><h2>รายชื่อสมาชิกทั้งหมด</h2><p class="gd-muted">ค้นหา กรอง และจัดการข้อมูลสมาชิกจากรายการเดียว</p></div></div>
          <form class="gd-toolbar" id="gd-filter-form">
            <input class="gd-field" id="gd-search" type="search" maxlength="80" placeholder="ค้นหาชื่อตัวละคร ชื่อเล่น หรือ Discord..." aria-label="ค้นหาชื่อตัวละคร ชื่อเล่น หรือ Discord">
            <select class="gd-field" id="gd-guild" aria-label="สังกัดกิลด์"><option value="all">ทั้งหมด</option><option value="4AM">4AM</option><option value="4PM">4PM</option><option value="unassigned">ไม่ระบุสังกัด</option></select>
            <select class="gd-field" id="gd-class" aria-label="คลาสตัวละคร"><option value="all">ทุกคลาส</option><option>Ironclad</option><option>Bloodstrom</option><option>Celestune</option><option>Numina</option><option>Sylph</option><option>Nightwaker</option><option>Dragonsvelte</option><option>Mystech</option></select>
            <select class="gd-field" id="gd-type" aria-label="ประเภทบัญชี"><option value="all">ทุกประเภท</option><option value="account">บัญชีเว็บไซต์</option><option value="manual">Manual</option></select>
            <button class="gd-button primary" type="submit">ค้นหา</button>
          </form>
          <div class="gd-table-wrap"><table class="gd-table"><thead><tr>
            <th>ลำดับ</th><th>ตัวละคร</th><th>ชื่อเล่น</th><th>คลาส</th><th>ตำแหน่งกิลด์</th><th>Discord Health</th><th>สังกัดกิลด์</th><th>สถานะสมาชิก</th><th>ออนไลน์</th><th>วันที่เข้าระบบ</th><th>จัดการ</th>
          </tr></thead><tbody id="gd-rows"><tr><td colspan="11" class="gd-empty">กำลังโหลดข้อมูลสมาชิก...</td></tr></tbody></table></div>
          <div class="gd-pagination"><span class="gd-muted" id="gd-page-label" aria-live="polite">—</span><div class="gd-actions"><button class="gd-button" id="gd-prev" type="button">← ก่อนหน้า</button><button class="gd-button" id="gd-next" type="button">ถัดไป →</button></div></div>
        </section>
      </section>
      <div class="gd-modal" id="gd-detail-modal" hidden><section class="gd-dialog" role="dialog" aria-modal="true" aria-labelledby="gd-detail-title">
        <div class="gd-head"><div><h2 id="gd-detail-title">ข้อมูลสมาชิก</h2><p class="gd-muted" id="gd-detail-subtitle"></p></div><button class="gd-button" id="gd-detail-close" type="button">ปิด</button></div>
        <div class="gd-detail-grid" id="gd-detail-grid"></div>
        <div class="gd-dialog-actions"><button class="gd-button" id="gd-detail-history" type="button">ดูประวัติ</button><button class="gd-button primary" id="gd-detail-assign" type="button">เปลี่ยนสังกัด</button></div>
      </section></div>
      <div class="gd-modal" id="gd-modal" hidden><form class="gd-dialog" id="gd-assign-form" role="dialog" aria-modal="true" aria-labelledby="gd-assign-title"><h2 id="gd-assign-title">เปลี่ยนสังกัดกิลด์</h2><p class="gd-muted" id="gd-member-label"></p><label>สังกัดใหม่<select class="gd-field" id="gd-new-guild" required><option value="">เลือกสังกัด</option><option value="4AM">4AM</option><option value="4PM">4PM</option></select></label><label>เหตุผลในการเปลี่ยนสังกัด<input class="gd-field" id="gd-reason" maxlength="160" placeholder="ระบุเหตุผล (ไม่บังคับ)"></label><p class="gd-status" id="gd-assign-status" role="status" aria-live="polite"></p><div class="gd-dialog-actions"><button class="gd-button" id="gd-cancel" type="button">ยกเลิก</button><button class="gd-button primary" id="gd-save" type="submit">บันทึกข้อมูล</button></div></form></div>
      <div class="gd-modal" id="gd-history-modal" hidden><section class="gd-dialog" role="dialog" aria-modal="true" aria-labelledby="gd-history-title"><h2 id="gd-history-title">ประวัติการเปลี่ยนสังกัด</h2><p class="gd-muted" id="gd-history-member"></p><div class="gd-history-list" id="gd-history-list" aria-live="polite"><p class="gd-muted">กำลังโหลดประวัติ...</p></div><div class="gd-dialog-actions"><button class="gd-button" id="gd-history-close" type="button">ปิด</button></div></section></div>`);
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
      const merged = { ...source, ...row };
      merged.game_uid = source.game_uid || linkedManual?.game_uid || null;
      merged.guild_position = source.guild_position || linkedManual?.guild_position || null;
      merged.discord_user_id = source.discord_user_id || linkedManual?.discord_user_id || null;
      merged.discord_username = source.discord_username || linkedManual?.discord_username || null;
      merged.discord_global_name = source.discord_global_name || linkedManual?.discord_global_name || null;
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
      tbody.innerHTML = '<tr><td colspan="11" class="gd-empty">ไม่พบสมาชิกที่ตรงกับเงื่อนไข</td></tr>';
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
        const buttons = '<button class="gd-button" type="button" data-gd-detail="'+esc(identity)+'" data-gd-kind="'+esc(row.record_type)+'">ข้อมูลสมาชิก</button>' +
          (canAssign() ? '<button class="gd-button" type="button" data-gd-assign="'+esc(identity)+'" data-gd-kind="'+esc(row.record_type)+'">เปลี่ยนสังกัด</button>' : '') +
          ((canAssign() || (row.record_type==="account" && String(currentUser?.id)===String(row.member_id))) ? '<button class="gd-button" type="button" data-gd-history="'+esc(identity)+'" data-gd-kind="'+esc(row.record_type)+'">ดูประวัติ</button>' : '');
        return '<tr><td class="gd-sequence">'+(state.page*PAGE_SIZE+index+1).toLocaleString("th-TH")+'</td>' +
          '<td><span class="gd-name">'+esc(row.character_name||"—")+'</span></td>' +
          '<td>'+esc(row.nickname||"—")+'</td>' +
          '<td><span class="manual-member-class" style="--class-color:'+esc(cls?.color||"#aaa")+'">'+esc(row.game_class||"—")+'</span></td>' +
          '<td>'+(canAssign() ? '<select class="gd-field gd-position-select" data-gd-position="'+esc(identity)+'" data-gd-kind="'+esc(row.record_type)+'"><option value="">ยังไม่ได้กำหนด</option>'+(typeof GUILD_POSITIONS!=="undefined"?GUILD_POSITIONS:[]).map(position=>'<option value="'+esc(position)+'" '+(row.guild_position===position?'selected':'')+'>'+esc(position)+'</option>').join("")+'</select>' : esc(row.guild_position||"ยังไม่ได้กำหนด"))+'</td>' +
          '<td><span class="member-admin-health-pill is-'+esc(health.tone||"muted")+'">'+esc(health.label||"ตรวจสอบไม่ได้")+'</span></td>' +
          '<td><span class="gd-pill '+guildClass+'">'+esc(guildLabel)+'</span></td>' +
          '<td><span class="gd-record-status '+statusClass+'">'+esc(statusLabel)+'</span></td>' +
          '<td>'+presence+'</td><td>'+esc(formatBangkokDateTime(row.created_at))+'</td>' +
          '<td><div class="gd-actions">'+buttons+'</div></td></tr>';
      }).join("");
    }
    const pages=Math.max(1,Math.ceil(state.total/PAGE_SIZE));
    const visibleTotal = state.healthFilter === "all" ? state.total : filteredRows.length;
    $("gd-page-label").textContent="แสดง "+(filteredRows.length?state.page*PAGE_SIZE+1:0)+"–"+Math.min((state.page+1)*PAGE_SIZE,visibleTotal)+" จาก "+visibleTotal+" รายชื่อ · หน้า "+(state.page+1)+" / "+pages;
    $("gd-prev").disabled=state.page<=0||state.busy;
    $("gd-next").disabled=(state.page+1)*PAGE_SIZE>=state.total||state.busy;
  }

  async function loadDirectory(force=false) {
    if (!isAllowed()) return;
    const tbody=$("gd-rows");
    if (state.busy) return;
    const key=keyForRequest(),cached=cache.get(key);
    if(!force&&cached&&Date.now()-cached.at<45_000){Object.assign(state,{rows:enrichDirectoryRows(cached.data.items||[]),total:cached.data.total||0,counts:cached.data.counts||null});renderStats(state.counts);renderRows();return;}
    state.busy=true;
    if(tbody)tbody.innerHTML='<tr><td colspan="11" class="gd-empty">กำลังโหลดข้อมูลสมาชิก...</td></tr>';
    try{
      const {data,error}=await supabaseClient.rpc("get_guild_member_directory",{
        p_search:state.search||null,p_guild_filter:state.guild,p_class_filter:state.gameClass,
        p_record_type:state.recordType,p_limit:PAGE_SIZE,p_offset:state.page*PAGE_SIZE
      });
      if(error)throw error;
      Object.assign(state,{rows:enrichDirectoryRows(data?.items||[]),total:Number(data?.total||0),counts:data?.counts||{}});
      cache.set(key,{at:Date.now(),data});renderStats(state.counts);renderRows();
    }catch(error){
      console.error("[Member Management Center]",error);
      if(tbody)tbody.innerHTML='<tr><td colspan="11" class="gd-empty">ไม่สามารถโหลดข้อมูลสมาชิกได้: '+esc(error.message||"Unknown error")+'</td></tr>';
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
    const row=state.rows.find(item=>String(item.member_id||item.manual_member_id)===String(identity)&&(!kind||item.record_type===kind));if(!row)return;detailRow=row;
    $("gd-detail-title").textContent=row.character_name||"ข้อมูลสมาชิก";
    $("gd-detail-subtitle").textContent=(row.nickname||"—")+" · "+(row.game_class||"—");
    const health=row.discordHealth||{label:"ตรวจสอบไม่ได้"};
    const values=[
      ["ตัวละคร",row.character_name],["ชื่อเล่น",row.nickname],["คลาส",row.game_class],
      ["ตำแหน่งกิลด์",row.guild_position||"ยังไม่ได้กำหนด"],["Discord Health",health.label],
      ["Discord",row.discord_name],["Discord Username",row.discord_username],
      ["Discord Global Name",row.discord_global_name],["Discord User ID",row.discord_user_id],
      ["สังกัดปัจจุบัน",row.guild_code||"ยังไม่ระบุสังกัด"],
      ["สถานะสมาชิก",row.record_type==="manual"?"Manual":(row.active===false?"Inactive":"Active")],
      ["ออนไลน์",row.online?"ออนไลน์":"ออฟไลน์"],["วันที่เข้าระบบ",formatBangkokDateTime(row.created_at)],
      ["เริ่มสังกัดเมื่อ",formatBangkokDateTime(row.affiliation_started_at)]
    ];
    $("gd-detail-grid").innerHTML=values.map(([label,value])=>'<div class="gd-detail"><span>'+esc(label)+'</span><strong>'+esc(value||"—")+'</strong></div>').join("");
    $("gd-detail-history").hidden=!(canAssign()||(row.record_type==="account"&&String(currentUser?.id)===String(row.member_id)));
    $("gd-detail-assign").hidden=!canAssign();
    $("gd-detail-modal").hidden=false;
  }
  function closeDetail(){$("gd-detail-modal").hidden=true;detailRow=null;}

  function openAssign(identity,kind){
    if(!canAssign()){alert("คุณไม่มีสิทธิ์ดำเนินการนี้");return;}
    const row=state.rows.find(item=>String(item.member_id||item.manual_member_id)===String(identity));
    if(!row)return;editing=row;
    $("gd-member-label").textContent=(row.character_name||"—")+" · "+(row.game_class||"—");
    $("gd-new-guild").value=row.guild_code||"";$("gd-reason").value="";$("gd-assign-status").textContent="";
    $("gd-modal").hidden=false;$("gd-new-guild").focus();
  }
  function closeAssign(){$("gd-modal").hidden=true;editing=null;}
  function closeHistory(){$("gd-history-modal").hidden=true;}

  async function openHistory(identity,kind){
    const row=state.rows.find(item=>String(item.member_id||item.manual_member_id)===String(identity));if(!row)return;
    const isOwner=row.record_type==="account"&&String(currentUser?.id)===String(row.member_id);
    if(!canAssign()&&!isOwner)return;
    $("gd-history-member").textContent=(row.character_name||"—")+" · "+(row.game_class||"—");
    $("gd-history-list").innerHTML='<p class="gd-muted">กำลังโหลดประวัติ...</p>';$("gd-history-modal").hidden=false;
    try{
      let query=supabaseClient.from("guild_member_affiliations")
        .select("id,started_at,ended_at,change_reason,created_at,guild_id,guilds(code,name)")
        .order("started_at",{ascending:false}).limit(50);
      query=kind==="account"?query.eq("user_id",identity):query.eq("manual_member_id",identity);
      const {data,error}=await query;if(error)throw error;
      $("gd-history-list").innerHTML=(data||[]).length?(data||[]).map(item=>{
        const code=item.guilds?.code||"ยังไม่ระบุสังกัด",status=item.ended_at?"สิ้นสุดแล้ว":"สังกัดปัจจุบัน";
        return '<article class="gd-history-item"><div class="gd-head" style="margin:0"><strong>'+esc(code)+'</strong><span class="gd-pill '+(item.ended_at?"none":code==="4PM"?"pm":"am")+'">'+status+'</span></div>'+
          '<p>เริ่ม: '+esc(formatBangkokDateTime(item.started_at))+'<br>สิ้นสุด: '+esc(item.ended_at?formatBangkokDateTime(item.ended_at):"ปัจจุบัน")+'</p>'+
          '<p>เหตุผลในการเปลี่ยนสังกัด: '+esc(item.change_reason||"ไม่ได้ระบุ")+'</p></article>';
      }).join(""):'<p class="gd-muted">ยังไม่มีประวัติการเปลี่ยนสังกัด</p>';
    }catch(error){$("gd-history-list").innerHTML='<p class="gd-status">ไม่สามารถโหลดข้อมูลสมาชิกได้: '+esc(error.message||"Unknown error")+'</p>';}
  }

  async function saveAssign(event){
    event.preventDefault();if(!editing||!canAssign())return;
    const guildCode=$("gd-new-guild").value;if(!guildCode){$("gd-assign-status").textContent="กรุณาเลือกสังกัด";return;}
    const button=$("gd-save");button.disabled=true;button.textContent="กำลังบันทึก...";
    try{
      const {error}=await supabaseClient.rpc("set_guild_member_affiliation",{
        p_guild_code:guildCode,p_user_id:editing.record_type==="account"?editing.member_id:null,
        p_manual_member_id:editing.record_type==="manual"?editing.manual_member_id:null,
        p_reason:$("gd-reason").value.trim()||null
      });
      if(error)throw error;
      cache.clear();closeAssign();closeDetail();await loadDirectory(true);
    }catch(error){$("gd-assign-status").textContent=error.message||"ไม่สามารถบันทึกข้อมูลได้";}
    finally{button.disabled=false;button.textContent="บันทึกข้อมูล";}
  }

  function bindEvents(){
    $("gd-filter-form")?.addEventListener("submit",event=>{event.preventDefault();state.search=$("gd-search").value.trim();state.guild=$("gd-guild").value;state.gameClass=$("gd-class").value;state.recordType=$("gd-type").value;state.page=0;void loadDirectory(true);});
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
    $("gd-history-close")?.addEventListener("click",closeHistory);
    $("gd-history-modal")?.addEventListener("click",event=>{if(event.target===$("gd-history-modal"))closeHistory();});
    $("gd-detail-close")?.addEventListener("click",closeDetail);
    $("gd-detail-modal")?.addEventListener("click",event=>{if(event.target===$("gd-detail-modal"))closeDetail();});
    $("gd-detail-history")?.addEventListener("click",()=>{if(!detailRow)return;const row=detailRow;closeDetail();void openHistory(row.member_id||row.manual_member_id,row.record_type);});
    $("gd-detail-assign")?.addEventListener("click",()=>{if(!detailRow)return;const row=detailRow;closeDetail();openAssign(row.member_id||row.manual_member_id,row.record_type);});
    $("gd-rows")?.addEventListener("click",event=>{
      const detail=event.target.closest("[data-gd-detail]"),assign=event.target.closest("[data-gd-assign]"),history=event.target.closest("[data-gd-history]");
      if(detail)openDetail(detail.dataset.gdDetail,detail.dataset.gdKind);
      else if(assign)openAssign(assign.dataset.gdAssign,assign.dataset.gdKind);
      else if(history)void openHistory(history.dataset.gdHistory,history.dataset.gdKind);
    });
    $("gd-rows")?.addEventListener("change",async event=>{
      const select=event.target.closest("[data-gd-position]");if(!select||!canAssign())return;
      const row=state.rows.find(item=>String(item.member_id||item.manual_member_id)===String(select.dataset.gdPosition)&&item.record_type===select.dataset.gdKind);
      if(!row)return;
      select.disabled=true;
      try{
        const value=select.value||null;
        const query=row.record_type==="manual"
          ? supabaseClient.from("guild_manual_members").update({guild_position:value}).eq("id",row.manual_member_id)
          : supabaseClient.from("guild_members").update({guild_position:value}).eq("user_id",row.member_id);
        const {error}=await query;if(error)throw error;
        cache.clear();
        if(typeof loadManualMemberManagement==="function")window.memberManagementLoadPromise=loadManualMemberManagement();
        await Promise.resolve(window.memberManagementLoadPromise);
        await loadDirectory(true);
      }catch(error){alert("ไม่สามารถบันทึกตำแหน่งกิลด์ได้: "+(error.message||"Unknown error"));select.value=row.guild_position||"";}
      finally{select.disabled=false;}
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
  window.openGuildPage=function(pageName){
    const legacyRoute=pageName===LEGACY_PAGE;let target=legacyRoute?PAGE:pageName;
    if(target===PAGE&&!isAllowed())target="dashboard";
    if(target!==PAGE)window.setGuildAffiliationRealtime?.(false);
    originalOpen.call(this,target);
    if(target===PAGE){ensurePage();activate();}
  };

  ensurePage();
  window.addEventListener("4am:app-ready",()=>{ensurePage();if(typeof syncManagementMenuVisibility==="function")syncManagementMenuVisibility();activate();});
})();
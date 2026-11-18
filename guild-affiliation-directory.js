(() => {
  "use strict";

  const PAGE = "guild-directory";
  const CACHE_TTL = 45_000;
  const PAGE_SIZE = 50;
  const cache = new Map();
  const state = { search: "", guild: "all", gameClass: "all", recordType: "all", page: 0, rows: [], total: 0, counts: null, busy: false };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
  const $ = id => document.getElementById(id);
  const isAllowed = () => !!currentUser && !!currentMember && currentMember.active === true &&
    currentMember.membership_status === "active";
  const canAssign = () => isAllowed() && typeof canManageMemberProfiles === "function" &&
    canManageMemberProfiles() && !(typeof isRolePreviewActive === "function" && isRolePreviewActive());

  function styles() {
    if ($("guild-directory-styles")) return;
    const style = document.createElement("style");
    style.id = "guild-directory-styles";
    style.textContent = [
      ".gd-root{display:grid;gap:16px;color:#f4f4f5}",
      ".gd-panel{padding:18px;border:1px solid rgba(232,51,63,.22);border-radius:14px;background:linear-gradient(145deg,#21191c,#121214)}",
      ".gd-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px}",
      ".gd-head h2{font-size:20px;margin:2px 0}.gd-muted{color:#aaa;font-size:15px;line-height:1.55}",
      ".gd-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}",
      ".gd-stat{padding:13px;border:1px solid rgba(232,51,63,.18);border-radius:11px;background:rgba(255,255,255,.025)}",
      ".gd-stat span{display:block;color:#aaa;font-size:15px}.gd-stat strong{display:block;font-size:24px;margin-top:3px}",
      ".gd-toolbar{display:grid;grid-template-columns:minmax(200px,1.6fr) repeat(3,minmax(140px,1fr)) auto;gap:9px;margin-bottom:14px}",
      ".gd-field{width:100%;min-width:0;min-height:43px;padding:9px 11px;border:1px solid rgba(232,51,63,.32);border-radius:9px;background:#101012;color:#fff;font-size:15px}",
      ".gd-field:focus{outline:2px solid rgba(232,51,63,.3);border-color:#d93643}",
      ".gd-table-wrap{overflow:auto}.gd-table{width:100%;min-width:800px;border-collapse:collapse}",
      ".gd-table th,.gd-table td{padding:12px 10px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:middle;font-size:15px}",
      ".gd-table th{color:#f08a92;font-weight:800;white-space:nowrap}.gd-name{font-weight:800}.gd-sub{display:block;color:#aaa;font-size:15px}",
      ".gd-pill{display:inline-flex;align-items:center;padding:5px 9px;border:1px solid rgba(255,255,255,.14);border-radius:99px;font-size:15px;font-weight:800;white-space:nowrap}",
      ".gd-pill.am{background:rgba(217,54,67,.12);border-color:rgba(217,54,67,.42);color:#ff9da5}",
      ".gd-pill.pm{background:rgba(118,92,190,.13);border-color:rgba(118,92,190,.42);color:#cbbcff}",
      ".gd-pill.none{background:rgba(255,255,255,.04);color:#bbb}.gd-pill.manual{color:#ff9da5;border-color:rgba(217,54,67,.42);background:rgba(217,54,67,.12)}",
      ".gd-button{min-height:39px;padding:8px 12px;border:1px solid rgba(255,255,255,.16);border-radius:9px;background:#29292f;color:#fff;font-size:15px;font-weight:700;cursor:pointer}",
      ".gd-button.primary{background:#d93643;border-color:#d93643}.gd-button:disabled{opacity:.45;cursor:not-allowed}",
      ".gd-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.gd-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px}",
      ".gd-empty{padding:28px;text-align:center;color:#aaa;font-size:15px}.gd-modal{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:16px}",
      ".gd-dialog{width:min(500px,100%);padding:21px;border:1px solid rgba(232,51,63,.4);border-radius:16px;background:#1c1c21;box-shadow:0 24px 70px #000a}",
      ".gd-dialog h2{margin:0 0 4px;font-size:20px}.gd-dialog label{display:grid;gap:6px;margin:14px 0;color:#ddd;font-size:15px}",
      ".gd-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.gd-status{min-height:22px;color:#ff9da5;font-size:15px}.gd-modal[hidden]{display:none}.gd-history-list{display:grid;gap:9px;max-height:min(55vh,520px);overflow:auto}.gd-history-item{padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#151519}.gd-history-item strong{font-size:16px}.gd-history-item p{margin:5px 0 0;color:#aaa;font-size:15px;line-height:1.5}",
      "@media(max-width:900px){.gd-toolbar{grid-template-columns:repeat(2,minmax(0,1fr))}.gd-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}",
      "@media(max-width:520px){.gd-toolbar{grid-template-columns:1fr}.gd-panel{padding:14px}.gd-stats{gap:8px}.gd-stat strong{font-size:21px}}"
    ].join("");
    document.head.appendChild(style);
  }

  if (typeof PAGE_TITLES !== "undefined") PAGE_TITLES[PAGE] = "Guild Directory";

  function ensurePage() {
    if ($("page-guild-directory")) return;
    const nav = document.querySelector(".sidebar-nav");
    const memberNav = document.querySelector('.sidebar .nav-item[data-page="members"]');
    if (nav && memberNav && !document.querySelector('.sidebar .nav-item[data-page="guild-directory"]')) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nav-item";
      button.dataset.page = PAGE;
      button.innerHTML = '<svg class="icon"><use href="#i-users"/></svg><span>Guild Directory</span>';
      memberNav.insertAdjacentElement("afterend", button);
      button.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        window.openGuildPage(PAGE);
      });
    }
    const main = document.querySelector(".main-area");
    if (!main) return;
    const page = document.createElement("section");
    page.id = "page-guild-directory";
    page.className = "page page-padded hidden";
    page.innerHTML = `
      <div class="page-intro"><span class="section-kicker">GUILD AFFILIATION</span><h1>Guild Directory</h1><p>รายชื่อสมาชิก 4AM และ 4PM ในหน้ารวมเดียว พร้อมจัดการสังกัดและประวัติการย้าย</p></div>
      <div class="gd-root">
        <section class="gd-stats" id="gd-stats"></section>
        <section class="gd-panel">
          <div class="gd-head"><div><h2>Member Directory</h2><p class="gd-muted">ค้นหาและกรองข้อมูลจากฐานข้อมูลโดยตรง · แสดงครั้งละ ${PAGE_SIZE} รายชื่อ</p></div><button class="gd-button" id="gd-refresh" type="button">↻ รีเฟรช</button></div>
          <form class="gd-toolbar" id="gd-filter-form">
            <input class="gd-field" id="gd-search" type="search" maxlength="80" placeholder="ค้นหาชื่อตัวละคร ชื่อเล่น หรือ Discord">
            <select class="gd-field" id="gd-guild"><option value="all">ทุกสังกัด</option><option value="4AM">4AM</option><option value="4PM">4PM</option><option value="unassigned">ยังไม่กำหนดสังกัด</option></select>
            <select class="gd-field" id="gd-class"><option value="all">ทุก Class</option><option>Ironclad</option><option>Bloodstrom</option><option>Celestune</option><option>Numina</option><option>Sylph</option><option>Nightwaker</option><option>Dragonsvelte</option><option>Mystech</option></select>
            <select class="gd-field" id="gd-type"><option value="all">ทุกประเภท</option><option value="account">บัญชีเว็บไซต์</option><option value="manual">Manual เท่านั้น</option></select>
            <button class="gd-button primary" type="submit">ค้นหา</button>
          </form>
          <div class="gd-table-wrap"><table class="gd-table"><thead><tr><th>สมาชิก</th><th>Class</th><th>Discord</th><th>ประเภท</th><th>สังกัด</th><th>จัดการ</th></tr></thead><tbody id="gd-rows"><tr><td colspan="6" class="gd-empty">กำลังโหลด...</td></tr></tbody></table></div>
          <div class="gd-pagination"><span class="gd-muted" id="gd-page-label">—</span><div class="gd-actions"><button class="gd-button" id="gd-prev" type="button">← ก่อนหน้า</button><button class="gd-button" id="gd-next" type="button">ถัดไป →</button></div></div>
        </section>
      </div>
      <div class="gd-modal" id="gd-modal" hidden><form class="gd-dialog" id="gd-assign-form"><h2>กำหนดสังกัดสมาชิก</h2><p class="gd-muted" id="gd-member-label"></p><label>สังกัดใหม่<select class="gd-field" id="gd-new-guild" required><option value="">เลือกสังกัด</option><option value="4AM">4AM</option><option value="4PM">4PM</option></select></label><label>เหตุผลในการเปลี่ยนสังกัด<input class="gd-field" id="gd-reason" maxlength="160" placeholder="ระบุเหตุผล (ไม่บังคับ)"></label><p class="gd-status" id="gd-assign-status" role="status" aria-live="polite"></p><div class="gd-dialog-actions"><button class="gd-button" id="gd-cancel" type="button">ยกเลิก</button><button class="gd-button primary" id="gd-save" type="submit">บันทึกสังกัด</button></div></form></div>\n      <div class="gd-modal" id="gd-history-modal" hidden><section class="gd-dialog" role="dialog" aria-modal="true" aria-labelledby="gd-history-title"><h2 id="gd-history-title">ประวัติสังกัดสมาชิก</h2><p class="gd-muted" id="gd-history-member"></p><div class="gd-history-list" id="gd-history-list" aria-live="polite"><p class="gd-muted">กำลังโหลดประวัติ...</p></div><div class="gd-dialog-actions"><button class="gd-button" id="gd-history-close" type="button">ปิด</button></div></section></div>`;
    main.appendChild(page);
    styles();
    bindEvents();
  }

  function keyForRequest() {
    return JSON.stringify([state.search,state.guild,state.gameClass,state.recordType,state.page]);
  }

  function renderStats(counts) {
    const values = [
      ["สมาชิกทั้งหมด",counts?.all ?? 0],["สังกัด 4AM",counts?.["4AM"] ?? 0],
      ["สังกัด 4PM",counts?.["4PM"] ?? 0],["ยังไม่กำหนดสังกัด",counts?.unassigned ?? 0]
    ];
    $("gd-stats").innerHTML = values.map(([label,value]) =>
      '<article class="gd-stat"><span>'+esc(label)+'</span><strong>'+Number(value).toLocaleString("th-TH")+'</strong></article>'
    ).join("");
  }

  function renderRows() {
    const tbody = $("gd-rows");
    if (!tbody) return;
    if (!state.rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="gd-empty">ไม่พบสมาชิกที่ตรงกับเงื่อนไข</td></tr>';
    } else {
      tbody.innerHTML = state.rows.map(row => {
        const identity = row.member_id || row.manual_member_id;
        const guildClass = row.guild_code === "4AM" ? "am" : row.guild_code === "4PM" ? "pm" : "none";
        const guildLabel = row.guild_code || "ยังไม่กำหนด";
        const assign = canAssign()
          ? '<button class="gd-button" type="button" data-gd-assign="'+esc(identity)+'" data-gd-kind="'+esc(row.record_type)+'">กำหนดสังกัด</button>'
          : '';
        const canViewHistory = canAssign() || (row.record_type==="account" && String(currentUser?.id)===String(row.member_id));
        const history = canViewHistory
          ? '<button class="gd-button" type="button" data-gd-history="'+esc(identity)+'" data-gd-kind="'+esc(row.record_type)+'">ประวัติ</button>'
          : '';
        const actions = assign || history ? '<div class="gd-actions">'+assign+history+'</div>' : '<span class="gd-muted">—</span>';
        return '<tr><td><span class="gd-name">'+esc(row.character_name)+'</span><span class="gd-sub">'+esc(row.nickname || "ไม่ระบุชื่อเล่น")+'</span></td>'+
          '<td>'+esc(row.game_class)+'</td><td>'+esc(row.discord_name || "—")+'</td>'+
          '<td><span class="gd-pill '+(row.record_type==="manual"?"manual":"")+'">'+(row.record_type==="manual"?"Manual":"บัญชีเว็บไซต์")+'</span></td>'+
          '<td><span class="gd-pill '+guildClass+'">'+esc(guildLabel)+'</span></td><td>'+assign+'</td></tr>';
      }).join("");
    }
    const pages = Math.max(1,Math.ceil(state.total/PAGE_SIZE));
    $("gd-page-label").textContent = "แสดง "+(state.total ? state.page*PAGE_SIZE+1 : 0)+"–"+Math.min((state.page+1)*PAGE_SIZE,state.total)+" จาก "+state.total+" รายชื่อ · หน้า "+(state.page+1)+" / "+pages;
    $("gd-prev").disabled = state.page<=0 || state.busy;
    $("gd-next").disabled = (state.page+1)*PAGE_SIZE>=state.total || state.busy;
  }

  async function loadDirectory(force=false) {
    if (!isAllowed()) return;
    const tbody = $("gd-rows");
    if (state.busy) return;
    const key = keyForRequest();
    const cached = cache.get(key);
    if (!force && cached && Date.now()-cached.at<CACHE_TTL) {
      Object.assign(state,{rows:cached.data.items||[],total:cached.data.total||0,counts:cached.data.counts||null});
      renderStats(state.counts); renderRows(); return;
    }
    state.busy = true;
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="gd-empty">กำลังโหลดข้อมูลสมาชิก...</td></tr>';
    try {
      const {data,error} = await supabaseClient.rpc("get_guild_member_directory",{
        p_search:state.search||null,p_guild_filter:state.guild,p_class_filter:state.gameClass,
        p_record_type:state.recordType,p_limit:PAGE_SIZE,p_offset:state.page*PAGE_SIZE
      });
      if (error) throw error;
      Object.assign(state,{rows:data?.items||[],total:Number(data?.total||0),counts:data?.counts||{}});
      cache.set(key,{at:Date.now(),data});
      renderStats(state.counts); renderRows();
    } catch(error) {
      console.error("[Guild Directory]",error);
      if (tbody) tbody.innerHTML='<tr><td colspan="6" class="gd-empty">โหลดข้อมูลไม่สำเร็จ: '+esc(error.message||"Unknown error")+'</td></tr>';
    } finally { state.busy=false; renderRows(); }
  }

  let editing = null;
  function openAssign(identity,kind) {
    if (!canAssign()) { alert("เฉพาะ Developer, Leader และ Management ที่มีสิทธิ์เท่านั้น"); return; }
    const row = state.rows.find(item => String(item.member_id||item.manual_member_id)===String(identity));
    if (!row) return;
    editing = row;
    $("gd-member-label").textContent = row.character_name+" · "+row.game_class+" · "+(row.record_type==="manual"?"Manual":"บัญชีเว็บไซต์");
    $("gd-new-guild").value = row.guild_code || "";
    $("gd-reason").value = "";
    $("gd-assign-status").textContent = "";
    $("gd-modal").hidden = false;
    $("gd-new-guild").focus();
  }
  function closeAssign() { $("gd-modal").hidden=true; editing=null; }

  function closeHistory() { $("gd-history-modal").hidden=true; }

  async function openHistory(identity,kind) {
    const row=state.rows.find(item=>String(item.member_id||item.manual_member_id)===String(identity));
    if(!row)return;
    const isOwner=row.record_type==="account"&&String(currentUser?.id)===String(row.member_id);
    if(!canAssign()&&!isOwner)return;
    $("gd-history-member").textContent=row.character_name+" · "+row.game_class;
    $("gd-history-list").innerHTML='<p class="gd-muted">กำลังโหลดประวัติ...</p>';
    $("gd-history-modal").hidden=false;
    try {
      let query=supabaseClient.from("guild_member_affiliations")
        .select("id,started_at,ended_at,change_reason,created_at,guild_id,guilds(code,name)")
        .order("started_at",{ascending:false}).limit(50);
      query=kind==="account"?query.eq("user_id",identity):query.eq("manual_member_id",identity);
      const {data,error}=await query;
      if(error)throw error;
      const rows=data||[];
      $("gd-history-list").innerHTML=rows.length?rows.map(item=>{
        const code=item.guilds?.code||"สังกัดไม่พร้อมใช้งาน";
        const status=item.ended_at?"สิ้นสุดแล้ว":"สังกัดปัจจุบัน";
        const start=item.started_at?new Date(item.started_at).toLocaleString("th-TH"):"—";
        const end=item.ended_at?new Date(item.ended_at).toLocaleString("th-TH"):"ปัจจุบัน";
        return '<article class="gd-history-item"><div class="gd-head" style="margin:0"><strong>'+esc(code)+'</strong><span class="gd-pill '+(item.ended_at?"none":"am")+'">'+status+'</span></div><p>เริ่ม: '+esc(start)+'<br>สิ้นสุด: '+esc(end)+'</p><p>เหตุผล: '+esc(item.change_reason||"ไม่ได้ระบุ")+'</p></article>';
      }).join(""):'<p class="gd-muted">ยังไม่มีประวัติการกำหนดสังกัด</p>';
    } catch(error) {
      $("gd-history-list").innerHTML='<p class="gd-status">โหลดประวัติไม่สำเร็จ: '+esc(error.message||"Unknown error")+'</p>';
    }
  }

  async function saveAssign(event) {
    event.preventDefault();
    if (!editing || !canAssign()) return;
    const guildCode = $("gd-new-guild").value;
    if (!guildCode) { $("gd-assign-status").textContent="กรุณาเลือกสังกัด"; return; }
    const button = $("gd-save");
    button.disabled=true; button.textContent="กำลังบันทึก...";
    $("gd-assign-status").textContent="";
    try {
      const {error} = await supabaseClient.rpc("set_guild_member_affiliation",{
        p_guild_code:guildCode,
        p_user_id:editing.record_type==="account"?editing.member_id:null,
        p_manual_member_id:editing.record_type==="manual"?editing.manual_member_id:null,
        p_reason:$("gd-reason").value.trim()||null
      });
      if (error) throw error;
      cache.clear(); closeAssign(); await loadDirectory(true);
    } catch(error) {
      $("gd-assign-status").textContent=error.message||"บันทึกไม่สำเร็จ";
    } finally { button.disabled=false; button.textContent="บันทึกสังกัด"; }
  }

  function bindEvents() {
    $("gd-filter-form")?.addEventListener("submit",event=>{
      event.preventDefault(); state.search=$("gd-search").value.trim(); state.guild=$("gd-guild").value;
      state.gameClass=$("gd-class").value; state.recordType=$("gd-type").value; state.page=0; void loadDirectory(true);
    });
    $("gd-prev")?.addEventListener("click",()=>{if(state.page>0){state.page--;void loadDirectory()}});
    $("gd-next")?.addEventListener("click",()=>{if((state.page+1)*PAGE_SIZE<state.total){state.page++;void loadDirectory()}});
    $("gd-refresh")?.addEventListener("click",()=>{cache.clear();void loadDirectory(true)});
    $("gd-cancel")?.addEventListener("click",closeAssign);
    $("gd-modal")?.addEventListener("click",event=>{if(event.target===$("gd-modal"))closeAssign()});
    $("gd-assign-form")?.addEventListener("submit",saveAssign);
    $("gd-history-close")?.addEventListener("click",closeHistory);
    $("gd-history-modal")?.addEventListener("click",event=>{if(event.target===$("gd-history-modal"))closeHistory()});
    $("gd-rows")?.addEventListener("click",event=>{
      const assignButton=event.target.closest("[data-gd-assign]");
      const historyButton=event.target.closest("[data-gd-history]");
      if(assignButton)openAssign(assignButton.dataset.gdAssign,assignButton.dataset.gdKind);
      else if(historyButton)void openHistory(historyButton.dataset.gdHistory,historyButton.dataset.gdKind);
    });
  }

  function activate() {
    ensurePage();
    if (!isAllowed()) return;
    void loadDirectory();
  }

  const originalOpen = window.openGuildPage || openGuildPage;
  window.openGuildPage = function(pageName) {
    let target=pageName;
    if (target===PAGE && !isAllowed()) target="dashboard";
    originalOpen.call(this,target);
    if (target===PAGE) activate();
  };

  ensurePage();
  window.addEventListener("4am:app-ready",()=> {
    if (typeof syncManagementMenuVisibility==="function") syncManagementMenuVisibility();
    if ($("page-guild-directory") && !$("page-guild-directory").classList.contains("hidden")) activate();
  });
})();
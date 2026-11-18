(() => {
  "use strict";
  const PAGE="patch-command-center", REVIEW_PAGE="patch-review-queue", PAGE_SIZE=50;
  const state={roundId:null,tab:"overview",search:"",status:"all",page:0,data:null,busy:false,workspace:null,workspaceTab:"overview",reviewTarget:null};
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const activeMember=()=>!!currentUser&&!!currentMember&&currentMember.active===true&&currentMember.membership_status==="active";
  const allowed=()=>activeMember()&&typeof isManagement==="function"&&isManagement()&&!(typeof isRolePreviewActive==="function"&&isRolePreviewActive());
  const statusText={not_submitted:"ยังไม่ส่ง",partial:"ส่งไม่ครบ",pending:"รอตรวจ",reviewing:"กำลังตรวจ",approved:"ผ่านแล้ว",revision_required:"ต้องแก้ไข",submitted:"ส่ง Patch",resubmitted:"ส่ง Version ใหม่"};
  const statusPill=s=>'<span class="pc-pill pc-'+esc(s)+'">'+esc(statusText[s]||s||"—")+'</span>';
  const dateLabel=v=>{if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"});};

  function injectStyles(){
    if($("pc-styles"))return;
    const style=document.createElement("style");style.id="pc-styles";
    style.textContent=[
      ".pc-root{display:grid;gap:15px;color:#f5f5f6}.pc-panel{padding:18px;border:1px solid rgba(217,54,67,.22);border-radius:14px;background:linear-gradient(145deg,#21191c,#121214)}",
      ".pc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px}.pc-head h2{margin:2px 0;font-size:20px}.pc-muted{color:#aaa;font-size:15px;line-height:1.55}",
      ".pc-kicker{color:#f08a92;font-size:15px;font-weight:800;letter-spacing:.1em}.pc-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.pc-field{min-height:42px;min-width:150px;padding:8px 10px;border:1px solid rgba(217,54,67,.35);border-radius:9px;background:#101012;color:#fff;font-size:15px}",
      ".pc-btn{min-height:39px;padding:8px 12px;border:1px solid rgba(255,255,255,.15);border-radius:9px;background:#29292f;color:#fff;font-size:15px;font-weight:700;cursor:pointer}.pc-btn.primary{background:#d93643;border-color:#d93643}.pc-btn.danger{border-color:#8a343d;color:#ff9da5}.pc-btn:disabled{opacity:.45;cursor:not-allowed}",
      ".pc-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.pc-stat{padding:14px;border:1px solid rgba(217,54,67,.18);border-radius:11px;background:rgba(255,255,255,.025)}.pc-stat span{display:block;color:#aaa;font-size:15px}.pc-stat strong{display:block;font-size:25px;margin-top:3px}",
      ".pc-tabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid #39343a}.pc-tab{border:0;border-bottom:2px solid transparent;background:transparent;color:#aaa;padding:11px 14px;font-size:15px;cursor:pointer}.pc-tab.active{color:#fff;border-color:#d93643}",
      ".pc-table-wrap{overflow:auto}.pc-table{width:100%;min-width:780px;border-collapse:collapse}.pc-table th,.pc-table td{padding:11px 9px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:middle;font-size:15px}.pc-table th{color:#f08a92;white-space:nowrap}.pc-name{font-weight:800}.pc-sub{display:block;color:#aaa;font-size:15px}",
      ".pc-pill{display:inline-flex;padding:5px 9px;border-radius:99px;border:1px solid rgba(255,255,255,.14);font-size:15px;font-weight:800;white-space:nowrap}.pc-not_submitted{color:#bbb;background:#29292f}.pc-pending{color:#ff9da5;background:#35171b;border-color:#88343d}.pc-reviewing{color:#9bcaff;background:#14253a;border-color:#365d83}.pc-approved{color:#8de0b3;background:#14291f;border-color:#2d7551}.pc-revision_required{color:#ff9da5;background:#35171b;border-color:#88343d}",
      ".pc-progress{height:8px;border-radius:99px;background:#333;overflow:hidden}.pc-progress i{display:block;height:100%;background:linear-gradient(90deg,#a9202d,#f05a65)}.pc-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.pc-member{padding:14px;border:1px solid #37343a;border-radius:11px;background:#17171b}.pc-member h3{margin:0;font-size:17px}.pc-member p{margin:4px 0;color:#aaa;font-size:15px}.pc-empty{padding:28px;text-align:center;color:#aaa;font-size:15px}",
      ".pc-split{display:grid;grid-template-columns:1.2fr .8fr;gap:12px}.pc-list{display:grid;gap:9px}.pc-event{padding:11px 12px;border-left:3px solid #d93643;border-radius:7px;background:#19191e}.pc-event strong{display:block}.pc-event small{color:#aaa;font-size:15px}",
      ".pc-form{display:grid;grid-template-columns:1.2fr 1fr 1fr auto;gap:9px;align-items:end}.pc-form label{display:grid;gap:6px;color:#ccc;font-size:15px}.pc-form input{min-width:0;min-height:42px;padding:8px 10px;border:1px solid rgba(217,54,67,.35);border-radius:9px;background:#101012;color:#fff;font-size:15px;color-scheme:dark}",
      ".pc-modal{position:fixed;inset:0;z-index:10001;display:grid;place-items:center;padding:16px;background:#000b}.pc-dialog{width:min(620px,100%);max-height:90vh;overflow:auto;padding:20px;border:1px solid #75424a;border-radius:15px;background:#1c1c21;box-shadow:0 24px 70px #000a}.pc-dialog h2{margin:0 0 4px;font-size:20px}.pc-dialog label{display:grid;gap:6px;margin:13px 0;font-size:15px}.pc-dialog textarea{min-height:90px;resize:vertical}.pc-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.pc-workspace-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pc-file{padding:13px;border:1px solid #39343a;border-radius:10px;background:#17171b}.pc-hidden{display:none!important}",
      "@media(max-width:900px){.pc-stats{grid-template-columns:repeat(2,1fr)}.pc-cards{grid-template-columns:repeat(2,1fr)}.pc-split{grid-template-columns:1fr}.pc-form{grid-template-columns:1fr 1fr}.pc-form label:first-child{grid-column:1/-1}}",
      "@media(max-width:560px){.pc-panel{padding:14px}.pc-cards,.pc-workspace-grid{grid-template-columns:1fr}.pc-form{grid-template-columns:1fr}.pc-form label:first-child{grid-column:auto}.pc-field{width:100%}}"
    ].join("");
    document.head.appendChild(style);
  }

  if (typeof PAGE_TITLES !== "undefined") PAGE_TITLES[PAGE] = "Patch Submission Command Center";
  function ensurePage(){
    const existingPage=$("page-patch-command-center");
    const directoryNav=document.querySelector('.sidebar .nav-item[data-page="guild-directory"]');
    const memberNav=document.querySelector('.sidebar .nav-item[data-page="members"]');
    const nav=directoryNav?.parentElement||memberNav?.parentElement;
    if(nav&&!document.querySelector('.sidebar .nav-item[data-page="'+PAGE+'"]')){
      const button=document.createElement("button");button.type="button";button.className="nav-item management-only is-role-hidden";button.dataset.page=PAGE;button.dataset.managementOnly="";button.setAttribute("aria-hidden","true");
      button.innerHTML='<svg class="icon"><use href="#i-folder-image"/></svg><span>Patch Command Center</span>';
      (directoryNav||memberNav).insertAdjacentElement("afterend",button);
      button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();window.openGuildPage(PAGE);});
    }
    const commandNav=document.querySelector('.sidebar .nav-item[data-page="'+PAGE+'"]');
    if(commandNav&&!document.querySelector('.sidebar .nav-item[data-page="'+REVIEW_PAGE+'"]')){
      const button=document.createElement("button");button.type="button";button.className="nav-item management-only is-role-hidden";button.dataset.page=REVIEW_PAGE;button.dataset.managementOnly="";button.setAttribute("aria-hidden","true");
      button.innerHTML='<svg class="icon"><use href="#i-shield-check"/></svg><span>Review Queue</span>';
      commandNav.insertAdjacentElement("afterend",button);
      button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();window.openGuildPage(REVIEW_PAGE);});
    }
    if(existingPage)return;
    const main=document.querySelector(".main-area");if(!main)return;
    const page=document.createElement("section");page.id="page-patch-command-center";page.className="page page-padded hidden";
    page.innerHTML=`
      <div class="page-intro"><span class="section-kicker">PATCH OPERATIONS</span><h1>PATCH SUBMISSION COMMAND CENTER</h1><p>ศูนย์ควบคุมการส่งแฟ้ม ตรวจสอบสถานะ และจัดการประวัติ Patch ของสมาชิก 4AM</p></div>
      <div class="pc-root">
        <section class="pc-panel">
          <div class="pc-head"><div><span class="pc-kicker">ACTIVE PATCH</span><h2 id="pc-round-title">กำลังโหลด Patch...</h2><p class="pc-muted" id="pc-round-dates">—</p></div><div class="pc-toolbar"><select class="pc-field" id="pc-round-select" aria-label="เลือก Patch"></select><button class="pc-btn" id="pc-refresh" type="button">↻ รีเฟรช</button></div></div>
          <div class="pc-toolbar" id="pc-round-actions"></div>
        </section>
        <section class="pc-panel" id="pc-create-panel">
          <div class="pc-head"><div><h2>สร้าง Patch รอบใหม่</h2><p class="pc-muted">กำหนดช่วงเวลาเปิดรับส่งแฟ้ม ระบบจะสร้าง Snapshot Roster เมื่อถึงเวลาเริ่มต้น</p></div><button class="pc-btn" id="pc-toggle-create" type="button">แสดงแบบฟอร์ม</button></div>
          <form id="pc-create-form" class="pc-form pc-hidden">
            <label>ชื่อ Patch<input name="round_name" maxlength="120" required placeholder="เช่น Patch 2.1.2"></label>
            <label>วันและเวลาเริ่ม<input name="starts_at" type="datetime-local" required></label>
            <label>วันและเวลาปิดรับ<input name="closes_at" type="datetime-local" required></label>
            <button class="pc-btn primary" type="submit">＋ สร้าง Patch</button>
          </form>
          <p class="pc-muted" id="pc-create-status" role="status" aria-live="polite"></p>
        </section>
        <nav class="pc-tabs" aria-label="Patch Command Center"><button class="pc-tab active" data-pc-tab="overview">ภาพรวม</button><button class="pc-tab" data-pc-tab="members">สมาชิก / Workspace</button><button class="pc-tab" data-pc-tab="queue">Review Queue</button><button class="pc-tab" data-pc-tab="history">Patch History</button></nav>
        <section id="pc-view-overview" class="pc-view">
          <div class="pc-stats" id="pc-stats"></div>
          <div class="pc-split" style="margin-top:14px"><section class="pc-panel"><div class="pc-head"><div><h2>ต้องติดตาม</h2><p class="pc-muted">สมาชิกที่ยังไม่ส่งหรือมีรายการต้องแก้ไข</p></div></div><div id="pc-attention" class="pc-list"></div></section><section class="pc-panel"><div class="pc-head"><div><h2>กิจกรรมล่าสุด</h2><p class="pc-muted">การเปลี่ยนสถานะ Submission</p></div></div><div id="pc-activity" class="pc-list"></div></section></div>
        </section>
        <section id="pc-view-members" class="pc-view pc-hidden"><section class="pc-panel"><div class="pc-head"><div><h2>Patch Member Roster</h2><p class="pc-muted">Snapshot สมาชิก 4AM ณ เวลาเริ่ม Patch และสมาชิกที่ย้ายเข้า 4AM ระหว่าง Patch</p></div></div><div class="pc-toolbar"><input class="pc-field" id="pc-member-search" maxlength="80" placeholder="ค้นหาสมาชิก"><select class="pc-field" id="pc-member-status"><option value="all">ทุกสถานะ</option><option value="not_submitted">ยังไม่ส่ง</option><option value="partial">ส่งไม่ครบ</option><option value="pending">รอตรวจ</option><option value="reviewing">กำลังตรวจ</option><option value="approved">ผ่านแล้ว</option><option value="revision_required">ต้องแก้ไข</option></select><button class="pc-btn" id="pc-member-search-btn" type="button">ค้นหา</button></div><div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>สมาชิก</th><th>Class</th><th>Roster Source</th><th>แฟ้มทั้งหมด</th><th>ส่งแล้ว</th><th>สถานะ</th><th></th></tr></thead><tbody id="pc-member-rows"></tbody></table></div><div class="pc-toolbar" style="justify-content:space-between;margin-top:12px"><span class="pc-muted" id="pc-member-page-label">—</span><div class="pc-toolbar"><button class="pc-btn" id="pc-member-prev" type="button">← ก่อนหน้า</button><button class="pc-btn" id="pc-member-next" type="button">ถัดไป →</button></div></div></section></section>
        <section id="pc-view-queue" class="pc-view pc-hidden"><section class="pc-panel"><div class="pc-head"><div><h2>Review Queue</h2><p class="pc-muted">ตรวจสอบ Submission ทีละรายการ พร้อมบันทึกผลและเหตุผลการแก้ไข</p></div></div><div class="pc-toolbar"><input class="pc-field" id="pc-queue-search" maxlength="80" placeholder="ค้นหาสมาชิกหรือชื่อแฟ้ม"><select class="pc-field" id="pc-queue-status"><option value="all">ทุกสถานะ</option><option value="pending">รอตรวจ</option><option value="reviewing">กำลังตรวจ</option><option value="approved">ผ่านแล้ว</option><option value="revision_required">ต้องแก้ไข</option></select><button class="pc-btn" id="pc-queue-search-btn" type="button">ค้นหา</button></div><div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>สมาชิก</th><th>แฟ้ม</th><th>Version</th><th>วันที่ส่ง</th><th>สถานะ</th><th>หมายเหตุ</th><th></th></tr></thead><tbody id="pc-queue-rows"></tbody></table></div><div class="pc-muted" id="pc-queue-count"></div><div class="pc-pagination"><span class="pc-muted" id="pc-queue-page-label">—</span><div class="pc-toolbar"><button class="pc-btn" id="pc-queue-prev" type="button">← ก่อนหน้า</button><button class="pc-btn" id="pc-queue-next" type="button">ถัดไป →</button></div></div></section></section>
        <section id="pc-view-history" class="pc-view pc-hidden"><section class="pc-panel"><div class="pc-head"><div><h2>Patch History & Archive</h2><p class="pc-muted">ดูรอบก่อนหน้าและเรียกดู Snapshot เดิม โดยไม่แก้ไขข้อมูลสมาชิกในประวัติ</p></div></div><div id="pc-history-list" class="pc-list"></div></section></section>
        <section id="pc-workspace" class="pc-panel pc-hidden"></section>
      </div>
      <div class="pc-modal pc-hidden" id="pc-review-modal"><form class="pc-dialog" id="pc-review-form"><h2>ตรวจสอบ Patch Submission</h2><p class="pc-muted" id="pc-review-member"></p><label>ผลการตรวจ<select class="pc-field" id="pc-review-status"><option value="reviewing">กำลังตรวจ</option><option value="approved">ผ่านแล้ว</option><option value="revision_required">ต้องแก้ไข</option></select></label><label id="pc-review-note-wrap">หมายเหตุ / สิ่งที่ต้องแก้ไข<textarea class="pc-field" id="pc-review-note" rows="3" maxlength="1000" placeholder="ระบุรายละเอียดเมื่อเลือกต้องแก้ไข"></textarea></label><p class="pc-muted" id="pc-review-error" role="status"></p><div class="pc-dialog-actions"><button class="pc-btn" id="pc-review-cancel" type="button">ยกเลิก</button><button class="pc-btn primary" id="pc-review-save" type="submit">บันทึกผลตรวจ</button></div></form></div>`;
    main.appendChild(page);injectStyles();bindEvents();
  }

  function showTab(tab){
    state.tab=tab;
    document.querySelectorAll("[data-pc-tab]").forEach(b=>b.classList.toggle("active",b.dataset.pcTab===tab));
    ["overview","members","queue","history"].forEach(v=>$("pc-view-"+v)?.classList.toggle("pc-hidden",v!==tab));
    $("pc-workspace")?.classList.add("pc-hidden");
  }

  function roundStatusLabel(round){if(round?.archived_at)return "เก็บเข้าคลัง";return round?.status==="open"?"เปิดรับส่ง":"ปิดรับส่ง";}
  function renderRound(){
    const round=state.data?.selected_round;
    $("pc-round-title").textContent=round?.round_name||"ยังไม่มี Patch";
    $("pc-round-dates").textContent=round?dateLabel(round.starts_at)+" – "+dateLabel(round.closes_at)+" · "+roundStatusLabel(round):"สร้าง Patch รอบแรกเพื่อเริ่มติดตาม Submission";
    const rounds=state.data?.rounds||[];
    $("pc-round-select").innerHTML=rounds.map(r=>'<option value="'+esc(r.id)+'" '+(r.id===round?.id?"selected":"")+'>'+esc(r.round_name)+(r.archived_at?" · Archive":"")+'</option>').join("")||'<option value="">ไม่มี Patch</option>';
    $("pc-round-actions").innerHTML=round?'<span class="pc-pill '+(round.archived_at?"pc-not_submitted":round.status==="open"?"pc-approved":"pc-pending")+'">'+esc(roundStatusLabel(round))+'</span>'+
      (!round.archived_at?'<button class="pc-btn" id="pc-toggle-round" type="button">'+(round.status==="open"?"ปิดรับส่ง":"เปิดรับส่ง")+'</button><button class="pc-btn danger" id="pc-archive-round" type="button">เก็บเข้าคลัง</button>':'<button class="pc-btn" id="pc-restore-round" type="button">กู้คืน Patch</button>'):"";
  }

  function renderOverview(){
    const s=state.data?.summary||{};
    const stats=[["สมาชิกใน Roster",s.roster_count||0],["ส่งแล้ว",s.submitted_members||0],["ยังไม่ส่ง",s.not_submitted||0],["ส่งไม่ครบ",s.partial_members||0],["Submission รอตรวจ",s.pending||0],["ต้องแก้ไข",s.revision_required||0]];
    $("pc-stats").innerHTML=stats.map(([label,value])=>'<article class="pc-stat"><span>'+esc(label)+'</span><strong>'+Number(value).toLocaleString("th-TH")+'</strong></article>').join("");
    const attention=state.data?.attention_members||[];
    $("pc-attention").innerHTML=attention.length?attention.slice(0,10).map(m=>'<div class="pc-event"><strong>'+esc(m.character_name)+' · '+esc(statusText[m.member_status])+'</strong><small>'+esc(m.game_class)+' · '+(m.submitted_folder_count||0)+'/'+(m.folder_count||0)+' แฟ้ม</small></div>').join(""):'<div class="pc-empty">ไม่มีรายการที่ต้องติดตามในหน้านี้</div>';
    const activity=state.data?.recent_activity||[];
    $("pc-activity").innerHTML=activity.length?activity.map(a=>{
      const label=a.activity_type==="submission"?(a.new_status==="resubmitted"?"ส่ง Version ใหม่":"ส่ง Patch"):statusText[a.new_status]||a.new_status;
      const detail=a.activity_type==="submission"?(a.version_name||("Version "+(a.version_number||""))) : (a.review_note||"อัปเดตสถานะการตรวจ");
      return '<div class="pc-event"><strong>'+esc(a.character_name)+' · '+esc(label)+'</strong><small>'+esc(detail)+' · '+dateLabel(a.created_at)+'</small></div>';
    }).join(""):'<div class="pc-empty">ยังไม่มีกิจกรรม Patch</div>';
  }

  function renderMembers(){
    const rows=state.data?.members||[];
    $("pc-member-rows").innerHTML=rows.length?rows.map(m=>'<tr><td><span class="pc-name">'+esc(m.character_name)+'</span><span class="pc-sub">'+esc(m.nickname||"")+'</span></td><td>'+esc(m.game_class)+'</td><td>'+esc(m.roster_source==="affiliation_transfer"?"ย้ายเข้า 4AM":m.roster_source==="manual_link"?"เชื่อมบัญชี Manual":"Opening Snapshot")+'</td><td>'+Number(m.folder_count||0)+'</td><td>'+Number(m.submitted_folder_count||0)+'/'+Number(m.folder_count||0)+'</td><td>'+statusPill(m.member_status)+'</td><td><button class="pc-btn" data-pc-workspace="'+esc(m.member_id)+'">Workspace</button></td></tr>').join(""):'<tr><td colspan="7" class="pc-empty">ไม่พบสมาชิกใน Roster</td></tr>';
    const total=Number(state.data?.member_total||0),pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
    $("pc-member-page-label").textContent="แสดง "+(total?state.page*PAGE_SIZE+1:0)+"–"+Math.min((state.page+1)*PAGE_SIZE,total)+" จาก "+total+" · หน้า "+(state.page+1)+" / "+pages;
    $("pc-member-prev").disabled=state.page<=0||state.busy;$("pc-member-next").disabled=(state.page+1)*PAGE_SIZE>=total||state.busy;
  }

  function renderQueue(){
    const rows=state.data?.review_queue||[];
    $("pc-queue-rows").innerHTML=rows.length?rows.map(r=>'<tr><td><span class="pc-name">'+esc(r.character_name)+'</span><span class="pc-sub">'+esc(r.game_class)+'</span></td><td>'+esc(r.portfolio_title)+'</td><td>'+esc(r.version_name||("Version "+r.version_number))+'</td><td>'+dateLabel(r.submitted_at)+'</td><td>'+statusPill(r.review_status)+'</td><td>'+esc(r.review_note||"—")+'</td><td><button class="pc-btn primary" data-pc-review="'+esc(r.submission_id)+'">ตรวจ</button></td></tr>').join(""):'<tr><td colspan="7" class="pc-empty">ไม่มี Submission ในคิวนี้</td></tr>';
    const total=Number(state.data?.review_queue_total||0),pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
    $("pc-queue-count").textContent="พบ "+total.toLocaleString("th-TH")+" Submission";
    $("pc-queue-page-label").textContent="หน้า "+(state.page+1)+" / "+pages;
    $("pc-queue-prev").disabled=state.page<=0||state.busy;$("pc-queue-next").disabled=(state.page+1)*PAGE_SIZE>=total||state.busy;
  }

  function renderHistory(){
    const rounds=state.data?.rounds||[];
    $("pc-history-list").innerHTML=rounds.length?rounds.map(r=>'<div class="pc-event"><div class="pc-head" style="margin:0"><div><strong>'+esc(r.round_name)+'</strong><small>'+dateLabel(r.starts_at)+' – '+dateLabel(r.closes_at)+' · '+roundStatusLabel(r)+'</small></div><button class="pc-btn" data-pc-history="'+esc(r.id)+'">เปิดรอบนี้</button></div></div>').join(""):'<div class="pc-empty">ยังไม่มีประวัติ Patch</div>';
  }

  async function loadCommandCenter(force=true){
    if(!allowed()||state.busy)return;
    state.busy=true;
    ["pc-member-rows","pc-queue-rows"].forEach(id=>{if($(id))$(id).innerHTML='<tr><td colspan="8" class="pc-empty">กำลังโหลดข้อมูล...</td></tr>';});
    try{
      const {data,error}=await supabaseClient.rpc("get_patch_command_center",{
        p_round_id:state.roundId,p_search:state.search||null,p_status_filter:state.status,
        p_limit:PAGE_SIZE,p_offset:state.page*PAGE_SIZE
      });
      if(error)throw error;
      state.data=data||null;
      if(!state.roundId&&data?.selected_round?.id)state.roundId=data.selected_round.id;
      renderRound();renderOverview();renderMembers();renderQueue();renderHistory();
    }catch(error){
      console.error("[Patch Command Center]",error);
      $("pc-round-title").textContent="โหลดข้อมูลไม่สำเร็จ";
      $("pc-round-dates").textContent=error.message||"Unknown error";
    }finally{state.busy=false;renderMembers();}
  }

  function setRound(id){state.roundId=id||null;state.page=0;state.search="";state.status="all";void loadCommandCenter(true);}

  async function createRound(event){
    event.preventDefault();if(!allowed())return;
    const form=event.currentTarget,fd=new FormData(form),name=String(fd.get("round_name")||"").trim();
    const start=new Date(String(fd.get("starts_at")||"")),close=new Date(String(fd.get("closes_at")||""));
    if(!name||Number.isNaN(start.getTime())||Number.isNaN(close.getTime())||close<=start){$("pc-create-status").textContent="กรุณาตรวจสอบชื่อ Patch และช่วงเวลา";return;}
    const button=form.querySelector("button[type='submit']");button.disabled=true;button.textContent="กำลังสร้าง...";
    try{
      const {data,error}=await supabaseClient.rpc("create_portfolio_patch_round",{
        p_round_name:name,p_starts_at:start.toISOString(),p_closes_at:close.toISOString()
      });
      if(error)throw error;
      state.roundId=data;state.page=0;form.reset();form.classList.add("pc-hidden");$("pc-toggle-create").textContent="แสดงแบบฟอร์ม";
      $("pc-create-status").textContent="สร้าง Patch สำเร็จ · ระบบจะสร้าง Opening Snapshot เมื่อถึงเวลาเริ่ม";
      await loadCommandCenter(true);
    }catch(error){$("pc-create-status").textContent=error.message||"สร้าง Patch ไม่สำเร็จ";}
    finally{button.disabled=false;button.textContent="＋ สร้าง Patch";}
  }

  async function updateRound(action){
    if(!allowed()||!state.roundId)return;
    try{
      const {error}=await supabaseClient.rpc("update_portfolio_patch_round",{p_round_id:state.roundId,p_action:action});
      if(error)throw error;
      state.page=0;await loadCommandCenter(true);
    }catch(error){alert("อัปเดต Patch ไม่สำเร็จ: "+(error.message||"Unknown error"));}
  }

  function openReview(submissionId){
    const row=(state.data?.review_queue||[]).find(x=>x.submission_id===submissionId);if(!row)return;
    state.reviewTarget=row;$("pc-review-member").textContent=row.character_name+" · "+row.portfolio_title+" · "+(row.version_name||"Version "+row.version_number);
    $("pc-review-status").value=row.review_status==="revision_required"?"revision_required":row.review_status==="approved"?"approved":"reviewing";
    $("pc-review-note").value=row.review_note||"";$("pc-review-error").textContent="";$("pc-review-note-wrap").classList.toggle("pc-hidden",$("pc-review-status").value!=="revision_required");
    $("pc-review-modal").classList.remove("pc-hidden");
  }
  function closeReview(){$("pc-review-modal").classList.add("pc-hidden");state.reviewTarget=null;}
  async function saveReview(event){
    event.preventDefault();if(!allowed()||!state.reviewTarget)return;
    const status=$("pc-review-status").value,note=$("pc-review-note").value.trim();
    if(status==="revision_required"&&!note){$("pc-review-error").textContent="กรุณาระบุสิ่งที่สมาชิกต้องแก้ไข";return;}
    const button=$("pc-review-save");button.disabled=true;button.textContent="กำลังบันทึก...";
    try{
      const {error}=await supabaseClient.rpc("set_patch_submission_review",{
        p_submission_id:state.reviewTarget.submission_id,p_status:status,p_review_note:status==="revision_required"?note:null
      });
      if(error)throw error;
      closeReview();state.page=0;await loadCommandCenter(true);
    }catch(error){$("pc-review-error").textContent=error.message||"บันทึกผลตรวจไม่สำเร็จ";}
    finally{button.disabled=false;button.textContent="บันทึกผลตรวจ";}
  }

  async function openWorkspace(memberId){
    const member=(state.data?.members||[]).find(m=>m.member_id===memberId);if(!member)return;
    const host=$("pc-workspace");host.classList.remove("pc-hidden");host.innerHTML='<div class="pc-empty">กำลังโหลด Workspace...</div>';
    try{
      const [portfolioResult,submissionResult,profileResult,affiliationResult]=await Promise.all([
        supabaseClient.from("portfolios").select("id,title,game_class,portfolio_type,created_at")
          .eq("member_id",memberId).order("created_at",{ascending:false}).limit(30),
        supabaseClient.from("portfolio_patch_submissions").select("id,portfolio_id,version_id,submitted_at,portfolio_patch_submission_reviews(status,review_note,reviewed_at)")
          .eq("member_id",memberId).eq("round_id",state.roundId).order("submitted_at",{ascending:false}).limit(30),
        supabaseClient.from("guild_members").select("user_id,character_name,game_class,nickname,discord_name,discord_accounts(discord_user_id,discord_username,discord_global_name,verified,guild_member_verified)")
          .eq("user_id",memberId).maybeSingle(),
        supabaseClient.from("guild_member_affiliations").select("id,started_at,ended_at,change_reason,guilds(code,name)")
          .eq("user_id",memberId).order("started_at",{ascending:false}).limit(50)
      ]);
      if(portfolioResult.error)throw portfolioResult.error;if(submissionResult.error)throw submissionResult.error;
      if(profileResult.error)throw profileResult.error;if(affiliationResult.error)throw affiliationResult.error;
      const folders=portfolioResult.data||[],folderIds=folders.map(folder=>folder.id);
      let versions=[];
      if(folderIds.length){
        const versionResult=await supabaseClient.from("portfolio_versions")
          .select("id,portfolio_id,version_number,version_name,created_at")
          .in("portfolio_id",folderIds).order("created_at",{ascending:false}).limit(100);
        if(versionResult.error)throw versionResult.error;
        versions=versionResult.data||[];
      }
      folders.forEach(folder=>{folder.portfolio_versions=versions.filter(version=>version.portfolio_id===folder.id);});
      const subs=submissionResult.data||[];
      let reviewEvents=[],submissionEvents=[];
      if(subs.length){
        const submissionIds=subs.map(row=>row.id);
        const [reviewEventResult,submissionEventResult]=await Promise.all([
          supabaseClient.from("portfolio_patch_review_events")
            .select("id,submission_id,old_status,new_status,review_note,created_at")
            .in("submission_id",submissionIds).order("created_at",{ascending:false}).limit(50),
          supabaseClient.from("portfolio_patch_submission_events")
            .select("id,submission_id,previous_version_id,new_version_id,event_type,created_at")
            .in("submission_id",submissionIds).order("created_at",{ascending:false}).limit(50)
        ]);
        if(reviewEventResult.error)throw reviewEventResult.error;
        if(submissionEventResult.error)throw submissionEventResult.error;
        reviewEvents=reviewEventResult.data||[];
        submissionEvents=submissionEventResult.data||[];
      }
      const knownVersionIds=new Set(versions.map(version=>version.id));
      const historyVersionIds=[...new Set(submissionEvents.flatMap(event=>[event.previous_version_id,event.new_version_id]).filter(Boolean))]
        .filter(id=>!knownVersionIds.has(id)).slice(0,100);
      if(historyVersionIds.length){
        const historyVersionResult=await supabaseClient.from("portfolio_versions")
          .select("id,portfolio_id,version_number,version_name,created_at")
          .in("id",historyVersionIds).limit(100);
        if(historyVersionResult.error)throw historyVersionResult.error;
        (historyVersionResult.data||[]).forEach(version=>{
          const folder=folders.find(item=>item.id===version.portfolio_id);
          if(folder)folder.portfolio_versions.push(version);
        });
      }
      subs.forEach(row=>{
        row.portfolio_patch_review_events=reviewEvents.filter(event=>event.submission_id===row.id);
        row.portfolio_patch_submission_events=submissionEvents.filter(event=>event.submission_id===row.id);
      });
      state.workspace={member,folders,subs,profile:profileResult.data||null,affiliations:affiliationResult.data||[],images:[],imagesLoaded:false,imagesLoading:false,imagesError:"",versionsLimited:versions.length===100,reviewHistoryLimited:reviewEvents.length===50,submissionHistoryLimited:submissionEvents.length===50,memberIds:(state.data?.members||[]).map(x=>x.member_id)};
      state.workspaceTab="overview";renderWorkspace();
    }catch(error){host.innerHTML='<div class="pc-empty">เปิด Workspace ไม่สำเร็จ: '+esc(error.message||"Unknown error")+'</div>';}
  }

  async function loadWorkspaceImages(){
    const w=state.workspace;if(!w||w.imagesLoading||w.imagesLoaded)return;
    w.imagesLoading=true;w.imagesError="";renderWorkspace();
    try{
      const versionIds=w.folders.flatMap(p=>(p.portfolio_versions||[]).map(v=>v.id)).filter(Boolean);
      if(!versionIds.length){w.images=[];w.imagesLoaded=true;return;}
      const {data,error}=await supabaseClient.from("portfolio_version_images")
        .select("id,version_id,image_url,section_key,sort_order,caption,image_type")
        .in("version_id",versionIds).order("sort_order").limit(100);
      if(error)throw error;
      const images=await Promise.all((data||[]).map(async item=>{
        let url="";
        if(typeof getPortfolioImageUrl==="function")url=await getPortfolioImageUrl(item.image_url);
        else if(/^https?:\/\//i.test(item.image_url||""))url=item.image_url;
        return {...item,signed_url:url};
      }));
      w.images=images;w.imagesLoaded=true;
    }catch(error){
      w.imagesError="โหลดไฟล์ไม่สำเร็จ: "+(error.message||"Unknown error");
      w.imagesLoaded=true;
    }finally{
      w.imagesLoading=false;renderWorkspace();
    }
  }

  function renderWorkspace(){
    const w=state.workspace;if(!w)return;const host=$("pc-workspace");host.classList.remove("pc-hidden");
    const ids=w.memberIds,index=ids.indexOf(w.member.member_id);
    const totalVersions=w.folders.reduce((sum,p)=>sum+(p.portfolio_versions||[]).length,0);
    const totalImages=w.imagesLoaded?w.images.length:null;
    const profile=w.profile||{},discordValue=profile.discord_accounts;
    const discord=Array.isArray(discordValue)?discordValue[0]:discordValue;
    const currentAffiliation=w.affiliations.find(a=>!a.ended_at);
    const discordName=discord?.discord_global_name||discord?.discord_username||profile.discord_name||"ไม่พบ Discord";
    const discordId=discord?.discord_user_id||"—";
    const discordStatus=discord?(discord.verified?"ยืนยันแล้ว":"รอยืนยัน"):"ไม่พบ Discord Account";
    const affiliationLabel=currentAffiliation?.guilds?.code||"ยังไม่กำหนดสังกัด";
    const sourceLabel=w.member.roster_source==="affiliation_transfer"?"เพิ่มจากการย้ายเข้า 4AM":w.member.roster_source==="manual_link"?"เพิ่มหลังเชื่อมบัญชี Manual":"Opening Snapshot";
    const overview='<div class="pc-stats"><article class="pc-stat"><span>แฟ้มผลงาน</span><strong>'+w.folders.length+'</strong></article><article class="pc-stat"><span>Portfolio Versions</span><strong>'+totalVersions+'</strong></article><article class="pc-stat"><span>รูปภาพ</span><strong>'+(totalImages===null?'เปิด Files':totalImages)+'</strong></article><article class="pc-stat"><span>Patch Submissions</span><strong>'+w.subs.length+'</strong></article></div><div class="pc-member"><h3>ข้อมูลสมาชิก</h3><p>สังกัดปัจจุบัน: <strong>'+esc(affiliationLabel)+'</strong> · '+esc(sourceLabel)+'</p><p>Discord: <strong>'+esc(discordName)+'</strong> · ID: '+esc(discordId)+'</p><p>สถานะ Discord: '+esc(discordStatus)+' · Guild Member Verified: '+(discord?.guild_member_verified?"ยืนยันแล้ว":"ยังไม่ยืนยัน")+'</p></div>';
    const files=w.imagesLoading?'<div class="pc-empty">กำลังโหลดไฟล์ Portfolio...</div>':w.imagesError?'<div class="pc-empty">'+esc(w.imagesError)+'<br><button class="pc-btn" data-pc-retry-files>ลองอีกครั้ง</button></div>':(w.versionsLimited?'<div class="pc-muted">แสดง 100 Versions ล่าสุดเพื่อประหยัดการโหลดข้อมูล</div>':'')+'<div class="pc-workspace-grid">'+(w.folders.map(p=>'<article class="pc-file"><strong>'+esc(p.title)+'</strong><p class="pc-muted">'+esc(p.game_class)+' · '+esc(p.portfolio_type)+' · '+(p.portfolio_versions||[]).length+' Versions</p>'+(p.portfolio_versions||[]).map(v=>{const images=(w.images||[]).filter(img=>img.version_id===v.id);return '<div class="pc-event"><strong>'+esc(v.version_name||("Version "+v.version_number))+'</strong><small>'+dateLabel(v.created_at)+' · '+images.length+' รูปภาพ'+(images.length?" · แสดง "+images.length:"") +'</small><div class="pc-file-images">'+images.map(img=>img.signed_url?'<a class="pc-file-thumb-link" href="'+esc(img.signed_url)+'" target="_blank" rel="noopener"><img class="pc-file-thumb" loading="lazy" decoding="async" src="'+esc(img.signed_url)+'" alt="'+esc(img.caption||img.section_key||"Portfolio image")+'"></a>':'').join("")+'</div></div>'}).join("")+'<button class="pc-btn" data-pc-open-portfolio="'+esc(w.member.member_id)+'">เปิดแฟ้มใน Portfolio</button></article>').join("")||'<div class="pc-empty">สมาชิกยังไม่มี Portfolio</div>')+'</div>';
    const events=w.subs.flatMap(s=>(s.portfolio_patch_review_events||[]).map(e=>({...e,submission:s}))).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const submissionEvents=w.subs.flatMap(s=>(s.portfolio_patch_submission_events||[]).map(e=>({...e,submission:s}))).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const versionLabel=id=>{const v=w.folders.flatMap(folder=>folder.portfolio_versions||[]).find(item=>item.id===id);return v?(v.version_name||("Version "+v.version_number)):"Version";}
    const affiliationHistory=w.affiliations.map(a=>'<div class="pc-event"><strong>'+esc(a.guilds?.code||"ไม่ทราบสังกัด")+' · '+(a.ended_at?"สิ้นสุดแล้ว":"ปัจจุบัน")+'</strong><small>เริ่ม '+dateLabel(a.started_at)+' · '+(a.ended_at?"สิ้นสุด "+dateLabel(a.ended_at):"ยังเป็นสังกัดปัจจุบัน")+' · '+esc(a.change_reason||"ไม่ได้ระบุเหตุผล")+'</small></div>').join("");
    const submissionHistory=(w.submissionHistoryLimited?'<div class="pc-muted">แสดงประวัติการส่ง 50 รายการล่าสุด</div>':'')+submissionEvents.map(e=>'<div class="pc-event"><strong>'+(e.event_type==="resubmitted"?"ส่ง Version ใหม่":"ส่ง Version ครั้งแรก")+' · '+esc(versionLabel(e.new_version_id))+'</strong><small>'+(e.previous_version_id?"แทนที่ "+esc(versionLabel(e.previous_version_id))+" · ":"")+dateLabel(e.created_at)+'</small></div>').join("");
    const reviewHistory=(w.reviewHistoryLimited?'<div class="pc-muted">แสดงประวัติการตรวจ 50 รายการล่าสุด</div>':'')+events.map(e=>'<div class="pc-event"><strong>'+esc(statusText[e.new_status]||e.new_status)+'</strong><small>'+esc(e.review_note||"ไม่มีหมายเหตุ")+' · '+dateLabel(e.created_at)+'</small></div>').join("");
    const history='<div class="pc-list"><h3>ประวัติสังกัด</h3>'+(affiliationHistory||'<div class="pc-empty">ยังไม่มีประวัติสังกัด</div>')+'<h3>ประวัติการส่ง Patch</h3>'+(submissionHistory||'<div class="pc-empty">ยังไม่มีประวัติการส่งใน Patch นี้</div>')+'<h3>ประวัติการตรวจ Patch</h3>'+(reviewHistory||'<div class="pc-empty">ยังไม่มีประวัติการตรวจใน Patch นี้</div>')+'</div>';
    host.innerHTML='<div class="pc-head"><div><span class="pc-kicker">MEMBER WORKSPACE</span><h2>'+esc(w.member.character_name)+'</h2><p class="pc-muted">'+esc(w.member.game_class)+' · '+esc(w.member.discord_name||"ไม่พบ Discord")+'</p></div><div class="pc-toolbar"><button class="pc-btn" id="pc-workspace-prev" '+(index<=0?"disabled":"")+'>← ก่อนหน้า</button><button class="pc-btn" id="pc-workspace-next" '+(index>=ids.length-1?"disabled":"")+'>ถัดไป →</button><button class="pc-btn" id="pc-workspace-close">ปิด</button></div></div><nav class="pc-tabs"><button class="pc-tab '+(state.workspaceTab==="overview"?"active":"")+'" data-pc-workspace-tab="overview">Overview</button><button class="pc-tab '+(state.workspaceTab==="files"?"active":"")+'" data-pc-workspace-tab="files">Files & Portfolio</button><button class="pc-tab '+(state.workspaceTab==="history"?"active":"")+'" data-pc-workspace-tab="history">History</button></nav><div>'+(state.workspaceTab==="overview"?overview:state.workspaceTab==="files"?files:history)+'</div>';
    host.querySelectorAll("[data-pc-workspace-tab]").forEach(b=>b.addEventListener("click",()=>{state.workspaceTab=b.dataset.pcWorkspaceTab;renderWorkspace()}));
    host.querySelector("[data-pc-retry-files]")?.addEventListener("click",()=>{w.imagesLoaded=false;w.imagesError="";void loadWorkspaceImages()});
    $("pc-workspace-close")?.addEventListener("click",()=>host.classList.add("pc-hidden"));
    $("pc-workspace-prev")?.addEventListener("click",()=>{if(index>0)void openWorkspace(ids[index-1])});
    $("pc-workspace-next")?.addEventListener("click",()=>{if(index<ids.length-1)void openWorkspace(ids[index+1])});
    if(state.workspaceTab==="files"&&!w.imagesLoaded&&!w.imagesLoading)void loadWorkspaceImages();
    host.querySelectorAll("[data-pc-open-portfolio]").forEach(button=>button.addEventListener("click",()=>{currentPortfolioMemberId=w.member.member_id;portfolioClassFilter="all";portfolioManageMode=typeof isManagement==="function"&&isManagement();window.openGuildPage("portfolio");if(typeof renderPortfolios==="function")void renderPortfolios()}));
  }

  function bindEvents(){
    document.querySelectorAll("[data-pc-tab]").forEach(b=>b.addEventListener("click",()=>{showTab(b.dataset.pcTab);if(b.dataset.pcTab==="queue"){state.search=$("pc-queue-search").value.trim();state.status=$("pc-queue-status").value;state.page=0;void loadCommandCenter(true)}else if(b.dataset.pcTab==="members"){state.search=$("pc-member-search").value.trim();state.status=$("pc-member-status").value;state.page=0;void loadCommandCenter(true)}else{state.search="";state.status="all";state.page=0;void loadCommandCenter(true)}}));
    $("pc-round-select")?.addEventListener("change",e=>setRound(e.target.value));
    $("pc-refresh")?.addEventListener("click",()=>void loadCommandCenter(true));
    $("pc-toggle-create")?.addEventListener("click",()=>{$("pc-create-form").classList.toggle("pc-hidden");$("pc-toggle-create").textContent=$("pc-create-form").classList.contains("pc-hidden")?"แสดงแบบฟอร์ม":"ซ่อนแบบฟอร์ม"});
    $("pc-create-form")?.addEventListener("submit",createRound);
    $("pc-member-search-btn")?.addEventListener("click",()=>{state.search=$("pc-member-search").value.trim();state.status=$("pc-member-status").value;state.page=0;void loadCommandCenter(true)});
    $("pc-queue-search-btn")?.addEventListener("click",()=>{state.search=$("pc-queue-search").value.trim();state.status=$("pc-queue-status").value;state.page=0;void loadCommandCenter(true)});
    $("pc-queue-prev")?.addEventListener("click",()=>{if(state.page>0){state.page--;void loadCommandCenter(true)}});
    $("pc-queue-next")?.addEventListener("click",()=>{if((state.page+1)*PAGE_SIZE<Number(state.data?.review_queue_total||0)){state.page++;void loadCommandCenter(true)}});
    $("pc-member-prev")?.addEventListener("click",()=>{if(state.page>0){state.page--;void loadCommandCenter(true)}});
    $("pc-member-next")?.addEventListener("click",()=>{state.page++;void loadCommandCenter(true)});
    $("pc-member-rows")?.addEventListener("click",e=>{const b=e.target.closest("[data-pc-workspace]");if(b)void openWorkspace(b.dataset.pcWorkspace)});
    $("pc-queue-rows")?.addEventListener("click",e=>{const b=e.target.closest("[data-pc-review]");if(b)openReview(b.dataset.pcReview)});
    $("pc-history-list")?.addEventListener("click",e=>{const b=e.target.closest("[data-pc-history]");if(b)setRound(b.dataset.pcHistory)});
    $("pc-round-actions")?.addEventListener("click",e=>{
      if(e.target.id==="pc-toggle-round"){const r=state.data?.selected_round;if(r)void updateRound(r.status==="open"?"close":"open");}
      if(e.target.id==="pc-archive-round"&&confirm("ยืนยันเก็บ Patch นี้เข้าคลัง โดยคง Snapshot และประวัติทั้งหมดไว้?"))void updateRound("archive");
      if(e.target.id==="pc-restore-round")void updateRound("restore");
    });
    $("pc-review-status")?.addEventListener("change",()=>{$("pc-review-note-wrap").classList.toggle("pc-hidden",$("pc-review-status").value!=="revision_required")});
    $("pc-review-cancel")?.addEventListener("click",closeReview);
    $("pc-review-modal")?.addEventListener("click",e=>{if(e.target===$("pc-review-modal"))closeReview()});
    $("pc-review-form")?.addEventListener("submit",saveReview);
  }

  function activate(){ensurePage();if(!allowed())return;void loadCommandCenter(true);}
  const originalOpen=window.openGuildPage||openGuildPage;
  window.openGuildPage=function(pageName){
    const reviewTarget=pageName===REVIEW_PAGE;
    let target=reviewTarget?PAGE:pageName;
    if(target===PAGE&&!allowed())target="dashboard";
    originalOpen.call(this,target);
    if(target===PAGE){
      showTab(reviewTarget?"queue":"overview");
      state.search=reviewTarget?($("pc-queue-search")?.value.trim()||""):"";
      state.status=reviewTarget?($("pc-queue-status")?.value||"all"):"all";
      state.page=0;
      activate();
      document.querySelector('.sidebar .nav-item[data-page="'+PAGE+'"]')?.classList.toggle("active",!reviewTarget);
      document.querySelector('.sidebar .nav-item[data-page="'+REVIEW_PAGE+'"]')?.classList.toggle("active",reviewTarget);
    }
  };
  ensurePage();
  window.addEventListener("4am:app-ready",()=>{if(typeof syncManagementMenuVisibility==="function")syncManagementMenuVisibility();if($("page-patch-command-center")&&!$("page-patch-command-center").classList.contains("hidden"))activate();});
})();
(() => {
  const CATEGORIES = [
    { key: "cultivation", label: "คัมภีร์หู่เฉียน (หน้าฝึกฝน)" },
    { key: "skills", label: "ขั้นสกิล" }
  ];
  let rounds = [];
  let selectedRoundId = "";
  let submissions = [];
  let images = [];
  let requests = [];
  let editPermissions = [];
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
  const isRoundEditable = (round) => round && round.status === "open" && Date.now() >= new Date(round.starts_at).getTime() && Date.now() <= new Date(round.closes_at).getTime();

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
    style.textContent = `
      .portfolio-tracker-root{display:grid;gap:18px;margin:0 0 22px}
      .portfolio-tracker-panel{padding:20px;border:1px solid rgba(205,160,120,.22);border-radius:12px;background:linear-gradient(145deg,rgba(28,15,19,.96),rgba(9,7,9,.98));}
      .portfolio-tracker-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px}
      .portfolio-tracker-heading h3{margin:4px 0;color:var(--cream,#fff);font-size:20px}
      .portfolio-tracker-heading p,.portfolio-tracker-muted{margin:4px 0;color:var(--muted,#aaa);font-size:13px;line-height:1.6}
      .portfolio-tracker-form{display:grid;grid-template-columns:minmax(180px,1.4fr) repeat(2,minmax(150px,1fr)) auto;gap:10px;align-items:end}
      .portfolio-tracker-form label,.portfolio-tracker-upload label{display:grid;gap:6px;color:var(--muted,#bbb);font-size:13px}
      .portfolio-tracker-form input,.portfolio-tracker-upload input[type=file],.portfolio-tracker-upload input[type=text],.portfolio-tracker-select{width:100%;min-width:0;min-height:42px;padding:9px 11px;border:1px solid rgba(190,45,60,.45);border-radius:7px;background:#10090c;color:#fff;color-scheme:dark}
      .portfolio-tracker-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .portfolio-tracker-round-list{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
      .portfolio-tracker-round{padding:9px 13px;border:1px solid rgba(205,160,120,.25);border-radius:8px;background:rgba(255,255,255,.025);color:#e9d9d0;cursor:pointer}
      .portfolio-tracker-round.is-active{border-color:#d8b06a;background:rgba(216,176,106,.12);color:#f3d99e}
      .portfolio-tracker-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
      .portfolio-tracker-stat{padding:13px;border:1px solid rgba(205,160,120,.16);border-radius:9px;background:rgba(255,255,255,.025)}
      .portfolio-tracker-stat strong{display:block;font-size:24px;color:#f4e8dc}
      .portfolio-tracker-stat span{color:var(--muted,#aaa);font-size:12px}
      .portfolio-tracker-table-wrap{overflow-x:auto}
      .portfolio-tracker-table{width:100%;min-width:660px;border-collapse:collapse}
      .portfolio-tracker-table th,.portfolio-tracker-table td{padding:11px 10px;border-bottom:1px solid rgba(205,160,120,.13);text-align:left;vertical-align:middle;font-size:13px}
      .portfolio-tracker-table th{color:#d8b878;font-weight:800}
      .portfolio-tracker-pill{display:inline-flex;padding:5px 9px;border-radius:30px;font-size:11px;font-weight:800;white-space:nowrap}
      .portfolio-tracker-pill.is-complete{color:#8de0b7;background:rgba(62,170,120,.13);border:1px solid rgba(62,170,120,.35)}
      .portfolio-tracker-pill.is-partial{color:#f2ca78;background:rgba(220,165,60,.12);border:1px solid rgba(220,165,60,.3)}
      .portfolio-tracker-pill.is-empty{color:#ff9ba4;background:rgba(220,65,80,.12);border:1px solid rgba(220,65,80,.3)}
      .portfolio-tracker-category{display:grid;gap:10px;padding:14px;border:1px solid rgba(205,160,120,.18);border-radius:10px;background:rgba(255,255,255,.02)}
      .portfolio-tracker-category-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .portfolio-tracker-drop{display:grid;place-items:center;min-height:100px;padding:16px;border:1px dashed rgba(216,176,106,.5);border-radius:8px;color:#e8d4a9;text-align:center;background:rgba(216,176,106,.035)}
      .portfolio-tracker-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px}
      .portfolio-tracker-thumbs img{width:100%;height:90px;object-fit:contain;background:#050505;border-radius:6px;border:1px solid rgba(255,255,255,.1)}
      .portfolio-tracker-request{display:grid;gap:8px;padding:12px;border:1px solid rgba(220,165,60,.25);border-radius:8px;background:rgba(220,165,60,.05)}
      .portfolio-tracker-request textarea{width:100%;min-height:72px;padding:10px;border:1px solid rgba(190,45,60,.4);border-radius:7px;background:#10090c;color:#fff}
      .portfolio-tracker-empty{padding:20px;border:1px dashed rgba(205,160,120,.2);border-radius:8px;color:var(--muted,#aaa);text-align:center}
      @media(max-width:760px){.portfolio-tracker-form{grid-template-columns:1fr 1fr}.portfolio-tracker-form label:first-child{grid-column:1/-1}.portfolio-tracker-form button{grid-column:1/-1}.portfolio-tracker-stats{grid-template-columns:1fr 1fr}}
      @media(max-width:480px){.portfolio-tracker-panel{padding:14px}.portfolio-tracker-form{grid-template-columns:1fr}.portfolio-tracker-form label:first-child,.portfolio-tracker-form button{grid-column:auto}.portfolio-tracker-stats{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  async function loadData() {
    const [roundResult, subResult, imageResult, requestResult, permissionResult] = await Promise.all([
      supabaseClient.from("portfolio_update_rounds").select("*").order("created_at",{ascending:false}),
      supabaseClient.from("portfolio_update_submissions").select("*"),
      supabaseClient.from("portfolio_update_images").select("*").order("sort_order"),
      supabaseClient.from("portfolio_update_edit_requests").select("*").order("created_at",{ascending:false}),
      supabaseClient.from("portfolio_update_edit_permissions").select("*").eq("member_id",currentUser.id)
    ]);
    const failure = [roundResult,subResult,imageResult,requestResult,permissionResult].find(r=>r.error);
    if (failure) throw failure.error;
    rounds = roundResult.data || [];
    submissions = subResult.data || [];
    images = imageResult.data || [];
    requests = requestResult.data || [];
    editPermissions = permissionResult.data || [];
    if (!selectedRoundId || !rounds.some(r=>r.id===selectedRoundId)) selectedRoundId = rounds[0]?.id || "";
  }

  function roundStats(roundId) {
    const rows = (allMembers || []).filter(m=>m.active !== false);
    let complete=0,partial=0,empty=0;
    const detail=rows.map(member=>{
      const cats=CATEGORIES.map(category=>{
        const submission=submissions.find(s=>s.round_id===roundId&&s.member_id===member.user_id&&s.category_key===category.key);
        const count=submission?images.filter(i=>i.submission_id===submission.id).length:0;
        return {category,count,submission};
      });
      const count=cats.filter(c=>c.count>0).length;
      const status=count===2?"complete":count===0?"empty":"partial";
      if(status==="complete")complete++;else if(status==="partial")partial++;else empty++;
      return {member,cats,status};
    });
    return {detail,complete,partial,empty,total:rows.length};
  }

  function pill(status) {
    const labels={complete:"อัปครบแล้ว",partial:"ยังไม่ครบ",empty:"ยังไม่ได้อัป"};
    return `<span class="portfolio-tracker-pill is-${status}">${labels[status]}</span>`;
  }

  function render() {
    const root=ensureRoot(); if(!root)return;
    injectStyles();
    const selected=rounds.find(r=>r.id===selectedRoundId);
    const stats=selected?roundStats(selected.id):null;
    const own=currentUser?.id;
    const ownMember=(allMembers||[]).find(m=>m.user_id===own);
    const ownSubs=selected?CATEGORIES.map(category=>{
      const sub=submissions.find(s=>s.round_id===selected.id&&s.member_id===own&&s.category_key===category.key);
      return {category,sub,rows:sub?images.filter(i=>i.submission_id===sub.id):[]};
    }):[];
    const editable=selected&&(isRoundEditable(selected)||editPermissions.some(p=>p.round_id===selected.id&&new Date(p.expires_at).getTime()>Date.now()));
    const request=selected?requests.find(r=>r.round_id===selected.id&&r.member_id===own&&r.status==="pending"):null;

    root.innerHTML=`
      ${management()? `
      <section class="portfolio-tracker-panel">
        <div class="portfolio-tracker-heading"><div><span class="panel-kicker">PORTFOLIO CONTROL CENTER</span><h3>จัดการรอบอัปเดตแฟ้มผลงาน</h3><p>กำหนดรอบรับข้อมูลและติดตามการส่งของสมาชิกทั้งกิลด์</p></div><span class="portfolio-tracker-pill is-complete">Management</span></div>
        <form id="pt-create-round" class="portfolio-tracker-form">
          <label>ชื่อรอบ<input name="round_name" maxlength="120" required placeholder="เช่น รอบพฤศจิกายน 2026"></label>
          <label>วันและเวลาเริ่ม<input name="starts_at" type="text" data-activity-datetime-input readonly autocomplete="off" placeholder="dd/mm/yyyy HH:mm" required></label>
          <label>วันและเวลาปิดรับ<input name="closes_at" type="text" data-activity-datetime-input readonly autocomplete="off" placeholder="dd/mm/yyyy HH:mm" required></label>
          <button class="btn btn-primary" type="submit">＋ สร้างรอบใหม่</button>
        </form>
        <div class="portfolio-tracker-actions"><small class="portfolio-tracker-muted">เมื่อปิดรอบ สมาชิกจะส่งหรือแก้ไขไม่ได้ เว้นแต่ได้รับอนุญาตเป็นรายบุคคล</small></div>
      </section>` : ""}
      <section class="portfolio-tracker-panel">
        <div class="portfolio-tracker-heading"><div><span class="panel-kicker">SUBMISSION TRACKER</span><h3>ตรวจสอบความครบถ้วนของแฟ้ม</h3><p>ติดตามสถานะการส่ง 2 หัวข้อของสมาชิกในแต่ละรอบ</p></div><button id="pt-refresh" class="btn btn-outline btn-sm" type="button">รีเฟรช</button></div>
        <div class="portfolio-tracker-round-list">${rounds.map(r=>`<button type="button" class="portfolio-tracker-round ${r.id===selectedRoundId?"is-active":""}" data-pt-round="${esc(r.id)}">${esc(r.round_name)} · ${r.status==="open"?"เปิดรับ":"ปิดรับ"}</button>`).join("")||'<div class="portfolio-tracker-empty">ยังไม่มีรอบอัปเดตแฟ้มผลงาน</div>'}</div>
        ${selected? `
          <div class="portfolio-tracker-heading"><div><strong>${esc(selected.round_name)}</strong><p>เริ่ม ${dateLabel(selected.starts_at)} · ปิดรับ ${dateLabel(selected.closes_at)}</p></div>
          ${management()? `<button id="pt-toggle-round" class="btn btn-outline btn-sm" type="button">${selected.status==="open"?"ปิดรอบรับข้อมูล":"เปิดรอบอีกครั้ง"}</button>` : ""}
          </div>
          ${management()? `
            <div class="portfolio-tracker-stats">
              <div class="portfolio-tracker-stat"><strong>${stats.total}</strong><span>สมาชิกทั้งหมด</span></div>
              <div class="portfolio-tracker-stat"><strong>${stats.complete}</strong><span>อัปครบแล้ว</span></div>
              <div class="portfolio-tracker-stat"><strong>${stats.partial+stats.empty}</strong><span>ยังไม่ครบ / ยังไม่ได้อัป</span></div>
            </div>
            <div class="portfolio-tracker-table-wrap"><table class="portfolio-tracker-table"><thead><tr><th>สมาชิก</th><th>คัมภีร์หู่เฉียน</th><th>ขั้นสกิล</th><th>สถานะรวม</th><th>จัดการ</th></tr></thead><tbody>
            ${stats.detail.sort((a,b)=>({empty:0,partial:1,complete:2}[a.status]-{empty:0,partial:1,complete:2}[b.status])||String(memberName(a.member.user_id)).localeCompare(String(memberName(b.member.user_id)),"th")).map(row=>`
              <tr><td><strong>${esc(memberName(row.member.user_id))}</strong></td>
              ${row.cats.map(c=>`<td>${c.count? `<span class="portfolio-tracker-pill is-complete">${c.count} รูป</span>`:'<span class="portfolio-tracker-pill is-empty">ยังไม่มีรูป</span>'}</td>`).join("")}
              <td>${pill(row.status)}</td><td><button class="btn btn-outline btn-sm" type="button" data-pt-member="${esc(row.member.user_id)}">ดู / อนุญาตแก้ไข</button></td></tr>`).join("")}
            </tbody></table></div>
            <div id="pt-member-detail" class="portfolio-tracker-member-detail"></div>
            <h4 style="margin:22px 0 10px;color:#e6c47d">คำขอแก้ไขหลังปิดรอบ</h4>
            <div class="portfolio-tracker-requests">${requests.filter(r=>r.round_id===selected.id&&r.status==="pending").map(r=>`<div class="portfolio-tracker-request"><strong>${esc(memberName(r.member_id))}</strong><span>${esc(r.reason)}</span><div class="portfolio-tracker-actions"><button class="btn btn-primary btn-sm" type="button" data-pt-approve-request="${esc(r.id)}">อนุมัติ 24 ชม.</button><button class="btn btn-outline btn-sm" type="button" data-pt-reject-request="${esc(r.id)}">ปฏิเสธ</button></div></div>`).join("")||'<p class="portfolio-tracker-muted">ไม่มีคำขอที่รออนุมัติ</p>'}</div>
          ` : ""}
          <div class="portfolio-tracker-member-upload">
            <h4 style="margin:22px 0 10px;color:#e6c47d">${ownMember?"แฟ้มประจำรอบของคุณ":"ส่งแฟ้มประจำรอบ"}</h4>
            ${ownSubs.map(item=>`
              <div class="portfolio-tracker-category" style="margin:10px 0">
                <div class="portfolio-tracker-category-head"><strong>${esc(item.category.label)}</strong><span class="portfolio-tracker-pill ${item.rows.length?"is-complete":"is-empty"}">${item.rows.length?item.rows.length+" รูป":"ยังไม่ได้อัป"}</span></div>
                <div class="portfolio-tracker-thumbs">${item.rows.map(img=>`<a href="#" data-pt-open-image="${esc(img.id)}"><img data-pt-image-path="${esc(img.image_path)}" alt="รูปที่อัปโหลด"></a>`).join("")}</div>
                ${editable? `<label class="portfolio-tracker-drop">＋ เพิ่มรูปภาพได้ไม่จำกัดจำนวน<input type="file" accept="image/*" multiple data-pt-upload="${item.category.key}"></label>` : ""}
              </div>`).join("")}
            ${!editable&&selected? `
              <div class="portfolio-tracker-request"><strong>รอบนี้ปิดรับการแก้ไขแล้ว</strong><p class="portfolio-tracker-muted">หากต้องการเพิ่มหรือแก้ไขรูปภาพ สามารถส่งคำขอให้ฝ่ายบริหารอนุมัติได้</p>
              ${request?'<span class="portfolio-tracker-pill is-partial">ส่งคำขอแล้ว · รออนุมัติ</span>':`<form id="pt-edit-request"><textarea name="reason" required maxlength="1000" placeholder="ระบุเหตุผลที่ต้องการแก้ไข..."></textarea><button class="btn btn-outline btn-sm" type="submit">ส่งคำขอแก้ไข</button></form>`}
              </div>` : ""}
        ` : ""}
      </section>`;
    bindEvents(root);
    hydrateImages(root);
  }

  async function hydrateImages(root) {
    const nodes=[...root.querySelectorAll("[data-pt-image-path]")];
    await Promise.all(nodes.map(async node=>{
      const path=node.dataset.ptImagePath;
      const {data,error}=await supabaseClient.storage.from("portfolio-images").createSignedUrl(path,3600);
      if(!error&&data?.signedUrl)node.src=data.signedUrl;
    }));
  }

  async function ensureSubmission(roundId, categoryKey) {
    let sub=submissions.find(s=>s.round_id===roundId&&s.member_id===currentUser.id&&s.category_key===categoryKey);
    if(sub)return sub;
    const {data,error}=await supabaseClient.from("portfolio_update_submissions").insert({round_id:roundId,member_id:currentUser.id,category_key:categoryKey}).select("*").single();
    if(error)throw error;
    submissions.push(sub=data);
    return sub;
  }

  async function uploadFiles(roundId, categoryKey, files) {
    if(busy)return;busy=true;
    try {
      const sub=await ensureSubmission(roundId,categoryKey);
      for(let i=0;i<files.length;i++){
        const file=files[i];
        if(!file.type.startsWith("image/"))continue;
        const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
        const path=`${currentUser.id}/portfolio-rounds/${roundId}/${categoryKey}/${Date.now()}-${i}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const {error:uploadError}=await supabaseClient.storage.from("portfolio-images").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
        if(uploadError)throw uploadError;
        const {data,error}=await supabaseClient.from("portfolio_update_images").insert({submission_id:sub.id,image_path:path,caption:"",sort_order:images.filter(x=>x.submission_id===sub.id).length+i}).select("*").single();
        if(error){await supabaseClient.storage.from("portfolio-images").remove([path]);throw error;}
        images.push(data);
      }
      await loadData();render();
    } catch(error){console.error("Portfolio round upload:",error);alert("อัปโหลดรูปไม่สำเร็จ: "+(error.message||"Unknown error"));}
    finally{busy=false;}
  }

  async function grantEdit(memberId, roundId, hours=24) {
    const expires=new Date(Date.now()+hours*3600000).toISOString();
    const {error}=await supabaseClient.from("portfolio_update_edit_permissions").upsert({round_id:roundId,member_id:memberId,granted_by:currentUser.id,expires_at:expires},{onConflict:"round_id,member_id"});
    if(error)throw error;
    alert("อนุญาตให้แก้ไขถึง "+dateLabel(expires));
  }

  function bindEvents(root) {
    root.querySelector("#pt-create-round")?.addEventListener("submit",async e=>{
      e.preventDefault();if(!management())return;
      const form=new FormData(e.currentTarget);
      let starts,closes;
      try {
        starts=parseRoundDateTime(form.get("starts_at"),"วันและเวลาเริ่ม");
        closes=parseRoundDateTime(form.get("closes_at"),"วันและเวลาปิดรับ");
      } catch(error) { alert(error.message); return; }
      if(!(closes>starts)){alert("วันและเวลาปิดรับต้องอยู่หลังวันและเวลาเริ่มต้น");return;}
      const {data,error}=await supabaseClient.from("portfolio_update_rounds").insert({round_name:String(form.get("round_name")).trim(),starts_at:starts.toISOString(),closes_at:closes.toISOString(),created_by:currentUser.id}).select("id").single();
      if(error){alert("สร้างรอบไม่สำเร็จ: "+error.message);return;}
      selectedRoundId=data.id;await loadData();render();
    });
    root.querySelector("#pt-refresh")?.addEventListener("click",async()=>{try{await loadData();render();}catch(e){alert(e.message);}});
    root.querySelectorAll("[data-pt-round]").forEach(btn=>btn.addEventListener("click",()=>{selectedRoundId=btn.dataset.ptRound;render();}));
    root.querySelector("#pt-toggle-round")?.addEventListener("click",async()=>{
      if(!management()||!selectedRoundId)return;
      const round=rounds.find(r=>r.id===selectedRoundId);
      const next=round.status==="open"?"closed":"open";
      if(!confirm(next==="closed"?"ยืนยันปิดรอบนี้?":"ยืนยันเปิดรอบนี้อีกครั้ง?"))return;
      const {error}=await supabaseClient.from("portfolio_update_rounds").update({status:next}).eq("id",selectedRoundId);
      if(error){alert(error.message);return;}await loadData();render();
    });
    root.querySelectorAll("[data-pt-upload]").forEach(input=>input.addEventListener("change",e=>{
      const files=[...(e.target.files||[])];e.target.value="";
      if(files.length)void uploadFiles(selectedRoundId,input.dataset.ptUpload,files);
    }));
    root.querySelector("#pt-edit-request")?.addEventListener("submit",async e=>{
      e.preventDefault();const reason=new FormData(e.currentTarget).get("reason");
      const {error}=await supabaseClient.from("portfolio_update_edit_requests").insert({round_id:selectedRoundId,member_id:currentUser.id,reason:String(reason).trim()});
      if(error){alert("ส่งคำขอไม่สำเร็จ: "+error.message);return;}await loadData();render();
    });
    root.querySelectorAll("[data-pt-member]").forEach(btn=>btn.addEventListener("click",async()=>{
      if(!management())return;
      const memberId=btn.dataset.ptMember;
      const detail=root.querySelector("#pt-member-detail");
      const rows=submissions.filter(s=>s.round_id===selectedRoundId&&s.member_id===memberId);
      detail.innerHTML=`<div class="portfolio-tracker-category"><strong>${esc(memberName(memberId))}</strong><p class="portfolio-tracker-muted">ตรวจสอบจำนวนรูปในแต่ละหัวข้อ และอนุญาตแก้ไขได้เป็นรายบุคคล</p>${CATEGORIES.map(c=>{const sub=rows.find(s=>s.category_key===c.key);const count=sub?images.filter(i=>i.submission_id===sub.id).length:0;return `<p>${esc(c.label)}: <strong>${count} รูป</strong></p>`}).join("")}<button type="button" class="btn btn-primary btn-sm" id="pt-grant-member">อนุญาตแก้ไข 24 ชั่วโมง</button></div>`;
      detail.querySelector("#pt-grant-member")?.addEventListener("click",async()=>{try{await grantEdit(memberId,selectedRoundId,24);await loadData();render();}catch(e){alert("อนุญาตแก้ไขไม่สำเร็จ: "+e.message);}});
    }));
    root.querySelectorAll("[data-pt-approve-request]").forEach(btn=>btn.addEventListener("click",async()=>{
      const req=requests.find(r=>r.id===btn.dataset.ptApproveRequest);if(!req)return;
      try{await grantEdit(req.member_id,req.round_id,24);const {error}=await supabaseClient.from("portfolio_update_edit_requests").update({status:"approved",reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()}).eq("id",req.id);if(error)throw error;await loadData();render();}catch(e){alert(e.message);}
    }));
    root.querySelectorAll("[data-pt-reject-request]").forEach(btn=>btn.addEventListener("click",async()=>{
      const {error}=await supabaseClient.from("portfolio_update_edit_requests").update({status:"rejected",reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()}).eq("id",btn.dataset.ptRejectRequest);
      if(error){alert(error.message);return;}await loadData();render();
    }));
  }

  async function loadPortfolioTracker() {
    if(!currentUser||!currentMember)return;
    try{await loadData();render();}
    catch(error){
      const root=ensureRoot();if(!root)return;injectStyles();
      root.innerHTML=`<section class="portfolio-tracker-panel"><div class="portfolio-tracker-heading"><div><span class="panel-kicker">PORTFOLIO TRACKER</span><h3>ระบบตรวจสอบแฟ้มประจำรอบ</h3><p>ต้องติดตั้งฐานข้อมูลก่อนใช้งาน</p></div></div><div class="portfolio-tracker-empty">ยังโหลดข้อมูลไม่ได้: ${esc(error.message||"ไม่พบตาราง")}<br>กรุณารันไฟล์ SQL: <strong>4AM_GUILD_PORTFOLIO_UPDATE_TRACKER.sql</strong> ใน Supabase SQL Editor แล้วกดรีเฟรช</div><button id="pt-refresh" class="btn btn-outline" type="button">ลองอีกครั้ง</button></section>`;
      $("pt-refresh")?.addEventListener("click",loadPortfolioTracker);
    }
  }

  window.loadPortfolioTracker=loadPortfolioTracker;
  window.addEventListener("4am:app-ready",loadPortfolioTracker);
  if(currentUser&&currentMember)loadPortfolioTracker();
})();

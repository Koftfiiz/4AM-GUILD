// ==========================================
// 4AM GUILD - SUPABASE CONFIGURATION
// ==========================================

const SUPABASE_URL = "https://qbjixpcbzklrkcneluej.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4nOj0RDz_BuIt-lIWNvGAg_NmABI3a0";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

// ==========================================
// GLOBAL STATE
// ==========================================

let currentUser = null;
let currentMember = null;
let allMembers = [];
let discordAccount = null;
let allPortfolios = [];
let portfolioClassFilter = "all";
let allWarEvents = [];
let currentWarParties = [];
let currentWarPartyAssignments = [];
let currentWarAssignmentEventId = null;
let selectedWarEventId = null;
let warAttendanceEvents = [];
let warAttendanceEventId = null;
let warRealtimeChannel = null;
let registrationBusy = false;

const $ = (id) => document.getElementById(id);

const DEFAULT_AVATAR = "assets/default-avatar.jpg";
const AVATAR_BUCKET = "character-avatars";
const PORTFOLIO_BUCKET = "portfolio-images";

const CLASS_DATA = [
  { name: "Ironclad", color: "#e6b84f", iconPath: "assets/class-icon/Ironclad.png" },
  { name: "Bloodstrom", color: "#e54858", iconPath: "assets/class-icon/Bloodstrom.png" },
  { name: "Celestune", color: "#477be8", iconPath: "assets/class-icon/Celestune.png" },
  { name: "Numina", color: "#9b83df", iconPath: "assets/class-icon/Numina.png" },
  { name: "Sylph", color: "#dfa6ce", iconPath: "assets/class-icon/Sylph.png" },
  { name: "Nightwaker", color: "#9ce8ea", iconPath: "assets/class-icon/Nightwaker.png" },
  { name: "Dragonsvelte", color: "#42c98e", iconPath: "assets/class-icon/Dragonsvelte.png" },
  { name: "Mystech", color: "#e6b84f", iconPath: "assets/class-icon/Mystech.png" }
];

// ตำแหน่งภายในกิลด์ 4AM เรียงจากสูงสุดไปต่ำสุด
// ฝ่ายบริหารเท่านั้นที่สามารถกำหนดตำแหน่งให้สมาชิกได้
const GUILD_POSITIONS = [
  "หัวหน้าใหญ่ช่างฝีมือ",
  "หัวหน้ารอง",
  "หัวหน้าคนที่สาม",
  "หัวหน้าสี่",
  "หอเฟิงหัวหน้าสำนัก",
  "หอถู่หัวหน้าสำนัก",
  "หอฮั่วหัวหน้าสำนัก",
  "หอสุ่ยหัวหน้าสำนัก",
  "กุนซือ",
  "ผู้จัดงานเลี้ยง",
  "ที่ปรึกษา",
  "สมาชิกแก๊ง",
  "ศิษย์ฝึกหัด"
];

const PAGE_TITLES = {
  dashboard: "ภาพรวมกิลด์",
  members: "สมาชิกกิลด์",
  war: "จัดตี้วอร์",
  "war-attendance": "ประกาศรายชื่อวอร์",
  "war-signup": "ลงชื่อวอร์",
  "war-leave": "แจ้งลาวอร์",
  "war-stats": "สถิติกิลด์วอร์",
  "war-attendance-stats": "สถิติการเข้าร่วมวอร์",
  rules: "กฎกิลด์",
  portfolio: "แฟ้มผลงาน",
  activities: "กิจกรรมกิลด์",
  feedback: "แจ้งปัญหา / Feedback",
  settings: "ตั้งค่าบัญชี",
  "system-management": "System Management"
};

// ==========================================
// HELPERS
// ==========================================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

// ==========================================
// ROLE AND PERMISSION SYSTEM
// ==========================================

// แปลง Role เป็นข้อความสำหรับแสดงผล
function roleLabel(role) {
  const roles = {
    developer: "4AM Dev",
    leader: "Leader",
    admin: "Admin",
    management: "Management",
    member: "Member"
  };

  return roles[String(role || "").toLowerCase()] || "Member";
}

// ตรวจสอบ Developer
function isDeveloper() {
  return String(currentMember?.role || "").toLowerCase() === "developer";
}

// ตรวจสอบสิทธิ์จัดการระบบกิลด์
// Developer, Leader และ Management มีสิทธิ์จัดการระบบกิลด์
// Admin เป็น Role แยกและไม่มีสิทธิ์ระดับ Management
function isManagement() {
  const role = String(currentMember?.role || "").toLowerCase();

  return [
    "developer",
    "leader",
    "management"
  ].includes(role);
}

// ตรวจสอบสิทธิ์ Admin (ระดับรองจาก Management)
// แยก helper ไว้สำหรับกำหนดสิทธิ์งานทั่วไปในอนาคต
// ตำแหน่งที่ต้องการแสดงบนหน้าเว็บ
function getAccountDisplayPosition(member = currentMember) {
  if (!member) return "Guild Member";

  return member.display_position || roleLabel(member.role);
}

// ข้อความแสดงสิทธิ์ภายในระบบ
function getAccountPermissionLabel(member = currentMember) {
  if (!member) return "Member";

  return roleLabel(member.role);
}

function showMessage(elementId, message, type = "error") {
  const element = $(elementId);
  if (!element) return;

  element.textContent = message;
  element.className = `message ${type}`;
}

function setConnectionStatus(message, connected = false) {
  const element = $("connection-status");
  if (!element) return;

  element.textContent = message;
  element.classList.toggle("connected", connected);
  $("connection-pill")?.classList.toggle("offline", !connected);
}

function getMemberName(member) {
  return (
    member?.character_name ||
    member?.nickname ||
    member?.discord_name ||
    member?.user_id ||
    "Unknown Member"
  );
}

function getMemberClass(member) {
  return member?.game_class || "Unassigned";
}

function getClassInfo(className) {
  return CLASS_DATA.find(
    (item) => item.name.toLowerCase() === String(className || "").toLowerCase()
  );
}

async function resolveAvatarUrl(member) {
  if (!member?.avatar_url) return DEFAULT_AVATAR;

  if (/^https?:\/\//i.test(member.avatar_url)) {
    return member.avatar_url;
  }

  const { data, error } = await supabaseClient.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(member.avatar_url, 3600);

  if (error || !data?.signedUrl) {
    console.error("Avatar URL error:", error);
    return DEFAULT_AVATAR;
  }

  return data.signedUrl;
}

function updateUserChip() {
  const label = $("user-label");
  const avatar = $("user-avatar");

  const name = currentMember
    ? getMemberName(currentMember)
    : (currentUser?.email || "ผู้ใช้");

  if (label) label.textContent = name;

  if (avatar) {
    avatar.onerror = () => {
      avatar.onerror = null;
      avatar.src = DEFAULT_AVATAR;
    };

    resolveAvatarUrl(currentMember).then((url) => {
      avatar.src = url;
    });
  }
}

function updateDiscordPill() {
  const pill = $("discord-pill");
  const text = $("discord-pill-text");
  if (!pill || !text) return;

  const linked = Boolean(discordAccount);
  text.textContent = linked
    ? "เชื่อมต่อ Discord แล้ว"
    : "ยังไม่ได้เชื่อมต่อ Discord";

  pill.classList.toggle("is-off", !linked);
}

function closeUserMenu() {
  $("user-menu")?.classList.remove("open");
  $("user-chip")?.setAttribute("aria-expanded", "false");
}

function formatDate(value) {
  if (!value) return "-";
  const raw=String(value),match=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let year,month,day;
  if(match){year=match[1];month=match[2];day=match[3];}
  else{const date=new Date(value);if(Number.isNaN(date.getTime()))return "-";year=String(date.getFullYear());month=String(date.getMonth()+1).padStart(2,"0");day=String(date.getDate()).padStart(2,"0");}
  return day+":"+month+":"+year;
}
function formatTime(value) {
  if (!value) return "-";
  const raw=String(value),match=raw.match(/(?:T| )(\d{2}):(\d{2})/);
  return match?match[1]+":"+match[2]:raw.slice(0,5);
}

function showEmpty(container, title, description) {
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <span>!</span>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(description)}</p>
    </div>
  `;
}

// ==========================================
// AUTHENTICATION
// ==========================================

async function login(event) {
  event?.preventDefault();

  const submitButton = document.querySelector(
    "#login-form button[type='submit']"
  );

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "CONNECTING TO DISCORD...";
  }

  showMessage(
    "login-message",
    "Redirecting to Discord authorization...",
    "info"
  );

  try {
    const { data, error } =
      await supabaseClient.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo:
            window.location.origin + window.location.pathname,
          scopes: "identify email"
        }
      });

    if (error) throw error;

    if (data?.url) {
      window.location.href = data.url;
    }
  } catch (error) {
    console.error("Discord login error:", error);

    showMessage(
      "login-message",
      error.message || "Unable to sign in with Discord."
    );

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "ENTER 4AM GUILD";
    }
  }
}

window.login = login;

let logoutInProgress = false;

async function logout(event) {
  event?.preventDefault();
  if (logoutInProgress) return;
  logoutInProgress = true;

  const registrationLogout = $("registration-logout");
  const menuLogout = $("logout-btn");
  if (registrationLogout) registrationLogout.disabled = true;
  if (menuLogout) menuLogout.disabled = true;

  try {
    // Clear only this application's Supabase session.
    const { error } = await supabaseClient.auth.signOut({ scope: "local" });
    if (error) throw error;

    currentUser = null;
    currentMember = null;
    allMembers = [];
    discordAccount = null;
    allPortfolios = [];
    allWarEvents = [];
    if (feedbackRealtimeChannel) {
      supabaseClient.removeChannel(feedbackRealtimeChannel);
      feedbackRealtimeChannel = null;
    }
    feedbackRowsCache = [];
    feedbackNotificationsCache = [];
    registrationBusy = false;

    $("app-layout")?.classList.add("hidden");
    $("registration-screen")?.remove();
    $("login-screen")?.classList.remove("hidden");

    // Restore the original Discord login card hidden by showRegistrationScreen().
    $("login-form")?.closest(".login-card")?.classList.remove("hidden");

    closeUserMenu();
    updateUserChip();
    updateDiscordPill();
    setConnectionStatus("ยังไม่ได้เชื่อมต่อ", false);

    $("login-form")?.reset();
    const loginButton = document.querySelector("#login-form button[type='submit']");
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = "ENTER 4AM GUILD";
    }
    showMessage("login-message", "");
  } catch (error) {
    console.error("Logout error:", error);
    alert("Unable to sign out: " + (error?.message || "Unknown error"));
  } finally {
    logoutInProgress = false;
    if (registrationLogout) registrationLogout.disabled = false;
    if (menuLogout) menuLogout.disabled = false;
  }
}

// ==========================================
// APPLICATION INITIALIZATION
// ==========================================

async function loadApplication() {
  $("app-layout")?.classList.add("hidden");

  if (!currentUser) {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) throw error;
    currentUser = data.user;
  }

  if (!currentUser) return;

  setConnectionStatus("เชื่อมต่อกับ Supabase แล้ว", true);

  try {
    await loadCurrentMember();

    // ยังไม่มีโปรไฟล์ ให้ลงทะเบียนก่อนเข้า Dashboard
    if (!currentMember) {
      showRegistrationScreen();
      return;
    }

    // สมาชิกที่ถูกปิดใช้งาน ไม่สามารถเข้าใช้งานได้
    if (currentMember.active !== true) {
      showRegistrationScreen(
        "บัญชีสมาชิกนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลกิลด์"
      );
      return;
    }

    $("registration-screen")?.remove();
    $("login-screen")?.classList.add("hidden");
    $("app-layout")?.classList.remove("hidden");

    updateUserChip();

    await loadDiscordAccount();

    await Promise.allSettled([
      loadDashboard(),
      loadMembers(),
      loadPortfolios(),
      loadWarEvents()
    ]);

    subscribeToWarRealtime();
    subscribeToFeedbackRealtime();

    // Re-render after member records are available so each portfolio shows its owner.
    await renderPortfolios();
    renderClassLegend();
    renderWarLayout();

    // Restore the last page after authentication and member permissions are ready.
    openGuildPage(getLastGuildPage());

    await handleDiscordCallback();

  } catch (error) {
    console.error("Application loading error:", error);
    setConnectionStatus("เชื่อมต่อแล้ว แต่มีข้อผิดพลาด", false);
  }
}

// ==========================================
// CURRENT MEMBER
// ==========================================

async function loadCurrentMember() {
  const { data, error } = await supabaseClient
    .from("guild_members")
    .select("*")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Member profile error:", error);
    currentMember = null;
    return;
  }

  currentMember = data;
  syncManagementMenuVisibility();
}

// ==========================================
// CHARACTER REGISTRATION
// ==========================================

function showRegistrationScreen(errorMessage = "") {
  const loginScreen = $("login-screen");

  if (!loginScreen) {
    console.error("Login screen not found");
    return;
  }

  $("app-layout")?.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  const originalLoginCard = $("login-form")?.closest(".login-card");

  if (originalLoginCard) {
    originalLoginCard.classList.add("hidden");
  }

  let screen = $("registration-screen");

  if (!screen) {
    screen = document.createElement("div");
    screen.id = "registration-screen";
    screen.className = "login-card";

    screen.innerHTML = `
      <div class="login-logo registration-guild-logo">
        <img
          src="assets/4am-guild-logo.png"
          alt="4AM GUILD Logo"
          onerror="this.style.display='none'"
        >
      </div>

      <h2>4AM REGISTRATION</h2>

      <p class="login-description">
        Register your character to join 4AM GUILD
      </p>

      <form id="registration-form">

        <label class="registration-field-label" for="registration-character">
          ชื่อตัวละคร
          <span class="registration-field-status required">จำเป็นต้องกรอก</span>
        </label>

        <input
          id="registration-character"
          name="character_name"
          type="text"
          maxlength="40"
          placeholder="Enter character name"
          autocomplete="off"
          required
        >

        <label class="registration-field-label" for="registration-game-uid">
          UID ตัวละคร
          <span class="registration-field-status required">จำเป็นต้องกรอก</span>
        </label>

        <input
          id="registration-game-uid"
          name="game_uid"
          type="text"
          inputmode="numeric"
          pattern="[0-9]{10}"
          minlength="10"
          maxlength="10"
          placeholder="Enter 10-digit UID"
          autocomplete="off"
          required
        >

        <label class="registration-field-label" for="registration-class">
          Class อาชีพ
          <span class="registration-field-status required">จำเป็นต้องกรอก</span>
        </label>

        <select
          id="registration-class"
          name="game_class"
          required
        >
          <option value="" disabled selected>Select your class</option>
          ${CLASS_DATA.map(item => `
            <option value="${escapeHTML(item.name)}">${escapeHTML(item.name)}</option>
          `).join("")}
        </select>

        <label class="registration-field-label" for="registration-nickname">
          ชื่อเล่น
          <span class="registration-field-status required">จำเป็นต้องกรอก</span>
        </label>

        <input
          id="registration-nickname"
          name="nickname"
          type="text"
          maxlength="40"
          placeholder="Enter nickname"
          autocomplete="nickname"
          required
        >

        <label class="registration-field-label" for="registration-age">
          อายุ
          <span class="registration-field-status optional">ไม่บังคับ</span>
        </label>

        <input
          id="registration-age"
          name="age"
          type="text"
          inputmode="numeric"
          pattern="[0-9]{1,3}"
          maxlength="3"
          placeholder="Enter your age"
          autocomplete="off"
        >

        <div class="registration-discord-info">
          <strong>Discord Account :</strong>
          <span>${escapeHTML(currentUser?.email || "Discord Connected")}</span>
        </div>

        <p id="registration-message" class="message">
          ${escapeHTML(errorMessage)}
        </p>

        <div class="registration-actions">
          <button
            type="submit"
            class="btn btn-primary login-submit"
            id="registration-submit"
          >
            REGISTER / สมัครสมาชิก
          </button>

          <button
            type="button"
            id="registration-logout"
            class="btn btn-outline registration-logout"
          >
            LOG OUT / ออกจากระบบ
          </button>
        </div>

      </form>
    `;

    loginScreen.appendChild(screen);

    $("registration-form")?.addEventListener(
      "submit",
      registerGuildMember
    );

    // Bind Logout directly to the dynamically-created registration screen.
    $("registration-logout")?.addEventListener("click", logout);

  } else {
    screen.classList.remove("hidden");

    if (errorMessage) {
      showMessage("registration-message", errorMessage);
    }
  }
}

async function registerGuildMember(event) {
  event.preventDefault();

  if (registrationBusy) return;

  const form = $("registration-form");
  const button = $("registration-submit");

  if (!form || !currentUser) return;

  const formData = new FormData(form);

  const characterName = String(
    formData.get("character_name") || ""
  ).trim();

  const gameClass = String(
    formData.get("game_class") || ""
  ).trim();

  const gameUID = String(
    formData.get("game_uid") || ""
  ).trim();

  const nickname = String(
    formData.get("nickname") || ""
  ).trim();

  const age = String(
    formData.get("age") || ""
  ).trim();

  if (!characterName) {
    showMessage(
      "registration-message",
      "กรุณากรอก Character Name"
    );
    return;
  }

  if (!/^[0-9]{10}$/.test(gameUID)) {
    showMessage(
      "registration-message",
      "UID ตัวละครต้องเป็นตัวเลข 10 หลักเท่านั้น"
    );
    return;
  }

  if (!CLASS_DATA.some(item => item.name === gameClass)) {
    showMessage(
      "registration-message",
      "กรุณาเลือก Class จากรายการที่กำหนด"
    );
    return;
  }

  if (!nickname) {
    showMessage(
      "registration-message",
      "กรุณากรอก ชื่อเล่น"
    );
    return;
  }

  if (age && (
    !Number.isInteger(Number(age)) ||
    Number(age) < 1 ||
    Number(age) > 120
  )) {
    showMessage(
      "registration-message",
      "Age ต้องอยู่ระหว่าง 1 ถึง 120"
    );
    return;
  }

  registrationBusy = true;

  if (button) {
    button.disabled = true;
    button.textContent = "REGISTERING...";
  }

  showMessage(
    "registration-message",
    "กำลังตรวจสอบบัญชี Discord และบันทึกข้อมูล...",
    "info"
  );

  try {
    const { data, error } = await supabaseClient.functions.invoke(
      "register-guild-member",
      {
        body: {
          character_name: characterName,
          game_class: gameClass,
          game_uid: gameUID,
          nickname,
          age: age || null
        }
      }
    );

    if (error) {
      let message = error.message;

      try {
        const response = error.context;

        if (response && typeof response.json === "function") {
          const result = await response.json();
          message = result.message || message;
        }
      } catch (_) {}

      throw new Error(message);
    }

    if (!data?.success) {
      throw new Error(
        data?.message || "ไม่สามารถลงทะเบียนได้"
      );
    }

    showMessage(
      "registration-message",
      "ลงทะเบียนสำเร็จ กำลังเข้าสู่ Dashboard...",
      "success"
    );

    await loadCurrentMember();

    if (!currentMember) {
      throw new Error(
        "ลงทะเบียนสำเร็จ แต่ไม่พบโปรไฟล์ กรุณาติดต่อผู้ดูแล"
      );
    }

    registrationBusy = false;

    await loadApplication();

  } catch (error) {
    console.error("Character registration error:", error);

    showMessage(
      "registration-message",
      error.message || "Registration failed."
    );

    if (button) {
      button.disabled = false;
      button.textContent = "REGISTER CHARACTER";
    }

    registrationBusy = false;
  }
}

// ==========================================
// DASHBOARD
// ==========================================

async function loadDashboard() {
  const { data: members, error: memberError } = await supabaseClient
    .from("guild_members")
    .select("*");

  if (memberError) {
    console.error("Dashboard members error:", memberError);
  }

  const memberList = members || [];

  const activeMembers = memberList.filter((member) => {
    return member.active === true;
  });

  if ($("stat-members")) {
    $("stat-members").textContent = activeMembers.length;
  }

  // ใช้ RPC ที่คืนเฉพาะยอดรวม ไม่เปิดเผยข้อมูลบัญชี Discord ของสมาชิกคนอื่น
  const { data: discordCount, error: discordError } = await supabaseClient
    .rpc("get_guild_discord_account_count");

  if (discordError) {
    console.error("Guild Discord count error:", discordError);
  }

  if ($("stat-discord")) {
    $("stat-discord").textContent = discordError
      ? "--"
      : (Number(discordCount) || 0);
  }

  // แสดงตำแหน่ง ไม่ใช่ Role ภายใน
  if ($("stat-role")) {
    $("stat-role").textContent = getAccountDisplayPosition();
  }

  renderDashboardProfile();
}

async function renderDashboardProfile() {
  const container = $("dashboard-profile");
  if (!container) return;

  if (!currentMember) {
    container.innerHTML = `
      <p class="profile-note">
        ยังไม่พบข้อมูลสมาชิกของบัญชีนี้ (${escapeHTML(currentUser?.email || "-")})<br>
        กรุณาติดต่อผู้ดูแลกิลด์เพื่อเพิ่มข้อมูลของคุณ
      </p>
    `;
    return;
  }

  const name = getMemberName(currentMember);
  const characterName = currentMember.character_name || name;

  // ใช้ display_position สำหรับข้อความแสดงผล
  const role = getAccountDisplayPosition(currentMember);

  const className = getMemberClass(currentMember);
  const classInfo = getClassInfo(className);
  const classColor = classInfo?.color || "#e03545";
  const avatar = await resolveAvatarUrl(currentMember);

  const discordName = discordAccount
    ? (
      discordAccount.discord_global_name ||
      discordAccount.discord_username ||
      "เชื่อมต่อแล้ว"
    )
    : "ยังไม่ได้เชื่อมต่อ";

  container.innerHTML = `
    <div class="profile-card-body">
      <div class="profile-avatar-column">
        <div class="profile-avatar-ring">
          <img src="${escapeHTML(avatar)}" alt="รูปโปรไฟล์"
            onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'">
        </div>
        <input type="file" id="profile-avatar-input" accept="image/*" hidden>
        <button type="button" class="btn btn-outline profile-avatar-upload-btn">
          เปลี่ยนรูปโปรไฟล์
        </button>
        <small class="profile-avatar-upload-status" aria-live="polite">
          รองรับไฟล์รูปภาพ ขนาดไม่เกิน 5 MB
        </small>
      </div>

      <div class="profile-meta">
        <div class="profile-name">
          <strong>${escapeHTML(name)}</strong>
          <svg class="icon icon-fill is-stroke"><use href="#i-crown"/></svg>
          <span class="role-badge">
            <svg class="icon icon-fill is-stroke"><use href="#i-crown"/></svg>
            ${escapeHTML(role)}
          </span>
        </div>

        <dl class="profile-list">
          <div>
            <dt>ชื่อตัวละคร :</dt>
            <dd>${escapeHTML(characterName)}</dd>
          </div>
          <div>
            <dt>UID ตัวละคร :</dt>
            <dd class="profile-game-uid">
              <span>${escapeHTML(currentMember.game_uid || "ยังไม่ได้กรอก UID")}</span>
              ${currentMember.game_uid ? `<button type="button" class="btn btn-outline copy-own-game-uid" data-game-uid="${escapeHTML(currentMember.game_uid)}">Copy UID</button>` : ""}
            </dd>
          </div>
          <div>
            <dt>Class อาชีพ :</dt>
            <dd>
              ${classInfo?.iconPath ? `<img class="profile-class-icon" src="${escapeHTML(classInfo.iconPath)}" alt="${escapeHTML(className)} icon">` : ""}
              ${escapeHTML(className)}
            </dd>
          </div>
          <div>
            <dt>ตำแหน่ง :</dt>
            <dd>${escapeHTML(currentMember.guild_position || "ยังไม่ได้กำหนดตำแหน่ง")}</dd>
          </div>
          <div>
            <dt>Discord :</dt>
            <dd>
              <svg class="icon icon-fill"><use href="#i-discord"/></svg>
              ${escapeHTML(discordName)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  `;
}

// ==========================================
// MEMBERS
// ==========================================

async function loadMembers() {
  const container = $("members-list");

  if (container) {
    container.innerHTML = `<p class="muted">กำลังโหลดรายชื่อสมาชิก...</p>`;
  }

  const { data, error } = await supabaseClient
    .from("guild_members")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Load members error:", error);
    showEmpty(container, "Unable to load members", error.message);
    return;
  }

  allMembers = data || [];
  renderMembers(allMembers);
}

function renderMembers(members) {
  const container = $("members-list");
  if (!container) return;

  if (!members.length) {
    showEmpty(container, "No Members Found", "There are no guild members to display.");
    return;
  }

  const canManagePositions = isManagement();

  container.innerHTML = members.map((member) => {
    const name = getMemberName(member);
    const role = roleLabel(member.role);
    const className = getMemberClass(member);
    const userId = member.user_id || "";
    const classInfo = getClassInfo(className);
    const classColor = classInfo?.color || "#a9a9a9";
    const guildPosition = member.guild_position || "";
    const gameUID = String(member.game_uid || "");

    const positionOptions = GUILD_POSITIONS.map((position) => `
      <option value="${escapeHTML(position)}"
        ${guildPosition === position ? "selected" : ""}>
        ${escapeHTML(position)}
      </option>
    `).join("");

    return `
      <article class="member-card">
        <div class="member-avatar">
          <img
            class="member-avatar-image"
            data-member-avatar-user-id="${escapeHTML(userId)}"
            src="${DEFAULT_AVATAR}"
            alt="รูปโปรไฟล์ ${escapeHTML(name)}"
            loading="lazy"
            onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'"
          >
        </div>

        <div class="member-info">
          <div class="member-details">
            <h4>${escapeHTML(name)}</h4>
            <span class="member-role role-${escapeHTML(String(member.role || "member").toLowerCase())} ${String(member.role || "").toLowerCase() === "developer" ? "is-developer" : ""}">${escapeHTML(role)}</span>
            <small class="member-guild-position">
              ตำแหน่งกิลด์: ${escapeHTML(guildPosition || "ยังไม่ได้กำหนดตำแหน่ง")}
            </small>
          </div>

          <div class="member-game-uid">
            <span class="member-uid-label">UID ตัวละคร</span>
            <strong>${escapeHTML(gameUID || "ยังไม่ได้กรอก UID")}</strong>
            ${gameUID ? `<button type="button" class="btn btn-outline copy-member-game-uid" data-game-uid="${escapeHTML(gameUID)}">Copy UID</button>` : ""}
          </div>
        </div>

        <div class="member-class" style="--class-color:${classColor}">
          ${classInfo?.iconPath ? `<img class="member-class-icon" src="${classInfo.iconPath}" alt="${escapeHTML(className)}" loading="lazy" onerror="this.style.display=\'none\'">` : ""}
          <span>${escapeHTML(className)}</span>
        </div>

        ${canManagePositions ? `
          <div class="member-position-management">
            <label for="guild-position-${escapeHTML(userId)}">กำหนดตำแหน่ง</label>
            <select
              id="guild-position-${escapeHTML(userId)}"
              class="guild-position-select"
              data-action="assign-guild-position"
              data-user-id="${escapeHTML(userId)}"
              aria-label="กำหนดตำแหน่งกิลด์ให้ ${escapeHTML(name)}"
              style="
                max-width: 220px;
                padding: 8px 10px;
                border: 1px solid rgba(255,255,255,.16);
                border-radius: 8px;
                background: rgba(20,20,24,.92);
                color: inherit;
              "
            >
              <option value="">ยังไม่ได้กำหนดตำแหน่ง</option>
              ${positionOptions}
            </select>
            <small class="guild-position-save-status" aria-live="polite"></small>
          </div>
        ` : ""}

      </article>
    `;
  }).join("");

  // Load each member's saved avatar into the circular member-list frame.
  members.forEach(async (member) => {
    const userId = String(member.user_id || "");
    const avatar = container.querySelector(
      `.member-avatar-image[data-member-avatar-user-id="${CSS.escape(userId)}"]`
    );
    if (!avatar) return;

    const avatarUrl = await resolveAvatarUrl(member);
    // Avoid applying a stale result if the member list has been re-rendered.
    if (avatar.isConnected) avatar.src = avatarUrl || DEFAULT_AVATAR;
  });
}

// ฝ่ายบริหารเท่านั้นที่กำหนดตำแหน่งกิลด์ให้สมาชิกได้
async function assignGuildPosition(selectElement) {
  if (!selectElement || !isManagement()) {
    alert("คุณไม่มีสิทธิ์กำหนดตำแหน่งกิลด์");
    return;
  }

  const userId = selectElement.dataset.userId;
  const newPosition = selectElement.value || null;
  const member = allMembers.find((item) => item.user_id === userId);

  if (!userId || !member) {
    alert("ไม่พบข้อมูลสมาชิกที่ต้องการแก้ไข");
    return;
  }

  if (newPosition && !GUILD_POSITIONS.includes(newPosition)) {
    alert("ตำแหน่งที่เลือกไม่ถูกต้อง");
    selectElement.value = member.guild_position || "";
    return;
  }

  const previousPosition = member.guild_position || "";
  const status = selectElement.parentElement?.querySelector(
    ".guild-position-save-status"
  );

  selectElement.disabled = true;
  if (status) status.textContent = "กำลังบันทึก...";

  try {
    const { data, error } = await supabaseClient
      .from("guild_members")
      .update({ guild_position: newPosition })
      .eq("user_id", userId)
      .select("user_id, guild_position")
      .single();

    if (error) throw error;

    member.guild_position = data.guild_position;

    if (currentMember?.user_id === userId) {
      currentMember.guild_position = data.guild_position;
      renderDashboardProfile();
    }

    if (status) {
      status.textContent = "บันทึกตำแหน่งแล้ว";
      status.style.color = "#42c98e";
    }

    const memberDetails = selectElement.closest(".member-card")
      ?.querySelector(".member-guild-position");

    if (memberDetails) {
      memberDetails.textContent =
        "ตำแหน่งกิลด์: " + (data.guild_position || "ยังไม่ได้กำหนดตำแหน่ง");
    }

  } catch (error) {
    console.error("Guild position update error:", error);
    selectElement.value = previousPosition;

    if (status) {
      status.textContent = "บันทึกไม่สำเร็จ";
      status.style.color = "#e54858";
    }

    alert(
      "ไม่สามารถบันทึกตำแหน่งได้: " +
      (error.message || "เกิดข้อผิดพลาด")
    );
  } finally {
    selectElement.disabled = false;
  }
}

function filterMembers() {
  const search = $("member-search")?.value.trim().toLowerCase() || "";

  const filtered = allMembers.filter((member) => {
    const searchable = [
      getMemberName(member),
      member.nickname,
      member.discord_name,
      member.role,
      member.display_position,
      getMemberClass(member),
      member.user_id,
      member.game_uid
    ].join(" ").toLowerCase();

    return searchable.includes(search);
  });

  renderMembers(filtered);
}

// ==========================================
// DISCORD ACCOUNT LINKING
// ==========================================

async function loadDiscordAccount() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("discord_accounts")
    .select("*")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Discord account loading error:", error);
    discordAccount = null;
    renderDiscordStatus(error.message);
    return;
  }

  discordAccount = data;
  renderDiscordStatus();
}

function renderDiscordStatus(errorMessage = "") {
  updateDiscordPill();
  renderDashboardProfile();

  const container = $("discord-status");
  if (!container) return;

  if (discordAccount) {
    const discordName =
      discordAccount.discord_global_name ||
      discordAccount.discord_username ||
      "Account linked";

    container.innerHTML = `
      <div class="discord-connected">
        <span class="discord-status-icon">✓</span>
        <div>
          <strong>Discord Connected</strong>
          <p>${escapeHTML(discordName)}</p>
        </div>
      </div>
    `;

    const button = $("connect-discord");
    if (button) {
      button.textContent = "Discord Connected";
      button.disabled = true;
    }

    showMessage("discord-message", "Your Discord account is linked.", "success");
    return;
  }

  container.innerHTML = `
    <div class="discord-disconnected">
      <span class="discord-status-icon">◈</span>
      <div>
        <strong>Discord Not Connected</strong>
        <p>Link your Discord account to your guild profile.</p>
        ${errorMessage ? `<small>${escapeHTML(errorMessage)}</small>` : ""}
      </div>
    </div>
  `;

  const button = $("connect-discord");
  if (button) {
    button.textContent = "Connect Discord Account";
    button.disabled = false;
  }
}

async function connectDiscord() {
  if (!currentUser) return;

  const button = $("connect-discord");

  if (button) {
    button.disabled = true;
    button.textContent = "Connecting...";
  }

  showMessage("discord-message", "Opening Discord authorization...", "info");

  try {
    const { data, error } = await supabaseClient.auth.linkIdentity({
      provider: "discord",
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) throw error;

    if (data?.url) {
      window.location.href = data.url;
    }
  } catch (error) {
    console.error("Discord linking error:", error);
    showMessage("discord-message", error.message || "Unable to connect Discord.");

    if (button) {
      button.disabled = false;
      button.textContent = "Connect Discord Account";
    }
  }
}

async function handleDiscordCallback() {
  const params = new URLSearchParams(window.location.search);

  const isCallback =
    params.has("code") ||
    params.has("error") ||
    window.location.hash.includes("access_token");

  if (!isCallback) return;

  if (params.has("error")) {
    showMessage(
      "login-message",
      params.get("error_description") || params.get("error")
    );
  }

  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  );
}

// ==========================================
// MEMBER AVATAR STORAGE
// ==========================================

// เปิดเครื่องมือครอปรูปโปรไฟล์แบบวงกลมก่อนอัปโหลด
function openAvatarCropper(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const size = 320;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("ไม่สามารถเปิดเครื่องมือครอปรูปได้"));
        return;
      }

      let zoom = 1;
      let offsetX = 0;
      let offsetY = 0;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      const baseScale = Math.max(size / image.naturalWidth, size / image.naturalHeight);

      const modal = document.createElement("div");
      modal.className = "avatar-crop-modal";
      modal.innerHTML = `
        <div class="avatar-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
          <h3 id="avatar-crop-title">จัดตำแหน่งรูปโปรไฟล์</h3>
          <p class="avatar-crop-hint">ลากรูปเพื่อจัดตำแหน่ง และเลื่อนเพื่อซูมเข้า–ออก</p>
          <canvas class="avatar-crop-canvas" width="${size}" height="${size}" aria-label="ตัวอย่างรูปโปรไฟล์ที่ครอป"></canvas>
          <label class="avatar-crop-zoom-label" for="avatar-crop-zoom">ซูมรูปภาพ</label>
          <input id="avatar-crop-zoom" class="avatar-crop-zoom" type="range" min="1" max="3" step="0.01" value="1">
          <div class="avatar-crop-actions">
            <button type="button" class="btn btn-outline avatar-crop-cancel">ยกเลิก</button>
            <button type="button" class="btn btn-primary avatar-crop-confirm">ยืนยันรูปภาพ</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      const preview = modal.querySelector("canvas");
      const previewCtx = preview.getContext("2d");
      const zoomInput = modal.querySelector(".avatar-crop-zoom");

      function drawPreview() {
        previewCtx.clearRect(0, 0, size, size);
        const scale = baseScale * zoom;
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        const x = (size - width) / 2 + offsetX;
        const y = (size - height) / 2 + offsetY;
        previewCtx.drawImage(image, x, y, width, height);

        previewCtx.beginPath();
        previewCtx.rect(0, 0, size, size);
        previewCtx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
        previewCtx.fillStyle = "rgba(0, 0, 0, .58)";
        previewCtx.fill("evenodd");

        previewCtx.beginPath();
        previewCtx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        previewCtx.strokeStyle = "#e33b4d";
        previewCtx.lineWidth = 4;
        previewCtx.stroke();
      }

      function finish(result) {
        modal.remove();
        URL.revokeObjectURL(objectUrl);
        resolve(result);
      }

      preview.addEventListener("pointerdown", (event) => {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        preview.setPointerCapture(event.pointerId);
      });
      preview.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        const rect = preview.getBoundingClientRect();
        const factor = size / rect.width;
        offsetX += (event.clientX - lastX) * factor;
        offsetY += (event.clientY - lastY) * factor;
        lastX = event.clientX;
        lastY = event.clientY;
        drawPreview();
      });
      preview.addEventListener("pointerup", () => { dragging = false; });
      preview.addEventListener("pointercancel", () => { dragging = false; });
      zoomInput.addEventListener("input", () => {
        zoom = Number(zoomInput.value);
        drawPreview();
      });
      modal.querySelector(".avatar-crop-cancel").addEventListener("click", () => finish(null));
      modal.querySelector(".avatar-crop-confirm").addEventListener("click", () => {
        const output = document.createElement("canvas");
        output.width = 512;
        output.height = 512;
        const outputCtx = output.getContext("2d");
        const scale = baseScale * zoom * (512 / size);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        const x = (512 - width) / 2 + offsetX * (512 / size);
        const y = (512 - height) / 2 + offsetY * (512 / size);
        outputCtx.drawImage(image, x, y, width, height);
        output.toBlob((blob) => {
          if (!blob) {
            reject(new Error("ไม่สามารถประมวลผลรูปภาพได้"));
            modal.remove();
            URL.revokeObjectURL(objectUrl);
            return;
          }
          finish(new File([blob], "profile-avatar.jpg", { type: "image/jpeg" }));
        }, "image/jpeg", 0.92);
      });
      modal.addEventListener("click", (event) => {
        if (event.target === modal) finish(null);
      });
      drawPreview();
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพนี้ได้"));
    };
    image.src = objectUrl;
  });
}

async function uploadMemberAvatar(file) {
  if (!currentUser || !currentMember) {
    throw new Error("ไม่พบข้อมูลสมาชิกของบัญชีนี้");
  }

  if (!file || !file.type.startsWith("image/")) {
    throw new Error("กรุณาเลือกไฟล์รูปภาพ");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("รูปภาพต้องมีขนาดไม่เกิน 5 MB");
  }

  const extension = file.name.split(".").pop().toLowerCase();
  const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
  const path = `${currentUser.id}/avatar-${Date.now()}.${safeExtension}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type
    });

  if (uploadError) throw uploadError;

  const { error: updateError } = await supabaseClient
    .from("guild_members")
    .update({ avatar_url: path })
    .eq("user_id", currentUser.id);

  if (updateError) throw updateError;

  currentMember.avatar_url = path;
  updateUserChip();
  renderDashboardProfile();

  return path;
}

// ==========================================
// PORTFOLIO
// ==========================================

async function loadPortfolios() {
  const { data, error } = await supabaseClient
    .from("portfolios")
    .select(`
      id, member_id, title, description, game_class, created_at, updated_at,
      portfolio_images ( id, image_url, image_type, caption, created_at, sort_order ),
      portfolio_reviews ( status, reason, reviewer_user_id, reviewed_at )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Portfolio loading error:", error);
    allPortfolios = [];
    renderPortfolios();
    return;
  }

  allPortfolios = (data || []).map((portfolio) => ({
    ...portfolio,
    portfolio_images: (portfolio.portfolio_images || []).sort((a, b) =>
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
      new Date(a.created_at) - new Date(b.created_at)
    )
  }));
  renderPortfolios();
}

async function getPortfolioImageUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await supabaseClient.storage
    .from(PORTFOLIO_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) {
    console.error("Portfolio image URL error:", error);
    return "";
  }
  return data?.signedUrl || "";
}

function getPortfolioClasses(value) {
  return String(value || "")
    .split(/[,|]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function renderPortfolioClassChoices() {
  const container = $("portfolio-class-tags");
  if (!container) return;
  const selected = new Set(
    [...container.querySelectorAll(".portfolio-class-tag.is-selected")]
      .map((button) => button.dataset.class)
  );
  container.innerHTML = CLASS_DATA.map((item) => `
    <button type="button"
      class="portfolio-class-tag ${selected.has(item.name) ? "is-selected" : ""}"
      data-class="${escapeHTML(item.name)}"
      style="--class-color:${item.color}"
      aria-pressed="${selected.has(item.name)}">
      <img src="${escapeHTML(item.iconPath)}" alt="" loading="lazy">
      <span>${escapeHTML(item.name)}</span>
    </button>
  `).join("");
}

function renderPortfolioSelectedFiles() {
  const container = $("portfolio-image-preview");
  const files = window.portfolioDraftFiles || [];
  if (!container) return;
  if (!files.length) {
    container.innerHTML = '<p class="portfolio-upload-empty">ยังไม่ได้เลือกรูปภาพ</p>';
    return;
  }
  container.innerHTML = files.map((item, index) => `
    <article class="portfolio-preview-item" draggable="true" data-index="${index}">
      <img src="${item.preview}" alt="Preview ${index + 1}">
      <div class="portfolio-preview-actions">
        <button type="button" class="portfolio-cover-button ${index === 0 ? "is-cover" : ""}" data-cover-index="${index}">
          ${index === 0 ? "ภาพหน้าปก" : "ตั้งเป็นหน้าปก"}
        </button>
        <button type="button" class="portfolio-remove-image" data-remove-index="${index}" aria-label="ลบรูป">×</button>
      </div>
      <small>ลากเพื่อจัดลำดับ · ${index + 1}</small>
    </article>
  `).join("");
}

function resetPortfolioForm() {
  const form = $("portfolio-create-form");
  if (form) form.reset();
  (window.portfolioDraftFiles || []).forEach((item) => {
    if (item.preview && item.preview.startsWith("blob:")) URL.revokeObjectURL(item.preview);
  });
  window.portfolioDraftFiles = [];
  window.editingPortfolioId = null;
  window.portfolioOriginalImages = [];
  renderPortfolioClassChoices();
  renderPortfolioSelectedFiles();
  const heading = $("portfolio-form-heading");
  if (heading) {
    heading.querySelector("h3").textContent = "สร้างแฟ้มผลงานใหม่";
    heading.querySelector("p").textContent = "ผลงานนี้จะถูกบันทึกไว้ในบัญชีและตัวละครของคุณ";
  }
  const submit = $("portfolio-create-submit");
  if (submit) submit.textContent = "บันทึก Portfolio";
  const status = $("portfolio-form-status");
  if (status) status.textContent = "";
}

function isPortfolioReviewer() {
  const role = String(currentMember?.role || "").toLowerCase();
  return ["developer", "leader", "management"].includes(role);
}

function getPortfolioReview(portfolio) {
  const value = portfolio?.portfolio_reviews;
  return Array.isArray(value) ? (value[0] || null) : (value || null);
}

function portfolioReviewStatusLabel(status) {
  return ({
    pending: "รอตรวจสอบ",
    approved: "ตรวจสอบแล้ว · ผ่าน",
    rejected: "ยังไม่ผ่าน"
  })[status] || "รอตรวจสอบ";
}

async function renderPortfolios() {
  const container = $("portfolio-grid");
  if (!container) return;
  if (!allPortfolios.length) {
    showEmpty(container, "No Portfolio Yet", "ยังไม่มีผลงานในระบบ · กด Add Portfolio เพื่อสร้างแฟ้มแรกของคุณ");
    return;
  }

  const visiblePortfolios = portfolioClassFilter === "all"
    ? allPortfolios
    : allPortfolios.filter((portfolio) => getPortfolioClasses(portfolio.game_class)
        .some((name) => name.toLowerCase() === portfolioClassFilter.toLowerCase()));
  if (!visiblePortfolios.length) {
    showEmpty(container, "No Portfolio Found", `ยังไม่มีแฟ้มผลงานของคลาส ${portfolioClassFilter}`);
    return;
  }

  const reviewer = isPortfolioReviewer();
  const cards = await Promise.all(visiblePortfolios.map(async (portfolio) => {
    const images = portfolio.portfolio_images || [];
    const firstImage = images[0];
    const imageUrl = firstImage ? await getPortfolioImageUrl(firstImage.image_url) : "";
    const owner = allMembers.find((member) => member.user_id === portfolio.member_id);
    const ownerName = owner ? getMemberName(owner) : "Guild Member";
    const classes = getPortfolioClasses(portfolio.game_class);
    const firstClass = getClassInfo(classes[0]);
    const color = firstClass?.color || "";
    const isOwner = currentUser?.id === portfolio.member_id;
    const review = getPortfolioReview(portfolio) || { status: "pending" };
    const canSeeReview = reviewer || isOwner;
    const classTags = classes.map((className) => {
      const info = getClassInfo(className);
      return `<span class="portfolio-card-tag" ${info ? `style="--class-color:${info.color}"` : ""}>${escapeHTML(className)}</span>`;
    }).join("");

    const reviewPanel = canSeeReview ? `
      <div class="portfolio-review-summary">
        <div class="portfolio-review-status-line">
          <span class="portfolio-review-status-label">สถานะ</span>
          <span class="portfolio-review-badge is-${escapeHTML(review.status || "pending")}">
            ${escapeHTML(portfolioReviewStatusLabel(review.status))}
          </span>
        </div>
        ${review.status === "rejected" && review.reason ? `
          <div class="portfolio-review-reason">
            <strong>เหตุผลที่ยังไม่ผ่าน</strong>
            <p>${escapeHTML(review.reason)}</p>
          </div>
        ` : ""}
        ${review.reviewed_at ? `<small class="portfolio-review-meta">ตรวจล่าสุด ${escapeHTML(formatDate(review.reviewed_at))}</small>` : ""}
      </div>
    ` : "";

    const reviewControls = reviewer ? `
      <div class="portfolio-review-controls" data-portfolio-review="${escapeHTML(portfolio.id)}">
        <div class="portfolio-review-actions">
          <button type="button" class="portfolio-review-approve" data-review-action="approve" data-portfolio-id="${escapeHTML(portfolio.id)}">
            ✓ ตรวจแล้ว · ผ่าน
          </button>
          <button type="button" class="portfolio-review-reject" data-review-action="toggle-reject" data-portfolio-id="${escapeHTML(portfolio.id)}">
            ✕ ยังไม่ผ่าน
          </button>
        </div>
        <div class="portfolio-review-reject-form hidden" data-reject-form="${escapeHTML(portfolio.id)}">
          <label>
            <span>เหตุผลที่ไม่ผ่าน <i>*</i></span>
            <textarea rows="3" maxlength="1000" data-rejection-reason="${escapeHTML(portfolio.id)}" placeholder="ระบุสิ่งที่สมาชิกต้องแก้ไข..."></textarea>
          </label>
          <div class="portfolio-review-reject-footer">
            <small>สมาชิกเจ้าของแฟ้มผลงานจะเห็นเหตุผลนี้</small>
            <button type="button" class="portfolio-review-submit-reject" data-review-action="submit-rejection" data-portfolio-id="${escapeHTML(portfolio.id)}">ยืนยันไม่ผ่าน</button>
          </div>
        </div>
        <p class="portfolio-review-feedback" data-review-feedback="${escapeHTML(portfolio.id)}" aria-live="polite"></p>
      </div>
    ` : "";

    return `
      <article class="portfolio-card" ${color ? `style="--class-color:${color}"` : ""}>
        ${imageUrl ? `<img class="portfolio-card-image" src="${escapeHTML(imageUrl)}" alt="${escapeHTML(portfolio.title)}" loading="lazy">` : '<div class="portfolio-card-no-image">4AM GUILD</div>'}
        <div class="portfolio-card-content">
          <div class="portfolio-card-owner">${escapeHTML(ownerName)}</div>
          <div class="portfolio-card-tags">${classTags || '<span class="portfolio-card-tag">Unassigned</span>'}</div>
          <h3>${escapeHTML(portfolio.title || "Untitled")}</h3>
          <p>${escapeHTML(portfolio.description || "")}</p>
          <div class="portfolio-card-footer">
            <small>${images.length} รูป · ${formatDate(portfolio.created_at)}</small>
            ${isOwner ? '<span class="portfolio-owner-label">ผลงานของคุณ</span>' : ""}
          </div>
          <div class="portfolio-card-management">
            ${isOwner ? `
              <button type="button" class="portfolio-edit-button" data-portfolio-action="edit" data-portfolio-id="${escapeHTML(portfolio.id)}" aria-label="แก้ไขแฟ้มผลงาน" title="แก้ไขแฟ้มผลงาน">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                <span>แก้ไข</span>
              </button>
            ` : ""}
            ${reviewer ? `
              <button type="button" class="portfolio-delete-button" data-portfolio-action="delete" data-portfolio-id="${escapeHTML(portfolio.id)}" aria-label="ลบแฟ้มผลงาน" title="ลบแฟ้มผลงาน">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
                <span>ลบ</span>
              </button>
            ` : ""}
          </div>
          ${reviewPanel}
          ${reviewControls}
        </div>
      </article>
    `;
  }));
  container.innerHTML = cards.join("");

  // Review clicks are handled at window capture phase in registerPortfolioEvents().
}

async function savePortfolioReview(portfolioId, status, reason = "") {
  if (!isPortfolioReviewer()) {
    alert("เฉพาะ Developer, Leader และ Management เท่านั้นที่ตรวจ Portfolio ได้");
    return;
  }

  const feedback = document.querySelector(`[data-review-feedback="${CSS.escape(portfolioId)}"]`);
  const buttons = document.querySelectorAll(`[data-portfolio-review="${CSS.escape(portfolioId)}"] button`);
  buttons.forEach((button) => { button.disabled = true; });
  if (feedback) feedback.textContent = "กำลังบันทึกผลตรวจ...";

  try {
    const { error } = await supabaseClient.rpc("set_portfolio_review", {
      target_portfolio_id: portfolioId,
      new_status: status,
      rejection_reason: status === "rejected" ? reason.trim() : null
    });
    if (error) throw error;
    await loadPortfolios();
  } catch (error) {
    console.error("Portfolio review error:", error);
    if (feedback) feedback.textContent = error.message || "บันทึกผลตรวจไม่สำเร็จ";
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function handlePortfolioReviewAction(event) {
  const button = event.target instanceof Element
    ? event.target.closest("[data-review-action]")
    : null;
  if (!button) return;

  const portfolioId = button.dataset.portfolioId;
  const feedback = portfolioId
    ? document.querySelector(`[data-review-feedback="${CSS.escape(portfolioId)}"]`)
    : null;

  if (!isPortfolioReviewer()) {
    if (feedback) feedback.textContent = "บัญชีนี้ไม่มีสิทธิ์ตรวจ Portfolio (ต้องเป็น Developer, Leader หรือ Management)";
    else alert("บัญชีนี้ไม่มีสิทธิ์ตรวจ Portfolio");
    return;
  }
  if (!portfolioId) {
    if (feedback) feedback.textContent = "ไม่พบรหัส Portfolio กรุณารีเฟรชหน้าเว็บ";
    return;
  }

  const action = button.dataset.reviewAction;
  if (action === "toggle-reject") {
    const form = document.querySelector(`[data-reject-form="${CSS.escape(portfolioId)}"]`);
    if (!form) {
      if (feedback) feedback.textContent = "ไม่พบแบบฟอร์มระบุเหตุผล กรุณารีเฟรชหน้าเว็บ";
      return;
    }
    form.classList.toggle("hidden");
    if (feedback) feedback.textContent = form.classList.contains("hidden")
      ? ""
      : "กรุณากรอกเหตุผลที่ยังไม่ผ่าน แล้วกด “ยืนยันไม่ผ่าน”";
    if (!form.classList.contains("hidden")) {
      form.querySelector("textarea")?.focus();
    }
    return;
  }

  if (action === "approve") {
    // Submit directly instead of relying on browser confirm dialogs,
    // which may be suppressed by the browser and look like a dead button.
    void savePortfolioReview(portfolioId, "approved");
    return;
  }

  if (action === "submit-rejection") {
    const input = document.querySelector(`[data-rejection-reason="${CSS.escape(portfolioId)}"]`);
    const reason = input?.value.trim() || "";
    if (!reason) {
      if (feedback) feedback.textContent = "กรุณาระบุเหตุผลก่อนยืนยัน";
      if (input) {
        input.focus();
        input.setCustomValidity("กรุณาระบุเหตุผลที่ยังไม่ผ่าน");
        input.reportValidity();
        input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
      }
      return;
    }
    // The required reason has already been validated; submit directly.
    void savePortfolioReview(portfolioId, "rejected", reason);
  }
}

async function uploadPortfolioImage(file, portfolioId, caption = "", sortOrder = 0) {
  if (!currentUser) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  if (!file || !file.type.startsWith("image/")) throw new Error("กรุณาเลือกไฟล์รูปภาพ");
  const extension = file.name.split(".").pop().toLowerCase();
  const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
  const path = `${currentUser.id}/${portfolioId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExtension}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(PORTFOLIO_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (uploadError) throw uploadError;

  const { data, error: insertError } = await supabaseClient
    .from("portfolio_images")
    .insert({
      portfolio_id: portfolioId,
      image_url: path,
      image_type: "other",
      caption,
      sort_order: sortOrder
    })
    .select("id")
    .single();

  if (insertError) {
    await supabaseClient.storage.from(PORTFOLIO_BUCKET).remove([path]);
    throw insertError;
  }
  return data;
}

async function createPortfolio({ title, description = "", gameClasses = [] }) {
  if (!currentUser || !currentMember) throw new Error("ไม่พบข้อมูลสมาชิก");
  const selectedClasses = gameClasses.length ? gameClasses : [getMemberClass(currentMember)];
  const { data, error } = await supabaseClient
    .from("portfolios")
    .insert({
      member_id: currentMember.user_id,
      title,
      description,
      game_class: selectedClasses.join(", ")
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function handlePortfolioCreate(event) {
  event.preventDefault();
  const title = $("portfolio-title")?.value.trim();
  const description = $("portfolio-description")?.value.trim() || "";
  const files = window.portfolioDraftFiles || [];
  const selectedClasses = [...document.querySelectorAll(".portfolio-class-tag.is-selected")]
    .map((button) => button.dataset.class);
  const status = $("portfolio-form-status");
  const submit = $("portfolio-create-submit");
  const editingId = window.editingPortfolioId || null;

  if (!title) {
    if (status) status.textContent = "กรุณากรอกชื่อผลงาน";
    $("portfolio-title")?.focus();
    return;
  }
  if (!files.length) {
    if (status) status.textContent = "กรุณาเก็บรูปภาพไว้อย่างน้อย 1 รูป";
    return;
  }
  if (!selectedClasses.length) {
    if (status) status.textContent = "กรุณาเลือก Class Tags อย่างน้อย 1 คลาส";
    return;
  }
  if (files.some((item) => item.file && item.file.size > 12 * 1024 * 1024)) {
    if (status) status.textContent = "รูปภาพแต่ละไฟล์ต้องมีขนาดไม่เกิน 12 MB";
    return;
  }

  submit.disabled = true;
  submit.textContent = editingId ? "กำลังบันทึกการแก้ไข..." : "กำลังบันทึกผลงาน...";
  if (status) status.textContent = editingId ? "กำลังอัปเดตข้อมูลและรูปภาพ..." : "กำลังสร้างแฟ้มผลงานและอัปโหลดรูปภาพ...";
  let createdPortfolio = null;
  try {
    if (editingId) {
      const { data: existing, error: fetchError } = await supabaseClient
        .from("portfolios").select("id, member_id").eq("id", editingId).single();
      if (fetchError) throw fetchError;
      if (existing.member_id !== currentUser?.id) throw new Error("คุณแก้ไขได้เฉพาะแฟ้มผลงานของตัวเองเท่านั้น");

      const { error: updateError } = await supabaseClient.from("portfolios")
        .update({ title, description, game_class: selectedClasses.join(", ") }).eq("id", editingId);
      if (updateError) throw updateError;

      const keptIds = new Set(files.filter((item) => item.existing).map((item) => item.imageId));
      const removedImages = (window.portfolioOriginalImages || []).filter((item) => !keptIds.has(item.id));
      const removedPaths = removedImages.map((item) => item.path).filter((path) => path && !/^https?:\/\//i.test(path));
      if (removedPaths.length) {
        const { error } = await supabaseClient.storage.from(PORTFOLIO_BUCKET).remove(removedPaths);
        if (error) throw error;
      }
      for (const image of removedImages) {
        const { error } = await supabaseClient.from("portfolio_images").delete().eq("id", image.id);
        if (error) throw error;
      }
      for (let index = 0; index < files.length; index++) {
        const item = files[index];
        if (item.existing) {
          const { error } = await supabaseClient.from("portfolio_images")
            .update({ sort_order: index }).eq("id", item.imageId);
          if (error) throw error;
        } else {
          await uploadPortfolioImage(item.file, editingId, "", index);
        }
        if (status) status.textContent = `กำลังบันทึกรูปภาพ ${index + 1}/${files.length}...`;
      }
    } else {
      createdPortfolio = await createPortfolio({ title, description, gameClasses: selectedClasses });
      for (let index = 0; index < files.length; index++) {
        await uploadPortfolioImage(files[index].file, createdPortfolio.id, "", index);
        if (status) status.textContent = `กำลังอัปโหลดรูปภาพ ${index + 1}/${files.length}...`;
      }
    }

    // Return to the complete gallery after saving so a previously selected
    // class filter cannot make the other existing portfolios appear missing.
    portfolioClassFilter = "all";
    await loadPortfolios();
    renderClassLegend();
    resetPortfolioForm();
    const savedNow = new Date();
    const savedAt = formatDate(savedNow.toLocaleDateString("en-CA",{timeZone:"Asia/Bangkok"}))+" "+new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",timeZone:"Asia/Bangkok"}).format(savedNow);
    if (status) status.textContent = `บันทึกข้อมูลแฟ้มผลงานสำเร็จ · ${savedAt} น. (เวลาไทย)`;
  } catch (error) {
    console.error("Portfolio save error:", error);
    if (status) status.textContent = (createdPortfolio ? "สร้างแฟ้มแล้ว แต่บันทึกรูปภาพไม่ครบ: " : "บันทึกไม่สำเร็จ: ") + (error.message || "Unknown error");
  } finally {
    submit.disabled = false;
    submit.textContent = window.editingPortfolioId ? "บันทึกการแก้ไข" : "บันทึก Portfolio";
  }
}

async function startPortfolioEdit(portfolioId) {
  const portfolio = allPortfolios.find((item) => item.id === portfolioId);
  if (!portfolio || portfolio.member_id !== currentUser?.id) {
    alert("คุณแก้ไขได้เฉพาะแฟ้มผลงานของตัวเองเท่านั้น");
    return;
  }
  resetPortfolioForm();
  window.editingPortfolioId = portfolio.id;
  window.portfolioOriginalImages = (portfolio.portfolio_images || []).map((image) => ({ id: image.id, path: image.image_url }));
  $("portfolio-title").value = portfolio.title || "";
  $("portfolio-description").value = portfolio.description || "";
  renderPortfolioClassChoices();
  const selected = new Set(getPortfolioClasses(portfolio.game_class));
  document.querySelectorAll(".portfolio-class-tag").forEach((button) => {
    const active = selected.has(button.dataset.class);
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const imageItems = await Promise.all((portfolio.portfolio_images || []).map(async (image) => ({
    file: null, preview: await getPortfolioImageUrl(image.image_url), existing: true,
    imageId: image.id, path: image.image_url
  })));
  window.portfolioDraftFiles = imageItems.filter((item) => item.preview);
  renderPortfolioSelectedFiles();
  const heading = $("portfolio-form-heading");
  if (heading) {
    heading.querySelector("h3").textContent = "แก้ไขแฟ้มผลงาน";
    heading.querySelector("p").textContent = "แก้ไขได้เฉพาะแฟ้มผลงานที่อยู่ในบัญชีของคุณ";
  }
  const submit = $("portfolio-create-submit");
  if (submit) submit.textContent = "บันทึกการแก้ไข";
  const status = $("portfolio-form-status");
  if (status) status.textContent = "";
  $("portfolio-create-panel")?.classList.remove("hidden");
  $("portfolio-add-button")?.setAttribute("aria-expanded", "true");
  $("portfolio-create-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deletePortfolio(portfolioId) {
  if (!isPortfolioReviewer()) {
    alert("เฉพาะ Developer, Leader และ Management เท่านั้นที่ลบแฟ้มผลงานได้");
    return;
  }
  const portfolio = allPortfolios.find((item) => item.id === portfolioId);
  if (!portfolio) return;
  try {
    const paths = (portfolio.portfolio_images || []).map((image) => image.image_url)
      .filter((path) => path && !/^https?:\/\//i.test(path));
    if (paths.length) {
      const { error } = await supabaseClient.storage.from(PORTFOLIO_BUCKET).remove(paths);
      if (error) throw error;
    }
    const { error } = await supabaseClient.from("portfolios").delete().eq("id", portfolioId);
    if (error) throw error;
    await loadPortfolios();
    alert("ลบแฟ้มผลงานและรูปภาพเรียบร้อยแล้ว");
  } catch (error) {
    console.error("Portfolio delete error:", error);
    alert("ลบแฟ้มผลงานไม่สำเร็จ: " + (error.message || "Unknown error"));
  }
}

async function handlePortfolioCardAction(event) {
  const button = event.target.closest("[data-portfolio-action]");
  if (!button) return;
  const portfolioId = button.dataset.portfolioId;
  if (!portfolioId) return;
  if (button.dataset.portfolioAction === "edit") {
    await startPortfolioEdit(portfolioId);
    return;
  }
  if (button.dataset.portfolioAction === "delete") {
    // Use an in-page two-click confirmation instead of window.confirm(),
    // which may be suppressed by some browser/event-handler contexts.
    if (button.dataset.confirmDelete !== "true") {
      button.dataset.confirmDelete = "true";
      button.classList.add("is-confirming");
      button.textContent = "ยืนยันลบ?";
      button.setAttribute("aria-label", "คลิกอีกครั้งเพื่อยืนยันการลบแฟ้มผลงาน");
      return;
    }
    button.disabled = true;
    button.textContent = "กำลังลบ...";
    await deletePortfolio(portfolioId);
  }
}

function registerPortfolioEvents() {
  window.portfolioDraftFiles = [];
  $("class-legend")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-portfolio-class-filter]");
    if (!button) return;
    portfolioClassFilter = button.dataset.portfolioClassFilter || "all";
    renderClassLegend();
    void renderPortfolios();
  });
  renderPortfolioClassChoices();
  renderPortfolioSelectedFiles();

  $("portfolio-add-button")?.addEventListener("click", () => {
    $("portfolio-create-panel")?.classList.toggle("hidden");
    $("portfolio-add-button").setAttribute("aria-expanded", String(!$("portfolio-create-panel")?.classList.contains("hidden")));
  });

  $("portfolio-create-form")?.addEventListener("submit", handlePortfolioCreate);
  $("portfolio-cancel-button")?.addEventListener("click", () => {
    resetPortfolioForm();
    $("portfolio-create-panel")?.classList.add("hidden");
    $("portfolio-add-button")?.setAttribute("aria-expanded", "false");
  });
  $("portfolio-class-tags")?.addEventListener("click", (event) => {
    const button = event.target.closest(".portfolio-class-tag");
    if (!button) return;
    button.classList.toggle("is-selected");
    button.setAttribute("aria-pressed", String(button.classList.contains("is-selected")));
  });

  $("portfolio-image-input")?.addEventListener("change", (event) => {
    const chosen = [...(event.target.files || [])];
    const existing = window.portfolioDraftFiles || [];
    const combined = [...existing, ...chosen].slice(0, 12);
    if (chosen.length + existing.length > 12) {
      const status = $("portfolio-form-status");
      if (status) status.textContent = "เพิ่มรูปได้สูงสุด 12 รูปต่อ Portfolio";
    }
    window.portfolioDraftFiles = combined.map((file) => ({
      file: file instanceof File ? file : file.file,
      preview: file instanceof File ? URL.createObjectURL(file) : file.preview
    }));
    renderPortfolioSelectedFiles();
    event.target.value = "";
  });

  $("portfolio-image-preview")?.addEventListener("click", (event) => {
    const cover = event.target.closest("[data-cover-index]");
    const remove = event.target.closest("[data-remove-index]");
    let files = window.portfolioDraftFiles || [];
    if (cover) {
      const index = Number(cover.dataset.coverIndex);
      files = [files[index], ...files.filter((_, i) => i !== index)];
    } else if (remove) {
      const index = Number(remove.dataset.removeIndex);
      URL.revokeObjectURL(files[index]?.preview);
      files = files.filter((_, i) => i !== index);
    } else return;
    window.portfolioDraftFiles = files;
    renderPortfolioSelectedFiles();
  });

  let draggingIndex = null;
  $("portfolio-image-preview")?.addEventListener("dragstart", (event) => {
    const item = event.target.closest(".portfolio-preview-item");
    if (!item) return;
    draggingIndex = Number(item.dataset.index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(draggingIndex));
    item.classList.add("is-dragging");
  });
  $("portfolio-image-preview")?.addEventListener("dragover", (event) => {
    if (event.target.closest(".portfolio-preview-item")) event.preventDefault();
  });
  $("portfolio-image-preview")?.addEventListener("drop", (event) => {
    const target = event.target.closest(".portfolio-preview-item");
    if (!target || draggingIndex === null) return;
    event.preventDefault();
    const targetIndex = Number(target.dataset.index);
    const files = [...(window.portfolioDraftFiles || [])];
    const [moved] = files.splice(draggingIndex, 1);
    files.splice(targetIndex, 0, moved);
    window.portfolioDraftFiles = files;
    draggingIndex = null;
    renderPortfolioSelectedFiles();
  });
  $("portfolio-image-preview")?.addEventListener("dragend", () => {
    draggingIndex = null;
    $("portfolio-image-preview")?.querySelectorAll(".is-dragging").forEach((item) => item.classList.remove("is-dragging"));
  });

  // Handle review actions at window capture phase, before document/card listeners.
  // This remains active across every portfolio-grid re-render.
  window.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const reviewButton = target?.closest("[data-review-action]");
    if (!reviewButton) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    handlePortfolioReviewAction({ target: reviewButton });
  }, true);

  // Keep portfolio edit/delete actions on the existing document capture handler.
  document.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    const actionButton = target.closest("[data-portfolio-action]");
    if (!actionButton) return;
    event.preventDefault();
    event.stopPropagation();
    await handlePortfolioCardAction({ target });
  }, true);
}

// ==========================================
// GUILD WAR - LOAD EVENTS
// ==========================================

async function loadWarEvents() {
  const { data, error } = await supabaseClient
    .from("war_events")
    .select("*")
    .order("event_date", { ascending: false });

  if (error) {
    console.error("War events loading error:", error);
    allWarEvents = [];
    renderWarLayout();
    return;
  }

  allWarEvents = data || [];
  renderWarEvents();
  renderWarLayout(selectedWarEventId);
}

function getWarEventStage(event) {
  if (event?.is_published) return "published";
  if (event?.is_draft_confirmed) return "draft";
  return "arranging";
}
function renderWarEvents() {
  const container = $("war-events");
  if (!container) return;
  if (!isManagement()) { container.innerHTML = ""; return; }
  if (!allWarEvents.length) { showEmpty(container,"No War Events","ยังไม่มีกิจกรรม Guild War · กด “สร้างตี้วอร์” เพื่อเริ่มต้น"); return; }
  container.innerHTML = allWarEvents.map(event => {
    const config=getWarEventConfig(event), stage=getWarEventStage(event);
    const description=String(event.description||"").replace(/\[\[WAR_CONFIG:\s*\{.*?\}\s*\]\]/g,"").trim();
    const label=stage==="published"?"PUBLISHED":stage==="draft"?"DRAFT":"กำลังจัดตี้";
    return `<article class="war-event-card war-event-card-selectable"><div class="war-event-main"><h3>${escapeHTML(event.event_name)}</h3><p>${formatDate(event.event_date)} · ${formatTime(event.start_time)} · ${config.mode==="practice"?"Practice War":"Official War"} · ${config.raidCount} Raid</p>${description?`<small>${escapeHTML(description)}</small>`:""}</div><div class="war-event-actions"><span class="war-stage-badge war-stage-${stage}">${label}</span><button class="btn btn-outline btn-sm" type="button" data-war-open="${escapeHTML(event.id)}">${stage==="published"?"ดูรายละเอียด":"จัดการตี้"}</button><button class="btn btn-danger btn-sm" type="button" data-war-delete="${escapeHTML(event.id)}">ลบวอร์</button></div></article>`;
  }).join("");
}

function getWarEventConfig(event) {
  const description = String(event?.description || "");
  const match = description.match(/\[\[WAR_CONFIG:(\{.*?\})\]\]/);
  if (!match) return { mode: "official", raidCount: 2 };
  try {
    const config = JSON.parse(match[1]);
    const raidCount = config.mode === "practice"
      ? Math.min(4, Math.max(1, Number(config.raidCount) || 1))
      : 2;
    return { mode: config.mode === "practice" ? "practice" : "official", raidCount };
  } catch {
    return { mode: "official", raidCount: 2 };
  }
}

function renderWarLayout(eventId = selectedWarEventId) {
  const summary=$("war-summary"),boards=$("war-raid-boards"),stage=$("war-detail-stage");
  const event=allWarEvents.find(item=>item.id===eventId)||null;
  if(!event){selectedWarEventId=null;currentWarParties=[];currentWarPartyAssignments=[];currentWarAssignmentEventId=null;if(summary)summary.innerHTML="";if(boards)boards.innerHTML="";stage?.classList.add("hidden");return;}
  selectedWarEventId=event.id;
  const config=getWarEventConfig(event),letters=["A","B","C","D"].slice(0,config.raidCount);
  stage?.classList.remove("hidden");
  if(summary)summary.innerHTML=`
    <article class="stat-card stat-card-sm"><div class="stat-icon"><svg class="icon"><use href="#i-swords"/></svg></div><div class="stat-info"><span class="stat-label">TOTAL CAPACITY</span><div class="stat-value"><strong>${config.raidCount*30}</strong></div><small>${config.mode==="practice"?"Practice War":"Official War"}</small></div></article>
    <article class="stat-card stat-card-sm"><div class="stat-icon letter">${config.raidCount}</div><div class="stat-info"><span class="stat-label">TOTAL RAIDS</span><div class="stat-value"><strong>${config.raidCount}</strong></div><small>5 Parties · 6 Players each</small></div></article>
    <article class="stat-card stat-card-sm"><div class="stat-icon letter">⚔</div><div class="stat-info"><span class="stat-label">WAR EVENT</span><div class="stat-value war-summary-name"><strong>${escapeHTML(event.event_name)}</strong></div><small>${formatDate(event.event_date)} · ${formatTime(event.start_time)}</small></div></article>`;
  const confirmed=Boolean(event.is_draft_confirmed),published=Boolean(event.is_published);
  $("war-confirm-draft")?.classList.toggle("hidden",!isManagement()||confirmed||published);
  $("war-publish-event")?.classList.toggle("hidden",!isManagement()||!confirmed||published);
  $("war-export-image")?.classList.toggle("hidden",!confirmed);
  const sync=$("war-sync-discord");sync?.classList.toggle("hidden",!confirmed);if(sync){sync.disabled=true;sync.title="Discord Bot integration ยังไม่เปิดใช้งาน";}
  const label=$("war-detail-stage-label");if(label)label.textContent=published?"PUBLISHED · สมาชิกมองเห็นแล้ว":confirmed?"DRAFT · ยืนยันรายชื่อแล้ว":"กำลังจัดตี้ · ยังไม่ยืนยัน";
  const notice=$("war-edit-notice");if(notice)notice.textContent=published?"วอร์นี้เผยแพร่แล้ว จึงเปิดดูรายชื่อได้อย่างเดียว":"เลือก Class ก่อน แล้วเลือกสมาชิกที่มี Class ตรงกันในแต่ละช่อง";
  if(boards)boards.innerHTML=letters.map((letter,index)=>`<div class="raid-section"><div class="raid-title"><span class="raid-badge ${index?"raid-b":""}">${letter}</span><div><h2>Raid ${letter}</h2><p>${config.mode==="practice"?"Practice battle formation":"Official battle formation"}</p></div></div><div id="raid-${letter.toLowerCase()}" class="raid-grid"></div></div>`).join("");
  loadSelectedWarEvent(event.id);
}

async function loadSelectedWarEvent(eventId) {
  currentWarAssignmentEventId=eventId;
  const {data:parties,error}=await supabaseClient.from("war_parties").select(`id,event_id,raid,party_number,party_name,war_party_members(id,member_id,position)`).eq("event_id",eventId).order("party_number",{ascending:true});
  if(error){console.error("War party loading error:",error);currentWarParties=[];currentWarPartyAssignments=[];alert("โหลดรายชื่อปาร์ตี้ไม่สำเร็จ: "+error.message);return;}
  currentWarParties=parties||[];
  currentWarPartyAssignments=currentWarParties.flatMap(party=>(party.war_party_members||[]).map(member=>({...member,party_id:party.id,raid:party.raid,party_number:party.party_number})));
  renderAllWarParties();
}
function renderAllWarParties() {
  const event=allWarEvents.find(item=>item.id===currentWarAssignmentEventId);if(!event)return;
  const config=getWarEventConfig(event),editable=isManagement()&&!event.is_published;
  ["A","B","C","D"].slice(0,config.raidCount).forEach(letter=>renderRaid(`raid-${letter.toLowerCase()}`,letter,currentWarParties.filter(party=>party.raid===letter),{editable}));
}

function getAssignedWarMemberIds(exceptAssignmentId = null) {
  return new Set(currentWarPartyAssignments
    .filter(item => item.id !== exceptAssignmentId)
    .map(item => item.member_id));
}

function getWarMemberOptions(className, selectedMemberId = "") {
  const assigned = getAssignedWarMemberIds();
  return allMembers
    .filter(member => member.active === true)
    .filter(member => String(getMemberClass(member)).toLowerCase() === String(className).toLowerCase())
    .filter(member => !assigned.has(member.user_id) || member.user_id === selectedMemberId)
    .sort((a, b) => getMemberName(a).localeCompare(getMemberName(b), "th"))
    .map(member => `<option value="${escapeHTML(member.user_id)}" ${member.user_id === selectedMemberId ? "selected" : ""}>${escapeHTML(getMemberName(member))}</option>`)
    .join("");
}

function renderRaid(containerId, raidName, parties = [], options = {}) {
  const container = $(containerId);
  if (!container) return;
  const canArrange = options.editable === true;

  container.innerHTML = Array.from({ length: 5 }, (_, index) => {
    const partyNumber = index + 1;
    const party = parties.find(item => Number(item.party_number) === partyNumber);
    const members = party?.war_party_members || [];

    return `
      <article class="party-card">
        <div class="party-header">
          <div class="party-heading-fields">
            <h3>${raidName}${partyNumber}</h3>
            ${party?.party_name && party.party_name !== `${raidName}${partyNumber}` ? `<small class="war-party-role-label">${escapeHTML(party.party_name)}</small>` : ""}
          </div>
          <span class="party-count">${members.length} / 6</span>
        </div>
        <div class="party-slots">
          ${Array.from({ length: 6 }, (_, slotIndex) => {
            const position = slotIndex + 1;
            const slot = members.find(item => Number(item.position) === position);
            const member = allMembers.find(item => item.user_id === slot?.member_id);
            if (slot && member) {
              const info = getClassInfo(getMemberClass(member));
              return `
                <div class="party-slot party-slot-filled">
                  <span class="slot-number">${position}</span>
                  <img class="war-slot-class-icon" src="${escapeHTML(info?.iconPath || "")}" alt="${escapeHTML(info?.name || "")}" title="${escapeHTML(info?.name || "")}">
                  <span class="slot-member-name">${escapeHTML(getMemberName(member))}</span>
                  ${canArrange ? `<button class="war-slot-remove" type="button" data-war-remove="${escapeHTML(slot.id)}" aria-label="นำสมาชิกออก" title="นำสมาชิกออก">×</button>` : ""}
                </div>`;
            }

            if (!canArrange || !party) {
              return `<div class="party-slot"><span class="slot-number">${position}</span><span class="slot-empty">Empty Slot</span></div>`;
            }

            const classOptions = CLASS_DATA.map(info =>
              `<option value="${escapeHTML(info.name)}">${escapeHTML(info.name)}</option>`
            ).join("");
            return `
              <div class="party-slot party-slot-editor" data-war-slot>
                <span class="slot-number">${position}</span>
                <select class="war-slot-class" aria-label="เลือกอาชีพช่อง ${position}" data-party-id="${escapeHTML(party.id)}" data-position="${position}">
                  <option value="">อาชีพ</option>${classOptions}
                </select>
                <img class="war-slot-class-icon hidden" alt="" data-war-class-icon>
                <select class="war-slot-member" aria-label="เลือกสมาชิกช่อง ${position}" disabled data-party-id="${escapeHTML(party.id)}" data-position="${position}">
                  <option value="">เลือกสมาชิก</option>
                </select>
              </div>`;
          }).join("")}
        </div>
      </article>`;
  }).join("");
}

async function handleWarSlotChange(event) {
  const classSelect = event.target.closest(".war-slot-class");
  if (classSelect) {
    const slot = classSelect.closest("[data-war-slot]");
    const memberSelect = slot?.querySelector(".war-slot-member");
    const icon = slot?.querySelector("[data-war-class-icon]");
    const info = getClassInfo(classSelect.value);
    if (icon) {
      icon.src = info?.iconPath || "";
      icon.alt = info?.name || "";
      icon.classList.toggle("hidden", !info);
    }
    if (memberSelect) {
      memberSelect.innerHTML = `<option value="">เลือกสมาชิก</option>${info ? getWarMemberOptions(info.name) : ""}`;
      memberSelect.disabled = !info;
    }
    return;
  }

  const memberSelect = event.target.closest(".war-slot-member");
  if (!memberSelect || !memberSelect.value) return;
  const activeWar = allWarEvents.find(item => item.id === currentWarAssignmentEventId);
  if (!isManagement() || !activeWar || activeWar.is_published) return;

  const memberId = memberSelect.value;
  const partyId = memberSelect.dataset.partyId;
  const position = Number(memberSelect.dataset.position);
  const party = currentWarParties.find(item => item.id === partyId);
  if (!party) return;

  if (getAssignedWarMemberIds().has(memberId)) {
    memberSelect.value = "";
    alert("สมาชิกคนนี้ถูกจัดลงปาร์ตี้อื่นในวอร์รอบนี้แล้ว");
    return;
  }
  if ((party.war_party_members || []).length >= 6) {
    memberSelect.value = "";
    alert("ปาร์ตี้นี้เต็มแล้ว");
    return;
  }

  memberSelect.disabled = true;
  try {
    const { data, error } = await supabaseClient
      .from("war_party_members")
      .insert({ party_id: partyId, member_id: memberId, position })
      .select()
      .single();
    if (error) throw error;

    party.war_party_members = [...(party.war_party_members || []), data];
    currentWarPartyAssignments.push({ ...data, party_id: partyId, raid: party.raid, party_number: party.party_number });
    renderAllWarParties();
  } catch (error) {
    console.error("War member assignment failed:", error);
    alert("จัดสมาชิกไม่สำเร็จ: " + (error.message || "กรุณาลองใหม่"));
    memberSelect.disabled = false;
    memberSelect.value = "";
  }
}

async function removeWarPartyMember(assignmentId, button) {
  const activeWar = allWarEvents.find(item => item.id === currentWarAssignmentEventId);
  if (!isManagement() || !activeWar || activeWar.is_published) return;
  if (!assignmentId) return;
  button.disabled = true;
  try {
    const { error } = await supabaseClient
      .from("war_party_members")
      .delete()
      .eq("id", assignmentId);
    if (error) throw error;

    currentWarParties.forEach(party => {
      party.war_party_members = (party.war_party_members || []).filter(item => item.id !== assignmentId);
    });
    currentWarPartyAssignments = currentWarPartyAssignments.filter(item => item.id !== assignmentId);
    renderAllWarParties();
  } catch (error) {
    console.error("War member removal failed:", error);
    alert("นำสมาชิกออกไม่สำเร็จ: " + (error.message || "กรุณาลองใหม่"));
    button.disabled = false;
  }
}

// ==========================================
// GUILD WAR - CREATE EVENT
// ==========================================

function setWarCreateMessage(message, isError = false) {
  const box = $("war-create-message");
  if (!box) return;
  box.textContent = message;
  box.classList.remove("hidden", "error", "success");
  box.classList.add(isError ? "error" : "success");
}

function updateWarCreateMode() {
  const mode = document.querySelector('input[name="war-mode"]:checked')?.value || "official";
  const isPractice = mode === "practice";
  $("war-raid-count-wrap")?.classList.toggle("hidden", !isPractice);
  const raidCount = isPractice ? Number($("war-raid-count")?.value || 4) : 2;
  const capacity = raidCount * 30;
  const label = isPractice ? "ซ้อมวอร์" : "วอร์จริง";
  const summary = $("war-create-capacity");
  if (summary) summary.textContent = `${label}: ${raidCount} Raid · ${raidCount * 5} ปาร์ตี้ · รองรับ ${capacity} คน`;
}

async function handleWarCreate(event) {
  event.preventDefault();if(!isManagement())return;
  const form=event.currentTarget,mode=form.querySelector('input[name="war-mode"]:checked')?.value||"official";
  const raidCount=mode==="practice"?Number($("war-raid-count")?.value||4):2;
  const opponent=String($("war-opponent")?.value||"").trim(),eventDate=$("war-event-date")?.value,startTime=String($("war-start-time")?.value||"").trim(),submit=$("war-create-submit");
  if(!opponent||!eventDate||!startTime){setWarCreateMessage("กรุณากรอกชื่อกิลด์คู่แข่ง วันที่ และเวลาเริ่มวอร์ให้ครบ",true);return;}
  if(!Number.isInteger(raidCount)||raidCount<1||raidCount>4){setWarCreateMessage("จำนวน Raid ต้องอยู่ระหว่าง 1–4",true);return;}
  submit.disabled=true;submit.textContent="กำลังสร้าง...";setWarCreateMessage("กำลังสร้างกิจกรรมและเตรียมช่องปาร์ตี้...");
  try{
    const metadata=`[[WAR_CONFIG:${JSON.stringify({mode,raidCount})}]]`;
    const {data:createdEvent,error:eventError}=await supabaseClient.from("war_events").insert({event_name:`4AM vs ${opponent}`,event_date:eventDate,start_time:startTime,description:metadata,status:"open",is_draft_confirmed:false,is_published:false}).select().single();
    if(eventError)throw eventError;
    const rows=[];["A","B","C","D"].slice(0,raidCount).forEach(raid=>{for(let n=1;n<=5;n++)rows.push({event_id:createdEvent.id,raid,party_number:n});});
    const {error:partyError}=await supabaseClient.from("war_parties").insert(rows);if(partyError)throw new Error("สร้างกิจกรรมแล้ว แต่สร้างช่องปาร์ตี้ไม่สำเร็จ: "+partyError.message);
    form.reset();updateWarCreateMode();$("war-create-panel")?.classList.add("hidden");await loadWarEvents();renderWarLayout(createdEvent.id);$("war-detail-stage")?.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(error){console.error("War event creation error:",error);setWarCreateMessage(error.message||"สร้างตี้วอร์ไม่สำเร็จ กรุณาลองอีกครั้ง",true);}
  finally{submit.disabled=false;submit.textContent="สร้างตี้วอร์";}
}
async function confirmWarDraft(){
  if(!isManagement())return;const event=allWarEvents.find(item=>item.id===selectedWarEventId);if(!event||event.is_published||event.is_draft_confirmed)return;
  const button=$("war-confirm-draft");if(button){button.disabled=true;button.textContent="กำลังยืนยัน...";}
  try{const {error}=await supabaseClient.from("war_events").update({is_draft_confirmed:true}).eq("id",event.id);if(error)throw error;await loadWarEvents();renderWarLayout(event.id);}
  catch(error){alert("ยืนยัน Draft ไม่สำเร็จ: "+error.message);}
  finally{if(button){button.disabled=false;button.textContent="ยืนยันการสร้างตี้วอร์";}}
}
async function deleteWarEvent(eventId,button){
  if(!isManagement())return;
  const event=allWarEvents.find(item=>item.id===eventId);
  if(!event)return;
  const confirmed=window.confirm(`ยืนยันลบวอร์ "${event.event_name}" (${getWarEventStage(event).toUpperCase()}) ใช่หรือไม่?\\n\\nการลบนี้จะลบรายการวอร์ ปาร์ตี้ และรายชื่อสมาชิกที่ผูกกับวอร์นี้ทั้งหมด ไม่สามารถกู้คืนได้`);
  if(!confirmed)return;
  if(button){button.disabled=true;button.textContent="กำลังลบ...";}
  try{
    const {error}=await supabaseClient.from("war_events").delete().eq("id",eventId).select("id").single();
    if(error)throw error;
    if(selectedWarEventId===eventId)selectedWarEventId=null;
    if(warAttendanceEventId===eventId)warAttendanceEventId=null;
    await loadWarEvents();
    if($("war-attendance-content"))await loadWarAttendance();
    if(selectedWarEventId)renderWarLayout(selectedWarEventId);
    else renderWarLayout();
  }catch(error){
    console.error("War event deletion failed:",error);
    alert("ลบวอร์ไม่สำเร็จ: "+(error.message||"เกิดข้อผิดพลาด"));
    if(button){button.disabled=false;button.textContent="ลบวอร์";}
  }
}
async function publishWarEvent(){
  if(!isManagement())return;const event=allWarEvents.find(item=>item.id===selectedWarEventId);if(!event||!event.is_draft_confirmed||event.is_published)return;
  const button=$("war-publish-event");if(button){button.disabled=true;button.textContent="กำลัง Publish...";}
  try{const {error}=await supabaseClient.from("war_events").update({is_published:true}).eq("id",event.id);if(error)throw error;selectedWarEventId=null;await loadWarEvents();renderWarLayout();}
  catch(error){alert("Publish วอร์ไม่สำเร็จ: "+error.message);}
  finally{if(button){button.disabled=false;button.textContent="Publish";}}
}
let thaiFontCssPromise = null;
// SVG ที่แปลงเป็นรูปใช้ฟอนต์ของหน้าเว็บไม่ได้ จึงต้องฝัง Noto Sans Thai (ไทย+ละติน, ปกติ/หนา) ลงในไฟล์ SVG เอง
function getThaiFontCss() {
  if (!thaiFontCssPromise) {
    thaiFontCssPromise = (async () => {
      const css = await (await fetch("https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;700&display=swap")).text();
      const faces = [...css.matchAll(/\/\*\s*(?:thai|latin)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)].map((match) => match[1]);
      const toDataUrl = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const embedded = await Promise.all(faces.map(async (face) => {
        const url = face.match(/url\(([^)]+)\)/)?.[1]?.replace(/['"]/g, "");
        if (!url) return "";
        const dataUrl = await toDataUrl(await (await fetch(url)).blob());
        return face.replace(/url\([^)]+\)(\s*format\([^)]*\))?/, () => `url(${dataUrl}) format("woff2")`);
      }));
      return embedded.join("\n");
    })().catch(() => {
      thaiFontCssPromise = null;
      return "";
    });
  }
  return thaiFontCssPromise;
}
async function exportWarImage(){
  const event=allWarEvents.find(item=>item.id===selectedWarEventId);if(!event||!event.is_draft_confirmed)return;
  const config=getWarEventConfig(event),width=1600,height=240+config.raidCount*510,esc=value=>escapeHTML(value);
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#100b0d"/><rect x="24" y="24" width="1552" height="${height-48}" rx="22" fill="#1b1114" stroke="#b88b48" stroke-width="3"/><text x="70" y="88" fill="#d6ad68" font-size="48" font-family="Noto Sans Thai" font-weight="700">4AM GUILD</text><text x="70" y="137" fill="#fff0df" font-size="30" font-family="Noto Sans Thai" font-weight="700">${esc(event.event_name)}</text><text x="70" y="178" fill="#c9b6a5" font-size="21" font-family="Noto Sans Thai">${esc(formatDate(event.event_date))} · ${esc(formatTime(event.start_time))}</text>`];
  let y=220;for(const raid of ["A","B","C","D"].slice(0,config.raidCount)){parts.push(`<text x="70" y="${y}" fill="#d6ad68" font-size="30" font-family="Noto Sans Thai" font-weight="700">RAID ${raid}</text>`);y+=18;for(let p=1;p<=5;p++){const party=currentWarParties.find(item=>item.raid===raid&&Number(item.party_number)===p),assigned=party?.war_party_members||[],x=70+(p-1)*300;parts.push(`<rect x="${x}" y="${y}" width="280" height="430" rx="12" fill="#25171b" stroke="#74552f" stroke-width="2"/><text x="${x+16}" y="${y+35}" fill="#e3bd7b" font-size="23" font-family="Noto Sans Thai" font-weight="700">${raid}${p} · ${assigned.length}/6</text>`);for(let slot=1;slot<=6;slot++){const assignment=assigned.find(item=>Number(item.position)===slot),member=allMembers.find(item=>item.user_id===assignment?.member_id);parts.push(`<text x="${x+16}" y="${y+88+(slot-1)*55}" fill="${member?"#fff0df":"#8d7a72"}" font-size="17" font-family="Noto Sans Thai">${slot}. ${esc(member?getMemberName(member):"Empty Slot")}</text><text x="${x+16}" y="${y+111+(slot-1)*55}" fill="#c9a76d" font-size="12" font-family="Noto Sans Thai">${esc(member?getMemberClass(member):"")}</text>`);}}y+=470;}
  parts.push("</svg>");const fontCss=await getThaiFontCss();if(fontCss)parts[0]=parts[0].replace(/^<svg[^>]*>/,tag=>tag+"<style>"+fontCss+"</style>");const svgUrl=URL.createObjectURL(new Blob([parts.join("")],{type:"image/svg+xml;charset=utf-8"}));
  try{const img=new Image();img.src=svgUrl;await img.decode();const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;canvas.getContext("2d").drawImage(img,0,0);const png=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));if(!png)throw Error("PNG export failed");const url=URL.createObjectURL(png),link=document.createElement("a");link.href=url;link.download=`4AM-War-${event.event_date}.png`;link.click();URL.revokeObjectURL(url);}catch(error){alert("บันทึกรูปไม่สำเร็จ: "+error.message);}finally{URL.revokeObjectURL(svgUrl);}
}
async function loadWarAttendance(){
  const container=$("war-attendance-content");if(!container)return;container.innerHTML='<p class="muted">กำลังโหลดวอร์ที่เผยแพร่แล้ว...</p>';
  const {data,error}=await supabaseClient.from("war_events").select("*").eq("is_published",true).order("event_date",{ascending:false});
  if(error){container.innerHTML=`<div class="system-role-error">โหลดข้อมูลไม่สำเร็จ: ${escapeHTML(error.message)}</div>`;return;}
  warAttendanceEvents=data||[];if(!warAttendanceEvents.length){showEmpty(container,"ยังไม่มีวอร์ที่เผยแพร่","เมื่อจัดตี้กิลด์วอร์เสร็จแล้ว รายชื่อปาร์ตี้วอร์จะแสดงที่หน้านี้");return;}
  warAttendanceEventId=warAttendanceEvents.find(item=>item.id===warAttendanceEventId)?.id||warAttendanceEvents[0].id;await renderWarAttendance();
}
async function renderWarAttendance(){
  const container=$("war-attendance-content");if(!container)return;const event=warAttendanceEvents.find(item=>item.id===warAttendanceEventId)||warAttendanceEvents[0];if(!event)return;
  const config=getWarEventConfig(event),{data:parties,error}=await supabaseClient.from("war_parties").select("id,event_id,raid,party_number,party_name,war_party_members(id,member_id,position)").eq("event_id",event.id).order("party_number",{ascending:true});
  if(error){container.innerHTML=`<div class="system-role-error">โหลดรายชื่อไม่สำเร็จ: ${escapeHTML(error.message)}</div>`;return;}
  container.innerHTML=`<div class="war-attendance-event-select"><label for="war-attendance-select">เลือกกิจกรรมวอร์</label><select id="war-attendance-select">${warAttendanceEvents.map(item=>`<option value="${escapeHTML(item.id)}" ${item.id===event.id?"selected":""}>${escapeHTML(item.event_name)} · ${formatDate(item.event_date)}</option>`).join("")}</select></div><div class="war-attendance-heading"><h3>${escapeHTML(event.event_name)}</h3><p>${formatDate(event.event_date)} · ${formatTime(event.start_time)}</p><span class="war-stage-badge war-stage-published">PUBLISHED</span></div><div class="war-attendance-boards">${["A","B","C","D"].slice(0,config.raidCount).map(raid=>`<section class="raid-section"><div class="raid-title"><span class="raid-badge">${raid}</span><div><h2>Raid ${raid}</h2><p>Published roster</p></div></div><div class="raid-grid">${Array.from({length:5},(_,index)=>{const party=parties?.find(item=>item.raid===raid&&Number(item.party_number)===index+1),assigned=party?.war_party_members||[];return `<article class="party-card"><div class="party-header"><h3>${raid}${index+1}</h3><span class="party-count">${assigned.length}/6</span></div><div class="party-slots">${Array.from({length:6},(_,slotIndex)=>{const position=slotIndex+1,assignment=assigned.find(item=>Number(item.position)===position),member=allMembers.find(item=>item.user_id===assignment?.member_id);if(!member)return `<div class="party-slot"><span class="slot-number">${position}</span><span class="slot-empty">Empty Slot</span></div>`;const info=getClassInfo(getMemberClass(member));return `<div class="party-slot party-slot-filled"><span class="slot-number">${position}</span><img class="war-slot-class-icon" src="${escapeHTML(info?.iconPath||"")}" alt=""><span class="slot-member-name">${escapeHTML(getMemberName(member))}</span></div>`;}).join("")}</div></article>`;}).join("")}</div></section>`).join("")}</div>`;
  $("war-attendance-select")?.addEventListener("change",async event=>{warAttendanceEventId=event.target.value;await renderWarAttendance();});
}

const WAR_RECORD_BUCKET="war-record-images";let warMatchRecords=[];let warAttendanceEditEventId=null;
function showWarRecordMessage(m,bad=false){const e=$("war-record-message");if(!e)return;e.textContent=m;e.classList.remove("hidden","error","success");e.classList.add(bad?"error":"success");}
async function loadWarMatchRecords(){if(!isManagement())return;const box=$("war-record-history");if(box)box.innerHTML='<p class="muted">กำลังโหลดประวัติผลวอร์...</p>';const q=await supabaseClient.from("war_match_records").select("*").eq("is_confirmed",true).order("war_date",{ascending:false}).order("created_at",{ascending:false});if(q.error){if(box)box.innerHTML='<div class="system-role-error">'+escapeHTML(q.error.message)+'<br>กรุณาติดตั้ง SQL ระบบบันทึกผลวอร์</div>';return;}warMatchRecords=q.data||[];await renderWarMatchRecords();}
async function renderWarMatchRecords(){
 const r=warMatchRecords||[],w=r.filter(x=>x.result==="win").length,l=r.filter(x=>x.result==="loss").length,n=w+l,p=x=>n?(x/n*100).toFixed(1):"0.0";
 $("war-record-total").textContent=n;$("war-record-wins").textContent=w;$("war-record-losses").textContent=l;$("war-record-win-rate").textContent=p(w)+"% Win Rate";$("war-record-loss-rate").textContent=p(l)+"% Loss Rate";$("war-record-opponent-count").textContent=new Set(r.map(x=>String(x.opponent_guild||"").trim().toLowerCase()).filter(Boolean)).size;
 const g={};r.forEach(x=>{const k=x.opponent_guild;if(!g[k])g[k]={w:0,l:0};g[k][x.result==="win"?"w":"l"]++;});
 const stats=$("war-record-opponent-stats");if(stats){const names=Object.keys(g).sort((a,b)=>a.localeCompare(b,"th"));stats.innerHTML=names.length?'<div class="war-record-table-wrap"><table class="war-record-table"><thead><tr><th>กิลด์</th><th>แข่ง</th><th>4AM ชนะ</th><th>4AM แพ้</th><th>ชนะ %</th><th>แพ้ %</th></tr></thead><tbody>'+names.map(k=>{const x=g[k],t=x.w+x.l;return "<tr><td>"+escapeHTML(k)+"</td><td>"+t+"</td><td>"+x.w+"</td><td>"+x.l+"</td><td>"+(x.w/t*100).toFixed(1)+"%</td><td>"+(x.l/t*100).toFixed(1)+"%</td></tr>";}).join("")+"</tbody></table></div>":'<div class="empty-state"><h3>ยังไม่มีผลวอร์</h3></div>';}
 const box=$("war-record-history");if(!box)return;if(!r.length){box.innerHTML='<div class="empty-state"><h3>ยังไม่มีประวัติผลวอร์</h3></div>';return;}
 const urls=await Promise.all(r.map(async x=>Promise.all((x.image_paths||[]).map(async path=>{const z=await supabaseClient.storage.from(WAR_RECORD_BUCKET).createSignedUrl(path,3600);return z.error?"":z.data.signedUrl;}))));
 box.innerHTML='<div class="war-record-table-wrap"><table class="war-record-table"><thead><tr><th>วันที่</th><th>คู่แข่ง</th><th>ผล</th><th>รูป</th><th>จัดการ</th></tr></thead><tbody>'+r.map((x,i)=>'<tr><td>'+formatDate(x.war_date)+'</td><td>'+escapeHTML(x.opponent_guild)+'</td><td><span class="war-record-result '+x.result+'">'+(x.result==="win"?"4AM ชนะ":"4AM แพ้")+'</span></td><td><div class="war-record-images">'+urls[i].filter(Boolean).map((u,j)=>'<a href="'+escapeHTML(u)+'" target="_blank" rel="noopener"><img src="'+escapeHTML(u)+'" alt="หลักฐาน '+(j+1)+'"></a>').join("")+'</div></td><td><div class="war-record-row-actions"><button class="btn btn-outline btn-sm" type="button" data-war-record-edit="'+escapeHTML(x.id)+'">แก้ไข</button><button class="btn btn-danger btn-sm" type="button" data-war-record-delete="'+escapeHTML(x.id)+'">ลบ</button></div></td></tr>').join("")+'</tbody></table></div>';
}
function resetWarRecordEditor(){ $("war-record-form")?.reset();$("war-record-edit-id").value="";$("war-record-existing-images").innerHTML="";$("war-record-images").required=true;$("war-record-submit").textContent="ยืนยันและบันทึกผลวอร์";$("war-record-cancel-edit")?.classList.add("hidden");$("war-record-message")?.classList.add("hidden");}
async function startEditWarMatchRecord(id){if(!isManagement())return;const x=warMatchRecords.find(r=>r.id===id);if(!x)return;$("war-record-edit-id").value=x.id;$("war-record-opponent").value=x.opponent_guild||"";$("war-record-date").value=x.war_date||"";$("war-record-result").value=x.result||"";$("war-record-images").value="";$("war-record-images").required=false;$("war-record-submit").textContent="บันทึกการแก้ไขผลวอร์";$("war-record-cancel-edit").classList.remove("hidden");const links=await Promise.all((x.image_paths||[]).map(async path=>{const q=await supabaseClient.storage.from(WAR_RECORD_BUCKET).createSignedUrl(path,3600);return q.error?"":'<a href="'+escapeHTML(q.data.signedUrl)+'" target="_blank" rel="noopener">ดูรูปเดิม</a>';}));$("war-record-existing-images").innerHTML=links.filter(Boolean).join(" · ")||"ไม่มีรูปเดิม";$("war-record-form").scrollIntoView({behavior:"smooth",block:"center"});}
async function deleteWarMatchRecord(id,button){if(!isManagement())return;const x=warMatchRecords.find(r=>r.id===id);if(!x||!confirm("ยืนยันลบผลวอร์และรูปหลักฐานทั้งหมดใช่หรือไม่?"))return;button.disabled=true;button.textContent="กำลังลบ...";const q=await supabaseClient.from("war_match_records").delete().eq("id",id).select("id").single();if(q.error){alert("ลบไม่สำเร็จ: "+q.error.message);button.disabled=false;button.textContent="ลบ";return;}if(x.image_paths?.length){const rm=await supabaseClient.storage.from(WAR_RECORD_BUCKET).remove(x.image_paths);if(rm.error)console.warn(rm.error);}await loadWarMatchRecords();}

async function saveWarMatchRecord(form){
 if(!isManagement())return;const editId=$("war-record-edit-id").value,old=editId?warMatchRecords.find(x=>x.id===editId):null,opponent=$("war-record-opponent").value.trim(),date=$("war-record-date").value,result=$("war-record-result").value,files=Array.from($("war-record-images").files||[]),btn=$("war-record-submit");
 if(!opponent||!date||!["win","loss"].includes(result)||(!editId&&!files.length)){showWarRecordMessage("กรุณากรอกข้อมูลและแนบรูปภาพให้ครบ",true);return;}if(files.length>10||files.some(f=>!f.type.startsWith("image/")||f.size>10485760)){showWarRecordMessage("แนบรูปได้สูงสุด 10 รูป และไม่เกิน 10 MB ต่อรูป",true);return;}if(editId&&!old){showWarRecordMessage("ไม่พบรายการที่ต้องการแก้ไข กรุณาโหลดหน้าใหม่",true);return;}
 btn.disabled=true;const newPaths=[];btn.textContent=editId?"กำลังบันทึกการแก้ไข...":"กำลังอัปโหลดและยืนยัน...";
 try{for(const file of files){const id=crypto.randomUUID?.()||String(Date.now())+Math.random().toString(16).slice(2),path=currentUser.id+"/"+id+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_"),up=await supabaseClient.storage.from(WAR_RECORD_BUCKET).upload(path,file,{upsert:false,contentType:file.type});if(up.error)throw up.error;newPaths.push(path);}
 const payload={opponent_guild:opponent,war_date:date,result,image_paths:editId?[...(old.image_paths||[]),...newPaths]:newPaths};
 const q=editId?await supabaseClient.from("war_match_records").update(payload).eq("id",editId).select("id").single():await supabaseClient.from("war_match_records").insert({...payload,is_confirmed:true,confirmed_by:currentUser.id,confirmed_at:new Date().toISOString(),created_by:currentUser.id});
 if(q.error)throw q.error;resetWarRecordEditor();showWarRecordMessage(editId?"แก้ไขผลวอร์เรียบร้อยแล้ว":"บันทึกผลวอร์เรียบร้อยแล้ว");await loadWarMatchRecords();
 }catch(e){if(newPaths.length)await supabaseClient.storage.from(WAR_RECORD_BUCKET).remove(newPaths);showWarRecordMessage("บันทึกไม่สำเร็จ: "+e.message,true);}finally{btn.disabled=false;btn.textContent=editId?"บันทึกการแก้ไขผลวอร์":"ยืนยันและบันทึกผลวอร์";}
}

async function loadWarAttendanceStatistics(){if(!isManagement())return;const s=$("war-attendance-stats-event"),ev=allWarEvents.filter(x=>x.is_published);if(s)s.innerHTML=ev.length?ev.map(x=>'<option value="'+escapeHTML(x.id)+'">'+escapeHTML(x.event_name)+" · "+formatDate(x.event_date)+"</option>").join(""):'<option value="">ยังไม่มีวอร์ที่ Publish</option>';warAttendanceEditEventId=ev[0]?.id||null;await loadWarAttendanceEditor();await loadWarAttendanceMemberSummary();}
async function loadWarAttendanceEditor(){const box=$("war-attendance-stats-editor"),btn=$("war-attendance-stats-save");if(!box||!isManagement())return;const id=$("war-attendance-stats-event")?.value||warAttendanceEditEventId;if(!id){box.innerHTML='<div class="empty-state"><h3>ยังไม่มีรอบวอร์ที่เผยแพร่</h3></div>';if(btn)btn.disabled=true;return;}warAttendanceEditEventId=id;const [m,a]=await Promise.all([supabaseClient.from("guild_members").select("user_id,character_name,nickname,active").eq("active",true).order("character_name"),supabaseClient.from("war_attendance_records").select("member_id,attendance_status").eq("war_event_id",id)]);if(m.error||a.error){box.innerHTML='<div class="system-role-error">'+escapeHTML((m.error||a.error).message)+'<br>กรุณาติดตั้ง SQL ระบบสถิติการเข้าร่วมวอร์</div>';if(btn)btn.disabled=true;return;}const old=new Map((a.data||[]).map(x=>[x.member_id,x.attendance_status])),members=m.data||[];box.innerHTML=members.length?'<div class="war-attendance-table-wrap"><table class="war-record-table war-attendance-member-table"><thead><tr><th>สมาชิก</th><th>สถานะ</th></tr></thead><tbody>'+members.map(x=>{const v=old.get(x.user_id)||"present";return '<tr><td>'+escapeHTML(getMemberName(x))+'</td><td><select data-attendance-member="'+escapeHTML(x.user_id)+'"><option value="present" '+(v==="present"?"selected":"")+' >มาตรงเวลา</option><option value="late" '+(v==="late"?"selected":"")+' >มาสาย</option><option value="leave" '+(v==="leave"?"selected":"")+' >ลา</option><option value="absent" '+(v==="absent"?"selected":"")+' >ขาด</option></select></td></tr>';}).join("")+"</tbody></table></div>":'<div class="empty-state"><h3>ไม่พบสมาชิก Active</h3></div>';if(btn)btn.disabled=!members.length;}
async function saveWarAttendanceStatistics(){if(!isManagement()||!warAttendanceEditEventId)return;const sels=Array.from($("war-attendance-stats-editor")?.querySelectorAll("[data-attendance-member]")||[]),btn=$("war-attendance-stats-save");if(!sels.length)return;btn.disabled=true;const rows=sels.map(x=>({war_event_id:warAttendanceEditEventId,member_id:x.dataset.attendanceMember,attendance_status:x.value,recorded_by:currentUser.id,updated_at:new Date().toISOString()}));try{const q=await supabaseClient.from("war_attendance_records").upsert(rows,{onConflict:"war_event_id,member_id"});if(q.error)throw q.error;await loadWarAttendanceMemberSummary();alert("บันทึกสถิติการเข้าร่วมวอร์เรียบร้อยแล้ว");}catch(e){alert("บันทึกไม่สำเร็จ: "+e.message);}finally{btn.disabled=false;btn.textContent="บันทึกสถานะการเข้าร่วม";}}
async function loadWarAttendanceMemberSummary(){
 const box=$("war-attendance-member-summary");if(!box||!isManagement())return;
 const q=await supabaseClient.from("war_attendance_records").select("member_id,attendance_status");
 if(q.error){box.textContent=q.error.message;return;}
 const map=new Map(),totals={present:0,late:0,leave:0,absent:0,total:0};
 (q.data||[]).forEach(x=>{
  if(!map.has(x.member_id))map.set(x.member_id,{present:0,late:0,leave:0,absent:0,total:0});
  const z=map.get(x.member_id);if(Object.prototype.hasOwnProperty.call(z,x.attendance_status)){z[x.attendance_status]++;totals[x.attendance_status]++;z.total++;totals.total++;}
 });
 const expected=totals.present+totals.late+totals.absent,attended=totals.present+totals.late,rate=expected?(attended/expected*100).toFixed(1):"0.0";
 const ms=allMembers.filter(x=>x.active===true).sort((a,b)=>getMemberName(a).localeCompare(getMemberName(b),"th"));
 box.innerHTML='<div class="attendance-overview-grid"><div><span>บันทึกสถานะทั้งหมด</span><strong>'+totals.total+'</strong></div><div><span>มาตรงเวลา</span><strong>'+totals.present+'</strong></div><div><span>มาสาย</span><strong>'+totals.late+'</strong></div><div><span>ขาด</span><strong>'+totals.absent+'</strong></div><div><span>ลา</span><strong>'+totals.leave+'</strong></div><div><span>อัตราเข้าร่วมจริง</span><strong>'+rate+'%</strong></div></div>'+
 (ms.length?'<div class="war-record-table-wrap"><table class="war-record-table"><thead><tr><th>สมาชิก</th><th>ตรงเวลา</th><th>สาย</th><th>ลา</th><th>ขาด</th><th>บันทึก</th><th>อัตราเข้าร่วม</th></tr></thead><tbody>'+ms.map(x=>{const z=map.get(x.user_id)||{present:0,late:0,leave:0,absent:0,total:0},e=z.present+z.late+z.absent,p=e?((z.present+z.late)/e*100).toFixed(1):"—";return "<tr><td>"+escapeHTML(getMemberName(x))+"</td><td>"+z.present+"</td><td>"+z.late+"</td><td>"+z.leave+"</td><td>"+z.absent+"</td><td>"+z.total+"</td><td>"+p+(p==="—"?"":"%")+"</td></tr>";}).join("")+"</tbody></table></div>":'<div class="empty-state">ยังไม่มีสมาชิก</div>');
}
function warSignupDateTime(value){
  if(!value)return "—";
  const date=new Date(value);if(Number.isNaN(date.getTime()))return "—";
  return formatDate(date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0"))+" "+String(date.getHours()).padStart(2,"0")+":"+String(date.getMinutes()).padStart(2,"0");
}
function warSignupEventState(event,now=Date.now()){
  const open=new Date(event.signup_opens_at).getTime(),close=new Date(event.signup_closes_at).getTime();
  if(!Number.isFinite(open)||!Number.isFinite(close))return "invalid";
  if(now<open)return "scheduled";
  if(now>=close)return "closed";
  return "open";
}
function warSignupClassSummary(rows,members=allMembers){
  const classes=new Map();
  (rows||[]).forEach(row=>{
    const member=(members||[]).find(item=>item.user_id===row.member_id);
    const name=getMemberClass(member||{});
    const key=name||"ไม่ระบุอาชีพ";
    if(!classes.has(key))classes.set(key,{name:key,total:0,primary:0,reserve:0});
    const item=classes.get(key);item.total++;
    if(Number(row.queue_position)<=60)item.primary++;else item.reserve++;
  });
  return [...classes.values()].sort((a,b)=>a.name.localeCompare(b.name,"th"));
}
function renderWarSignupSummary(rows,members=allMembers){
  const primary=(rows||[]).filter(row=>Number(row.queue_position)>=1&&Number(row.queue_position)<=60);
  const reserve=(rows||[]).filter(row=>Number(row.queue_position)>=61&&Number(row.queue_position)<=80);
  const summary=warSignupClassSummary(rows,members);
  return '<div class="war-signup-summary"><div class="war-signup-summary-head"><strong>REGISTRATION SUMMARY</strong><span>สรุปจำนวนสมาชิกแยกตามอาชีพ</span></div>'+
    '<div class="war-signup-summary-stats"><div><strong>'+rows.length+'</strong><span>ผู้ลงชื่อทั้งหมด</span></div><div><strong>'+primary.length+'</strong><span>ตัวจริง</span></div><div><strong>'+reserve.length+'</strong><span>ตัวสำรอง</span></div></div>'+
    '<div class="war-signup-class-summary">'+(summary.length?summary.map(item=>{
      const info=getClassInfo(item.name),icon=info?.iconPath?'<img src="'+escapeHTML(info.iconPath)+'" alt="">':"";
      return '<div class="war-signup-class-row">'+icon+'<strong>'+escapeHTML(item.name)+'</strong><span>'+item.total+' คน</span><small>ตัวจริง '+item.primary+' · สำรอง '+item.reserve+'</small></div>';
    }).join(""):'<p class="muted">ยังไม่มีผู้ลงชื่อ</p>')+'</div></div>';
}
async function loadWarSignups(){
  const box=$("war-signup-content");
  if(!box||!currentUser)return;
  if(!window.__warSignupRefreshTimer){window.__warSignupRefreshTimer=window.setInterval(()=>{if(!$("page-war-signup")?.classList.contains("hidden"))loadWarSignups();},30000);}
  $("war-signup-management")?.classList.toggle("hidden",!isManagement());
  $("war-signup-add")?.classList.toggle("hidden",!isManagement());
  box.innerHTML='<p class="muted">กำลังโหลดกิจกรรมวอร์...</p>';
  const {data:events,error}=await supabaseClient.from("war_events")
    .select("id,event_name,event_date,start_time,registration_type,signup_opens_at,signup_closes_at,description")
    .not("signup_opens_at","is",null).not("signup_closes_at","is",null)
    .order("signup_opens_at",{ascending:false});
  if(error){
    box.innerHTML='<div class="system-role-error">'+escapeHTML(error.message)+'<br>หากยังไม่ได้ติดตั้งระบบลงชื่อวอร์ V2 กรุณารัน SQL: 4AM_GUILD_WAR_REGISTRATION_V2</div>';
    return;
  }
  if(!events?.length){
    box.innerHTML='<div class="empty-state"><h3>ยังไม่มีกิจกรรมวอร์ที่เปิดให้ลงชื่อ</h3><p>รายการจะแสดงเมื่อมีการเปิด event ให้ลงชื่อ</p></div>';
    return;
  }
  const {data:signups,error:signupError}=await supabaseClient.from("war_signups")
    .select("id,event_id,member_id,raid,status,queue_position,created_at")
    .in("event_id",events.map(event=>event.id)).neq("status","cancelled")
    .order("queue_position",{ascending:true});
  if(signupError){box.innerHTML='<div class="system-role-error">'+escapeHTML(signupError.message)+'</div>';return;}
  const memberResult=await supabaseClient.from("guild_members")
    .select("user_id,character_name,nickname,discord_name,game_class,active")
    .eq("active",true).order("character_name");
  if(memberResult.error){box.innerHTML='<div class="system-role-error">'+escapeHTML(memberResult.error.message)+'</div>';return;}
  const rosterMembers=memberResult.data||[];
  const [leaveResults,attendanceResults]=await Promise.all([
    Promise.all(events.map(async event=>{
      const q=await supabaseClient.rpc("get_war_leave_roster",{p_event_id:event.id});
      return {eventId:event.id,rows:q.error?[]:(q.data||[]),error:q.error||null};
    })),
    Promise.all(events.map(async event=>{
      const q=await supabaseClient.rpc("get_war_attendance_roster",{p_event_id:event.id});
      return {eventId:event.id,rows:q.error?[]:(q.data||[]),error:q.error||null};
    }))
  ]);
  const leaveByEvent=new Map(leaveResults.map(x=>[x.eventId,x.rows]));
  const attendanceByEvent=new Map(attendanceResults.map(x=>[x.eventId,x.rows]));
  const leaveRpcUnavailable=leaveResults.some(x=>x.error);
  const attendanceRpcUnavailable=attendanceResults.some(x=>x.error);
  const allSignups=signups||[],now=Date.now();
  box.innerHTML=events.map(event=>{
    const rows=allSignups.filter(row=>row.event_id===event.id);
    const leaveRows=leaveByEvent.get(event.id)||[];
    const attendanceRows=attendanceByEvent.get(event.id)||[];
    const state=warSignupEventState(event,now);
    const own=rows.find(row=>row.member_id===currentUser.id);
    const stateLabel=state==="scheduled"?"รอเปิดรับสมัคร":state==="open"?"เปิดรับสมัคร":state==="closed"?"ปิดรับสมัคร":"ข้อมูลเวลาไม่ถูกต้อง";
    const stateClass=state==="open"?"is-open":state==="closed"?"is-closed":"is-scheduled";
    const typeLabel=event.registration_type==="practice"?"ซ้อมวอร์":"วอร์จริง";
    const capacity=rows.length+"/80";
    let action="";
    if(own){
      action='<div class="war-signup-own-status"><strong>คุณลงชื่อแล้ว · คิวที่ '+(own.queue_position||"—")+'</strong><span>'+(Number(own.queue_position)<=60?"ตัวจริง":"ตัวสำรอง")+'</span></div>';
    }else if(state==="open"&&rows.length<80){
      action='<button class="btn btn-primary btn-sm" type="button" data-war-signup-join="'+escapeHTML(event.id)+'">เข้าร่วมวอร์</button>';
    }else if(state==="open"&&rows.length>=80){
      action='<span class="war-signup-status">รายชื่อครบ 80 คนแล้ว</span>';
    }else if(state==="scheduled"){
      action='<span class="war-signup-status">ยังไม่ถึงเวลาเปิดลงชื่อ</span>';
    }else{
      action='<span class="war-signup-status">ปิดรับสมัครแล้ว</span>';
    }
    const rosterHtml=renderWarSignupRoster(rows,rosterMembers,leaveRows,attendanceRows);
    const summary=renderWarSignupSummary(rows,rosterMembers);
    const managementActions=isManagement()?'<div class="war-signup-management-actions"><button class="btn btn-outline btn-sm" type="button" data-war-signup-edit="'+escapeHTML(event.id)+'">แก้ไข Event</button><button class="btn btn-danger btn-sm" type="button" data-war-signup-delete="'+escapeHTML(event.id)+'">ลบ Event</button></div>':"";
    return '<article class="war-signup-card"><div class="war-signup-card-top"><div class="war-signup-card-heading"><h3>'+escapeHTML(event.event_name)+'</h3><p>'+formatDate(event.event_date)+' · เริ่มวอร์ '+formatTime(event.start_time)+'</p></div><div class="war-signup-badges"><span class="war-signup-state '+stateClass+'">'+stateLabel+'</span><span class="war-signup-type">'+typeLabel+'</span></div></div>'+managementActions+
      '<div class="war-signup-event-meta"><span>เริ่มลงชื่อ: '+warSignupDateTime(event.signup_opens_at)+'</span><span>ปิดรับ: '+warSignupDateTime(event.signup_closes_at)+'</span><span>ผู้ลงชื่อ: '+capacity+'</span></div>'+
      (event.description?'<p class="war-signup-description">'+escapeHTML(String(event.description).replace(/\[\[WAR_CONFIG:[\s\S]*?\]\]/,"").trim())+'</p>':"")+
      '<div class="war-signup-card-bottom"><div class="war-signup-action">'+action+'</div></div>'+rosterHtml+(leaveRpcUnavailable?'<p class="war-leave-roster-warning">ยังโหลดรายชื่อผู้แจ้งลาไม่ได้ กรุณาตรวจสอบ SQL ระบบแจ้งลาวอร์</p>':"")+(attendanceRpcUnavailable?'<p class="war-leave-roster-warning">ยังโหลดสถานะขาดวอร์ไม่ได้ กรุณาติดตั้ง SQL ระบบสรุปการเข้า war</p>':"")+summary+'</article>';
  }).join("");
}
function renderWarSignupRoster(signups,members,leaveRows,attendanceRows){
  const memberMap=new Map((members||[]).map(member=>[member.user_id,member]));
  const leaveMap=new Map((leaveRows||[]).map(row=>[row.member_id,row.status]));
  const primary=(signups||[]).filter(row=>Number(row.queue_position)>=1&&Number(row.queue_position)<=60).sort((a,b)=>Number(a.queue_position)-Number(b.queue_position));
  const reserve=(signups||[]).filter(row=>Number(row.queue_position)>=61&&Number(row.queue_position)<=80).sort((a,b)=>Number(a.queue_position)-Number(b.queue_position));
  const renderSignupList=(items,kind)=>{
    if(!items.length)return '<div class="war-roster-empty">ยังไม่มีรายชื่อ</div>';
    return '<div class="war-roster-list">'+items.map(row=>{
      const member=memberMap.get(row.member_id)||{};
      const className=getMemberClass(member),info=getClassInfo(className);
      const icon=info?.iconPath?'<img class="war-roster-class-icon" src="'+escapeHTML(info.iconPath)+'" alt="'+escapeHTML(className)+'" loading="lazy">':'<span class="war-roster-class-fallback">✦</span>';
      return '<div class="war-roster-row"><span class="war-roster-number">#'+Number(row.queue_position||0)+'</span>'+icon+'<strong>'+escapeHTML(getMemberName(member))+'</strong><span class="war-roster-row-note">'+kind+'</span></div>';
    }).join("")+'</div>';
  };
  const leaveList=(leaveRows||[]).map(row=>({row,member:memberMap.get(row.member_id)})).filter(x=>x.member);
  const leaveStatusLabel=status=>status==="approved"?"รับทราบแล้ว":status==="rejected"?"ไม่อนุมัติ":"รอตรวจสอบ";
  const leaveHtml=leaveList.length?'<div class="war-roster-name-list">'+leaveList.map(({row,member})=>'<div class="war-roster-name-row"><span class="war-roster-bullet">◆</span><strong>'+escapeHTML(getMemberName(member))+'</strong><small>'+leaveStatusLabel(row.status)+'</small></div>').join("")+'</div>':'<div class="war-roster-empty">ยังไม่มีสมาชิกแจ้งลาในระบบ</div>';
  const attendanceMap=new Map((attendanceRows||[]).map(row=>[row.member_id,row.attendance_status]));
  const absent=Array.from(attendanceMap.entries())
    .filter(([memberId,status])=>status==="absent"&&!leaveMap.has(memberId))
    .map(([memberId])=>memberMap.get(memberId)).filter(Boolean);
  const hasAttendanceRecords=(attendanceRows||[]).length>0;
  const absentHtml=absent.length?'<div class="war-roster-name-list">'+absent.map(member=>'<div class="war-roster-name-row"><span class="war-roster-bullet">◆</span><strong>'+escapeHTML(getMemberName(member))+'</strong></div>').join("")+'</div>':
    (hasAttendanceRecords?'<div class="war-roster-empty">ไม่มีสมาชิกถูกบันทึกว่าขาดวอร์</div>':'<div class="war-roster-empty">รอฝ่ายจัดการบันทึกผลเช็กชื่อหลังวอร์</div>');
  return '<section class="war-signup-roster-board"><div class="war-roster-section"><div class="war-roster-section-head"><h4>ตัวจริง</h4><span>'+primary.length+'/60</span></div>'+renderSignupList(primary,"ตัวจริง")+'</div>'+
    '<div class="war-roster-section is-reserve"><div class="war-roster-section-head"><h4>สำรอง</h4><span>'+reserve.length+'/20</span></div>'+renderSignupList(reserve,"ตัวสำรอง")+'</div>'+
    '<div class="war-roster-section is-leave"><div class="war-roster-section-head"><h4>ลาวอร์</h4><span>'+leaveList.length+' คน</span></div>'+leaveHtml+'</div>'+
    '<div class="war-roster-section is-absent"><div class="war-roster-section-head"><h4>ขาดวอร์</h4><span>'+absent.length+' คน</span></div>'+absentHtml+'</div></section>';
}

let warLeaveEvents=[];
let warLeaveRequests=[];
let warLeaveMembers=[];

function warLeaveStatusLabel(status){
  return status==="approved"?"รับทราบแล้ว":status==="rejected"?"ไม่อนุมัติ":"รอตรวจสอบ";
}
function renderWarLeaveOwnStatus(){
  const eventId=$("war-leave-event")?.value;
  const request=warLeaveRequests.find(row=>row.event_id===eventId&&row.member_id===currentUser?.id);
  const reason=$("war-leave-reason"),status=$("war-leave-own-status"),button=$("war-leave-submit");
  if(reason){reason.value=request?.reason||"";reason.disabled=request?.status==="approved";}
  if(status)status.innerHTML=request?'<strong>สถานะคำแจ้งลา: '+warLeaveStatusLabel(request.status)+'</strong><span> ส่งเมื่อ '+warSignupDateTime(request.created_at)+'</span>':"ยังไม่มีการแจ้งลาสำหรับรอบวอร์ที่เลือก";
  if(button){button.disabled=request?.status==="approved";button.textContent=request?.status==="approved"?"รับทราบคำแจ้งลาแล้ว":request?"อัปเดตคำแจ้งลา":"ยืนยันแจ้งลาวอร์";}
}
function renderWarLeaveLists(){
  const mine=$("war-leave-my-list"),management=$("war-leave-management-list");
  const myRows=warLeaveRequests.filter(row=>row.member_id===currentUser?.id);
  const eventName=id=>warLeaveEvents.find(event=>event.id===id);
  mine.innerHTML=myRows.length?'<div class="war-leave-history-list">'+myRows.map(row=>{
    const event=eventName(row.event_id);
    return '<article class="war-leave-history-row"><div><strong>'+escapeHTML(event?.event_name||"กิจกรรมวอร์")+'</strong><small>'+escapeHTML(event?formatDate(event.event_date):"")+' · '+escapeHTML(warLeaveStatusLabel(row.status))+'</small><p>'+escapeHTML(row.reason||"")+'</p></div><span class="war-leave-status '+escapeHTML(row.status)+'">'+warLeaveStatusLabel(row.status)+'</span></article>';
  }).join("")+'</div>':'<div class="war-roster-empty">ยังไม่มีประวัติการแจ้งลา</div>';
  if(!isManagement()){ $("war-leave-management")?.classList.add("hidden"); return; }
  $("war-leave-management")?.classList.remove("hidden");
  management.innerHTML=warLeaveRequests.length?'<div class="war-leave-management-list">'+warLeaveRequests.map(row=>{
    const member=warLeaveMembers.find(item=>item.user_id===row.member_id)||allMembers.find(item=>item.user_id===row.member_id)||{};
    const event=eventName(row.event_id);
    return '<article class="war-leave-review-row"><div class="war-leave-review-main"><strong>'+escapeHTML(getMemberName(member))+'</strong><span>'+escapeHTML(event?.event_name||"กิจกรรมวอร์")+' · '+escapeHTML(event?formatDate(event.event_date):"")+'</span><p>'+escapeHTML(row.reason||"ไม่ได้ระบุเหตุผล")+'</p></div><div class="war-leave-review-actions"><span class="war-leave-status '+escapeHTML(row.status)+'">'+warLeaveStatusLabel(row.status)+'</span>'+(row.status==="pending"?'<button class="btn btn-primary btn-sm" data-war-leave-review="'+escapeHTML(row.id)+'" data-status="approved" type="button">รับทราบ</button><button class="btn btn-outline btn-sm" data-war-leave-review="'+escapeHTML(row.id)+'" data-status="rejected" type="button">ไม่อนุมัติ</button>':"")+'<button class="btn btn-outline btn-sm" data-war-leave-edit="'+escapeHTML(row.id)+'" type="button">แก้ไข</button><button class="btn btn-danger btn-sm" data-war-leave-delete="'+escapeHTML(row.id)+'" type="button">ลบ</button></div></article>';
  }).join("")+'</div>':'<div class="war-roster-empty">ยังไม่มีสมาชิกแจ้งลาวอร์</div>';
}
async function loadWarLeavePage(){
  const select=$("war-leave-event"),mine=$("war-leave-my-list");
  if(!select||!currentUser)return;
  if(mine)mine.innerHTML='<p class="muted">กำลังโหลดข้อมูล...</p>';
  const [eventsQ,requestsQ,membersQ]=await Promise.all([
    supabaseClient.from("war_events").select("id,event_name,event_date,start_time,signup_opens_at,signup_closes_at").not("signup_opens_at","is",null).order("event_date",{ascending:true}),
    supabaseClient.from("war_leave_requests").select("id,event_id,member_id,reason,status,created_at").order("created_at",{ascending:false}),
    supabaseClient.from("guild_members").select("user_id,character_name,nickname,discord_name,game_class,active").eq("active",true)
  ]);
  if(eventsQ.error||requestsQ.error||membersQ.error){
    const error=eventsQ.error||requestsQ.error||membersQ.error;
    if(mine)mine.innerHTML='<div class="system-role-error">'+escapeHTML(error.message)+'<br>กรุณารัน SQL ระบบแจ้งลาวอร์ใน Supabase ก่อนใช้งาน</div>';
    select.innerHTML='<option value="">โหลดข้อมูลไม่สำเร็จ</option>';
    return;
  }
  warLeaveEvents=eventsQ.data||[];
  warLeaveRequests=requestsQ.data||[];
  warLeaveMembers=membersQ.data||[];
  const previous=select.value;
  const now=new Date(),today=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const selectable=warLeaveEvents.filter(event=>event.event_date>=today);
  select.innerHTML=selectable.length?selectable.map(event=>'<option value="'+escapeHTML(event.id)+'">'+escapeHTML(event.event_name)+' · '+formatDate(event.event_date)+'</option>').join(""):'<option value="">ยังไม่มีรอบวอร์ที่เปิดให้แจ้งลา</option>';
  if(previous&&selectable.some(event=>event.id===previous))select.value=previous;
  else if(selectable.length)select.value=selectable[0].id;
  select.disabled=!selectable.length;
  $("war-leave-form")?.querySelectorAll("textarea,button").forEach(el=>el.disabled=!selectable.length);
  renderWarLeaveOwnStatus();
  renderWarLeaveLists();
}
async function submitWarLeave(event){
  event.preventDefault();
  if(!currentUser)return;
  const eventId=$("war-leave-event")?.value,reason=$("war-leave-reason")?.value.trim(),button=$("war-leave-submit"),message=$("war-leave-message");
  if(!eventId||!reason){message.textContent="กรุณาเลือกรอบวอร์และระบุเหตุผล";message.className="message error";return;}
  button.disabled=true;button.textContent="กำลังส่งคำแจ้งลา...";
  try{
    const q=await supabaseClient.rpc("submit_war_leave",{p_event_id:eventId,p_reason:reason});
    if(q.error)throw q.error;
    message.textContent="ส่งคำแจ้งลาวอร์เรียบร้อยแล้ว";message.className="message success";
    await loadWarLeavePage();
  }catch(error){message.textContent=error.message||"ส่งคำแจ้งลาไม่สำเร็จ";message.className="message error";}
  finally{button.disabled=false;}
}
async function reviewWarLeave(id,status){
  if(!isManagement()||!id||!["approved","rejected"].includes(status))return;
  const q=await supabaseClient.from("war_leave_requests").update({status,reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()}).eq("id",id).select("id").single();
  if(q.error){alert("อัปเดตสถานะคำแจ้งลาไม่สำเร็จ: "+q.error.message);return;}await loadWarLeavePage();
}
async function editWarLeaveRequest(id){
  if(!isManagement())return;const row=warLeaveRequests.find(x=>x.id===id);if(!row)return;
  const reason=prompt("แก้ไขเหตุผลการแจ้งลา:",row.reason||"");if(reason===null)return;
  if(!reason.trim()){alert("กรุณาระบุเหตุผล");return;}
  const q=await supabaseClient.from("war_leave_requests").update({reason:reason.trim()}).eq("id",id).select("id").single();
  if(q.error){alert("แก้ไขคำแจ้งลาไม่สำเร็จ: "+q.error.message);return;}await loadWarLeavePage();
}
async function deleteWarLeaveRequest(id){
  if(!isManagement()||!confirm("ยืนยันลบคำแจ้งลานี้ใช่หรือไม่?"))return;
  const q=await supabaseClient.from("war_leave_requests").delete().eq("id",id).select("id").single();
  if(q.error){alert("ลบคำแจ้งลาไม่สำเร็จ: "+q.error.message);return;}await loadWarLeavePage();
}
function registerWarLeaveEvents(){
  $("war-leave-form")?.addEventListener("submit",submitWarLeave);
  $("war-leave-event")?.addEventListener("change",renderWarLeaveOwnStatus);
  $("war-leave-refresh")?.addEventListener("click",loadWarLeavePage);
  $("war-leave-management-list")?.addEventListener("click",event=>{
    const review=event.target.closest("[data-war-leave-review]"),edit=event.target.closest("[data-war-leave-edit]"),del=event.target.closest("[data-war-leave-delete]");
    if(review)reviewWarLeave(review.dataset.warLeaveReview,review.dataset.status);
    if(edit)editWarLeaveRequest(edit.dataset.warLeaveEdit);
    if(del)deleteWarLeaveRequest(del.dataset.warLeaveDelete);
  });
}

async function joinWarSignup(eventId,button){
  if(!currentUser||!eventId||!button)return;
  button.disabled=true;button.textContent="กำลังลงชื่อ...";
  try{
    const {data,error}=await supabaseClient.rpc("join_war_signup",{p_event_id:eventId});
    if(error)throw error;
    const result=Array.isArray(data)?data[0]:data;
    alert("ลงชื่อวอร์เรียบร้อยแล้ว · คิวที่ "+(result?.queue_position??"—")+(result?.signup_status==="standby"?" (ตัวสำรอง)":" (ตัวจริง)"));
    await loadWarSignups();
  }catch(error){
    console.error("War signup error:",error);
    alert(error.message||"ลงชื่อวอร์ไม่สำเร็จ");
    button.disabled=false;button.textContent="เข้าร่วมวอร์";
  }
}
function isDoubleOfficialSaturday(dateValue){
  if(!dateValue)return false;
  const date=new Date(dateValue+"T12:00:00");
  const anchor=new Date("2026-11-14T12:00:00");
  if(Number.isNaN(date.getTime())||date.getDay()!==6)return false;
  const weeks=Math.round((date-anchor)/(7*86400000));
  return weeks%2===0;
}
async function updateWarSignupTimeForDate(){
  const type=$("war-signup-type")?.value;
  const date=$("war-signup-event-date")?.value;
  const input=$("war-signup-start-time");
  const note=$("war-signup-time-note");
  if(!input)return;
  if(type==="practice"){
    input.readOnly=false;
    input.required=true;
    if(note)note.textContent="ซ้อมวอร์: Management กำหนดวันและเวลาเองได้ (24 ชั่วโมง)";
    return;
  }
  input.readOnly=true;
  input.required=true;
  if(!date){
    input.value="";
    if(note)note.textContent="วอร์จริงกำหนดเฉพาะวันเสาร์ตามตารางกิลด์";
    return;
  }
  const selectedDate=new Date(date+"T12:00:00");
  if(selectedDate.getDay()!==6){
    input.value="";
    if(note)note.textContent="วอร์จริงเลือกได้เฉพาะวันเสาร์ตามตารางที่กำหนด";
    return;
  }
  const double=isDoubleOfficialSaturday(date);
  input.value=double?"20:30":"20:00";
  if(note)note.textContent=double
    ?"วอร์จริง 2 รอบ · รอบแรก 20:00 น. / รอบสอง 20:30 น. · ลงชื่อเพียงครั้งเดียวเพื่อจัดตี้รอบสอง"
    :"วอร์จริง 1 รอบ · เวลา 20:00 น. · ลงชื่อเพียงครั้งเดียว";
}
function resetWarSignupForm(){
  $("war-signup-create-form")?.reset();$("war-signup-edit-id").value="";
  $("war-signup-create-confirm").textContent="ยืนยันสร้าง Event ลงชื่อวอร์";
  $("war-signup-create-form")?.classList.remove("is-editing");
}
async function startEditWarSignupEvent(id){
  if(!isManagement())return;
  const {data,error}=await supabaseClient.from("war_events").select("id,event_name,registration_type,event_date,start_time,signup_opens_at,signup_closes_at,description").eq("id",id).single();
  if(error){alert("โหลด Event ไม่สำเร็จ: "+error.message);return;}
  $("war-signup-edit-id").value=data.id;$("war-signup-event-name").value=data.event_name||"";
  $("war-signup-type").value=data.registration_type||"official";$("war-signup-event-date").value=String(data.event_date||"").slice(0,10);
  $("war-signup-start-time").value=formatTime(data.start_time)==="-"?"":formatTime(data.start_time);
  const toLocal=v=>{if(!v)return "";const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  $("war-signup-opens-at").value=toLocal(data.signup_opens_at);$("war-signup-closes-at").value=toLocal(data.signup_closes_at);
  $("war-signup-description").value=data.description||"";
  $("war-signup-create-confirm").textContent="บันทึกการแก้ไข Event";$("war-signup-create-form").classList.remove("hidden");$("war-signup-create-form").classList.add("is-editing");
  $("war-signup-start-time").readOnly=data.registration_type==="official";
  $("war-signup-create-form").scrollIntoView({behavior:"smooth",block:"center"});
}
async function deleteWarSignupEvent(id,button){
  if(!isManagement()||!confirm("ยืนยันลบ Event ลงชื่อวอร์นี้?"))return;
  button.disabled=true;button.textContent="กำลังลบ...";
  const q=await supabaseClient.from("war_events").delete().eq("id",id).select("id").maybeSingle();
  if(q.error||!q.data){alert("ลบ Event ไม่สำเร็จ: "+(q.error?.message||"ไม่พบ Event หรือไม่มีสิทธิ์"));button.disabled=false;button.textContent="ลบ Event";return;}
  await loadWarSignups();
}
async function createWarSignupEvent(form){
  if(!isManagement())return;
  const button=$("war-signup-create-confirm"),message=$("war-signup-create-message");
  const name=$("war-signup-event-name").value.trim(),type=$("war-signup-type").value,date=$("war-signup-event-date").value;
  const startTime=$("war-signup-start-time").value,opens=$("war-signup-opens-at").value,closes=$("war-signup-closes-at").value;
  const description=$("war-signup-description").value.trim(),editId=$("war-signup-edit-id").value;
  const openDate=new Date(opens),closeDate=new Date(closes),showError=t=>{message.textContent=t;message.className="message error";};
  if(!name||!date||!startTime||!opens||!closes){showError("กรุณากรอกข้อมูลที่จำเป็นให้ครบ");return;}
  if(type==="official"){
    const selectedDate=new Date(date+"T12:00:00");
    if(selectedDate.getDay()!==6){showError("วอร์จริงเลือกได้เฉพาะวันเสาร์ตามตารางกิลด์");return;}
    const double=isDoubleOfficialSaturday(date);
    const q=await supabaseClient.from("war_events").select("id").eq("event_date",date).eq("registration_type","official");
    if(q.error){showError(q.error.message);return;}
    const used=(q.data||[]).filter(x=>x.id!==editId).length;
    if(used>=1){showError("วันดังกล่าวมี Event ลงชื่อวอร์อยู่แล้ว ใช้ Event เดิมเพียงรายการเดียว");return;}
    const expected=double?"20:30":"20:00";
    if(startTime!==expected){
      showError(double
        ?"วันเสาร์ที่มีวอร์ 2 รอบ ต้องตั้งเวลา Event เป็น 20:30 น. (รอบสอง) โดยรายชื่อใช้ลงชื่อเพียงครั้งเดียว"
        :"วันเสาร์ที่มีวอร์ 1 รอบ ต้องตั้งเวลาเป็น 20:00 น.");
      return;
    }
  }
  if(Number.isNaN(openDate.getTime())||Number.isNaN(closeDate.getTime())||closeDate<=openDate){showError("เวลาปิดรับสมัครต้องอยู่หลังเวลาเริ่มลงชื่อ");return;}
  if(closeDate<=new Date()){showError("เวลาปิดรับสมัครต้องเป็นเวลาในอนาคต");return;}
  button.disabled=true;button.textContent=editId?"กำลังบันทึกการแก้ไข...":"กำลังสร้าง Event...";
  try{
    let result;
    if(editId)result=await supabaseClient.from("war_events").update({event_name:name,registration_type:type,event_date:date,start_time:startTime,signup_opens_at:openDate.toISOString(),signup_closes_at:closeDate.toISOString(),description:description||null}).eq("id",editId).select("id").single();
    else result=await supabaseClient.rpc("create_war_signup_event",{p_event_name:name,p_registration_type:type,p_event_date:date,p_start_time:startTime,p_signup_opens_at:openDate.toISOString(),p_signup_closes_at:closeDate.toISOString(),p_description:description||null});
    if(result.error)throw result.error;
    resetWarSignupForm();form.classList.add("hidden");message.classList.add("hidden");
    alert(editId?"แก้ไข Event เรียบร้อยแล้ว":"ยืนยันสร้าง Event ลงชื่อวอร์เรียบร้อยแล้ว");
    await loadWarSignups();
  }catch(error){console.error("Save war signup event:",error);showError(error.message||"บันทึก Event ไม่สำเร็จ");}
  finally{button.disabled=false;button.textContent=$("war-signup-edit-id").value?"บันทึกการแก้ไข Event":"ยืนยันสร้าง Event ลงชื่อวอร์";}
}

function registerWarRecordAndAttendanceEvents(){
  $("war-signup-refresh")?.addEventListener("click",loadWarSignups);
  $("war-signup-add")?.addEventListener("click",()=>{if(isManagement()){resetWarSignupForm();$("war-signup-create-form")?.classList.toggle("hidden");}});
  $("war-signup-create-cancel")?.addEventListener("click",()=>{resetWarSignupForm();$("war-signup-create-form")?.classList.add("hidden");});
  $("war-signup-event-date")?.addEventListener("change",updateWarSignupTimeForDate);
  $("war-signup-type")?.addEventListener("change",updateWarSignupTimeForDate);
  $("war-signup-create-form")?.addEventListener("submit",async e=>{e.preventDefault();await createWarSignupEvent(e.currentTarget);});
  $("war-signup-content")?.addEventListener("click",e=>{
    const join=e.target.closest("[data-war-signup-join]"),edit=e.target.closest("[data-war-signup-edit]"),del=e.target.closest("[data-war-signup-delete]");
    if(join)joinWarSignup(join.dataset.warSignupJoin,join);
    if(edit)startEditWarSignupEvent(edit.dataset.warSignupEdit);
    if(del)deleteWarSignupEvent(del.dataset.warSignupDelete,del);
  });
  $("war-record-cancel-edit")?.addEventListener("click",resetWarRecordEditor);
  $("war-record-history")?.addEventListener("click",e=>{const ed=e.target.closest("[data-war-record-edit]"),del=e.target.closest("[data-war-record-delete]");if(ed)startEditWarMatchRecord(ed.dataset.warRecordEdit);if(del)deleteWarMatchRecord(del.dataset.warRecordDelete,del);});
  $("war-record-form")?.addEventListener("submit",async e=>{e.preventDefault();await saveWarMatchRecord(e.currentTarget);});
  $("war-attendance-stats-load")?.addEventListener("click",loadWarAttendanceEditor);$("war-attendance-stats-event")?.addEventListener("change",loadWarAttendanceEditor);$("war-attendance-stats-save")?.addEventListener("click",saveWarAttendanceStatistics);
}
function subscribeToWarRealtime() {
  if (warRealtimeChannel) {
    supabaseClient.removeChannel(warRealtimeChannel);
    warRealtimeChannel = null;
  }

  warRealtimeChannel = supabaseClient
    .channel("guild-war-live-updates")
    .on("postgres_changes", { event: "*", schema: "public", table: "war_events" }, () => loadWarEvents())
    .on("postgres_changes", { event: "*", schema: "public", table: "war_parties" }, async () => {
      const eventId = currentWarAssignmentEventId || selectedWarEventId;
      if (eventId) await loadSelectedWarEvent(eventId);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "war_party_members" }, async () => {
      const eventId = currentWarAssignmentEventId || selectedWarEventId;
      if (eventId) await loadSelectedWarEvent(eventId);
    })
    .subscribe();
}

function registerWarCreationEvents(){
  $("war-raid-boards")?.addEventListener("change",handleWarSlotChange);
  $("war-raid-boards")?.addEventListener("click",event=>{const button=event.target.closest("[data-war-remove]");if(button)removeWarPartyMember(button.dataset.warRemove,button);});
  $("war-events")?.addEventListener("click",event=>{
    const deleteButton=event.target.closest("[data-war-delete]");
    if(deleteButton){deleteWarEvent(deleteButton.dataset.warDelete,deleteButton);return;}
    const button=event.target.closest("[data-war-open]");
    if(!button||!isManagement())return;
    renderWarLayout(button.dataset.warOpen);
    $("war-detail-stage")?.scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("war-create-open")?.addEventListener("click",()=>{if(!isManagement())return;selectedWarEventId=null;$("war-detail-stage")?.classList.add("hidden");$("war-create-panel")?.classList.remove("hidden");$("war-create-message")?.classList.add("hidden");$("war-create-panel")?.scrollIntoView({behavior:"smooth",block:"start"});});
  ["war-create-close","war-create-cancel"].forEach(id=>$(id)?.addEventListener("click",()=>$("war-create-panel")?.classList.add("hidden")));
  $("war-back-to-list")?.addEventListener("click",()=>{$("war-detail-stage")?.classList.add("hidden");$("war-events")?.scrollIntoView({behavior:"smooth",block:"start"});});
  $("war-confirm-draft")?.addEventListener("click",confirmWarDraft);$("war-publish-event")?.addEventListener("click",publishWarEvent);$("war-export-image")?.addEventListener("click",exportWarImage);$("war-sync-discord")?.addEventListener("click",()=>alert("Discord Bot Sync ยังไม่เปิดใช้งานในขณะนี้"));
  document.querySelectorAll('input[name="war-mode"]').forEach(input=>input.addEventListener("change",updateWarCreateMode));$("war-raid-count")?.addEventListener("change",updateWarCreateMode);$("war-create-form")?.addEventListener("submit",handleWarCreate);
  const dateInput=$("war-event-date");if(dateInput){const now=new Date(),today=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);dateInput.min=today;}updateWarCreateMode();
}

// ==========================================
// CLASS LEGEND
// ==========================================

function renderClassLegend() {
  const container = $("class-legend");
  if (!container) return;

  container.innerHTML = `
    <button type="button" class="class-item class-filter-all ${portfolioClassFilter === "all" ? "is-active" : ""}" data-portfolio-class-filter="all" aria-pressed="${portfolioClassFilter === "all"}"><strong>All Classes</strong></button>
    ${CLASS_DATA.map((item) => `
      <button type="button" class="class-item ${portfolioClassFilter === item.name ? "is-active" : ""}" data-portfolio-class-filter="${escapeHTML(item.name)}" style="--class-color:${item.color}" aria-pressed="${portfolioClassFilter === item.name}">
        <img class="class-icon-image" src="${escapeHTML(item.iconPath)}" alt="" loading="lazy">
        <strong>${escapeHTML(item.name)}</strong>
      </button>
    `).join("")}
  `;
}

// ==========================================
// DEVELOPER — SYSTEM ROLE MANAGEMENT
// ==========================================

const SYSTEM_ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "management", label: "Management" },
  { value: "leader", label: "Leader" }
];

let systemRoleMembers = [];
let systemRoleFilter = "all";

function systemRoleLabel(role) {
  const labels = {
    developer: "4AM Dev",
    leader: "Leader",
    management: "Management",
    admin: "Admin (Legacy)",
    member: "Member"
  };
  return labels[String(role || "member").toLowerCase()] || "Member";
}

function renderSystemRoleSummary(members) {
  const counts = {
    total: members.length,
    management: members.filter(m => ["management", "admin"].includes(String(m.role || "").toLowerCase())).length,
    leaders: members.filter(m => String(m.role || "").toLowerCase() === "leader").length,
    pending: members.filter(m => m.active === false).length
  };

  const set = (id, value) => {
    const element = $(id);
    if (element) element.textContent = String(value);
  };
  set("system-role-total", counts.total);
  set("system-role-management", counts.management);
  set("system-role-leaders", counts.leaders);
  set("system-role-pending", counts.pending);
}

function getFilteredSystemRoleMembers() {
  const query = String($("system-role-search")?.value || "").trim().toLowerCase();
  return systemRoleMembers.filter(member => {
    const role = String(member.role || "member").toLowerCase();
    const matchesRole = systemRoleFilter === "all"
      || (systemRoleFilter === "management" && ["management", "admin"].includes(role))
      || role === systemRoleFilter;
    const searchable = [
      getMemberName(member),
      member.character_name,
      member.nickname,
      member.user_id,
      member.game_uid
    ].join(" ").toLowerCase();
    return matchesRole && (!query || searchable.includes(query));
  });
}

function renderSystemRoleMembers() {
  const container = $("system-role-list");
  if (!container) return;

  const members = getFilteredSystemRoleMembers();
  renderSystemRoleSummary(systemRoleMembers);

  if (!members.length) {
    container.innerHTML = '<div class="system-role-empty">ไม่พบสมาชิกที่ตรงกับการค้นหา</div>';
    return;
  }

  container.innerHTML = members.map(member => {
    const role = String(member.role || "member").toLowerCase();
    const isProtected = role === "developer";
    const isSelf = member.user_id === currentUser?.id;
    const locked = isProtected || isSelf;
    const options = SYSTEM_ROLE_OPTIONS.map(option => `
      <option value="${option.value}" ${role === option.value ? "selected" : ""}>
        ${option.label}
      </option>
    `).join("");
    const legacyRoleOption = role === "admin"
      ? '<option value="" selected disabled>Admin (Legacy) — เลือก Role ใหม่</option>'
      : "";
    const status = member.active === false ? "รอตรวจสอบ / ไม่ Active" : "Active";
    const createdAt = member.created_at ? formatDate(member.created_at) : "ไม่ระบุวันที่";

    return `
      <article class="system-role-row" data-system-role-user="${escapeHTML(member.user_id)}">
        <div class="system-role-person">
          <strong>${escapeHTML(getMemberName(member))}</strong>
          <span>${escapeHTML(member.user_id || "-")}</span>
          <small>${escapeHTML(status)} · สมัครเมื่อ ${escapeHTML(createdAt)}</small>
        </div>
        <div class="system-role-current">
          <span class="system-role-caption">CURRENT ROLE</span>
          <strong class="system-role-badge role-${escapeHTML(role)}">${escapeHTML(systemRoleLabel(role))}</strong>
        </div>
        <div class="system-role-action">
          <label for="system-role-select-${escapeHTML(member.user_id)}">เปลี่ยน System Role</label>
          <select
            id="system-role-select-${escapeHTML(member.user_id)}"
            data-action="change-system-role"
            data-user-id="${escapeHTML(member.user_id)}"
            data-original-role="${escapeHTML(role)}"
            ${locked ? "disabled" : ""}
            aria-label="เปลี่ยน System Role ของ ${escapeHTML(getMemberName(member))}"
          >
            ${isProtected ? '<option selected>Developer (Protected)</option>' : legacyRoleOption + options}
          </select>
          <small class="system-role-status" aria-live="polite">${isProtected ? "บัญชี Developer ถูกป้องกัน" : (isSelf ? "ไม่สามารถเปลี่ยน Role ของบัญชีตัวเอง" : "")}</small>
        </div>
      </article>
    `;
  }).join("");

  // Bind directly to each freshly rendered dropdown. This avoids relying on
  // document-level delegation for controls inside the re-rendered list.
  container.querySelectorAll('select[data-action="change-system-role"]').forEach(select => {
    select.addEventListener("change", () => {
      void saveSystemRole(select);
    });
  });
}

async function loadSystemRoleMembers() {
  if (!isDeveloper()) {
    alert("หน้านี้อนุญาตเฉพาะ Developer");
    openGuildPage("dashboard");
    return;
  }

  const container = $("system-role-list");
  if (container) container.innerHTML = '<p class="muted">กำลังโหลดข้อมูลสมาชิก...</p>';

  const { data, error } = await supabaseClient
    .from("guild_members")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("System role member loading error:", error);
    if (container) {
      container.innerHTML = `<div class="system-role-error">โหลดข้อมูลไม่สำเร็จ: ${escapeHTML(error.message)}</div>`;
    }
    return;
  }

  systemRoleMembers = data || [];
  renderSystemRoleMembers();
}

async function saveSystemRole(selectElement) {
  if (!isDeveloper()) {
    alert("เฉพาะ Developer เท่านั้นที่เปลี่ยน System Role ได้");
    return;
  }

  const userId = selectElement?.dataset.userId;
  const newRole = selectElement?.value;
  const member = systemRoleMembers.find(item => item.user_id === userId);
  const status = selectElement?.parentElement?.querySelector(".system-role-status");

  if (!userId || !member || !SYSTEM_ROLE_OPTIONS.some(option => option.value === newRole)) {
    if (status) status.textContent = "ข้อมูล Role ไม่ถูกต้อง";
    return;
  }
  if (member.user_id === currentUser?.id || String(member.role || "").toLowerCase() === "developer") {
    selectElement.value = selectElement.dataset.originalRole || member.role;
    if (status) status.textContent = "บัญชีนี้ถูกป้องกันไม่ให้เปลี่ยน Role";
    return;
  }

  const previousRole = String(member.role || "member").toLowerCase();
  if (newRole === previousRole) return;

  // Save immediately after the dropdown changes; do not depend on a
  // browser confirmation dialog that may be suppressed.
  selectElement.disabled = true;
  if (status) {
    status.classList.remove("is-success");
    status.textContent = `กำลังเปลี่ยนเป็น ${systemRoleLabel(newRole)}...`;
  }

  try {
    const { data, error } = await supabaseClient.rpc("set_member_system_role", {
      target_user_id: userId,
      new_role: newRole
    });
    if (error) throw error;
    if (!data || data.success !== true) throw new Error(data?.message || "ระบบไม่ได้ยืนยันการเปลี่ยน Role");

    member.role = newRole;
    selectElement.dataset.originalRole = newRole;
    if (status) {
      status.textContent = "บันทึกสำเร็จ";
      status.classList.add("is-success");
    }
    renderSystemRoleMembers();
  } catch (error) {
    console.error("System role update error:", error);
    selectElement.value = previousRole;
    selectElement.disabled = false;
    if (status) {
      status.textContent = error.message || "บันทึกไม่สำเร็จ";
      status.classList.remove("is-success");
    }
  }
}

function registerSystemRoleEvents() {
  $("system-role-search")?.addEventListener("input", renderSystemRoleMembers);
  $("system-role-filter")?.addEventListener("change", event => {
    systemRoleFilter = event.target.value;
    renderSystemRoleMembers();
  });
  $("system-role-refresh")?.addEventListener("click", loadSystemRoleMembers);
  // System Role dropdowns receive direct listeners after each list render.
}


let activeGuildRichEditor=null,savedGuildRichRange=null;
function rememberGuildRichSelection(editor){if(editor)activeGuildRichEditor=editor;const s=window.getSelection();if(activeGuildRichEditor&&s&&s.rangeCount&&activeGuildRichEditor.contains(s.anchorNode))savedGuildRichRange=s.getRangeAt(0).cloneRange();}
function restoreGuildRichSelection(){if(!activeGuildRichEditor)return false;activeGuildRichEditor.focus();const s=window.getSelection();if(s&&savedGuildRichRange){s.removeAllRanges();s.addRange(savedGuildRichRange);}return true;}
function addGuildRichToolbarControls(){
 document.querySelectorAll('[contenteditable="true"]').forEach(editor=>{
  if(editor.dataset.richSelectionReady==="true")return;
  editor.dataset.richSelectionReady="true";
  editor.addEventListener("focus",()=>rememberGuildRichSelection(editor));
  editor.addEventListener("keyup",()=>rememberGuildRichSelection(editor));
  editor.addEventListener("mouseup",()=>rememberGuildRichSelection(editor));
 });
}
function initializeGuildRichTextEnhancements(){
 addGuildRichToolbarControls();
 document.addEventListener("mousedown",event=>{if(event.target.closest(".rule-editor-toolbar button"))event.preventDefault();});
 document.addEventListener("selectionchange",()=>{
  const editor=document.activeElement?.closest?.('[contenteditable="true"]');
  if(editor)rememberGuildRichSelection(editor);
 });
}


// GUILD ACTIVITIES
const GUILD_ACTIVITY_BUCKET="guild-activity-images";
let guildActivitiesCache=[];
function sanitizeGuildActivityHTML(html){
 const parsed=new DOMParser().parseFromString(String(html||""),"text/html");
 const allowed=new Set(["P","DIV","BR","STRONG","B","EM","I","U","UL","OL","LI","H2","H3","H4","BLOCKQUOTE","SPAN","IMG","S","STRIKE","TABLE","TBODY","TR","TD","TH","HR"]);
 const prefix=SUPABASE_URL+"/storage/v1/object/public/"+GUILD_ACTIVITY_BUCKET+"/";
 const clean=node=>{
  if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent||"");
  if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
  const tag=node.tagName;
  if(!allowed.has(tag)){const f=document.createDocumentFragment();[...node.childNodes].forEach(n=>f.appendChild(clean(n)));return f;}
  const el=parsed.createElement(tag.toLowerCase());
  if(tag==="IMG"){const src=node.getAttribute("src")||"";if(!src.startsWith(prefix))return document.createTextNode("");el.src=src;el.alt=(node.alt||"Guild activity image").slice(0,120);el.loading="lazy";el.className="guild-activity-image";return el;}
  if(["DIV","P","SPAN","TD","TH"].includes(tag)){const st=node.style||{};if(["left","center","right","justify"].includes(st.textAlign))el.style.textAlign=st.textAlign;if(/^\\d{1,2}px$/.test(st.fontSize||"")&&parseInt(st.fontSize)<=72)el.style.fontSize=st.fontSize;if(/^(Arial|Tahoma|Georgia|Verdana|monospace)$/i.test(st.fontFamily||""))el.style.fontFamily=st.fontFamily;if(/^#[0-9a-f]{6}$/i.test(st.color||""))el.style.color=st.color;if(/^#[0-9a-f]{6}$/i.test(st.backgroundColor||""))el.style.backgroundColor=st.backgroundColor;}if(tag==="TABLE")el.className="guild-rich-table";
  [...node.childNodes].forEach(n=>el.appendChild(clean(n)));return el;
 };
 const out=parsed.createElement("div");[...parsed.body.childNodes].forEach(n=>out.appendChild(clean(n)));return out.innerHTML;
}
function activityDateLabel(value){
 if(!value)return "";
 const date=new Date(value);if(Number.isNaN(date.getTime()))return "";
 return formatDate(date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0"))+" "+String(date.getHours()).padStart(2,"0")+":"+String(date.getMinutes()).padStart(2,"0");
}
function renderGuildActivities(){
 const list=$("guild-activities-list");if(!list)return;
 if(!guildActivitiesCache.length){
  list.innerHTML='<div class="empty-state"><span>◷</span><h3>ยังไม่มีกิจกรรม</h3><p>'+(isManagement()?'กด “เพิ่มกิจกรรม” เพื่อสร้างข่าวสารหรือกิจกรรมแรกของกิลด์':'ขณะนี้ยังไม่มีข่าวสารหรือกิจกรรมที่เผยแพร่')+'</p></div>';
  return;
 }
 list.innerHTML=guildActivitiesCache.map(item=>{
  const id=escapeHTML(item.id),title=escapeHTML(item.title||"กิจกรรมกิลด์"),date=escapeHTML(activityDateLabel(item.updated_at||item.created_at));
  const actions=isManagement()?'<div class="activity-card-actions"><button type="button" class="btn btn-outline btn-sm" data-activity-edit="'+id+'"><svg class="icon"><use href="#i-edit"/></svg> แก้ไข</button><button type="button" class="btn btn-danger btn-sm" data-activity-delete="'+id+'">ลบ</button></div>':"";
  return '<article class="activity-card" data-activity-card="'+id+'"><header class="activity-card-header"><div class="activity-card-title-wrap"><span class="panel-kicker">4AM GUILD · COMMUNITY</span><h3>'+title+'</h3><time>'+date+'</time></div>'+actions+'</header><div class="activity-card-content">'+sanitizeGuildActivityHTML(item.content_html||"")+'</div></article>';
 }).join("");
}
async function loadGuildActivities(){
 const list=$("guild-activities-list");if(list)list.innerHTML='<div class="empty-state"><span>◷</span><h3>กำลังโหลดกิจกรรม</h3><p>กรุณารอสักครู่</p></div>';
 const {data,error}=await supabaseClient.from("guild_activities").select("id,title,content_html,created_by,updated_by,created_at,updated_at").order("created_at",{ascending:false});
 if(error){console.error("Load guild activities:",error);if(list)list.innerHTML='<div class="empty-state"><span>!</span><h3>โหลดกิจกรรมไม่สำเร็จ</h3><p>'+escapeHTML(error.message)+'</p></div>';return;}
 guildActivitiesCache=data||[];renderGuildActivities();
}
function openGuildActivityEditor(id=null){
 if(!isManagement())return;
 const panel=$("activity-editor"),title=$("activity-title-input"),body=$("activity-editor-body"),msg=$("activity-editor-message");
 if(!panel||!title||!body)return;
 const item=id?guildActivitiesCache.find(row=>row.id===id):null;
 if(id&&!item)return;
 panel.dataset.editingId=item?.id||"";
 $("activity-editor-title").textContent=item?"แก้ไขกิจกรรม":"สร้างกิจกรรมใหม่";
 title.value=item?.title||"";body.innerHTML=sanitizeGuildActivityHTML(item?.content_html||"");
 if(msg){msg.textContent="";msg.className="message";}
 $("activity-save-button").textContent=item?"บันทึกการแก้ไข":"บันทึกกิจกรรม";
 panel.classList.remove("hidden");$("activity-add-button")?.classList.add("hidden");
 title.focus();
}
async function uploadGuildActivityImage(file){
 if(!isManagement())throw new Error("ไม่มีสิทธิ์อัปโหลดรูป");
 if(!file||!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw new Error("รองรับ PNG, JPG, WEBP และ GIF");
 if(file.size>8*1024*1024)throw new Error("รูปต้องมีขนาดไม่เกิน 8 MB");
 const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"}[file.type];
 const path=currentUser.id+"/activities/"+crypto.randomUUID()+"."+ext;
 const {error}=await supabaseClient.storage.from(GUILD_ACTIVITY_BUCKET).upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
 if(error)throw error;
 return supabaseClient.storage.from(GUILD_ACTIVITY_BUCKET).getPublicUrl(path).data.publicUrl;
}
function closeGuildActivityEditor(){
 $("activity-editor")?.classList.add("hidden");$("activity-editor")?.removeAttribute("data-editing-id");
 $("activity-title-input").value="";$("activity-editor-body").innerHTML="";
 $("activity-add-button")?.classList.toggle("hidden",!isManagement());
}
function registerGuildActivityEvents(){
 const page=$("page-activities");if(!page||page.dataset.eventsReady==="true")return;page.dataset.eventsReady="true";
 page.addEventListener("click",async event=>{
  const add=event.target.closest("#activity-add-button"),edit=event.target.closest("[data-activity-edit]"),del=event.target.closest("[data-activity-delete]"),cmd=event.target.closest("[data-activity-command]"),emoji=event.target.closest("[data-activity-emoji]"),image=event.target.closest("[data-activity-image]");
  if(add){openGuildActivityEditor();return;}
  if(edit){if(!isManagement())return;openGuildActivityEditor(edit.dataset.activityEdit);return;}
  if(del){
   if(!isManagement())return;
   const id=del.dataset.activityDelete,item=guildActivitiesCache.find(row=>row.id===id);if(!item)return;
   if(!window.confirm('ต้องการลบกิจกรรม “'+item.title+'” ใช่หรือไม่?'))return;
   del.disabled=true;
   try{const {error}=await supabaseClient.from("guild_activities").delete().eq("id",id);if(error)throw error;guildActivitiesCache=guildActivitiesCache.filter(row=>row.id!==id);renderGuildActivities();}
   catch(error){console.error("Delete guild activity:",error);alert("ลบกิจกรรมไม่สำเร็จ: "+error.message);del.disabled=false;}
   return;
  }
  if(cmd){if(!isManagement())return;const body=$("activity-editor-body");body?.focus();document.execCommand(cmd.dataset.activityCommand,false,null);return;}
  if(emoji){if(!isManagement())return;const value=window.prompt("พิมพ์หรือวางอีโมจิ","✨");if(value){$("activity-editor-body")?.focus();document.execCommand("insertText",false,value);}return;}
  if(image){if(isManagement())$("activity-image-input")?.click();return;}
  if(event.target.closest("#activity-cancel-button")){if(isManagement())closeGuildActivityEditor();return;}
  if(event.target.closest("#activity-save-button")){
   if(!isManagement())return;
   const save=$("activity-save-button"),title=$("activity-title-input").value.trim(),body=$("activity-editor-body"),msg=$("activity-editor-message"),panel=$("activity-editor"),id=panel.dataset.editingId||"";
   if(!title){msg.textContent="กรุณาระบุหัวข้อกิจกรรม";msg.className="message error";$("activity-title-input").focus();return;}
   const content=sanitizeGuildActivityHTML(body.innerHTML);
   if(!content.trim()){msg.textContent="กรุณากรอกรายละเอียดกิจกรรม";msg.className="message error";body.focus();return;}
   save.disabled=true;save.textContent="กำลังบันทึก...";
   try{
    const payload={title,content_html:content,updated_by:currentUser.id,updated_at:new Date().toISOString()};
    let result;
    if(id)result=await supabaseClient.from("guild_activities").update(payload).eq("id",id).select("id,title,content_html,created_by,updated_by,created_at,updated_at").single();
    else result=await supabaseClient.from("guild_activities").insert({...payload,created_by:currentUser.id}).select("id,title,content_html,created_by,updated_by,created_at,updated_at").single();
    if(result.error)throw result.error;
    const saved=result.data,index=guildActivitiesCache.findIndex(row=>row.id===saved.id);
    if(index>=0)guildActivitiesCache[index]=saved;else guildActivitiesCache.unshift(saved);
    guildActivitiesCache.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    closeGuildActivityEditor();renderGuildActivities();
   }catch(error){console.error("Save guild activity:",error);msg.textContent="บันทึกไม่สำเร็จ: "+error.message;msg.className="message error";}
   finally{save.disabled=false;save.textContent=id?"บันทึกการแก้ไข":"บันทึกกิจกรรม";}
  }
 });
 page.addEventListener("change",async event=>{
  const input=event.target.closest("#activity-image-input");if(!input||!input.files?.length)return;
  const button=page.querySelector("[data-activity-image]"),body=$("activity-editor-body");
  try{if(button){button.disabled=true;button.textContent="กำลังอัปโหลด...";}const url=await uploadGuildActivityImage(input.files[0]);body?.focus();document.execCommand("insertHTML",false,'<img src="'+escapeHTML(url)+'" alt="Guild activity image">');}
  catch(error){alert(error.message||"อัปโหลดรูปไม่สำเร็จ");}
  finally{input.value="";if(button){button.disabled=false;button.textContent="▧ รูป / GIF";}}
 });
}
registerGuildActivityEvents();

// ==========================================
// FEEDBACK & SUPPORT CENTER
// ==========================================
const FEEDBACK_STATUS_LABELS = {
  received: "รับเรื่องแล้ว",
  in_progress: "กำลังดำเนินการ",
  resolved: "แก้ไขแล้ว"
};
const FEEDBACK_TYPE_LABELS = { problem: "แจ้งปัญหา", feedback: "Feedback" };
let feedbackRowsCache = [];
let feedbackNotificationsCache = [];
let feedbackRealtimeChannel = null;

function sanitizeFeedbackHTML(html) {
  const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
  const allowed = new Set(["P","DIV","BR","STRONG","B","EM","I","U","UL","OL","LI","BLOCKQUOTE","SPAN","IMG","S","STRIKE","TABLE","TBODY","TR","TD","TH","HR"]);
  const imagePrefix = SUPABASE_URL + "/storage/v1/object/public/" + GUILD_ACTIVITY_BUCKET + "/";
  const clean = node => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
    const tag = node.tagName;
    if (!allowed.has(tag)) {
      const fragment = document.createDocumentFragment();
      [...node.childNodes].forEach(child => fragment.appendChild(clean(child)));
      return fragment;
    }
    const element = parsed.createElement(tag.toLowerCase());
    if(tag==="IMG"){const src=node.getAttribute("src")||"";if(!src.startsWith(imagePrefix))return document.createTextNode("");element.src=src;element.alt=(node.alt||"Feedback image").slice(0,120);element.loading="lazy";element.className="guild-feedback-image";return element;}
    if (["DIV","P","SPAN","TD","TH"].includes(tag)) { const st=node.style||{}; if(["left","center","right","justify"].includes(st.textAlign)) element.style.textAlign=st.textAlign; if(/^\\d{1,2}px$/.test(st.fontSize||"")&&parseInt(st.fontSize)<=72)element.style.fontSize=st.fontSize; if(/^(Arial|Tahoma|Georgia|Verdana|monospace)$/i.test(st.fontFamily||""))element.style.fontFamily=st.fontFamily; if(/^#[0-9a-f]{6}$/i.test(st.color||""))element.style.color=st.color; if(/^#[0-9a-f]{6}$/i.test(st.backgroundColor||""))element.style.backgroundColor=st.backgroundColor; } if(tag==="TABLE")element.className="guild-rich-table";
    [...node.childNodes].forEach(child => element.appendChild(clean(child)));
    return element;
  };
  const output = document.createElement("div");
  [...parsed.body.childNodes].forEach(node => output.appendChild(clean(node)));
  return output.innerHTML;
}

async function uploadGuildFeedbackImage(file){
 if(!currentUser)throw new Error("กรุณาเข้าสู่ระบบก่อน");
 if(!file||!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw new Error("รองรับ PNG, JPG, WEBP และ GIF");
 if(file.size>8*1024*1024)throw new Error("รูปต้องมีขนาดไม่เกิน 8 MB");
 const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"}[file.type];
 const path=currentUser.id+"/feedback/"+crypto.randomUUID()+"."+ext;
 const {error}=await supabaseClient.storage.from(GUILD_ACTIVITY_BUCKET).upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
 if(error)throw error;
 return supabaseClient.storage.from(GUILD_ACTIVITY_BUCKET).getPublicUrl(path).data.publicUrl;
}

function feedbackStatusBadge(status) {
  return '<span class="feedback-status-badge status-' + escapeHTML(status) + '">' +
    escapeHTML(FEEDBACK_STATUS_LABELS[status] || "รับเรื่องแล้ว") + '</span>';
}

function getFeedbackMemberLabel(userId) {
  const member = allMembers.find(item => item.user_id === userId);
  return member ? getMemberName(member) : "สมาชิกที่ออกจากกิลด์";
}

function renderGuildFeedback() {
  const container = $("guild-feedback-list");
  if (!container) return;
  const management = isManagement();
  const typeFilter = $("feedback-filter-type")?.value || "all";
  const statusFilter = $("feedback-filter-status")?.value || "all";
  const search = String($("feedback-filter-search")?.value || "").trim().toLocaleLowerCase();
  let rows = [...feedbackRowsCache];
  if (typeFilter !== "all") rows = rows.filter(row => row.type === typeFilter);
  if (statusFilter !== "all") rows = rows.filter(row => row.status === statusFilter);
  if (search) rows = rows.filter(row =>
    String(row.title || "").toLocaleLowerCase().includes(search) ||
    (management && getFeedbackMemberLabel(row.user_id).toLocaleLowerCase().includes(search))
  );

  if (!rows.length) {
    showEmpty(container, "ยังไม่มีรายการ", management
      ? "ยังไม่มีรายการแจ้งปัญหาหรือ Feedback ที่ตรงกับเงื่อนไข"
      : "เมื่อคุณส่งปัญหาหรือ Feedback รายการจะปรากฏที่นี่");
    return;
  }

  container.innerHTML = rows.map(row => {
    const memberLine = management
      ? '<div class="feedback-member-line">ผู้แจ้ง: <strong>' + escapeHTML(getFeedbackMemberLabel(row.user_id)) + '</strong></div>'
      : "";
    const updated = row.updated_at && row.updated_at !== row.created_at
      ? '<span>อัปเดตล่าสุด ' + escapeHTML(formatDate(row.updated_at)) + '</span>' : "";
    const statusControl = management
      ? '<label class="feedback-status-control"><span>เปลี่ยนสถานะ</span><select data-feedback-status="' + escapeHTML(row.id) + '">' +
        Object.entries(FEEDBACK_STATUS_LABELS).map(([value,label]) =>
          '<option value="' + value + '"' + (row.status === value ? " selected" : "") + '>' + escapeHTML(label) + '</option>'
        ).join("") + '</select></label>' : "";
    const discordStatus = management
      ? (row.discord_notified_at
        ? '<span class="feedback-discord-state is-sent">ส่ง Discord แล้ว</span>'
        : '<button type="button" class="btn btn-outline btn-sm feedback-discord-retry" data-feedback-discord-retry="' + escapeHTML(row.id) + '">ส่ง Discord อีกครั้ง</button>') : "";
    return '<article class="feedback-ticket-card" data-feedback-id="' + escapeHTML(row.id) + '">' +
      '<div class="feedback-ticket-topline"><span class="feedback-type-badge type-' + escapeHTML(row.type) + '">' +
      escapeHTML(FEEDBACK_TYPE_LABELS[row.type] || row.type) + '</span>' + feedbackStatusBadge(row.status) + '</div>' +
      '<h3>' + escapeHTML(row.title) + '</h3>' + memberLine +
      '<div class="feedback-ticket-content">' + sanitizeFeedbackHTML(row.content_html) + '</div>' +
      '<div class="feedback-ticket-footer"><span>ส่งเมื่อ ' + escapeHTML(formatDate(row.created_at)) + '</span>' + updated + discordStatus + '</div>' +
      (statusControl ? '<div class="feedback-ticket-management">' + statusControl + '</div>' : "") +
      '</article>';
  }).join("");
}

async function loadGuildFeedback() {
  const container = $("guild-feedback-list");
  if (!container || !currentUser) return;
  const management = isManagement();
  $("feedback-management-filters")?.classList.toggle("hidden", !management);
  $("feedback-list-kicker").textContent = management ? "MANAGEMENT INBOX" : "MY REQUESTS";
  $("feedback-list-title").textContent = management ? "รายการแจ้งปัญหาและ Feedback ทั้งหมด" : "รายการที่ฉันแจ้งไว้";
  $("feedback-list-description").textContent = management
    ? "ตรวจสอบรายการจากสมาชิกทุกคนและอัปเดตสถานะการดำเนินงาน"
    : "มีเพียงคุณและทีมดูแลกิลด์เท่านั้นที่สามารถเห็นรายการเหล่านี้ได้";
  container.innerHTML = '<div class="empty-state"><span>◷</span><h3>กำลังโหลดรายการ</h3><p>กรุณารอสักครู่</p></div>';

  let query = supabaseClient.from("guild_feedback").select("*").order("created_at", { ascending: false });
  if (!management) query = query.eq("user_id", currentUser.id);
  const { data, error } = await query;
  if (error) {
    console.error("Load guild feedback:", error);
    showEmpty(container, "โหลดรายการไม่สำเร็จ", error.message || "กรุณาตรวจสอบการตั้งค่า Supabase");
    return;
  }
  feedbackRowsCache = data || [];
  renderGuildFeedback();
  await loadFeedbackNotifications();
}

function renderFeedbackNotifications() {
  const count = $("feedback-notification-count");
  const list = $("feedback-notification-list");
  const unread = feedbackNotificationsCache.filter(item => !item.is_read).length;
  if (count) {
    count.textContent = unread > 99 ? "99+" : String(unread);
    count.classList.toggle("hidden", unread === 0);
  }
  if (!list) return;
  if (!feedbackNotificationsCache.length) {
    list.innerHTML = '<p class="feedback-notification-empty">ยังไม่มีการแจ้งเตือน</p>';
    return;
  }
  list.innerHTML = feedbackNotificationsCache.map(item =>
    '<button type="button" class="feedback-notification-item ' + (item.is_read ? "" : "is-unread") +
    '" data-feedback-notification="' + escapeHTML(item.id) + '"><span class="feedback-notification-dot"></span>' +
    '<span class="feedback-notification-copy"><strong>' + escapeHTML(item.title || "มีการแจ้งเตือนใหม่") +
    '</strong><small>' + escapeHTML(item.body || "") + '</small><time>' + escapeHTML(formatDate(item.created_at)) +
    '</time></span></button>'
  ).join("");
}

async function loadFeedbackNotifications() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient.from("guild_notifications").select("*")
    .eq("recipient_user_id", currentUser.id).order("created_at", { ascending: false }).limit(40);
  if (error) {
    console.warn("Load feedback notifications:", error);
    return;
  }
  feedbackNotificationsCache = data || [];
  renderFeedbackNotifications();
}

async function markFeedbackNotificationRead(notificationId) {
  if (!currentUser || !notificationId) return;
  const { error } = await supabaseClient.from("guild_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId).eq("recipient_user_id", currentUser.id);
  if (error) console.warn("Mark notification read:", error);
  await loadFeedbackNotifications();
}

async function markAllFeedbackNotificationsRead() {
  if (!currentUser) return;
  const { error } = await supabaseClient.from("guild_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_user_id", currentUser.id).eq("is_read", false);
  if (error) {
    alert("ไม่สามารถอ่านการแจ้งเตือนทั้งหมดได้: " + error.message);
    return;
  }
  await loadFeedbackNotifications();
}

function subscribeToFeedbackRealtime() {
  if (feedbackRealtimeChannel) {
    supabaseClient.removeChannel(feedbackRealtimeChannel);
    feedbackRealtimeChannel = null;
  }
  if (!currentUser) return;
  feedbackRealtimeChannel = supabaseClient.channel("guild-feedback-live-" + currentUser.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "guild_feedback" }, () => {
      if (!$("page-feedback")?.classList.contains("hidden")) loadGuildFeedback();
    })
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "guild_notifications",
      filter: "recipient_user_id=eq." + currentUser.id
    }, loadFeedbackNotifications)
    .subscribe();
  loadFeedbackNotifications();
}

function closeFeedbackNotificationPanel() {
  $("feedback-notification-panel")?.classList.add("hidden");
  $("feedback-notification-toggle")?.setAttribute("aria-expanded", "false");
}

function registerFeedbackEvents() {
  const page = $("page-feedback");
  if (!page || page.dataset.eventsReady === "true") return;
  page.dataset.eventsReady = "true";

  $("feedback-notification-toggle")?.addEventListener("click", async event => {
    event.stopPropagation();
    const panel = $("feedback-notification-panel");
    const open = panel?.classList.toggle("hidden") === false;
    $("feedback-notification-toggle")?.setAttribute("aria-expanded", String(open));
    if (open) await loadFeedbackNotifications();
  });
  $("feedback-notification-read-all")?.addEventListener("click", markAllFeedbackNotificationsRead);
  $("feedback-notification-list")?.addEventListener("click", async event => {
    const item = event.target.closest("[data-feedback-notification]");
    if (!item) return;
    await markFeedbackNotificationRead(item.dataset.feedbackNotification);
    closeFeedbackNotificationPanel();
    openGuildPage("feedback");
  });
  document.addEventListener("click", event => {
    if (!event.target.closest("#feedback-notification-wrap")) closeFeedbackNotificationPanel();
  });

  page.addEventListener("click", async event => {
    const retry = event.target.closest("[data-feedback-discord-retry]");
    if (retry) {
      if (!isManagement()) return;
      retry.disabled = true;
      retry.textContent = "กำลังส่ง...";
      const { data, error } = await supabaseClient.functions.invoke(
        "discord-feedback-notify", { body: { feedback_id: retry.dataset.feedbackDiscordRetry } }
      );
      if (error || data?.success === false) {
        alert("ส่ง Discord ไม่สำเร็จ: " + (error?.message || data?.message || "Unknown error"));
      }
      await loadGuildFeedback();
      return;
    }
    if(event.target.closest("[data-feedback-image]")){$("feedback-image-input")?.click();return;}
    const command = event.target.closest("[data-feedback-command]");
    if (command) {
      $("feedback-editor-body")?.focus();
      document.execCommand(command.dataset.feedbackCommand, false, null);
      return;
    }
    if (event.target.closest("[data-feedback-emoji]")) {
      const emoji = window.prompt("พิมพ์หรือวางอีโมจิ", "💬");
      if (emoji) {
        $("feedback-editor-body")?.focus();
        document.execCommand("insertText", false, emoji);
      }
    }
  });

  page.addEventListener("submit", async event => {
    if (event.target.id !== "feedback-submit-form") return;
    event.preventDefault();
    if (!currentUser || !currentMember || currentMember.active !== true) return;
    const type = $("feedback-type").value;
    const title = String($("feedback-title").value || "").trim();
    const editor = $("feedback-editor-body");
    const contentHTML = sanitizeFeedbackHTML(editor?.innerHTML || "");
    const textContent = editor?.innerText?.trim() || "";
    const button = $("feedback-submit-button");
    if (!title || !textContent) {
      showMessage("feedback-submit-message", "กรุณากรอกหัวข้อและรายละเอียดให้ครบถ้วน", "error");
      return;
    }
    if (title.length > 160 || contentHTML.length > 20000) {
      showMessage("feedback-submit-message", "หัวข้อหรือรายละเอียดมีความยาวเกินกำหนด", "error");
      return;
    }
    button.disabled = true;
    button.textContent = "กำลังส่งรายการ...";
    showMessage("feedback-submit-message", "กำลังบันทึกรายการ...", "info");
    try {
      const { data, error } = await supabaseClient.from("guild_feedback")
        .insert({ type, title, content_html: contentHTML }).select("*").single();
      if (error) throw error;

      let notice = "ระบบบันทึกรายการแล้ว";
      const { data: discordResult, error: discordError } = await supabaseClient.functions.invoke(
        "discord-feedback-notify", { body: { feedback_id: data.id } }
      );
      if (discordError || discordResult?.success === false) {
        console.warn("Discord notification failed:", discordError || discordResult);
        notice += " แต่การแจ้งเตือน Discord ยังไม่สำเร็จ ทีมดูแลสามารถตรวจสอบและส่งซ้ำได้";
      } else {
        notice += " และส่งแจ้งเตือน Discord แล้ว";
      }
      $("feedback-submit-form").reset();
      if (editor) editor.innerHTML = "";
      showMessage("feedback-submit-message", "ส่งรายการสำเร็จ · " + notice, "success");
      await loadGuildFeedback();
    } catch (error) {
      console.error("Submit guild feedback:", error);
      showMessage("feedback-submit-message", "ส่งรายการไม่สำเร็จ: " + (error.message || "กรุณาลองอีกครั้ง"), "error");
    } finally {
      button.disabled = false;
      button.textContent = "ส่งรายการ";
    }
  });

  page.addEventListener("change", async event => {
    const imageInput=event.target.closest("#feedback-image-input");
    if(imageInput?.files?.length){
      const button=page.querySelector("[data-feedback-image]");
      try{
        if(button){button.disabled=true;button.textContent="กำลังอัปโหลด...";}
        const url=await uploadGuildFeedbackImage(imageInput.files[0]);
        const editor=$("feedback-editor-body");
        if(editor){editor.focus();document.execCommand("insertHTML",false,'<img src="'+escapeHTML(url)+'" alt="Feedback image">');}
      }catch(error){alert(error.message||"อัปโหลดรูปไม่สำเร็จ");}
      finally{imageInput.value="";if(button){button.disabled=false;button.textContent="▧ รูปภาพ";}}
      return;
    }
    const select = event.target.closest("[data-feedback-status]");
    if (!select || !isManagement()) return;
    const id = select.dataset.feedbackStatus;
    select.disabled = true;
    const { error } = await supabaseClient.from("guild_feedback")
      .update({ status: select.value }).eq("id", id);
    if (error) {
      alert("เปลี่ยนสถานะไม่สำเร็จ: " + error.message);
      await loadGuildFeedback();
      return;
    }
    await loadGuildFeedback();
  });

  $("feedback-refresh-button")?.addEventListener("click", loadGuildFeedback);
  ["feedback-filter-type","feedback-filter-status"].forEach(id => $(id)?.addEventListener("change", renderGuildFeedback));
  $("feedback-filter-search")?.addEventListener("input", renderGuildFeedback);
}

// GUILD RULES
const GUILD_RULE_KEYS=["regulations","war","discord"];
const GUILD_RULE_BUCKET="guild-rule-images";
let guildRulesCache={};
function sanitizeGuildRuleHTML(html){
 const parsed=new DOMParser().parseFromString(String(html||""),"text/html");
 const allowed=new Set(["P","DIV","BR","STRONG","B","EM","I","U","UL","OL","LI","H2","H3","H4","BLOCKQUOTE","SPAN","IMG","S","STRIKE","TABLE","TBODY","TR","TD","TH","HR"]);
 const prefix=SUPABASE_URL+"/storage/v1/object/public/"+GUILD_RULE_BUCKET+"/";
 const clean=node=>{
  if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent||"");
  if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
  const tag=node.tagName;
  if(!allowed.has(tag)){const f=document.createDocumentFragment();[...node.childNodes].forEach(n=>f.appendChild(clean(n)));return f;}
  const el=parsed.createElement(tag.toLowerCase());
  if(tag==="IMG"){const src=node.getAttribute("src")||"";if(!src.startsWith(prefix))return document.createTextNode("");el.src=src;el.alt=(node.alt||"Guild rule image").slice(0,120);el.loading="lazy";el.className="guild-rule-image";return el;}
  if(["DIV","P","SPAN","TD","TH"].includes(tag)){const st=node.style||{};if(["left","center","right","justify"].includes(st.textAlign))el.style.textAlign=st.textAlign;if(/^\\d{1,2}px$/.test(st.fontSize||"")&&parseInt(st.fontSize)<=72)el.style.fontSize=st.fontSize;if(/^(Arial|Tahoma|Georgia|Verdana|monospace)$/i.test(st.fontFamily||""))el.style.fontFamily=st.fontFamily;if(/^#[0-9a-f]{6}$/i.test(st.color||""))el.style.color=st.color;if(/^#[0-9a-f]{6}$/i.test(st.backgroundColor||""))el.style.backgroundColor=st.backgroundColor;}if(tag==="TABLE")el.className="guild-rich-table";
  [...node.childNodes].forEach(n=>el.appendChild(clean(n)));return el;
 };
 const out=parsed.createElement("div");[...parsed.body.childNodes].forEach(n=>out.appendChild(clean(n)));return out.innerHTML;
}
function renderGuildRuleCard(key,html){
 const content=$("rule-content-"+key),edit=document.querySelector('[data-rule-edit="'+key+'"]'),add=document.querySelector('[data-rule-add="'+key+'"]');
 const has=Boolean(String(html||"").trim());
 if(content)content.innerHTML=has?sanitizeGuildRuleHTML(html):'<div class="empty-state"><span>◈</span><h3>ยังไม่มีรายละเอียด</h3><p>ฝ่ายบริหารสามารถเพิ่มรายละเอียดของหัวข้อนี้ได้</p></div>';
 edit?.classList.toggle("hidden",!has||!isManagement());add?.classList.toggle("hidden",has||!isManagement());
}
async function loadGuildRules(){
 const {data,error}=await supabaseClient.from("guild_rule_details").select("rule_key,content_html,updated_at").in("rule_key",GUILD_RULE_KEYS);
 if(error){console.error("Load guild rules:",error);GUILD_RULE_KEYS.forEach(k=>{const el=$("rule-content-"+k);if(el)el.textContent="โหลดกฎไม่สำเร็จ: "+error.message;});return;}
 guildRulesCache={};(data||[]).forEach(row=>guildRulesCache[row.rule_key]=row);
 GUILD_RULE_KEYS.forEach(k=>renderGuildRuleCard(k,guildRulesCache[k]?.content_html||""));
}
function openGuildRuleEditor(key){
 if(!isManagement()||!GUILD_RULE_KEYS.includes(key))return;
 const panel=$("rule-editor-"+key),body=document.querySelector('[data-rule-editor="'+key+'"]');if(!panel||!body)return;
 body.innerHTML=sanitizeGuildRuleHTML(guildRulesCache[key]?.content_html||"");panel.classList.remove("hidden");
 document.querySelector('[data-rule-add="'+key+'"]')?.classList.add("hidden");document.querySelector('[data-rule-edit="'+key+'"]')?.classList.add("hidden");body.focus();
}
async function uploadGuildRuleImage(key,file){
 if(!isManagement())throw new Error("ไม่มีสิทธิ์อัปโหลดรูป");
 if(!file||!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw new Error("รองรับ PNG, JPG, WEBP และ GIF");
 if(file.size>8*1024*1024)throw new Error("รูปต้องมีขนาดไม่เกิน 8 MB");
 const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"}[file.type],path=currentUser.id+"/"+key+"/"+crypto.randomUUID()+"."+ext;
 const {error}=await supabaseClient.storage.from(GUILD_RULE_BUCKET).upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});if(error)throw error;
 return supabaseClient.storage.from(GUILD_RULE_BUCKET).getPublicUrl(path).data.publicUrl;
}
function registerGuildRuleEvents(){
 const page=$("page-rules");if(!page||page.dataset.eventsReady==="true")return;page.dataset.eventsReady="true";
 page.addEventListener("click",async event=>{
  const add=event.target.closest("[data-rule-add]"),edit=event.target.closest("[data-rule-edit]"),cancel=event.target.closest("[data-rule-cancel]"),save=event.target.closest("[data-rule-save]"),cmd=event.target.closest("[data-rule-command]"),emoji=event.target.closest("[data-rule-emoji]"),image=event.target.closest("[data-rule-image]");
  if(add){openGuildRuleEditor(add.dataset.ruleAdd);return;}if(edit){openGuildRuleEditor(edit.dataset.ruleEdit);return;}
  if(cancel){const k=cancel.dataset.ruleCancel;$("rule-editor-"+k)?.classList.add("hidden");renderGuildRuleCard(k,guildRulesCache[k]?.content_html||"");return;}
  if(cmd){const k=cmd.closest(".rule-card")?.dataset.ruleCard,body=document.querySelector('[data-rule-editor="'+k+'"]');if(body){body.focus();document.execCommand(cmd.dataset.ruleCommand,false,null);}return;}
  if(emoji){const k=emoji.closest(".rule-card")?.dataset.ruleCard,body=document.querySelector('[data-rule-editor="'+k+'"]'),value=window.prompt("พิมพ์หรือวางอีโมจิ","✨");if(body&&value){body.focus();document.execCommand("insertText",false,value);}return;}
  if(image){image.closest(".rule-card")?.querySelector("[data-rule-image-input]")?.click();return;}
  if(save){
   const k=save.dataset.ruleSave;if(!isManagement())return;const body=document.querySelector('[data-rule-editor="'+k+'"]'),msg=document.querySelector('[data-rule-message="'+k+'"]');if(!body)return;save.disabled=true;
   try{const html=sanitizeGuildRuleHTML(body.innerHTML),{data,error}=await supabaseClient.from("guild_rule_details").upsert({rule_key:k,content_html:html,updated_by:currentUser.id,updated_at:new Date().toISOString()},{onConflict:"rule_key"}).select("rule_key,content_html,updated_at").single();if(error)throw error;guildRulesCache[k]=data;$("rule-editor-"+k)?.classList.add("hidden");renderGuildRuleCard(k,data.content_html);if(msg){msg.textContent="บันทึกรายละเอียดเรียบร้อยแล้ว";msg.className="message success";}}
   catch(error){console.error("Save rule:",error);if(msg){msg.textContent="บันทึกไม่สำเร็จ: "+error.message;msg.className="message error";}}finally{save.disabled=false;}
  }
 });
 page.addEventListener("change",async event=>{
  const input=event.target.closest("[data-rule-image-input]");if(!input||!input.files?.length)return;const k=input.closest(".rule-card")?.dataset.ruleCard,body=document.querySelector('[data-rule-editor="'+k+'"]'),btn=input.closest(".rule-editor-toolbar")?.querySelector("[data-rule-image]");
  try{if(btn){btn.disabled=true;btn.textContent="กำลังอัปโหลด...";}const url=await uploadGuildRuleImage(k,input.files[0]);if(body){body.focus();document.execCommand("insertHTML",false,'<img src="'+escapeHTML(url)+'" alt="Guild rule image">');}}
  catch(error){alert(error.message||"อัปโหลดรูปไม่สำเร็จ");}finally{input.value="";if(btn){btn.disabled=false;btn.textContent="▧ รูป / GIF";}}
 });
}
registerGuildRuleEvents();

// ==========================================
// PAGE NAVIGATION
// ==========================================

function syncManagementMenuVisibility() {
  document.querySelectorAll("[data-management-only]").forEach(item => {
    const allowed = isManagement();
    item.classList.toggle("is-role-hidden", !allowed);
    item.setAttribute("aria-hidden", String(!allowed));
  });
  const devMenuItems = document.querySelectorAll("[data-developer-only]");
  const developerAllowed = isDeveloper();
  devMenuItems.forEach((item) => {
    item.classList.toggle("is-role-hidden", !developerAllowed);
    item.setAttribute("aria-hidden", String(!developerAllowed));
  });
}

const LAST_GUILD_PAGE_KEY = "4am-guild:last-page";

function getLastGuildPage() {
  try {
    const savedPage = window.localStorage.getItem(LAST_GUILD_PAGE_KEY);
    return savedPage && PAGE_TITLES[savedPage] ? savedPage : "dashboard";
  } catch (error) {
    console.warn("Unable to restore last page:", error);
    return "dashboard";
  }
}

function openGuildPage(pageName) {
  if (["war","war-stats","war-attendance-stats"].includes(pageName) && !isManagement()) {
    pageName = "war-attendance";
  }
  if (pageName === "system-management" && !isDeveloper()) {
    pageName = "dashboard";
  }

  // Remember the current section so a hard refresh returns to the same page.
  try {
    window.localStorage.setItem(LAST_GUILD_PAGE_KEY, pageName);
  } catch (error) {
    console.warn("Unable to save current page:", error);
  }

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.add("hidden");
  });

  const targetPage = $("page-" + pageName);
  if (targetPage) {
    targetPage.classList.remove("hidden");
  }

  document.querySelectorAll(".nav-item[data-page], .nav-subitem").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageName);
  });

  const warPage = ["war", "war-attendance", "war-signup", "war-leave", "war-stats", "war-attendance-stats"].includes(pageName);
  const warParent = document.querySelector('[data-toggle-submenu="war-submenu"]');
  const warSubmenu = $("war-submenu");
  warParent?.classList.toggle("active", warPage);
  if (warPage && warSubmenu) warSubmenu.classList.add("is-open");

  document.title = `${PAGE_TITLES[pageName] || "4AM GUILD"} | 4AM GUILD`;

  closeUserMenu();
  window.scrollTo({ top: 0 });

  if (pageName === "members") loadMembers();
  if (pageName === "system-management") loadSystemRoleMembers();

  if (pageName === "settings") {
    renderAccountDetails();
    loadDiscordAccount();
  }

  if (pageName === "portfolio") loadPortfolios();
  if (pageName === "war") loadWarEvents();
  if (pageName === "war-attendance") loadWarAttendance();
  if (pageName === "war-signup") loadWarSignups();
  if (pageName === "war-leave") loadWarLeavePage();
  if (pageName === "war-stats") loadWarMatchRecords();
  if (pageName === "war-attendance-stats") loadWarAttendanceStatistics();
  if (pageName === "rules") loadGuildRules();
  if (pageName === "activities") loadGuildActivities();
  if (pageName === "feedback") loadGuildFeedback();
}

async function copyGameUID(button) {
  const uid = String(button?.dataset.gameUid || "");
  if (!/^[0-9]{10}$/.test(uid)) return;

  try {
    await navigator.clipboard.writeText(uid);
    const original = button.textContent;
    button.textContent = "Copied!";
    button.disabled = true;
    setTimeout(() => {
      button.textContent = original;
      button.disabled = false;
    }, 1400);
  } catch (error) {
    console.error("Copy character UID failed:", error);
    alert("ไม่สามารถคัดลอก UID ตัวละครได้");
  }
}

async function saveOwnGameUID(form) {
  if (!currentUser || !currentMember || !form) return;

  const input = form.querySelector("[name='game_uid']");
  const button = form.querySelector("button[type='submit']");
  const uid = String(input?.value || "").trim();

  if (!/^[0-9]{10}$/.test(uid)) {
    showMessage("game-uid-message", "UID ตัวละครต้องเป็นตัวเลข 10 หลักเท่านั้น");
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "กำลังบันทึก...";
  }

  showMessage("game-uid-message", "กำลังบันทึก UID ตัวละคร...", "info");

  try {
    const { data, error } = await supabaseClient
      .from("guild_members")
      .update({ game_uid: uid })
      .eq("user_id", currentUser.id)
      .select("user_id, game_uid")
      .single();

    if (error) throw error;

    currentMember.game_uid = data.game_uid;
    const cachedMember = allMembers.find((member) => member.user_id === currentUser.id);
    if (cachedMember) cachedMember.game_uid = data.game_uid;

    renderAccountDetails();
    showMessage("game-uid-message", "บันทึก UID ตัวละครสำเร็จ", "success");
    renderDashboardProfile();
    renderMembers(allMembers);
  } catch (error) {
    console.error("Character UID update error:", error);
    showMessage(
      "game-uid-message",
      "บันทึกไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด")
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "บันทึก UID ตัวละคร";
    }
  }
}

async function saveOwnCharacterProfile(form) {
  if (!currentUser || !currentMember || !form) return;
  const characterName = String(form.querySelector("[name='character_name']")?.value || "").trim();
  const gameClass = String(form.querySelector("[name='game_class']")?.value || "").trim();
  const button = form.querySelector("button[type='submit']");
  if (!characterName) { showMessage("character-profile-message", "กรุณากรอกชื่อตัวละคร"); return; }
  if (characterName.length > 40) { showMessage("character-profile-message", "ชื่อตัวละครต้องไม่เกิน 40 ตัวอักษร"); return; }
  if (!CLASS_DATA.some(item => item.name === gameClass)) { showMessage("character-profile-message", "กรุณาเลือกอาชีพจากรายการ"); return; }
  if (button) { button.disabled = true; button.textContent = "กำลังบันทึก..."; }
  showMessage("character-profile-message", "กำลังบันทึกข้อมูลตัวละคร...", "info");
  try {
    const { data, error } = await supabaseClient.from("guild_members").update({ character_name: characterName, game_class: gameClass }).eq("user_id", currentUser.id).select("user_id, character_name, game_class").single();
    if (error) throw error;
    Object.assign(currentMember, { character_name: data.character_name, game_class: data.game_class });
    const cachedMember = allMembers.find(member => member.user_id === currentUser.id);
    if (cachedMember) Object.assign(cachedMember, { character_name: data.character_name, game_class: data.game_class });
    renderAccountDetails(); updateUserChip(); renderDashboardProfile(); renderMembers(allMembers); renderWarLayout();
    showMessage("character-profile-message", "บันทึกชื่อตัวละครและอาชีพสำเร็จ", "success");
  } catch (error) { console.error("Character profile update error:", error); showMessage("character-profile-message", "บันทึกไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด")); }
  finally { if (button) { button.disabled = false; button.textContent = "บันทึกข้อมูลตัวละคร"; } }
}
// ==========================================
// ACCOUNT SETTINGS
// ==========================================

function renderAccountDetails() {
  const container = $("account-details");
  if (!container) return;
  const name = currentMember ? getMemberName(currentMember) : "Guild Member";
  const displayPosition = getAccountDisplayPosition();
  const permission = getAccountPermissionLabel();
  const currentClass = getClassInfo(currentMember?.game_class);
  const classIcon = currentClass?.iconPath || "";
  const classColor = currentClass?.color || "#d8b878";
  container.innerHTML = `
    <div class="settings-detail"><span>Display Name</span><strong>${escapeHTML(name)}</strong></div>
    <div class="settings-detail"><span>Email Address</span><strong>${escapeHTML(currentUser?.email || "-")}</strong></div>
    <div class="settings-detail"><span>อาชีพปัจจุบัน</span><strong class="account-class-display" style="--class-color:${classColor}"><img class="account-class-icon" src="${escapeHTML(classIcon)}" alt="" onerror="this.style.display='none'"><span>${escapeHTML(currentMember?.game_class || "ยังไม่ได้เลือกอาชีพ")}</span></strong></div>
    <form id="character-profile-form" class="game-uid-settings-form account-character-form">
      <label for="account-character-name">แก้ไขชื่อตัวละคร</label>
      <input id="account-character-name" name="character_name" type="text" maxlength="40" autocomplete="off" placeholder="กรอกชื่อตัวละครใหม่" value="${escapeHTML(currentMember?.character_name || "")}" required>
      <label for="account-game-class">เปลี่ยนอาชีพ (Class)</label>
      <div class="account-class-select-wrap">
        <img id="account-class-preview" class="account-class-icon" src="${escapeHTML(classIcon)}" alt="" onerror="this.style.display='none'">
        <select id="account-game-class" name="game_class" required>
          ${CLASS_DATA.map(item => '<option value="' + escapeHTML(item.name) + '" ' + (item.name === currentMember?.game_class ? 'selected' : '') + '>' + escapeHTML(item.name) + '</option>').join("")}
        </select>
      </div>
      <div class="account-class-legend" aria-label="รายการอาชีพ">
        ${CLASS_DATA.map(item => '<span class="account-class-option" style="--class-color:' + item.color + '"><img src="' + escapeHTML(item.iconPath) + '" alt="" onerror="this.style.display=\'none\'">' + escapeHTML(item.name) + '</span>').join("")}
      </div>
      <button type="submit" class="btn btn-primary">บันทึกข้อมูลตัวละคร</button>
      <p id="character-profile-message" class="message" aria-live="polite"></p>
    </form>
    <div class="settings-detail"><span>UID ตัวละคร</span><strong>${escapeHTML(currentMember?.game_uid || "ยังไม่ได้กรอก UID")}</strong></div>
    <form id="game-uid-form" class="game-uid-settings-form">
      <label for="account-game-uid">แก้ไข UID ตัวละคร (ตัวเลข 10 หลัก)</label>
      <input id="account-game-uid" name="game_uid" type="text" inputmode="numeric" pattern="[0-9]{10}" minlength="10" maxlength="10" placeholder="กรอก UID ตัวละคร 10 หลัก" value="${escapeHTML(currentMember?.game_uid || "")}" required>
      <button type="submit" class="btn btn-primary">บันทึก Game UID</button>
      <p id="game-uid-message" class="message" aria-live="polite"></p>
    </form>
    <div class="settings-detail"><span>Display Position</span><strong>${escapeHTML(displayPosition)}</strong></div>
    <div class="settings-detail"><span>System Permission</span><strong>${escapeHTML(permission)}</strong></div>
    <div class="settings-detail"><span>Guild</span><strong>4AM GUILD</strong></div>
    <div class="settings-detail"><span>Server</span><strong>Tideborn Dreams</strong></div>
  `;
}

// ==========================================
// EVENT LISTENERS
// ==========================================

function registerAppEventListeners() {
  $("logout-btn")?.addEventListener("click", logout);

  $("member-search")?.addEventListener("input", filterMembers);
  $("refresh-members")?.addEventListener("click", loadMembers);
  $("connect-discord")?.addEventListener("click", connectDiscord);

  document.querySelectorAll(".nav-item[data-page], .nav-subitem").forEach((button) => {
    button.addEventListener("click", () => {
      openGuildPage(button.dataset.page);
    });
  });

  document.querySelectorAll("[data-toggle-submenu]").forEach((button) => {
    button.addEventListener("click", () => {
      const submenu = $(button.dataset.toggleSubmenu);
      const isOpen = submenu?.classList.toggle("is-open") ?? false;
      button.setAttribute("aria-expanded", String(isOpen));
    });
  });

  document.querySelectorAll("[data-go-page]").forEach((button) => {
    button.addEventListener("click", () => {
      openGuildPage(button.dataset.goPage);
    });
  });

  $("user-chip")?.addEventListener("click", (event) => {
    event.stopPropagation();

    const menu = $("user-menu");
    if (!menu) return;

    const isOpen = menu.classList.toggle("open");
    $("user-chip").setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#user-menu") &&
        !event.target.closest("#user-chip")) {
      closeUserMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeUserMenu();
  });

  $("discord-pill")?.addEventListener("click", (event) => {
    if (!discordAccount) {
      event.preventDefault();
      openGuildPage("settings");
    }
  });

  $("members-list")?.addEventListener("click", async (event) => {
    const uidButton = event.target.closest(".copy-member-game-uid");
    if (uidButton) {
      await copyGameUID(uidButton);
      return;
    }

    const button = event.target.closest(".copy-member-id");
    if (!button) return;

    const userId = button.dataset.userId;
    if (!userId) return;

    try {
      await navigator.clipboard.writeText(userId);
      button.textContent = "Copied!";

      setTimeout(() => {
        button.textContent = "Copy ID";
      }, 1500);
    } catch (error) {
      console.error("Copy failed:", error);
      alert("Unable to copy ID.");
    }
  });

  $("dashboard-profile")?.addEventListener("click", async (event) => {
    const uploadButton = event.target.closest(".profile-avatar-upload-btn");
    if (uploadButton) {
      $("profile-avatar-input")?.click();
      return;
    }

    const button = event.target.closest(".copy-own-game-uid");
    if (button) await copyGameUID(button);
  });

  $("dashboard-profile")?.addEventListener("change", async (event) => {
    if (event.target.id !== "profile-avatar-input") return;

    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    const uploadButton = $("dashboard-profile")?.querySelector(".profile-avatar-upload-btn");
    const status = $("dashboard-profile")?.querySelector(".profile-avatar-upload-status");

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("กรุณาเลือกไฟล์รูปภาพ");
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("รูปภาพต้องมีขนาดไม่เกิน 5 MB");
      }

      const croppedFile = await openAvatarCropper(file);
      if (!croppedFile) {
        if (status) status.textContent = "ยกเลิกการเปลี่ยนรูปโปรไฟล์แล้ว";
        return;
      }

      if (uploadButton) {
        uploadButton.disabled = true;
        uploadButton.textContent = "กำลังอัปโหลด...";
      }
      if (status) status.textContent = "กำลังบันทึกรูปโปรไฟล์...";

      await uploadMemberAvatar(croppedFile);
    } catch (error) {
      console.error("Profile avatar upload error:", error);
      if (status) status.textContent = error.message || "อัปโหลดรูปไม่สำเร็จ";
      alert(error.message || "อัปโหลดรูปโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      if (uploadButton) {
        uploadButton.disabled = false;
        uploadButton.textContent = "เปลี่ยนรูปโปรไฟล์";
      }
      input.value = "";
    }
  });

  registerPortfolioEvents();
  registerSystemRoleEvents();
  registerWarCreationEvents();
  registerWarRecordAndAttendanceEvents();
  registerWarLeaveEvents();
  initializeGuildRichTextEnhancements();
  registerGuildRuleEvents();
  registerFeedbackEvents();

  $("account-details")?.addEventListener("change", (event) => {
    if (event.target.id !== "account-game-class") return;
    const selected = getClassInfo(event.target.value);
    const preview = $("account-class-preview");
    if (preview) {
      preview.src = selected?.iconPath || "";
      preview.style.display = selected ? "" : "none";
    }
  });

  $("account-details")?.addEventListener("submit", async (event) => {
    if (event.target.id === "game-uid-form") {
      event.preventDefault();
      await saveOwnGameUID(event.target);
      return;
    }
    if (event.target.id === "character-profile-form") {
      event.preventDefault();
      await saveOwnCharacterProfile(event.target);
    }
  });

  $("members-list")?.addEventListener("change", async (event) => {
    const select = event.target.closest(
      "select[data-action='assign-guild-position']"
    );

    if (!select) return;
    await assignGuildPosition(select);
  });

  initializeAuth();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", registerAppEventListeners, { once: true });
} else {
  registerAppEventListeners();
}

// ==========================================
// AUTH SESSION INITIALIZATION
// ==========================================

async function initializeAuth() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      currentUser = data.session.user;
      await loadApplication();
    } else {
      $("login-screen")?.classList.remove("hidden");
      $("app-layout")?.classList.add("hidden");
      setConnectionStatus("ยังไม่ได้เชื่อมต่อ", false);
    }
  } catch (error) {
    console.error("Session initialization error:", error);
    setConnectionStatus("เชื่อมต่อไม่สำเร็จ", false);
  }
}

// ==========================================
// AUTH STATE CHANGE
// ==========================================

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session?.user) {
    currentUser = session.user;
  }

  if (event === "SIGNED_OUT") {
    currentUser = null;
    currentMember = null;
    discordAccount = null;
  }
});

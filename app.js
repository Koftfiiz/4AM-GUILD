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
let rolePreviewRole = null;
let allMembers = [];
let manualGuildMembers = [];
let directoryMembers = [];
let discordAccount = null;
let allPortfolios = [];
let portfolioClassFilter = "all";
let currentPortfolioMemberId = null;
let portfolioManageMode = false;
let allWarEvents = [];
let currentWarParties = [];
let currentWarPartyAssignments = [];
let currentWarAssignmentEventId = null;
let selectedWarEventId = null;
let warAttendanceEvents = [];
let warAttendanceEventId = null;
let warRealtimeChannel = null;
let registrationBusy = false;
let warArrangeMode = false;
let warAssignmentFilter="all",warAssignmentClassFilter="all",warAssignmentSearch="",warAssignmentSignups=[],warAssignmentLeaves=[],warAssignmentAbsentees=[],warAssignmentRosterSnapshot=[],warAssignmentModalSlot=null;
let warSkillCatalog=[],warMemberSkillMap=new Map(),warSkillLoadError="",warSkillDeleteMode=false;
const WAR_SKILL_BUCKET="war-skill-icons";

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
  { name: "Mystech", color: "#f2dc83", iconPath: "assets/class-icon/Mystech.png" }
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
  members: "รายชื่อสมาชิก",
  "member-management": "จัดการรายชื่อสมาชิก",
  war: "จัดตี้วอร์",
  "war-attendance": "ประกาศรายชื่อวอร์",
  "war-signup": "ลงชื่อวอร์",
  "war-leave": "แจ้งลาวอร์",
  "war-stats": "สถิติกิลด์วอร์",
  "war-attendance-stats": "สถิติการเข้าร่วมวอร์",
  rules: "กฎกิลด์",
  portfolio: "แฟ้มผลงาน",
  guides: "ไกด์เกม",
  "community-board": "Community Board",
  "duck-race": "4AM Duck Race",
  "guild-news": "Guild News",
  "guild-activities": "Guild Activities",
  feedback: "แจ้งปัญหา / Feedback",
  settings: "ตั้งค่าบัญชี",
  "system-management": "System Management",
  "discord-integration": "Discord Integration Settings",
  appearance: "Appearance"
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
    admin: "HR",
    management: "Management",
    member: "Member"
  };

  return roles[String(role || "").toLowerCase()] || "Member";
}

// ตรวจสอบ Developer จากสิทธิ์จริงเสมอ ไม่ใช้ Role ที่กำลัง Preview
function isDeveloper() {
  return String(currentMember?.role || "").toLowerCase() === "developer";
}

function isRolePreviewActive() {
  return Boolean(rolePreviewRole);
}

function getEffectiveSystemRole() {
  return rolePreviewRole || String(currentMember?.role || "member").toLowerCase();
}

// สิทธิ์สำหรับแสดงผล UI ใช้ Role จำลองได้ แต่การทำรายการจริงถูกบล็อกใน Preview
function isManagement() {
  return ["developer", "leader", "management"].includes(getEffectiveSystemRole());
}

function applyRolePreviewState() {
  const active = isRolePreviewActive();
  const labels = { member: "Member", admin: "HR", management: "Management", leader: "Leader", developer: "Developer" };
  document.body.classList.toggle("role-preview-active", active);
  const banner = $("role-preview-banner");
  if (banner) banner.classList.toggle("hidden", !active);
  const bannerText = $("role-preview-banner-text");
  if (bannerText) bannerText.textContent = active ? "กำลังจำลองมุมมอง: " + (labels[rolePreviewRole] || rolePreviewRole) : "";
  const select = $("role-preview-select");
  if (select && active) select.value = rolePreviewRole;
  syncManagementMenuVisibility();
}

function startRolePreview() {
  if (!isDeveloper()) {
    alert("เฉพาะ Developer เท่านั้นที่ใช้ Role Preview ได้");
    return;
  }
  const selectedRole = String($("role-preview-select")?.value || "").toLowerCase();
  const allowedRoles = ["member", "admin", "management", "leader", "developer"];
  if (!allowedRoles.includes(selectedRole)) return;
  rolePreviewRole = selectedRole;
  applyRolePreviewState();
  openGuildPage("dashboard");
}

function stopRolePreview() {
  if (!isDeveloper()) return;
  rolePreviewRole = null;
  applyRolePreviewState();
  openGuildPage("system-management");
}

function registerRolePreviewEvents() {
  $("role-preview-start")?.addEventListener("click", startRolePreview);
  $("role-preview-exit")?.addEventListener("click", stopRolePreview);

  // Preview is deliberately read-only: block page actions before page handlers run.
  document.addEventListener("click", (event) => {
    if (!isRolePreviewActive()) return;
    const protectedSurface = event.target.closest?.(".page,.topbar");
    if (!protectedSurface || event.target.closest("[data-role-preview-control],[data-preview-safe],[data-page],[data-go-page],[data-toggle-submenu]")) return;
    if (event.target.closest("button,a,[role='button']")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const bannerText = $("role-preview-banner-text");
      if (bannerText) bannerText.textContent = "โหมด " + rolePreviewRole + " · Preview เท่านั้น ไม่สามารถดำเนินการหรือบันทึกข้อมูลได้";
    }
  }, true);

  document.addEventListener("submit", (event) => {
    if (!isRolePreviewActive() || !event.target.closest(".page,.topbar")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener("change", (event) => {
    if (!isRolePreviewActive() || !event.target.closest(".page,.topbar")) return;
    if (event.target.closest("[data-role-preview-control],[data-preview-safe]")) return;
    if (event.target.matches("select,input[type='file'],input[type='checkbox'],input[type='radio']")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
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
  return day+"/"+month+"/"+year;
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
    await loadAppearanceSettings();

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

    // Save Discord identity only after an active guild profile has passed the
    // existing membership gate. OAuth login alone never grants app access.
    await syncOwnDiscordOAuthIdentity();
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
    window.dispatchEvent(new Event("4am:app-ready"));

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

// Read the Discord identity returned by Supabase OAuth.
// This identifies the Discord account only; it does not prove guild membership.
function getDiscordOAuthIdentity() {
  const discordIdentity = (currentUser?.identities || [])
    .find(identity => String(identity.provider || "").toLowerCase() === "discord");
  const metadata = discordIdentity?.identity_data || currentUser?.user_metadata || {};
  const discordId = String(
    metadata.provider_id || metadata.sub || metadata.id || ""
  ).trim();
  const username = String(
    metadata.user_name || metadata.username || metadata.preferred_username || ""
  ).trim();
  const globalName = String(
    metadata.full_name || metadata.global_name || metadata.name || ""
  ).trim();

  return { discordId, username, globalName };
}

// Persist the signed-in member's own Discord OAuth identity through a
// SECURITY DEFINER RPC. This never grants guild membership or changes roles.
async function syncOwnDiscordOAuthIdentity() {
  if (!currentUser || !currentMember || currentMember.active !== true) return;
  const { discordId } = getDiscordOAuthIdentity();
  if (!discordId) {
    console.warn("Discord OAuth identity did not include a Discord user ID.");
    return;
  }

  const { error } = await supabaseClient.rpc("sync_my_discord_account");
  if (error) {
    console.warn("Discord identity sync is not installed yet:", error.message);
  }
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
          src="/assets/4am-guild-logo.png?v=20261111b"
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
          placeholder="กรอกชื่อตัวละคร"
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
          placeholder="กรอกชื่อเล่น"
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
          <strong>บัญชี Discord ที่เข้าสู่ระบบ</strong>
          <span>ชื่อแสดงผล: ${escapeHTML(getDiscordOAuthIdentity().globalName || "ไม่พบชื่อแสดงผล")}</span>
          <span>Username: ${escapeHTML(getDiscordOAuthIdentity().username || "ไม่พบ Username")}</span>
          <span>Discord User ID: ${escapeHTML(getDiscordOAuthIdentity().discordId || "ไม่พบ User ID")}</span>
          <small>ข้อมูลนี้มาจาก Discord OAuth โดยตรง แต่ยังไม่ใช่การยืนยันสถานะสมาชิกกิลด์</small>
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
      "กรุณากรอกชื่อตัวละคร"
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

async function loadDashboardAnnouncement() {
  const container = $("dashboard-announcement-content");
  if (!container) return;

  container.innerHTML = '<p class="muted">กำลังโหลดข่าวสารล่าสุด...</p>';

  const { data, error } = await supabaseClient
    .from("guild_activities")
    .select("id,title,content_html,starts_at,ends_at,created_at")
    .is("starts_at", null)
    .is("ends_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Dashboard guild announcement error:", error);
    container.innerHTML = '<span class="badge-important">ข่าวสารจากกิลด์</span><h4>โหลดข่าวสารไม่สำเร็จ</h4><p>กรุณาลองใหม่อีกครั้ง</p>';
    return;
  }

  if (!data) {
    container.innerHTML = '<span class="badge-important">ข่าวสารจากกิลด์</span><h4>ยังไม่มีข่าวสารที่เผยแพร่</h4><p>เมื่อสร้างประกาศกิลด์ ข่าวสารล่าสุดจะแสดงที่นี่</p>';
    return;
  }

  const contentPreview = document.createElement("div");
  contentPreview.innerHTML = sanitizeGuildActivityHTML(data.content_html || "");
  const plainText = (contentPreview.textContent || "").replace(/\s+/g, " ").trim();
  const excerpt = plainText.length > 190 ? plainText.slice(0, 190).trimEnd() + "…" : plainText;

  container.innerHTML = `
    <span class="badge-important">ข่าวสารล่าสุด</span>
    <h4>${escapeHTML(data.title || "ข่าวสารจากกิลด์")}</h4>
    <p>${escapeHTML(excerpt || "กดเพื่ออ่านรายละเอียดข่าวสารจากกิลด์")}</p>
    <div class="announcement-date">
      <svg class="icon"><use href="#i-clock"/></svg>
      เผยแพร่เมื่อ ${escapeHTML(activityDateLabel(data.created_at) || "-")}
    </div>
  `;
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
  if (container) container.innerHTML = `<p class="muted">กำลังโหลดรายชื่อสมาชิก...</p>`;

  const [accountsResult, manualResult] = await Promise.all([
    supabaseClient.from("guild_members").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("guild_manual_members").select("*").eq("active", true).order("character_name", { ascending: true })
  ]);

  if (accountsResult.error) {
    console.error("Load members error:", accountsResult.error);
    showEmpty(container, "ไม่สามารถโหลดรายชื่อสมาชิกได้", accountsResult.error.message);
    return;
  }

  allMembers = accountsResult.data || [];
  manualGuildMembers = manualResult.error ? [] : (manualResult.data || []);
  if (manualResult.error && !/guild_manual_members|relation.*does not exist/i.test(manualResult.error.message || "")) {
    console.warn("Load manual guild members:", manualResult.error);
  }

  directoryMembers = [
    ...allMembers.map(member => ({ ...member, is_manual_record: false })),
    ...manualGuildMembers.map(member => ({
      ...member,
      user_id: null,
      role: "member",
      is_manual_record: true
    }))
  ].sort((a, b) => String(a.character_name || "").localeCompare(String(b.character_name || ""), "th"));

  renderMembers(directoryMembers);
}

function renderMembers(members) {
  const container = $("members-list");
  if (!container) return;

  if (!members.length) {
    showEmpty(container, "ยังไม่มีรายชื่อสมาชิก", "เมื่อมีสมาชิกในกิลด์ รายชื่อจะแสดงที่นี่");
    return;
  }

  container.innerHTML = members.map(member => {
    const name = getMemberName(member);
    const className = getMemberClass(member);
    const classInfo = getClassInfo(className);
    const classColor = classInfo?.color || "#a9a9a9";
    const guildPosition = member.guild_position || "ยังไม่ได้กำหนดตำแหน่ง";
    const gameUID = String(member.game_uid || "");
    const recordType = member.is_manual_record ? "manual" : "account";
    const avatarKey = member.user_id || member.id || name;

    return `
      <article class="member-card member-directory-card" data-member-kind="${recordType}">
        <div class="member-avatar">
          <img class="member-avatar-image"
            data-member-avatar-user-id="${escapeHTML(avatarKey)}"
            src="${DEFAULT_AVATAR}" alt="รูปโปรไฟล์ ${escapeHTML(name)}"
            loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'">
        </div>
        <div class="member-info">
          <div class="member-details">
            <h4>${escapeHTML(name)}</h4>
            <span class="member-guild-position-badge">${escapeHTML(guildPosition)}</span>
            <small class="member-secondary-name">ชื่อเล่น: ${escapeHTML(member.nickname || "-")}</small>${member.discord_name ? `<small class="member-secondary-name">Discord: ${escapeHTML(member.discord_name)}</small>` : ""}
          </div>
          <div class="member-game-uid">
            <span class="member-uid-label">UID ตัวละคร</span>
            <strong>${escapeHTML(gameUID || "-")}</strong>
            ${gameUID ? `<button type="button" class="btn btn-outline copy-member-game-uid" data-game-uid="${escapeHTML(gameUID)}">คัดลอก UID</button>` : ""}
          </div>
        </div>
        <div class="member-class" style="--class-color:${classColor}">
          ${classInfo?.iconPath ? `<img class="member-class-icon" src="${classInfo.iconPath}" alt="${escapeHTML(className)}" loading="lazy" onerror="this.style.display='none'">` : ""}
          <span>${escapeHTML(className)}</span>
        </div>
        ${member.is_manual_record ? '<span class="member-record-status">รายชื่อ Manual</span>' : ""}
      </article>
    `;
  }).join("");

  members.forEach(async member => {
    if (member.is_manual_record) return;
    const key = String(member.user_id || member.id || getMemberName(member));
    const avatar = container.querySelector(`.member-avatar-image[data-member-avatar-user-id="${CSS.escape(key)}"]`);
    if (!avatar) return;
    const avatarUrl = await resolveAvatarUrl(member);
    if (avatar.isConnected) avatar.src = avatarUrl || DEFAULT_AVATAR;
  });
}

// ==========================================
// MANUAL MEMBER MANAGEMENT
// ==========================================

function renderGuildPositionOptions(selected = "") {
  return '<option value="">เลือกตำแหน่งกิลด์</option>' + GUILD_POSITIONS.map(position =>
    `<option value="${escapeHTML(position)}" ${selected === position ? "selected" : ""}>${escapeHTML(position)}</option>`
  ).join("");
}

function openManualMemberModal() {
  const modal = $("manual-member-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.classList.add("manual-member-modal-open");
  window.setTimeout(() => modal.querySelector('input[name="character_name"]')?.focus(), 80);
}

function closeManualMemberModal() {
  $("manual-member-modal")?.classList.add("hidden");
  document.body.classList.remove("manual-member-modal-open");
}

function resetManualMemberForm() {
  const form = $("manual-member-form");
  if (!form) return;
  form.reset();
  $("manual-member-id").value = "";
  $("manual-member-type").value = "manual";
  $("manual-member-user-id").value = "";
  $("manual-member-form-title").textContent = "เพิ่มสมาชิกใหม่";
  $("manual-member-submit").textContent = "บันทึกสมาชิก";
  $("manual-member-cancel").classList.add("hidden");
  $("manual-member-active").checked = true;
  closeManualMemberModal();
}

async function loadManualMemberManagement() {
  if (!isManagement()) return;
  const list = $("manual-member-list");
  if (list) list.innerHTML = '<p class="muted">กำลังโหลดข้อมูลสมาชิก...</p>';
  await loadMembers();

  const form = $("manual-member-form");
  const classSelect = form?.elements?.game_class;
  const positionSelect = form?.elements?.guild_position;
  if (classSelect && classSelect.options.length <= 1) {
    classSelect.innerHTML = '<option value="">เลือก Class อาชีพ</option>' + CLASS_DATA.map(item =>
      `<option value="${escapeHTML(item.name)}">${escapeHTML(item.name)}</option>`
    ).join("");
  }
  if (positionSelect && positionSelect.options.length <= 1) {
    positionSelect.innerHTML = renderGuildPositionOptions();
  }

  const { data, error } = await supabaseClient
    .from("guild_manual_members")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Manual member management load:", error);
    if (list) list.innerHTML = '<div class="manual-member-setup-warning"><strong>ยังไม่พบตารางรายชื่อสมาชิก Manual</strong><p>กรุณารัน SQL ชื่อ <b>4AM Manual Guild Member Directory</b> ใน Supabase SQL Editor ก่อนใช้งานส่วนนี้</p><small>' + escapeHTML(error.message) + '</small></div>';
    return;
  }

  manualGuildMembers = data || [];
  renderManualMemberManagement();
}

function renderManualMemberManagement() {
  const list = $("manual-member-list");
  const summary = $("manual-member-summary");
  if (!list) return;
  const linkedCount = allMembers.length;
  const manualCount = manualGuildMembers.length;
  const activeCount = allMembers.filter(member => member.active).length + manualGuildMembers.filter(member => member.active).length;
  if (summary) summary.textContent = `สมาชิกในระบบ ${linkedCount} คน · Manual ${manualCount} คน · Active ${activeCount} คน`;

  if (!linkedCount && !manualCount) {
    list.innerHTML = '<div class="manual-member-empty"><span>＋</span><strong>ยังไม่มีรายชื่อสมาชิก</strong><p>เพิ่มสมาชิกที่ยังไม่มีบัญชีเข้าใช้งานแอปได้จากแบบฟอร์มด้านบน</p></div>';
    return;
  }

  const accountRows = allMembers.map(member => {
    const cls = getClassInfo(member.game_class);
    return `<tr>
      <td><strong>${escapeHTML(member.character_name || getMemberName(member))}</strong><small>ชื่อเล่น: ${escapeHTML(member.nickname || "-")} · บัญชีเชื่อมต่อแล้ว</small></td>
      <td><span class="manual-member-class" style="--class-color:${cls?.color || "#aaa"}">${escapeHTML(member.game_class || "ยังไม่ระบุ")}</span></td>
      <td>${escapeHTML(member.guild_position || "ยังไม่ได้กำหนด")}</td>
      <td><span class="manual-member-status ${member.active ? "is-active" : "is-inactive"}">${member.active ? "Active" : "Inactive"}</span></td>
      <td><div class="manual-member-actions">
        <button type="button" class="btn btn-outline btn-sm" data-account-edit="${escapeHTML(member.user_id)}">แก้ไข</button>
        <button type="button" class="btn btn-sm manual-member-toggle-btn ${member.active ? "is-suspend" : "is-activate"}" data-account-toggle="${escapeHTML(member.user_id)}">${member.active ? "ระงับ" : "เปิดใช้งาน"}</button>
      </div></td>
    </tr>`;
  }).join("");

  const manualRows = manualGuildMembers.map(member => {
    const cls = getClassInfo(member.game_class);
    return `<tr>
      <td><strong>${escapeHTML(member.character_name)}</strong><small>ชื่อเล่น: ${escapeHTML(member.nickname || "-")} · ยังไม่มีบัญชีเข้าใช้งาน</small></td>
      <td><span class="manual-member-class" style="--class-color:${cls?.color || "#aaa"}">${escapeHTML(member.game_class)}</span></td>
      <td>${escapeHTML(member.guild_position || "ยังไม่ได้กำหนด")}</td>
      <td><span class="manual-member-status ${member.active ? "is-active" : "is-inactive"}">${member.active ? "Active" : "Inactive"}</span></td>
      <td><div class="manual-member-actions">
        <button type="button" class="btn btn-outline btn-sm" data-manual-edit="${escapeHTML(member.id)}">แก้ไข</button>
        <button type="button" class="btn btn-sm manual-member-toggle-btn ${member.active ? "is-suspend" : "is-activate"}" data-manual-toggle="${escapeHTML(member.id)}">${member.active ? "ระงับ" : "เปิดใช้งาน"}</button>
        <button type="button" class="btn btn-danger btn-sm" data-manual-delete="${escapeHTML(member.id)}">ลบ</button>
      </div></td>
    </tr>`;
  }).join("");

  list.innerHTML = `
    <div class="manual-member-table-wrap">
      <table class="manual-member-table">
        <thead><tr><th>สมาชิก</th><th>Class</th><th>ตำแหน่งกิลด์</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
        <tbody>${accountRows}${manualRows}</tbody>
      </table>
    </div>`;
}

async function saveManualGuildMember(form) {
  if (!isManagement() || !form) return;
  const formData = new FormData(form);
  const id = String(formData.get("id") || "");
  const recordType = String(formData.get("record_type") || "manual");
  const userId = String(formData.get("user_id") || "");
  const payload = {
    character_name: String(formData.get("character_name") || "").trim(),
    game_class: String(formData.get("game_class") || "").trim(),
    nickname: String(formData.get("nickname") || "").trim() || null,
    discord_name: String(formData.get("discord_name") || "").trim() || null,
    age: String(formData.get("age") || "").trim() ? Number(formData.get("age")) : null,
    guild_position: String(formData.get("guild_position") || "").trim() || null,
    active: $("manual-member-active").checked,
    updated_at: new Date().toISOString()
  };
  const status = $("manual-member-form-status");
  const submit = $("manual-member-submit");

  if (!payload.character_name || payload.character_name.length > 40) {
    if (status) status.textContent = "กรุณากรอกชื่อตัวละครไม่เกิน 40 ตัวอักษร";
    return;
  }
  if (!CLASS_DATA.some(item => item.name === payload.game_class)) {
    if (status) status.textContent = "กรุณาเลือก Class อาชีพ";
    return;
  }
  if (payload.age !== null && (!Number.isInteger(payload.age) || payload.age < 1 || payload.age > 120)) {
    if (status) status.textContent = "กรุณาตรวจสอบอายุ (1–120 ปี)";
    return;
  }

  if (submit) { submit.disabled = true; submit.textContent = "กำลังบันทึก..."; }
  if (status) status.textContent = "กำลังบันทึกข้อมูลสมาชิก...";
  try {
    const duplicate = await supabaseClient.from("guild_manual_members")
      .select("id").ilike("character_name", payload.character_name);
    if (duplicate.error) throw duplicate.error;
    if ((duplicate.data || []).some(row => row.id !== id)) {
      throw new Error("มีชื่อตัวละครนี้ในรายชื่อ Manual แล้ว");
    }
    const accountDuplicate = allMembers.some(member =>
      String(member.character_name || "").trim().toLowerCase() === payload.character_name.toLowerCase() &&
      !(recordType === "account" && member.user_id === userId)
    );
    if (accountDuplicate) throw new Error("มีชื่อตัวละครนี้ในรายชื่อสมาชิกที่เชื่อมบัญชีแล้ว");

    let result;
    if (recordType === "account") {
      if (!userId) throw new Error("ไม่พบ User ID ของบัญชีสมาชิก");
      const accountPayload = { ...payload };
      delete accountPayload.updated_at;
      result = await supabaseClient.from("guild_members")
        .update(accountPayload)
        .eq("user_id", userId).select("*").single();
    } else if (id) {
      result = await supabaseClient.from("guild_manual_members")
        .update({ ...payload, updated_by: currentUser.id }).eq("id", id).select("*").single();
    } else {
      result = await supabaseClient.from("guild_manual_members")
        .insert({ ...payload, created_by: currentUser.id, updated_by: currentUser.id }).select("*").single();
    }
    if (result.error) throw result.error;

    if (recordType === "account") {
      const accountIndex = allMembers.findIndex(member => member.user_id === userId);
      if (accountIndex >= 0) allMembers[accountIndex] = result.data;
      if (currentMember?.user_id === userId) Object.assign(currentMember, result.data);
      updateUserChip();
      renderDashboardProfile();
    } else {
      const index = manualGuildMembers.findIndex(member => member.id === result.data.id);
      if (index >= 0) manualGuildMembers[index] = result.data;
      else manualGuildMembers.unshift(result.data);
    }

    resetManualMemberForm();
    if (status) status.textContent = "บันทึกข้อมูลสมาชิกเรียบร้อยแล้ว";
    renderManualMemberManagement();
    await loadMembers();
  } catch (error) {
    console.error("Save member record:", error);
    if (status) status.textContent = "บันทึกไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด");
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = $("manual-member-id")?.value ? "บันทึกการแก้ไข" : "บันทึกสมาชิก"; }
  }
}

function fillManualMemberForm(member, type = "manual") {
  const form = $("manual-member-form");
  if (!member || !form) return;
  $("manual-member-id").value = type === "manual" ? member.id : "";
  $("manual-member-type").value = type;
  $("manual-member-user-id").value = type === "account" ? member.user_id : "";
  form.elements.character_name.value = member.character_name || "";
  form.elements.game_class.value = member.game_class || "";
  form.elements.nickname.value = member.nickname || "";
  form.elements.discord_name.value = member.discord_name || "";
  form.elements.age.value = member.age || "";
  form.elements.guild_position.value = member.guild_position || "";
  form.elements.notes.value = member.notes || "";
  $("manual-member-active").checked = member.active !== false;
  $("manual-member-form-title").textContent = type === "account" ? "แก้ไขข้อมูลสมาชิกที่เชื่อมบัญชีแล้ว" : "แก้ไขข้อมูลสมาชิก Manual";
  $("manual-member-submit").textContent = "บันทึกการแก้ไข";
  $("manual-member-cancel").classList.remove("hidden");
  openManualMemberModal();
}

function editManualGuildMember(id) {
  if (!isManagement()) return;
  fillManualMemberForm(manualGuildMembers.find(item => item.id === id), "manual");
}

function editLinkedGuildMember(userId) {
  if (!isManagement()) return;
  fillManualMemberForm(allMembers.find(item => item.user_id === userId), "account");
}

async function updateManualGuildMemberStatus(id) {
  if (!isManagement()) return;
  const member = manualGuildMembers.find(item => item.id === id);
  if (!member) return;
  const { data, error } = await supabaseClient.from("guild_manual_members")
    .update({ active: !member.active, updated_by: currentUser.id, updated_at: new Date().toISOString() })
    .eq("id", id).select("*").single();
  if (error) { alert("เปลี่ยนสถานะไม่สำเร็จ: " + error.message); return; }
  Object.assign(member, data);
  renderManualMemberManagement();
  await loadMembers();
}

async function updateLinkedGuildMemberStatus(userId) {
  if (!isManagement()) return;
  const member = allMembers.find(item => item.user_id === userId);
  if (!member) return;
  const { data, error } = await supabaseClient.from("guild_members")
    .update({ active: !member.active })
    .eq("user_id", userId).select("*").single();
  if (error) { alert("เปลี่ยนสถานะไม่สำเร็จ: " + error.message); return; }
  Object.assign(member, data);
  if (currentMember?.user_id === userId) Object.assign(currentMember, data);
  renderManualMemberManagement();
  await loadMembers();
}

async function deleteManualGuildMember(id) {
  if (!isManagement()) return;
  const member = manualGuildMembers.find(item => item.id === id);
  if (!member || !confirm(`ยืนยันลบรายชื่อ "${member.character_name}" หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้`)) return;
  const { error } = await supabaseClient.from("guild_manual_members").delete().eq("id", id);
  if (error) { alert("ลบรายชื่อไม่สำเร็จ: " + error.message); return; }
  manualGuildMembers = manualGuildMembers.filter(item => item.id !== id);
  renderManualMemberManagement();
  await loadMembers();
}

function filterMembers() {
  const search = $("member-search")?.value.trim().toLowerCase() || "";

  const filtered = directoryMembers.filter((member) => {
    const searchable = [
      getMemberName(member),
      member.nickname,
      member.discord_name,
      member.role,
      member.display_position,
      member.guild_position,
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
  const extended = `
    id, member_id, title, description, game_class, portfolio_type, created_at, updated_at,
    portfolio_images ( id, image_url, cover_image_url, crop_settings, image_type, section_key, caption, created_at, sort_order ),
    portfolio_reviews ( status, reason, reviewer_user_id, reviewed_at )
  `;
  let { data, error } = await supabaseClient.from("portfolios").select(extended).order("created_at", { ascending: false });
  if (error && /cover_image_url|crop_settings|column/i.test(error.message || "")) {
    ({ data, error } = await supabaseClient.from("portfolios").select(`
      id, member_id, title, description, game_class, portfolio_type, created_at, updated_at,
      portfolio_images ( id, image_url, image_type, section_key, caption, created_at, sort_order ),
      portfolio_reviews ( status, reason, reviewer_user_id, reviewed_at )
    `).order("created_at", { ascending: false }));
  }
  if (error) { console.error("Portfolio loading error:", error); allPortfolios = []; renderPortfolios(); return; }
  allPortfolios = (data || []).map((portfolio) => ({
    ...portfolio,
    portfolio_images: (portfolio.portfolio_images || []).sort((a, b) =>
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || new Date(a.created_at) - new Date(b.created_at)
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
  const portfolioType = $("portfolio-type")?.value || "pvp";
  const zones = portfolioType === "cultivation_skills"
    ? [
        { key: "cultivation", label: "คัมภีร์หู่เฉียน", hint: "ภาพข้อมูลและรายละเอียดคัมภีร์หู่เฉียน" },
        { key: "hero_skills", label: "ขั้นสกิลเหล่าผู้กล้า / อัลติ", hint: "ภาพขั้นสกิลและอัลติ" }
      ]
    : [
        { key: "stats", label: "Stats ตัวละคร", hint: "ค่าสถานะและรายละเอียดตัวละคร" },
        { key: "inner_power", label: "กำลังภายใน", hint: "ภาพข้อมูลกำลังภายใน" },
        { key: "affixes", label: "ออฟสร้าง", hint: "ภาพออฟสร้าง" },
        { key: "weapons", label: "ศาสตราวุธ", hint: "อาวุธและรายละเอียดศาสตราวุธ" }
      ];
  const allowedSections = new Set(zones.map(zone => zone.key));
  files.forEach(item => { if (!allowedSections.has(item.sectionKey || "stats")) item.sectionKey = zones[0].key; });
  container.innerHTML = zones.map((zone, zoneIndex) => {
    const items = files.map((item, index) => ({ item, index })).filter(entry => (entry.item.sectionKey || "stats") === zone.key);
    const cards = items.map(({ item, index }) => `
      <article class="portfolio-preview-item" draggable="true" data-index="${index}" data-section-key="${zone.key}">
        <div class="portfolio-preview-image-wrap">
          <img src="${escapeHTML(item.preview)}" alt="${escapeHTML(zone.label)} รูปที่ ${index + 1}">
          <span class="portfolio-preview-number">${index + 1}</span>
          <button type="button" class="portfolio-remove-image" data-remove-index="${index}" aria-label="ลบรูปนี้" title="ลบรูปนี้">−</button>
        </div>
        <div class="portfolio-preview-controls">
          <button type="button" class="portfolio-cover-button ${index === 0 ? "is-cover" : ""}" data-cover-index="${index}">${index === 0 ? "ภาพหน้าปก" : "ตั้งเป็นหน้าปก"}</button>
          ${index === 0 ? '<button type="button" class="portfolio-crop-open" data-crop-index="0">ปรับหน้าปก</button>' : ""}
          <label class="portfolio-image-caption">รายละเอียดรูป
            <input type="text" maxlength="240" data-image-caption-index="${index}" value="${escapeHTML(item.caption || "")}" placeholder="อธิบายรูปนี้...">
          </label>
        </div>
      </article>`).join("");
    return `
      <section class="portfolio-upload-zone portfolio-upload-zone-${zone.key}">
        <header class="portfolio-upload-zone-heading">
          <div><span class="portfolio-upload-zone-index">${String(zoneIndex + 1).padStart(2, "0")}</span><div><h4>${zone.label}</h4><p>${zone.hint}</p></div></div>
          <span class="portfolio-upload-zone-count">${items.length} รูป</span>
        </header>
        <div class="portfolio-upload-zone-grid">
          ${cards}
          <label class="portfolio-upload-add-tile" for="portfolio-image-input-${zone.key}">
            <span class="portfolio-upload-add-icon">＋</span><strong>${zone.key === "affixes" ? "เพิ่มรูปออฟสร้าง" : zone.key === "weapons" ? "เพิ่มรูปศาสตราวุธ" : "เพิ่มรูป"}</strong>
            <small>เลือกได้หลายรูป</small>
          </label>
          <input id="portfolio-image-input-${zone.key}" data-portfolio-section-input="${zone.key}" type="file" accept="image/*" multiple hidden>
        </div>
      </section>`;
  }).join("");
}
let portfolioCropper = null;
let portfolioCropIndex = null;
let portfolioCropSourceUrl = null;
let portfolioMemberCoverMode = false;
let portfolioMemberCoverMemberId = null;
function closePortfolioCropEditor() {
  if (portfolioCropper) { portfolioCropper.destroy(); portfolioCropper = null; }
  if (portfolioCropSourceUrl?.startsWith("blob:")) URL.revokeObjectURL(portfolioCropSourceUrl);
  portfolioCropSourceUrl = null; portfolioCropIndex = null;
  portfolioMemberCoverMode = false; portfolioMemberCoverMemberId = null;
  $("portfolio-crop-title").textContent = "จัดตำแหน่งภาพหน้าปก";
  $("portfolio-crop-save").textContent = "ใช้ภาพนี้เป็นหน้าปก";
  $("portfolio-crop-modal")?.classList.add("hidden");
}
async function openPortfolioCropEditor(index = 0) {
  const item = (window.portfolioDraftFiles || [])[index];
  if (!item) return;
  if (typeof window.Cropper !== "function") { alert("โหลดเครื่องมือ Crop ภาพไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ"); return; }
  closePortfolioCropEditor();
  portfolioCropIndex = index;
  portfolioCropSourceUrl = item.file instanceof File ? URL.createObjectURL(item.file) : await getPortfolioImageUrl(item.path || "");
  if (!portfolioCropSourceUrl) { alert("ไม่สามารถเปิดภาพต้นฉบับได้"); return; }
  const image = $("portfolio-crop-image");
  image.onload = () => {
    portfolioCropper = new Cropper(image, {
      aspectRatio:16/9, viewMode:1, dragMode:"move", autoCropArea:.92, responsive:true,
      restore:false, background:false, guides:true, center:true, cropBoxMovable:true, cropBoxResizable:true,
      toggleDragModeOnDblclick:false,
      ready() { $("portfolio-crop-zoom").value="1"; $("portfolio-crop-zoom-value").textContent="100%"; }
    });
  };
  image.src = portfolioCropSourceUrl;
  $("portfolio-crop-modal")?.classList.remove("hidden");
}
async function openBondProfileEditor() {
  if (!currentUser) { alert("ไม่พบข้อมูลบัญชีที่เข้าสู่ระบบ"); return; }
  const member = allMembers.find(item => item.user_id === currentUser.id);
  if (!member) { alert("ไม่พบข้อมูลสมาชิกของบัญชีนี้"); return; }

  // Show the editor immediately. Resolving a remote cover URL must not block opening the modal.
  const modal = $("bond-profile-modal");
  const namesField = $("bond-profile-names");
  const image = $("bond-profile-current-cover");
  if (namesField) namesField.value = Array.isArray(member.bond_names) ? member.bond_names.join("\n") : "";
  if (image) image.src = DEFAULT_AVATAR;
  modal?.classList.remove("hidden");

  try {
    const cover = member.member_cover_url
      ? await resolveAvatarUrl({...member, avatar_url:member.member_cover_url})
      : await resolveAvatarUrl(member);
    if (image && modal && !modal.classList.contains("hidden")) image.src = cover || DEFAULT_AVATAR;
  } catch (error) {
    console.warn("Bond profile cover preview could not be loaded:", error);
    if (image) image.src = DEFAULT_AVATAR;
  }
}
function closeBondProfileEditor() { $("bond-profile-modal")?.classList.add("hidden"); }
async function saveBondProfile(event) {
  event.preventDefault();
  const button = $("bond-profile-save");
  const names = ($("bond-profile-names")?.value || "").split(/[\n,;]+/).map(name => name.trim()).filter(Boolean);
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length > 40) { alert("กรอกรายชื่อได้สูงสุด 40 คน"); return; }
  button.disabled = true; button.textContent = "กำลังบันทึก...";
  try {
    const { error } = await supabaseClient.from("guild_members").update({ bond_names: uniqueNames }).eq("user_id", currentUser.id);
    if (error) throw error;
    allMembers = allMembers.map(member => member.user_id === currentUser.id ? {...member, bond_names: uniqueNames} : member);
    if (currentMember?.user_id === currentUser.id) currentMember.bond_names = uniqueNames;
    closeBondProfileEditor();
    await renderPortfolioMemberDirectory();
  } catch (error) {
    console.error("Bond profile save error:", error);
    alert("บันทึกรายชื่อสายใยผูกพันธ์ไม่สำเร็จ: " + (error.message || "Unknown error"));
  } finally { button.disabled = false; button.textContent = "บันทึกโปรไฟล์"; }
}
function openPortfolioMemberCoverPicker() {
  if(!currentUser||!allMembers.some(m=>m.user_id===currentUser.id)){alert("ไม่พบข้อมูลสมาชิกของบัญชีนี้");return;}
  const input=$("portfolio-member-cover-input");
  if(input)input.click();
}
async function openPortfolioMemberCoverCrop(file) {
  if(typeof window.Cropper!=="function"){alert("โหลดเครื่องมือ Crop ภาพไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ");return;}
  closePortfolioCropEditor();
  portfolioMemberCoverMode=true;
  portfolioMemberCoverMemberId=currentUser.id;
  portfolioCropSourceUrl=URL.createObjectURL(file);
  $("portfolio-crop-title").textContent="เปลี่ยนรูปหน้าปกการ์ดสมาชิก";
  $("portfolio-crop-save").textContent="บันทึกรูปหน้าปก";
  const image=$("portfolio-crop-image");
  image.onload=()=>{
    portfolioCropper=new Cropper(image,{
      aspectRatio:16/9,viewMode:1,dragMode:"move",autoCropArea:.92,responsive:true,
      restore:false,background:false,guides:true,center:true,cropBoxMovable:true,cropBoxResizable:true,
      toggleDragModeOnDblclick:false,
      ready(){
        const zoom=$("portfolio-crop-zoom");
        if(zoom)zoom.value="1";
        const zoomValue=$("portfolio-crop-zoom-value");
        if(zoomValue)zoomValue.textContent="100%";
      }
    });
  };
  // The crop dialog is a global overlay outside the portfolio page; explicitly reveal it.
  $("portfolio-crop-modal")?.classList.remove("hidden");
  image.src=portfolioCropSourceUrl;
}

async function savePortfolioCrop() {
  if (!portfolioCropper) return;
  if (portfolioMemberCoverMode) {
    const button=$("portfolio-crop-save"); button.disabled=true; button.textContent="กำลังบันทึก...";
    try {
      if (!currentUser || portfolioMemberCoverMemberId !== currentUser.id) throw new Error("คุณแก้ไขรูปหน้าปกได้เฉพาะการ์ดของตัวเอง");
      const canvas=portfolioCropper.getCroppedCanvas({width:1600,height:900,minWidth:800,minHeight:450,imageSmoothingEnabled:true,imageSmoothingQuality:"high",fillColor:"#090909"});
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error("ไม่สามารถสร้างภาพหน้าปกได้")),"image/webp",.9));
      const path=`${currentUser.id}/portfolio-cover-${Date.now()}.webp`;
      const {error:uploadError}=await supabaseClient.storage.from(AVATAR_BUCKET).upload(path,blob,{cacheControl:"3600",upsert:false,contentType:"image/webp"});
      if(uploadError)throw uploadError;
      const oldPath=allMembers.find(m=>m.user_id===currentUser.id)?.member_cover_url||null;
      const cropSettings=portfolioCropper.getData(true);
      const {error:updateError}=await supabaseClient.from("guild_members").update({member_cover_url:path,member_cover_crop_settings:cropSettings}).eq("user_id",currentUser.id);
      if(updateError){await supabaseClient.storage.from(AVATAR_BUCKET).remove([path]);throw updateError;}
      allMembers=allMembers.map(m=>m.user_id===currentUser.id?{...m,member_cover_url:path,member_cover_crop_settings:cropSettings}:m);
      if(currentMember?.user_id===currentUser.id){currentMember.member_cover_url=path;currentMember.member_cover_crop_settings=cropSettings;}
       const bondCoverPreview=$("bond-profile-current-cover");
       if(bondCoverPreview)bondCoverPreview.src=await resolveAvatarUrl({...allMembers.find(m=>m.user_id===currentUser.id),avatar_url:path});
      if(oldPath&&!/^https?:\/\//i.test(oldPath))await supabaseClient.storage.from(AVATAR_BUCKET).remove([oldPath]);
      closePortfolioCropEditor();
      await renderPortfolioMemberDirectory();
    } catch(error) { console.error("Member cover save error:",error); alert("บันทึกรูปหน้าปกไม่สำเร็จ: "+(error.message||"Unknown error")); }
    finally { button.disabled=false;button.textContent="ใช้ภาพนี้เป็นหน้าปก"; }
    return;
  }
  if (portfolioCropIndex === null) return;
  const button=$("portfolio-crop-save"); button.disabled=true; button.textContent="กำลังประมวลผล...";
  try {
    const canvas=portfolioCropper.getCroppedCanvas({width:1600,height:900,minWidth:800,minHeight:450,imageSmoothingEnabled:true,imageSmoothingQuality:"high",fillColor:"#090909"});
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error("ไม่สามารถสร้างภาพหน้าปกได้")),"image/webp",.9));
    const files=[...(window.portfolioDraftFiles||[])],item=files[portfolioCropIndex];
    if(!item)return;
    if(item.coverPreview?.startsWith("blob:"))URL.revokeObjectURL(item.coverPreview);
    item.cropBlob=blob; item.cropSettings=portfolioCropper.getData(true);
    item.coverPreview=URL.createObjectURL(blob); item.preview=item.coverPreview;
    window.portfolioDraftFiles=files; closePortfolioCropEditor(); renderPortfolioSelectedFiles();
  } catch(error) { alert(error.message||"จัดเตรียมภาพหน้าปกไม่สำเร็จ"); }
  finally { button.disabled=false; button.textContent="ใช้ภาพนี้เป็นหน้าปก"; }
}

function resetPortfolioForm() {
  const form = $("portfolio-create-form");
  if (form) form.reset();
  (window.portfolioDraftFiles || []).forEach((item) => {
    if (item.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview);
    if (item.coverPreview?.startsWith("blob:") && item.coverPreview !== item.preview) URL.revokeObjectURL(item.coverPreview);
  });
  window.portfolioDraftFiles = [];
  $("portfolio-type-step")?.classList.remove("hidden");
  $("portfolio-create-form")?.classList.add("hidden");
  $("portfolio-type").value = "pvp";
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

async function renderPortfolioMemberDirectory() {
  const container=$("portfolio-member-grid"); if(!container)return;
  const search=String($("portfolio-member-search")?.value||"").trim().toLowerCase();
  const members=(allMembers||[]).filter(m=>m.active!==false)
    .filter(m=>portfolioClassFilter==="all"||getMemberClass(m).toLowerCase()===portfolioClassFilter.toLowerCase())
    .filter(m=>!search||[getMemberName(m),m.nickname,m.discord_name,getMemberClass(m)].filter(Boolean).join(" ").toLowerCase().includes(search))
    .sort((a,b)=>getMemberName(a).localeCompare(getMemberName(b),"th"));
  if(!members.length){showEmpty(container,"ไม่พบสมาชิก","ลองค้นหาด้วยชื่อตัวละคร ชื่อเล่น หรือคลาสอาชีพ");return;}
  const cards=await Promise.all(members.map(async m=>{
    const ps=allPortfolios.filter(p=>p.member_id===m.user_id);
    const cn=getMemberClass(m),ci=getClassInfo(cn),color=ci?.color||"#aaa";
    let src=m.member_cover_url?await resolveAvatarUrl({...m,avatar_url:m.member_cover_url}):"";
    if(!src)src=await resolveAvatarUrl(m)||DEFAULT_AVATAR;
    const bondNames = Array.isArray(m.bond_names) ? m.bond_names : [];
    return `<article class="portfolio-member-card" style="--class-color:${color}">
      <button type="button" class="portfolio-member-open" data-portfolio-member-id="${escapeHTML(m.user_id)}">
        <div class="portfolio-member-cover"><img src="${escapeHTML(src)}" alt="รูปหน้าปก ${escapeHTML(getMemberName(m))}" loading="lazy"><span class="portfolio-member-count">${ps.length} แฟ้ม</span></div>
        <div class="portfolio-member-card-content"><div class="portfolio-member-class">${ci?.iconPath?`<img src="${escapeHTML(ci.iconPath)}" alt="">`:""}<span>${escapeHTML(cn||"ยังไม่ระบุคลาส")}</span></div>
        <h3>${escapeHTML(getMemberName(m))}</h3>
        <div class="portfolio-member-bonds"><strong>สายใยผูกพันธ์</strong><span>${bondNames.length ? escapeHTML(bondNames.join(" · ")) : "ยังไม่ได้ระบุรายชื่อ"}</span></div>
        <span class="portfolio-member-open-label">${m.user_id===currentUser?.id?"แฟ้มผลงานของคุณ":"ดูแฟ้มผลงาน"} <span>↗</span></span></div>
      </button>
      ${m.user_id===currentUser?.id?'<button type="button" class="portfolio-member-cover-edit" data-bond-profile-edit="true" aria-label="แก้ไข Bond Profile" title="แก้ไข Bond Profile">✎</button>':""}
    </article>`;
  }));
  container.innerHTML=cards.join("");
  // Bind the pencil directly after rendering so its action never depends on a parent-grid delegate.
  container.querySelectorAll("[data-bond-profile-edit]").forEach(button=>{
    button.addEventListener("click",event=>{
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void openBondProfileEditor();
    });
  });
}

async function renderPortfolios() {
  const container = $("portfolio-grid");
  if (!container) return;
  const directory=$("portfolio-member-directory"),detail=$("portfolio-member-detail");
  if(!currentPortfolioMemberId){directory?.classList.remove("hidden");detail?.classList.add("hidden");await renderPortfolioMemberDirectory();return;}
  const selectedMember=allMembers.find(m=>m.user_id===currentPortfolioMemberId);
  if(!selectedMember){currentPortfolioMemberId=null;await renderPortfolios();return;}
  directory?.classList.add("hidden");detail?.classList.remove("hidden");
  const memberClass=getMemberClass(selectedMember),memberClassInfo=getClassInfo(memberClass);
  if($("portfolio-member-detail-name"))$("portfolio-member-detail-name").textContent=getMemberName(selectedMember);
  if($("portfolio-member-detail-subtitle"))$("portfolio-member-detail-subtitle").textContent=selectedMember.user_id===currentUser?.id?"จัดการและแบ่งปันแฟ้มผลงานตัวละครของคุณ":"แฟ้มผลงานและ Build ที่สมาชิกคนนี้แบ่งปัน";
  if($("portfolio-member-detail-class")){$("portfolio-member-detail-class").textContent=memberClass||"ยังไม่ระบุคลาส";$("portfolio-member-detail-class").style.setProperty("--class-color",memberClassInfo?.color||"#aaa");}
  const ownCollection=selectedMember.user_id===currentUser?.id,canManage=ownCollection||isPortfolioReviewer();
  $("portfolio-create-section")?.classList.toggle("hidden",!ownCollection);
  $("portfolio-manage-button")?.classList.toggle("hidden",!canManage);
  const manageButton=$("portfolio-manage-button");if(manageButton){manageButton.textContent=portfolioManageMode?"เสร็จสิ้น":"จัดการแฟ้ม";manageButton.classList.toggle("is-active",portfolioManageMode);manageButton.setAttribute("aria-pressed",String(portfolioManageMode));}

  const memberPortfolios=allPortfolios.filter(portfolio=>portfolio.member_id===currentPortfolioMemberId);
  if (!memberPortfolios.length) {
    showEmpty(container, "ยังไม่มีแฟ้มผลงาน", ownCollection ? "กด ADD NEW PORTFOLIO เพื่อสร้างแฟ้มแรกของคุณ" : "สมาชิกคนนี้ยังไม่ได้เพิ่มแฟ้มผลงาน");
    return;
  }
  const visiblePortfolios=portfolioClassFilter==="all"?memberPortfolios:memberPortfolios.filter(portfolio=>getPortfolioClasses(portfolio.game_class).some(name=>name.toLowerCase()===portfolioClassFilter.toLowerCase()));
  if (!visiblePortfolios.length) {
    showEmpty(container, "No Portfolio Found", `ยังไม่มีแฟ้มผลงานของคลาส ${portfolioClassFilter}`);
    return;
  }

  const reviewer = isPortfolioReviewer();
  const cards = await Promise.all(visiblePortfolios.map(async (portfolio) => {
    const images = portfolio.portfolio_images || [];
    const firstImage = images[0];
    const imageUrl = firstImage ? await getPortfolioImageUrl(firstImage.cover_image_url || firstImage.image_url) : "";
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
      return `<span class="portfolio-card-tag portfolio-card-class" ${info ? `style="--class-color:${info.color}"` : ""}>
        ${info?.iconPath ? `<img class="portfolio-card-class-icon" src="${escapeHTML(info.iconPath)}" alt="" loading="lazy">` : ""}
        <span>${escapeHTML(className)}</span>
      </span>`;
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
      <article class="portfolio-card ${portfolioManageMode && (isOwner || reviewer) ? "is-jiggling" : ""}" ${color ? `style="--class-color:${color}"` : ""}>
        ${imageUrl ? `<img class="portfolio-card-image" src="${escapeHTML(imageUrl)}" alt="${escapeHTML(portfolio.title)}" loading="lazy">` : '<div class="portfolio-card-no-image">4AM GUILD</div>'}
        ${isOwner || (portfolioManageMode && reviewer) ? `<button type="button" class="portfolio-iphone-delete" data-portfolio-action="delete" data-portfolio-id="${escapeHTML(portfolio.id)}" aria-label="ลบแฟ้มผลงาน" title="ลบแฟ้มผลงาน">−</button>` : ""}
        <div class="portfolio-card-content">
          <div class="portfolio-card-owner">${escapeHTML(ownerName)}</div>
          <span class="portfolio-type-chip">${portfolio.portfolio_type === "cultivation_skills" ? "คัมภีร์หู่เฉียน / ขั้นสกิล" : portfolio.portfolio_type === "pve" ? "PvE Build" : "PvP Build"}</span>
          <div class="portfolio-card-tags">${classTags || '<span class="portfolio-card-tag">Unassigned</span>'}</div>
          <h3>${escapeHTML(portfolio.portfolio_type === "cultivation_skills" ? (portfolio.title || "Untitled") : (/^build\b/i.test(portfolio.title||"")?(portfolio.title||"Untitled"):"Build "+(portfolio.title||"Untitled")))}</h3>
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

async function uploadPortfolioImage(file, portfolioId, caption="", sortOrder=0, coverBlob=null, cropSettings=null, sectionKey="stats") {
  if(!currentUser)throw new Error("กรุณาเข้าสู่ระบบก่อน");
  if(!file||!file.type.startsWith("image/"))throw new Error("กรุณาเลือกรูปภาพ");
  const ext=(file.name.split(".").pop()||"jpg").toLowerCase(),safe=/^[a-z0-9]+$/.test(ext)?ext:"jpg";
  const base=`${currentUser.id}/${portfolioId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const originalPath=`${base}.${safe}`,coverPath=coverBlob?`${base}-cover.webp`:null,storage=supabaseClient.storage.from(PORTFOLIO_BUCKET);
  const {error:originalError}=await storage.upload(originalPath,file,{cacheControl:"3600",upsert:false,contentType:file.type});
  if(originalError)throw originalError;
  if(coverBlob){const {error}=await storage.upload(coverPath,coverBlob,{cacheControl:"31536000",upsert:false,contentType:"image/webp"});if(error){await storage.remove([originalPath]);throw error;}}
  const {data,error:insertError}=await supabaseClient.from("portfolio_images").insert({
    portfolio_id:portfolioId,image_url:originalPath,cover_image_url:coverPath,crop_settings:cropSettings,
    image_type:"other",section_key:sectionKey,caption,sort_order:sortOrder
  }).select("id").single();
  if(insertError){await storage.remove([originalPath,...(coverPath?[coverPath]:[])]);throw insertError;}
  return data;
}

async function createPortfolio({ title, description = "", gameClasses = [], portfolioType = "pvp" }) {
  if (!currentUser || !currentMember) throw new Error("ไม่พบข้อมูลสมาชิก");
  const selectedClasses = gameClasses.length ? gameClasses : [getMemberClass(currentMember)];
  const { data, error } = await supabaseClient
    .from("portfolios")
    .insert({
      member_id: currentMember.user_id,
      title,
      description,
      game_class: selectedClasses.join(", "),
      portfolio_type: portfolioType
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
  const portfolioType = $("portfolio-type")?.value || "pvp";
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
  if (!files[0].existing && !files[0].cropBlob) {
    if (status) status.textContent = "กรุณาจัดตำแหน่งและ Crop ภาพหน้าปกก่อนบันทึก";
    await openPortfolioCropEditor(0);
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
        .update({ title, description, game_class: selectedClasses.join(", "), portfolio_type: portfolioType }).eq("id", editingId);
      if (updateError) throw updateError;

      const keptIds = new Set(files.filter((item) => item.existing).map((item) => item.imageId));
      const removedImages = (window.portfolioOriginalImages || []).filter((item) => !keptIds.has(item.id));
      const removedPaths = removedImages.flatMap((item) => [item.path, item.coverPath]).filter((path) => path && !/^https?:\/\//i.test(path));
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
          const updatePayload = { sort_order:index, section_key:item.sectionKey||"stats", caption:item.caption||"" };
          if(index===0 && item.cropBlob){
            const coverPath=`${currentUser.id}/${editingId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-cover.webp`;
            const {error:coverError}=await supabaseClient.storage.from(PORTFOLIO_BUCKET).upload(coverPath,item.cropBlob,{cacheControl:"31536000",upsert:false,contentType:"image/webp"});
            if(coverError)throw coverError;
            updatePayload.cover_image_url=coverPath; updatePayload.crop_settings=item.cropSettings||null;
            if(item.coverPath && item.coverPath!==item.path && !/^https?:\/\//i.test(item.coverPath)){const {error:removeError}=await supabaseClient.storage.from(PORTFOLIO_BUCKET).remove([item.coverPath]);if(removeError)throw removeError;}
          }
          const {error}=await supabaseClient.from("portfolio_images").update(updatePayload).eq("id",item.imageId);
          if(error)throw error;
        } else {
          await uploadPortfolioImage(item.file, editingId, item.caption||"", index, index===0?item.cropBlob:null, index===0?item.cropSettings:null, item.sectionKey||"stats");
        }
        if (status) status.textContent = `กำลังบันทึกรูปภาพ ${index + 1}/${files.length}...`;
      }
    } else {
      createdPortfolio = await createPortfolio({ title, description, gameClasses: selectedClasses, portfolioType });
      for (let index = 0; index < files.length; index++) {
        await uploadPortfolioImage(files[index].file, createdPortfolio.id, files[index].caption||"", index, index===0?files[index].cropBlob:null, index===0?files[index].cropSettings:null, files[index].sectionKey||"stats");
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
  window.portfolioOriginalImages = (portfolio.portfolio_images || []).map((image) => ({ id:image.id,path:image.image_url,coverPath:image.cover_image_url||null }));
  $("portfolio-title").value = portfolio.title || "";
  $("portfolio-description").value = portfolio.description || "";
  $("portfolio-type").value = portfolio.portfolio_type || "pvp";
  document.querySelectorAll("[data-portfolio-type]").forEach(button => button.classList.toggle("is-selected", button.dataset.portfolioType === $("portfolio-type").value));
  $("portfolio-type-step")?.classList.add("hidden");
  $("portfolio-create-form")?.classList.remove("hidden");
  $("portfolio-title-label").textContent = $("portfolio-type").value === "cultivation_skills" ? "ชื่อแฟ้มคัมภีร์ / ขั้นสกิล" : "ชื่อ Build";
  renderPortfolioClassChoices();
  const selected = new Set(getPortfolioClasses(portfolio.game_class));
  document.querySelectorAll(".portfolio-class-tag").forEach((button) => {
    const active = selected.has(button.dataset.class);
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const imageItems = await Promise.all((portfolio.portfolio_images || []).map(async (image) => ({
    file:null,preview:await getPortfolioImageUrl(image.cover_image_url||image.image_url),existing:true,sectionKey:image.section_key||"stats",caption:image.caption||"",
    imageId:image.id,path:image.image_url,coverPath:image.cover_image_url||null,cropSettings:image.crop_settings||null,cropBlob:null
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
  const portfolio = allPortfolios.find((item) => item.id === portfolioId);
  if (!portfolio) return;
  if (portfolio.member_id !== currentUser?.id && !isPortfolioReviewer()) { alert("คุณลบได้เฉพาะแฟ้มผลงานของตัวเองเท่านั้น"); return; }
  try {
    const paths = (portfolio.portfolio_images || []).flatMap(image=>[image.image_url,image.cover_image_url])
      .filter(path=>path&&!/^https?:\/\//i.test(path));
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
    // Owner delete control is always visible on their own card; reviewers still use manage mode.
    if (portfolio.member_id !== currentUser?.id && (!portfolioManageMode || !isPortfolioReviewer())) return;
    // Use an in-page two-click confirmation instead of window.confirm(),
    // which may be suppressed by some browser/event-handler contexts.
    if (button.dataset.confirmDelete !== "true") {
      button.dataset.confirmDelete = "true";
      button.classList.add("is-confirming");
      button.textContent = "−";
      button.setAttribute("aria-label", "ยืนยันลบแฟ้มผลงาน กดอีกครั้ง");
      button.title = "กดอีกครั้งเพื่อยืนยันการลบ";
      return;
    }
    button.disabled = true;
    button.textContent = "−";
    button.title = "กำลังลบแฟ้มผลงาน...";
    await deletePortfolio(portfolioId);
  }
}

function registerPortfolioEvents() {
  window.portfolioDraftFiles = [];
  $("portfolio-member-search")?.addEventListener("input",()=>{void renderPortfolioMemberDirectory();});
  // Pencil controls are bound directly after each directory render.
  $("portfolio-member-grid")?.addEventListener("click",async event=>{
    if(event.target instanceof Element && event.target.closest("[data-bond-profile-edit]"))return;
    const button=event.target instanceof Element ? event.target.closest("[data-portfolio-member-id]") : null;
    if(!button)return;
    currentPortfolioMemberId=button.dataset.portfolioMemberId;portfolioClassFilter="all";portfolioManageMode=false;await renderPortfolios();
  });
  $("portfolio-back-to-members")?.addEventListener("click",async()=>{
    currentPortfolioMemberId=null;portfolioManageMode=false;portfolioClassFilter="all";resetPortfolioForm();
    $("portfolio-create-panel")?.classList.add("hidden");$("portfolio-add-button")?.setAttribute("aria-expanded","false");await renderPortfolios();
  });
  $("portfolio-manage-button")?.addEventListener("click",()=>{portfolioManageMode=!portfolioManageMode;void renderPortfolios();});

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
    const panel = $("portfolio-create-panel");
    const opening = panel?.classList.contains("hidden");
    panel?.classList.toggle("hidden");
    $("portfolio-add-button").setAttribute("aria-expanded", String(!!opening));
    if (opening) {
      $("portfolio-type-step")?.classList.remove("hidden");
      $("portfolio-create-form")?.classList.add("hidden");
    }
  });
  $("portfolio-type-choices")?.addEventListener("click", event => {
    const choice = event.target.closest("[data-portfolio-type]");
    if (!choice) return;
    $("portfolio-type").value = choice.dataset.portfolioType;
    document.querySelectorAll("[data-portfolio-type]").forEach(button => button.classList.toggle("is-selected", button === choice));
    $("portfolio-type-step")?.classList.add("hidden");
    $("portfolio-create-form")?.classList.remove("hidden");
    const isSpecial = choice.dataset.portfolioType === "cultivation_skills";
    $("portfolio-title-label").textContent = isSpecial ? "ชื่อแฟ้มคัมภีร์ / ขั้นสกิล" : "ชื่อ Build";
    $("portfolio-form-heading")?.querySelector("h3")?.replaceChildren(document.createTextNode(isSpecial ? "สร้างแฟ้มคัมภีร์หู่เฉียน / ขั้นสกิล" : choice.dataset.portfolioType === "pve" ? "สร้างแฟ้ม PvE Build" : "สร้างแฟ้ม PvP Build"));
    renderPortfolioSelectedFiles();
  });

  $("portfolio-create-form")?.addEventListener("submit", handlePortfolioCreate);
  $("portfolio-type-back")?.addEventListener("click", () => {
    $("portfolio-create-form")?.classList.add("hidden");
    $("portfolio-type-step")?.classList.remove("hidden");
  });
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

  $("bond-profile-cancel")?.addEventListener("click",closeBondProfileEditor);
  $("bond-profile-close")?.addEventListener("click",closeBondProfileEditor);
  $("bond-profile-form")?.addEventListener("submit", saveBondProfile);
  $("bond-profile-cover-button")?.addEventListener("click", openPortfolioMemberCoverPicker);
  $("portfolio-member-cover-input")?.addEventListener("change",event=>{
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    if(!file.type.startsWith("image/")){alert("กรุณาเลือกไฟล์รูปภาพ");return;}
    if(file.size>12*1024*1024){alert("รูปภาพต้องมีขนาดไม่เกิน 12 MB");return;}
    void openPortfolioMemberCoverCrop(file);
  });
  $("portfolio-crop-close")?.addEventListener("click",closePortfolioCropEditor);
  $("portfolio-crop-cancel")?.addEventListener("click",closePortfolioCropEditor);
  $("portfolio-crop-save")?.addEventListener("click",()=>{void savePortfolioCrop();});
  $("portfolio-crop-rotate-left")?.addEventListener("click",()=>portfolioCropper?.rotate(-90));
  $("portfolio-crop-rotate-right")?.addEventListener("click",()=>portfolioCropper?.rotate(90));
  $("portfolio-crop-reset")?.addEventListener("click",()=>{portfolioCropper?.reset();$("portfolio-crop-zoom").value="1";$("portfolio-crop-zoom-value").textContent="100%";});
  $("portfolio-crop-zoom")?.addEventListener("input",event=>{const v=Number(event.target.value);portfolioCropper?.zoomTo(v);$("portfolio-crop-zoom-value").textContent=`${Math.round(v*100)}%`;});
  $("portfolio-crop-modal")?.addEventListener("click",event=>{if(event.target.id==="portfolio-crop-modal")closePortfolioCropEditor();});

  $("portfolio-image-preview")?.addEventListener("change", event => {
    const input = event.target.closest("[data-portfolio-section-input]");
    if (!input) return;
    const chosen = [...(input.files || [])], sectionKey = input.dataset.portfolioSectionInput;
    const existing = window.portfolioDraftFiles || [];
    window.portfolioDraftFiles = [...existing, ...chosen.map(file => ({file,preview:URL.createObjectURL(file),existing:false,sectionKey,caption:"",cropBlob:null,cropSettings:null}))];
    renderPortfolioSelectedFiles(); input.value = "";
  });
  $("portfolio-image-preview")?.addEventListener("input",event=>{
    const field=event.target.closest("[data-image-caption-index]");if(!field)return;
    const item=(window.portfolioDraftFiles||[])[Number(field.dataset.imageCaptionIndex)];if(item)item.caption=field.value;
  });
  $("portfolio-image-preview")?.addEventListener("click", (event) => {
    const crop = event.target.closest("[data-crop-index]");
    const cover = event.target.closest("[data-cover-index]");
    const remove = event.target.closest("[data-remove-index]");
    if(crop){void openPortfolioCropEditor(Number(crop.dataset.cropIndex));return;}
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
  await loadWarSkillData();
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
    const partyCount=config.raidCount*5,memberCapacity=config.raidCount*30;
    const eventDetail=config.mode==="practice"
      ? `ซ้อมวอร์ ${formatDate(event.event_date)} · ${formatTime(event.start_time)} น. · ${config.raidCount} Raid · ${partyCount} ปาร์ตี้ · รองรับ ${memberCapacity} คน`
      : `วอร์จริงวันเสาร์ ${formatDate(event.event_date)} · ${config.rounds?.length||1} รอบ (${(config.rounds?.length?config.rounds:[formatTime(event.start_time)]).join(" / ")}) น. · ${config.raidCount} Raid · ${partyCount} ปาร์ตี้ · รองรับ ${memberCapacity} คน`;
    return `<article class="war-event-card war-event-card-selectable"><div class="war-event-main"><h3>${escapeHTML(event.event_name)}</h3><p>${eventDetail}</p>${description?`<small>${escapeHTML(description)}</small>`:""}</div><div class="war-event-actions"><span class="war-stage-badge war-stage-${stage}">${label}</span><button class="btn btn-outline btn-sm" type="button" data-war-open="${escapeHTML(event.id)}">${stage==="published"?"ดูรายละเอียด":"จัดการตี้"}</button><button class="btn btn-danger btn-sm" type="button" data-war-delete="${escapeHTML(event.id)}">ลบวอร์</button></div></article>`;
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
    return { mode: config.mode === "practice" ? "practice" : "official", raidCount, rounds:Array.isArray(config.rounds)?config.rounds:[] };
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
  warArrangeMode=false;warAssignmentFilter="all";warAssignmentClassFilter="all";warAssignmentSearch="";warAssignmentSignups=[];warAssignmentLeaves=[];warAssignmentAbsentees=[];warAssignmentRosterSnapshot=[];closeWarAssignmentModal();
  stage?.classList.remove("hidden");
  if(summary)summary.innerHTML=`
    <article class="stat-card stat-card-sm"><div class="stat-icon"><svg class="icon"><use href="#i-swords"/></svg></div><div class="stat-info"><span class="stat-label">TOTAL CAPACITY</span><div class="stat-value"><strong>${config.raidCount*30}</strong></div><small>${config.mode==="practice"?"Practice War":"Official War"}</small></div></article>
    <article class="stat-card stat-card-sm"><div class="stat-icon letter">${config.raidCount}</div><div class="stat-info"><span class="stat-label">TOTAL RAIDS</span><div class="stat-value"><strong>${config.raidCount}</strong></div><small>5 Parties · 6 Players each</small></div></article>
    <article class="stat-card stat-card-sm"><div class="stat-icon letter">⚔</div><div class="stat-info"><span class="stat-label">WAR EVENT</span><div class="stat-value war-summary-name"><strong>${escapeHTML(event.event_name)}</strong></div><small>${formatDate(event.event_date)} · ${formatTime(event.start_time)}</small></div></article>`;
  const confirmed=Boolean(event.is_draft_confirmed),published=Boolean(event.is_published);
  $("war-confirm-draft")?.classList.toggle("hidden",!isManagement()||confirmed||published);
  const publishButton=$("war-publish-event");
  publishButton?.classList.toggle("hidden",!isManagement()||!confirmed);
  if(publishButton)publishButton.textContent=published?"Publish อัปเดตรายชื่อ":"Publish";
  $("war-export-image")?.classList.toggle("hidden",!confirmed);
  const sync=$("war-sync-discord");sync?.classList.toggle("hidden",!confirmed);if(sync){sync.disabled=true;sync.title="Discord Bot integration ยังไม่เปิดใช้งาน";}
  const label=$("war-detail-stage-label");if(label)label.textContent=published?"PUBLISHED · สมาชิกมองเห็นแล้ว":confirmed?"DRAFT · ยืนยันรายชื่อแล้ว":"กำลังจัดตี้ · ยังไม่ยืนยัน";
  const notice=$("war-edit-notice");if(notice)notice.textContent=published?"วอร์นี้เผยแพร่แล้ว · ฝ่ายบริหารยังสามารถแก้ไขและบันทึกการจัดตี้ได้":"เลือก + ADD เพื่อจัดสมาชิกผ่านหน้าต่าง Party Management";
  if(boards)boards.innerHTML=letters.map((letter,index)=>`<div class="raid-section" data-raid-section="${letter}"><div class="raid-title"><span class="raid-badge raid-${letter.toLowerCase()}">${letter}</span><div><h2>Raid ${letter}</h2><p>${config.mode==="practice"?"Practice battle formation":"Official battle formation"}</p></div></div><div id="raid-${letter.toLowerCase()}" class="raid-grid"></div></div>`).join("");
  renderWarAssignmentToolbar(config.raidCount);loadSelectedWarEvent(event.id);
}

async function loadSelectedWarEvent(eventId){
 currentWarAssignmentEventId=eventId;
 const event=allWarEvents.find(item=>item.id===eventId);
 const isSignupClosed=Boolean(event?.signup_closes_at)&&Date.now()>=new Date(event.signup_closes_at).getTime();
 const [p,s,l,snapshot,attendance]=await Promise.all([
  supabaseClient.from("war_parties").select(`id,event_id,raid,party_number,party_name,war_party_members(id,member_id,position)`).eq("event_id",eventId).order("party_number",{ascending:true}),
  supabaseClient.from("war_signups").select("id,event_id,member_id,raid,status,queue_position").eq("event_id",eventId).neq("status","cancelled"),
  supabaseClient.from("war_leave_requests").select("id,event_id,member_id,status").eq("event_id",eventId),
  isSignupClosed?supabaseClient.rpc("capture_war_event_roster_snapshot",{p_event_id:eventId}):Promise.resolve({data:[],error:null}),
  Promise.resolve({data:[],error:null})
 ]);
 if(p.error){console.error("War party loading error:",p.error);currentWarParties=[];currentWarPartyAssignments=[];alert("โหลดรายชื่อปาร์ตี้ไม่สำเร็จ: "+p.error.message);return;}
 if(snapshot.error)console.error("War roster snapshot error:",snapshot.error);
 currentWarParties=p.data||[];warAssignmentSignups=s.error?[]:(s.data||[]);warAssignmentLeaves=l.error?[]:(l.data||[]);
 warAssignmentRosterSnapshot=snapshot.error?[]:(snapshot.data||[]);
 warAssignmentAbsentees=warAssignmentRosterSnapshot.filter(x=>x.roster_status==="absent").map(x=>x.member_id);
 currentWarPartyAssignments=currentWarParties.flatMap(party=>(party.war_party_members||[]).map(member=>({...member,party_id:party.id,raid:party.raid,party_number:party.party_number})));
 renderWarAssignmentToolbar(getWarEventConfig(event).raidCount);renderAllWarParties();
}
function renderAllWarParties(){
 const event=allWarEvents.find(item=>item.id===currentWarAssignmentEventId);if(!event)return;
 const config=getWarEventConfig(event),editable=isManagement();
 ["A","B","C","D"].slice(0,config.raidCount).forEach(letter=>{
  renderRaid(`raid-${letter.toLowerCase()}`,letter,currentWarParties.filter(p=>p.raid===letter),{editable});
  addWarRaidExportButton(letter);
 });
 applyWarAssignmentMemberFilters();
}
function addWarRaidExportButton(raidName){
 const section=document.querySelector(`[data-raid-section="${raidName}"]`);
 const header=section?.querySelector(".raid-title");
 if(!header||header.querySelector(".war-raid-image-button"))return;
 const button=document.createElement("button");
 button.type="button";
 button.className="btn btn-outline btn-sm war-raid-image-button";
 button.textContent="บันทึกเป็นรูปภาพ";
 button.setAttribute("aria-label",`บันทึก Raid ${raidName} เป็นรูปภาพ`);
 button.addEventListener("click",()=>exportWarImage(raidName));
 header.appendChild(button);
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


function getWarSkillIconUrl(path){
 if(!path)return "";
 if(/^https?:\/\//i.test(path))return path;
 return supabaseClient.storage.from(WAR_SKILL_BUCKET).getPublicUrl(path).data?.publicUrl||"";
}
function getMemberSkillIconsMarkup(memberId){
 const skills=warMemberSkillMap.get(memberId)||[];
 return skills.map(skill=>`<img class="war-member-skill-icon" src="${escapeHTML(skill.iconUrl||"")}" alt="${escapeHTML(skill.skill_name)}" title="${escapeHTML(skill.skill_name)}" loading="lazy">`).join("");
}
async function loadWarSkillData(){
 const [catalogResult,memberResult]=await Promise.all([
  supabaseClient.from("war_skill_catalog").select("id,skill_name,icon_path,created_at").order("skill_name"),
  supabaseClient.from("guild_member_skills").select("member_id,skill_id")
 ]);
 if(catalogResult.error||memberResult.error){
  warSkillLoadError=(catalogResult.error||memberResult.error).message||"ไม่สามารถโหลดคลัง Skill ได้";
  console.warn("War Skill data is not ready:",warSkillLoadError);
  warSkillCatalog=[];warMemberSkillMap=new Map();renderWarSkillManager();return;
 }
 warSkillLoadError="";
 warSkillCatalog=(catalogResult.data||[]).map(skill=>({...skill,iconUrl:getWarSkillIconUrl(skill.icon_path)}));
 const byId=new Map(warSkillCatalog.map(skill=>[skill.id,skill]));
 warMemberSkillMap=new Map();
 (memberResult.data||[]).forEach(row=>{
  const skill=byId.get(row.skill_id);if(!skill)return;
  const list=warMemberSkillMap.get(row.member_id)||[];list.push(skill);warMemberSkillMap.set(row.member_id,list);
 });
 renderWarSkillManager();
}
function renderWarSkillManager(){
  const panel=$("war-skill-management"),toggle=$("war-skill-library-toggle"),list=$("war-skill-library-list");
  const manager=isManagement();
  if(toggle)toggle.classList.toggle("hidden",!manager);
  if(panel&&!manager)panel.classList.add("hidden");
  if(!list)return;
  const modeButton=$("war-skill-delete-mode");
  if(modeButton){
    modeButton.textContent=warSkillDeleteMode?"เสร็จสิ้น":"ลบสกิล";
    modeButton.classList.toggle("is-active",warSkillDeleteMode);
    modeButton.setAttribute("aria-pressed",String(warSkillDeleteMode));
  }
  if(warSkillLoadError){list.innerHTML=`<p class="war-skill-error">${escapeHTML(warSkillLoadError)}</p>`;return;}
  if(!warSkillCatalog.length){list.innerHTML='<div class="war-skill-empty"><span>✦</span><strong>ยังไม่มี Skill ในคลัง</strong><p>กด “จัดการสกิล” เพื่อเพิ่ม Skill</p></div>';return;}
  list.innerHTML='<div class="war-skill-library-grid'+(warSkillDeleteMode?' is-delete-mode':'')+'">'+warSkillCatalog.map(skill=>`<article class="war-skill-library-item"><button type="button" class="war-skill-icon-button" data-war-skill-edit="${escapeHTML(skill.id)}" aria-label="แก้ไข ${escapeHTML(skill.skill_name)}" title="${escapeHTML(skill.skill_name)}"><img src="${escapeHTML(skill.iconUrl)}" alt="${escapeHTML(skill.skill_name)}"></button>${warSkillDeleteMode?`<button type="button" class="war-skill-delete-badge" data-war-skill-delete="${escapeHTML(skill.id)}" aria-label="ลบ ${escapeHTML(skill.skill_name)}" title="ลบ Skill">−</button>`:""}</article>`).join("")+'</div>';
 }
async function saveWarSkillDefinition(event){
 event.preventDefault();if(!isManagement())return;
 const name=$("war-skill-name")?.value.trim(),file=$("war-skill-icon")?.files?.[0],status=$("war-skill-form-status"),button=$("war-skill-submit");
 if(!name||!file){if(status)status.textContent="กรุณากรอกชื่อ Skill และเลือกไอคอน";return;}
 if(!file.type.startsWith("image/")||file.size>3*1024*1024){if(status)status.textContent="ไฟล์ต้องเป็นรูปภาพและมีขนาดไม่เกิน 3 MB";return;}
 if(button){button.disabled=true;button.textContent="กำลังเพิ่ม Skill...";}
 if(status)status.textContent="กำลังอัปโหลดไอคอนและบันทึกข้อมูล...";
 const extension=(file.name.split(".").pop()||"png").toLowerCase().replace(/[^a-z0-9]/g,"")||"png";
 const path=`skills/${Date.now()}-${Math.random().toString(36).slice(2,9)}.${extension}`;
 try{
  const upload=await supabaseClient.storage.from(WAR_SKILL_BUCKET).upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
  if(upload.error)throw upload.error;
  const insert=await supabaseClient.from("war_skill_catalog").insert({skill_name:name,icon_path:path,created_by:currentUser?.id}).select("id").single();
  if(insert.error){await supabaseClient.storage.from(WAR_SKILL_BUCKET).remove([path]);throw insert.error;}
  $("war-skill-form")?.reset();
  $("war-skill-form")?.classList.add("hidden");
  $("war-skill-add-toggle")?.setAttribute("aria-expanded","false");
  await loadWarSkillData();
  if(status)status.textContent="เพิ่ม Skill ลงคลังเรียบร้อยแล้ว";
 }catch(error){console.error("Create Skill error:",error);if(status)status.textContent="เพิ่ม Skill ไม่สำเร็จ: "+(error.message||"กรุณาลองใหม่");}
 finally{if(button){button.disabled=false;button.textContent="＋ เพิ่ม Skill เข้าคลัง";}}
}
async function deleteWarSkill(skillId,button){
 if(!isManagement())return;
 const skill=warSkillCatalog.find(item=>item.id===skillId);if(!skill)return;
 if(!confirm(`ลบ Skill "${skill.skill_name}" ออกจากคลังและลบการกำหนด Skill ของสมาชิกที่ใช้อยู่หรือไม่?`))return;
 if(button){button.disabled=true;button.textContent="...";}
 try{
  const result=await supabaseClient.from("war_skill_catalog").delete().eq("id",skillId);
  if(result.error)throw result.error;
  if(skill.icon_path)await supabaseClient.storage.from(WAR_SKILL_BUCKET).remove([skill.icon_path]);
  await loadWarSkillData();
 }catch(error){alert("ลบ Skill ไม่สำเร็จ: "+(error.message||"กรุณาลองใหม่"));if(button){button.disabled=false;button.textContent="ลบ";}}
}
function openWarSkillEditor(skillId){
 if(!isManagement())return;
 const skill=warSkillCatalog.find(item=>item.id===skillId);if(!skill)return;
 document.getElementById("war-skill-edit-modal")?.remove();
 const modal=document.createElement("div");modal.id="war-skill-edit-modal";modal.className="war-assignment-modal";
 modal.innerHTML=`<div class="war-assignment-modal-backdrop" data-war-skill-edit-close></div><section class="war-assignment-modal-panel war-skill-edit-panel" role="dialog" aria-modal="true" aria-labelledby="war-skill-edit-title"><button class="war-modal-close" data-war-skill-edit-close type="button" aria-label="ปิด">×</button><span class="panel-kicker">SKILL LIBRARY</span><h3 id="war-skill-edit-title">แก้ไข Skill</h3><p class="war-skill-edit-description">ปรับชื่อหรือเปลี่ยนไอคอนของ Skill ในคลัง</p><form id="war-skill-edit-form" data-skill-id="${escapeHTML(skill.id)}"><div class="war-skill-edit-field"><label class="war-skill-edit-label" for="war-skill-edit-name">ชื่อ Skill</label><input id="war-skill-edit-name" name="skill-name" type="text" maxlength="80" value="${escapeHTML(skill.skill_name)}" required></div><div class="war-skill-edit-field"><label class="war-skill-edit-label" for="war-skill-edit-icon">เปลี่ยนรูปไอคอน <span>(ไม่บังคับ)</span></label><input id="war-skill-edit-icon" name="skill-icon" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"><small>หากไม่เลือกรูปใหม่ จะใช้ไอคอนเดิม · รองรับไฟล์ไม่เกิน 3 MB</small></div><p id="war-skill-edit-status" class="war-skill-status" role="status"></p><div class="rule-editor-actions"><button type="button" class="btn btn-outline" data-war-skill-edit-close>ยกเลิก</button><button id="war-skill-edit-submit" type="submit" class="btn btn-primary">บันทึกการแก้ไข</button></div></form></section>`;
 document.body.appendChild(modal);$("war-skill-edit-name")?.focus();
}
async function saveWarSkillEdit(event){
 event.preventDefault();if(!isManagement())return;
 const form=event.currentTarget,skillId=form.dataset.skillId,skill=warSkillCatalog.find(item=>item.id===skillId);
 const name=$("war-skill-edit-name")?.value.trim(),file=$("war-skill-edit-icon")?.files?.[0],status=$("war-skill-edit-status"),button=$("war-skill-edit-submit");
 if(!skill||!name){if(status)status.textContent="กรุณากรอกชื่อ Skill";return;}
 if(file&&(!file.type.startsWith("image/")||file.size>3*1024*1024)){if(status)status.textContent="ไฟล์ต้องเป็นรูปภาพและมีขนาดไม่เกิน 3 MB";return;}
 if(button){button.disabled=true;button.textContent="กำลังบันทึก...";}
 let newPath=null;
 try{
  if(file){
   const extension=(file.name.split(".").pop()||"png").toLowerCase().replace(/[^a-z0-9]/g,"")||"png";
   newPath=`skills/${Date.now()}-${Math.random().toString(36).slice(2,9)}.${extension}`;
   const upload=await supabaseClient.storage.from(WAR_SKILL_BUCKET).upload(newPath,file,{cacheControl:"3600",upsert:false,contentType:file.type});
   if(upload.error)throw upload.error;
  }
  const update=await supabaseClient.from("war_skill_catalog").update({skill_name:name,...(newPath?{icon_path:newPath}:{})}).eq("id",skillId);
  if(update.error)throw update.error;
  if(newPath&&skill.icon_path&&!String(skill.icon_path).startsWith("http")){
   const cleanup=await supabaseClient.storage.from(WAR_SKILL_BUCKET).remove([skill.icon_path]);
   if(cleanup.error)console.warn("Old Skill icon cleanup failed:",cleanup.error);
  }
  $("war-skill-edit-modal")?.remove();await loadWarSkillData();
 }catch(error){
  if(newPath)await supabaseClient.storage.from(WAR_SKILL_BUCKET).remove([newPath]);
  console.error("Update Skill error:",error);if(status)status.textContent="แก้ไข Skill ไม่สำเร็จ: "+(error.message||"กรุณาลองใหม่");
  if(button){button.disabled=false;button.textContent="บันทึกการแก้ไข";}
 }
}
function renderWarMemberSkillEditor(member){
 const root=$("war-member-skill-editor");if(!root||!member)return;
 const skills=warSkillCatalog,selected=new Set((warMemberSkillMap.get(member.user_id)||[]).map(skill=>skill.id));
 if(warSkillLoadError){root.innerHTML='<p class="war-skill-error">ระบบ Skill ยังไม่พร้อม: '+escapeHTML(warSkillLoadError)+'</p>';return;}
 root.innerHTML=`<div class="war-member-skill-heading"><strong>SKILL (${skills.length})</strong><span>เลือกได้หลายรายการ</span></div>
  <div class="war-member-skill-choice-list war-member-skill-icon-grid">
   ${skills.length?skills.map(skill=>`<label class="war-member-skill-choice war-member-skill-icon-choice" title="${escapeHTML(skill.skill_name)}">
    <input type="checkbox" value="${escapeHTML(skill.id)}" ${selected.has(skill.id)?"checked":""} aria-label="${escapeHTML(skill.skill_name)}">
    <img src="${escapeHTML(skill.iconUrl)}" alt="${escapeHTML(skill.skill_name)}"><span>${escapeHTML(skill.skill_name)}</span>
   </label>`).join(""):'<p class="war-modal-empty-hint">ยังไม่มี Skill ในคลัง</p>'}
  </div>
  <div class="war-member-skill-upload-tools">
   <button type="button" class="war-member-skill-upload-toggle" data-war-skill-upload-toggle>＋ อัปโหลดรูป Skill</button>
   <form id="war-member-skill-create-form" class="war-member-skill-create-form" hidden>
    <label for="war-member-skill-new-name">ชื่อ Skill</label>
    <input id="war-member-skill-new-name" type="text" maxlength="80" placeholder="ชื่อ Skill" required>
    <label class="war-member-skill-upload" for="war-member-skill-new-icon">เลือกรูปไอคอน<input id="war-member-skill-new-icon" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" required></label>
    <button id="war-member-skill-create-submit" type="submit" class="btn btn-primary btn-sm">เพิ่ม Skill</button>
    <small>รองรับ PNG, JPG, WEBP, GIF หรือ SVG · ไม่เกิน 3 MB</small><p id="war-member-skill-create-status" class="war-skill-status" role="status"></p>
   </form>
  </div>
  <button type="button" class="war-member-skill-save" data-war-save-member-skills="${escapeHTML(member.user_id)}">บันทึก Skill</button>
  <p id="war-member-skill-status" class="war-skill-status" role="status"></p>`;
}
async function saveWarMemberSkillFromEditor(event){
  event.preventDefault();if(!isManagement())return;
  const name=$("war-member-skill-new-name")?.value.trim(),file=$("war-member-skill-new-icon")?.files?.[0],status=$("war-member-skill-create-status"),button=$("war-member-skill-create-submit");
  if(!name||!file){if(status)status.textContent="กรุณากรอกชื่อ Skill และเลือกรูปไอคอน";return;}
  if(!file.type.startsWith("image/")||file.size>3*1024*1024){if(status)status.textContent="ไฟล์ต้องเป็นรูปภาพและมีขนาดไม่เกิน 3 MB";return;}
  if(button){button.disabled=true;button.textContent="กำลังเพิ่ม...";}
  if(status)status.textContent="กำลังอัปโหลดไอคอน...";
  const extension=(file.name.split(".").pop()||"png").toLowerCase().replace(/[^a-z0-9]/g,"")||"png";
  const path=`skills/${Date.now()}-${Math.random().toString(36).slice(2,9)}.${extension}`;
  try{
    const upload=await supabaseClient.storage.from(WAR_SKILL_BUCKET).upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
    if(upload.error)throw upload.error;
    const insert=await supabaseClient.from("war_skill_catalog").insert({skill_name:name,icon_path:path,created_by:currentUser?.id}).select("id").single();
    if(insert.error){await supabaseClient.storage.from(WAR_SKILL_BUCKET).remove([path]);throw insert.error;}
    const memberId=document.querySelector("#war-member-skill-editor [data-war-save-member-skills]")?.dataset.warSaveMemberSkills;
    await loadWarSkillData();
    const member=allMembers.find(item=>item.user_id===memberId);
    if(member)renderWarMemberSkillEditor(member);
    const refreshedStatus=$("war-member-skill-create-status");
    if(refreshedStatus)refreshedStatus.textContent="เพิ่ม Skill ลงคลังแล้ว · เลือก Skill และกดบันทึกด้านล่าง";
  }catch(error){console.error("Create member Skill error:",error);if(status)status.textContent="เพิ่ม Skill ไม่สำเร็จ: "+(error.message||"กรุณาลองใหม่");}
  finally{if(button){button.disabled=false;button.textContent="เพิ่ม Skill";}}
}
async function saveWarMemberSkills(memberId,button){
 if(!isManagement()||!memberId)return;
 const selected=[...document.querySelectorAll("#war-member-skill-editor input[type=checkbox]:checked")].map(input=>input.value);
 if(button){button.disabled=true;button.textContent="กำลังบันทึก...";}
 const status=$("war-member-skill-status");
 try{
  const result=await supabaseClient.rpc("set_guild_member_skills",{p_member_id:memberId,p_skill_ids:selected});
  if(result.error)throw result.error;
  await loadWarSkillData();await loadSelectedWarEvent(currentWarAssignmentEventId);closeWarAssignmentModal();
 }catch(error){console.error("Save member Skills error:",error);if(status)status.textContent="บันทึก Skill ไม่สำเร็จ: "+(error.message||"กรุณาลองใหม่");if(button){button.disabled=false;button.textContent="บันทึก Skill ของสมาชิก";}}
}

function renderRaid(containerId,raidName,parties=[],options={}){
 const container=$(containerId);if(!container)return;const canArrange=options.editable===true;
 container.innerHTML=Array.from({length:5},(_,i)=>{const n=i+1,p=parties.find(x=>Number(x.party_number)===n),members=p?.war_party_members||[];
 return `<article class="party-card" data-party-card data-raid="${raidName}"><div class="party-header"><div class="party-heading-fields"><h3>${raidName}${n}</h3>${p?.party_name&&p.party_name!==`${raidName}${n}`?`<small class="war-party-role-label">${escapeHTML(p.party_name)}</small>`:""}</div></div><div class="party-slots">${Array.from({length:6},(_,j)=>{const pos=j+1,slot=members.find(x=>Number(x.position)===pos),member=allMembers.find(x=>x.user_id===slot?.member_id);
 if(slot&&member){const info=getClassInfo(getMemberClass(member));return `<button class="party-slot party-slot-filled war-member-slot" type="button" data-war-manage-slot data-assignment-id="${escapeHTML(slot.id)}" data-party-id="${escapeHTML(p.id)}" data-position="${pos}" style="--class-color:${info?.color||"#aaa"}" ${canArrange?"":"disabled"}><img class="war-slot-class-icon" src="${escapeHTML(info?.iconPath||"")}" alt="${escapeHTML(info?.name||"")}"><span class="war-member-identity"><strong class="slot-member-name">${escapeHTML(getMemberName(member))}</strong><small class="war-member-class">${escapeHTML(info?.name||getMemberClass(member))}</small></span><span class="war-member-skills" aria-label="Skill ของสมาชิก">${getMemberSkillIconsMarkup(member.user_id)}</span><span class="war-member-slot-edit">${canArrange?"MANAGE":""}</span></button>`;}
 return `<div class="party-slot ${canArrange&&p?"party-slot-editor":""}">${canArrange&&p?`<button class="war-slot-add-button" type="button" data-war-add-slot data-party-id="${escapeHTML(p.id)}" data-position="${pos}">＋ ADD</button>`:'<span class="slot-empty">Empty Slot</span>'}</div>`;
 }).join("")}</div></article>`;}).join("");
 // ปุ่มบันทึกรูปภาพถูกย้ายไปอยู่ที่หัวข้อ Raid แล้ว
}
function warMemberStatus(id){const signup=warAssignmentSignups.find(x=>x.member_id===id),leaveRow=warAssignmentLeaves.find(x=>x.member_id===id&&x.status!=="rejected"),snapshot=warAssignmentRosterSnapshot.find(x=>x.member_id===id),alreadyAssigned=currentWarPartyAssignments.some(x=>x.member_id===id),leave=snapshot?snapshot.roster_status==="leave":!!leaveRow;return {signup,leave,leaveRow,snapshot,absent:snapshot?.roster_status==="absent",addedByManagement:snapshot?.roster_status==="added_by_management",reserve:(snapshot?.roster_status==="reserve"||(!snapshot&&!!signup&&Number(signup.queue_position)>=61))&&!alreadyAssigned,raid:signup?.raid||""};}
function getWarAssignmentRosterMembers(){const snapshotIds=new Set(warAssignmentRosterSnapshot.map(x=>x.member_id));return allMembers.filter(m=>m.active===true||snapshotIds.has(m.user_id));}
function renderWarAssignmentToolbar(raidCount=2){
 const root=$("war-assignment-toolbar");if(!root)return;const active=getWarAssignmentRosterMembers(),reserve=warAssignmentRosterSnapshot.length?warAssignmentRosterSnapshot.filter(x=>x.roster_status==="reserve"&&!currentWarPartyAssignments.some(a=>a.member_id===x.member_id)).length:warAssignmentSignups.filter(x=>Number(x.queue_position)>=61).length;
 const teams=["A","B","C","D"].slice(0,raidCount).map(x=>`<button class="war-filter-chip" data-war-filter="${x}" type="button">Raid ${x}</button>`).join("");
 const classes=CLASS_DATA.map(info=>{const count=active.filter(x=>getMemberClass(x).toLowerCase()===info.name.toLowerCase()).length;return `<button class="war-class-filter" data-war-class-filter="${escapeHTML(info.name)}" type="button" title="${escapeHTML(info.name)}"><img src="${escapeHTML(info.iconPath)}" alt=""><span>${count}</span></button>`;}).join("");
 root.innerHTML=`<div class="war-assignment-filter-row"><div class="war-filter-group"><button class="war-filter-chip is-active" data-war-filter="all" type="button">All Raid</button>${teams}<button class="war-filter-chip" data-war-filter="reserve" type="button">สำรอง · ${reserve}</button><button class="war-filter-chip" data-war-filter="leave" type="button">ลาวอร์ · ${(warAssignmentRosterSnapshot.length?warAssignmentRosterSnapshot.filter(x=>x.roster_status==="leave").length:warAssignmentLeaves.filter(x=>x.status!=="rejected").length)}</button><button class="war-filter-chip" data-war-filter="absent" type="button">ขาดวอร์ · ${warAssignmentAbsentees.length}</button></div></div><div class="war-assignment-search-row"><label class="war-assignment-search"><span>⌕</span><input id="war-assignment-search" type="search" placeholder="ค้นหาชื่อตัวละคร หรือ UID..." value="${escapeHTML(warAssignmentSearch)}"></label><button class="war-count-chip" data-war-filter="all" type="button">TOTAL <strong>${active.length}</strong></button><button class="war-count-chip is-reserve" data-war-filter="reserve" type="button">RESERVE <strong>${reserve}</strong></button></div><div class="war-assignment-class-row"><span class="war-filter-caption">FILTER BY CLASS</span><button class="war-class-filter is-active" data-war-class-filter="all" type="button">ALL</button>${classes}</div><div class="war-assignment-results" id="war-assignment-results"></div>`;
 applyWarAssignmentMemberFilters();
}
function applyWarAssignmentMemberFilters(){
 const q=warAssignmentSearch.trim().toLowerCase(),members=getWarAssignmentRosterMembers().filter(m=>{const st=warMemberStatus(m.user_id);if(warAssignmentFilter==="leave"&&!st.leave)return false;if(warAssignmentFilter==="reserve"&&!st.reserve)return false;if(warAssignmentFilter==="absent"&&!st.absent)return false;if(["A","B","C","D"].includes(warAssignmentFilter)&&st.raid!==warAssignmentFilter)return false;if(warAssignmentClassFilter!=="all"&&getMemberClass(m).toLowerCase()!==warAssignmentClassFilter.toLowerCase())return false;return !q||getMemberName(m).toLowerCase().includes(q)||String(m.game_uid||"").includes(q);});
 const out=$("war-assignment-results");if(out){out.innerHTML=members.length?members.slice(0,40).map(m=>{const info=getClassInfo(getMemberClass(m)),st=warMemberStatus(m.user_id);return `<button class="war-assignment-member-pill" data-war-pool-member="${escapeHTML(m.user_id)}" type="button" style="--class-color:${info?.color||"#aaa"}"><img src="${escapeHTML(info?.iconPath||"")}" alt=""><span>${escapeHTML(getMemberName(m))}</span><small>${st.addedByManagement?"เพิ่มโดยฝ่ายบริหาร":st.leave?"ลาวอร์":st.absent?"ขาดวอร์":st.reserve?"สำรอง":st.raid?"RAID "+st.raid:"ยังไม่จัดตี้"}</small></button>`;}).join(""):'<p class="war-assignment-no-results">ไม่พบสมาชิกที่ตรงกับตัวกรอง</p>';if(members.length>40)out.insertAdjacentHTML("beforeend",`<small class="war-assignment-more">แสดง 40 จาก ${members.length} คน · ใช้ช่องค้นหาเพื่อจำกัดผลลัพธ์</small>`);}
 document.querySelectorAll("[data-war-filter]").forEach(b=>b.classList.toggle("is-active",b.dataset.warFilter===warAssignmentFilter));document.querySelectorAll("[data-war-class-filter]").forEach(b=>b.classList.toggle("is-active",b.dataset.warClassFilter===warAssignmentClassFilter));
 document.querySelectorAll("[data-raid-section]").forEach(s=>s.classList.toggle("hidden",["leave","reserve","absent"].includes(warAssignmentFilter)||(warAssignmentFilter!=="all"&&s.dataset.raidSection!==warAssignmentFilter)));
}
function closeWarAssignmentModal(){$("war-assignment-modal")?.remove();warAssignmentModalSlot=null;}
function openWarAssignmentModal(partyId,position,assignmentId=null){
 const event=allWarEvents.find(x=>x.id===currentWarAssignmentEventId);if(!isManagement()||!event)return;const party=currentWarParties.find(x=>x.id===partyId);if(!party)return;
 const assignment=assignmentId?currentWarPartyAssignments.find(x=>x.id===assignmentId):null,current=assignment?allMembers.find(x=>x.user_id===assignment.member_id):null;
 closeWarAssignmentModal();warAssignmentModalSlot={partyId,position,assignmentId};
 const status=current?warMemberStatus(current.user_id):null;
 const statusTags=current?[
  status?.reserve?'<span class="war-member-status-tag is-reserve">สำรอง</span>':"",
  status?.leave?'<span class="war-member-status-tag is-leave">ลาวอร์</span>':"",
  status?.absent?'<span class="war-member-status-tag is-absent">ไม่ลงชื่อ</span>':"",
  status?.addedByManagement?'<span class="war-member-status-tag is-added">เพิ่มโดยผู้ดูแล</span>':"",
  status?.signup&&!status?.reserve?'<span class="war-member-status-tag is-signed">ลงชื่อแล้ว</span>':""
 ].filter(Boolean).join(""):"";
 const modal=document.createElement("div");modal.id="war-assignment-modal";modal.className="war-assignment-modal";modal.dataset.activeTab=current?"skills":"members";
 modal.innerHTML=`<div class="war-assignment-modal-backdrop" data-war-modal-close></div>
 <section class="war-assignment-modal-panel war-assignment-modal-panel-reference" role="dialog" aria-modal="true" aria-labelledby="war-modal-title">
  <button class="war-modal-close" data-war-modal-close type="button" aria-label="ปิด">×</button>
  <span class="panel-kicker">PARTY MANAGEMENT</span>
  <h3 id="war-modal-title">${party.raid}${party.party_number} · SLOT ${position}</h3>
  <p class="war-modal-subtitle">${assignment?"จัดการสมาชิกในช่องนี้":"เลือกสมาชิกเพื่อเพิ่มลง Party"}</p>
  ${current?`<div class="war-modal-current-member war-modal-member-reference">
    <img src="${escapeHTML(getClassInfo(getMemberClass(current))?.iconPath||"")}" alt="">
    <div class="war-modal-member-details"><strong>${escapeHTML(getMemberName(current))}</strong><small>${escapeHTML(getMemberClass(current))} · UID: ${escapeHTML(current.game_uid||"—")}</small></div>
    <div class="war-member-status-tags">${statusTags}</div>
  </div>`:""}
  <div class="war-modal-tabs" role="tablist" aria-label="จัดการสมาชิก">
   <button type="button" role="tab" data-war-modal-tab="skills" class="${current?"is-active":""}" aria-selected="${current?"true":"false"}">Skill</button>
   <button type="button" role="tab" data-war-modal-tab="members" class="${current?"":"is-active"}" aria-selected="${current?"false":"true"}">${current?"เปลี่ยนคน":"เลือกสมาชิก"}</button>
  </div>
  <div id="war-modal-skills-panel" class="war-modal-tab-panel" ${current?"":"hidden"}>${current?'<div id="war-member-skill-editor" class="war-member-skill-editor"></div>':'<p class="war-modal-empty-hint">เลือกสมาชิกก่อนเพื่อจัดการ Skill</p>'}</div>
  <div id="war-modal-members-panel" class="war-modal-tab-panel" ${current?"hidden":""}>
   <label class="war-modal-search">ค้นหาชื่อ / UID<input id="war-modal-member-search" type="search" placeholder="พิมพ์ชื่อหรือตัวเลข UID"></label>
   <div class="war-modal-class-tabs"><button class="is-active" data-war-modal-class="all" type="button">ALL</button><button data-war-modal-reserve type="button">สำรอง <span>${warAssignmentSignups.filter(x=>Number(x.queue_position)>=61&&!currentWarPartyAssignments.some(a=>a.member_id===x.member_id)).length}</span></button>${CLASS_DATA.map(x=>`<button data-war-modal-class="${escapeHTML(x.name)}" type="button" title="${escapeHTML(x.name)}"><img src="${escapeHTML(x.iconPath)}" alt="${escapeHTML(x.name)}"></button>`).join("")}</div>
   <div class="war-modal-member-list" id="war-modal-member-list"></div>
  </div>
  ${current?'<button class="war-modal-section-remove" data-war-modal-remove type="button">ย้ายออกจาก Section</button>':""}
  <p class="war-modal-status" id="war-modal-status" role="status"></p>
 </section>`;
 document.body.appendChild(modal);if(current)renderWarMemberSkillEditor(current);renderWarAssignmentModalMembers();
}
function renderWarAssignmentModalMembers(){
 const list=$("war-modal-member-list");if(!list||!warAssignmentModalSlot)return;const assigned=getAssignedWarMemberIds(warAssignmentModalSlot.assignmentId),q=String($("war-modal-member-search")?.value||"").toLowerCase(),cls=$("war-assignment-modal")?.dataset.classFilter||"all",reserveOnly=$("war-assignment-modal")?.dataset.reserveOnly==="true";
 const members=allMembers.filter(m=>m.active===true&&!assigned.has(m.user_id)).filter(m=>!reserveOnly||warMemberStatus(m.user_id).reserve).filter(m=>cls==="all"||getMemberClass(m).toLowerCase()===cls.toLowerCase()).filter(m=>!q||getMemberName(m).toLowerCase().includes(q)||String(m.game_uid||"").includes(q)).sort((a,b)=>getMemberName(a).localeCompare(getMemberName(b),"th"));
 list.innerHTML=members.length?members.map(m=>{const info=getClassInfo(getMemberClass(m));return `<button class="war-modal-member-option" data-war-modal-assign="${escapeHTML(m.user_id)}" style="--class-color:${info?.color||"#aaa"}" type="button"><img src="${escapeHTML(info?.iconPath||"")}" alt=""><span><strong>${escapeHTML(getMemberName(m))}</strong><small>${escapeHTML(getMemberClass(m))} · UID ${escapeHTML(m.game_uid||"—")}</small></span><b>ADD</b></button>`;}).join(""):'<p class="war-assignment-no-results">ไม่พบสมาชิกที่สามารถเพิ่มได้</p>';
}
async function assignWarMemberToSlot(id){
 const slot=warAssignmentModalSlot;if(!slot)return;const event=allWarEvents.find(x=>x.id===currentWarAssignmentEventId);if(!isManagement()||!event)return;const party=currentWarParties.find(x=>x.id===slot.partyId);if(!party)return;
 if(getAssignedWarMemberIds(slot.assignmentId).has(id)){alert("สมาชิกคนนี้ถูกจัดลงปาร์ตี้อื่นในวอร์รอบนี้แล้ว");return;}
 try{
  const snapshot=warAssignmentRosterSnapshot.find(x=>x.member_id===id);
  const signupClosed=Boolean(event.signup_closes_at)&&Date.now()>=new Date(event.signup_closes_at).getTime();
  if(signupClosed&&(!snapshot||["absent","leave"].includes(snapshot.roster_status))){
   const reason=prompt("สมาชิกคนนี้ไม่ได้ลงชื่อทันเวลา/แจ้งลาไว้ กรุณาระบุเหตุผลที่ฝ่ายบริหารเพิ่มเข้าวอร์:");
   if(reason===null)return;
   if(!reason.trim()){alert("กรุณาระบุเหตุผลในการเพิ่มสมาชิก");return;}
   const add=await supabaseClient.rpc("add_member_to_war_event_roster",{p_event_id:currentWarAssignmentEventId,p_member_id:id,p_reason:reason.trim()});
   if(add.error)throw add.error;
  }
  const r=slot.assignmentId?await supabaseClient.from("war_party_members").update({member_id:id}).eq("id",slot.assignmentId).select().single():await supabaseClient.from("war_party_members").insert({party_id:slot.partyId,member_id:id,position:slot.position}).select().single();if(r.error)throw r.error;await loadSelectedWarEvent(currentWarAssignmentEventId);closeWarAssignmentModal();
 }catch(e){console.error(e);const status=$("war-modal-status");if(status)status.textContent="บันทึกไม่สำเร็จ: "+(e.message||"กรุณาลองใหม่");}
}
async function removeWarPartyMember(id,button){
 const event=allWarEvents.find(x=>x.id===currentWarAssignmentEventId);if(!isManagement()||!event||!id)return;if(button){button.disabled=true;button.textContent="กำลังนำออก...";}
 try{const r=await supabaseClient.from("war_party_members").delete().eq("id",id);if(r.error)throw r.error;await loadSelectedWarEvent(currentWarAssignmentEventId);closeWarAssignmentModal();}
 catch(e){alert("นำสมาชิกออกไม่สำเร็จ: "+(e.message||"กรุณาลองใหม่"));if(button)button.disabled=false;}
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

function getUpcomingWarSaturday() {
  const now = new Date();
  const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
  const saturday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSaturday);
  return String(saturday.getFullYear()) + "-" + String(saturday.getMonth()+1).padStart(2,"0") + "-" + String(saturday.getDate()).padStart(2,"0");
}
function getOfficialWarRounds(dateValue) {
  if (!dateValue) return [];
  return isDoubleOfficialSaturday(dateValue) ? ["20:00","20:30"] : ["20:00"];
}
function formatWarDateDisplay(dateValue) {
  if(!dateValue)return "";
  const parts=String(dateValue).split("-");
  return parts.length===3?parts[2]+"/"+parts[1]+"/"+parts[0]:"";
}
function parseWarDateDisplay(value) {
  const match=String(value||"").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!match)return "";
  const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]);
  const date=new Date(year,month-1,day);
  if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return "";
  return String(year)+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
}
function updateWarCreateMode() {
  const mode=document.querySelector('input[name="war-mode"]:checked')?.value||"official";
  const isPractice=mode==="practice";
  $("war-raid-count-wrap")?.classList.toggle("hidden",!isPractice);
  const dateInput=$("war-event-date"),timeInput=$("war-start-time"),scheduleNote=$("war-create-schedule-note");
  const dateDisplay=$("war-event-date-display"),timeDisplay=$("war-start-time-display");
  if(dateInput){dateInput.disabled=!isPractice;if(!isPractice)dateInput.value=getUpcomingWarSaturday();}
  const rounds=isPractice?[]:getOfficialWarRounds(dateInput?.value);
  if(timeInput){timeInput.disabled=!isPractice;if(!isPractice)timeInput.value=rounds[0]||"20:00";}
  if(dateDisplay){dateDisplay.value=formatWarDateDisplay(dateInput?.value);dateDisplay.readOnly=true;dateDisplay.placeholder="dd/mm/yyyy";dateDisplay.style.cursor=isPractice?"pointer":"default";if(!isPractice)dateDisplay.setCustomValidity("");}
  if(timeDisplay){timeDisplay.value=isPractice?(timeInput?.value||""):(rounds.length===2?"รอบแรก "+rounds[0]+" น. / รอบสอง "+rounds[1]+" น.":"รอบเดียว "+(rounds[0]||"20:00")+" น.");timeDisplay.readOnly=true;timeDisplay.placeholder="00:00";timeDisplay.style.cursor=isPractice?"pointer":"default";if(!isPractice)timeDisplay.setCustomValidity("");}
  if(!isPractice){closePracticeTimePicker();closeWarDatePicker();}
  const raidCount=isPractice?Number($("war-raid-count")?.value||4):2;
  const summary=$("war-create-capacity");
  if(summary)summary.textContent=isPractice?"ซ้อมวอร์: "+raidCount+" Raid · "+(raidCount*5)+" ปาร์ตี้ · รองรับ "+(raidCount*30)+" คน":"วอร์จริงวันเสาร์ "+formatWarDateDisplay(dateInput?.value)+" · "+rounds.length+" รอบ ("+rounds.join(" / ")+") น. · 2 Raid · 10 ปาร์ตี้ · รองรับ 60 คน";
  if(scheduleNote)scheduleNote.textContent=isPractice?"ซ้อมวอร์: กรอกวันที่ dd/mm/yyyy และเวลา 00:00–23:59 ได้เอง":(rounds.length===2?"ระบบกำหนดวันเสาร์ที่ใกล้ที่สุด 2 เสาร์ · วันเสาร์ที่มีวอร์ 2 รอบ จะแสดง รอบ 1 เวลา 20:00 น. / รอบ 2 เวลา 20:30 น.":"ระบบกำหนดวันเสาร์ที่ใกล้ที่สุด 2 เสาร์ · วันเสาร์ที่มีวอร์ 1 รอบ จะแสดง รอบ 1 เวลา 20:00 น.");
}
function syncPracticeDateDisplay(){
  const display=$("war-event-date-display"),dateInput=$("war-event-date");if(!display||!dateInput)return;
  display.value=formatWarDateDisplay(dateInput.value);display.setCustomValidity(dateInput.value?"":"กรุณาเลือกวันที่เริ่มวอร์");
}
function syncPracticeTimeDisplay(){
  const display=$("war-start-time-display"),timeInput=$("war-start-time");if(!display||!timeInput)return;
  display.value=timeInput.value;display.setCustomValidity(timeInput.value?"":"กรุณาเลือกเวลาเริ่มวอร์");
}
function closeWarDatePicker(){document.querySelector(".war-date-picker-popover")?.remove();}
function closePracticeTimePicker(){document.querySelector(".war-time-picker-popover")?.remove();}
function openWarDatePicker(){
  const dateInput=$("war-event-date"),display=$("war-event-date-display");
  if(!dateInput||dateInput.disabled||!display)return;
  if(document.querySelector(".war-date-picker-popover")){closeWarDatePicker();return;}
  closePracticeTimePicker();
  const wrapper=display.closest(".war-picker-control");if(!wrapper)return;
  const selected=dateInput.value?new Date(dateInput.value+"T12:00:00"):new Date();
  let view=new Date(selected.getFullYear(),selected.getMonth(),1);
  const panel=document.createElement("div");panel.className="war-date-picker-popover";
  const minValue=dateInput.min||"";
  const render=()=>{
    const year=view.getFullYear(),month=view.getMonth();
    const firstDay=new Date(year,month,1).getDay(),offset=(firstDay+6)%7;
    const days=new Date(year,month+1,0).getDate();
    const monthLabel=new Intl.DateTimeFormat("th-TH",{month:"long",year:"numeric"}).format(view);
    const cells=Array.from({length:offset},()=>'<span class="war-calendar-empty"></span>');
    for(let day=1;day<=days;day++){
      const date=new Date(year,month,day),iso=year+"-"+String(month+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
      const disabled=!!minValue&&iso<minValue,active=iso===dateInput.value;
      cells.push('<button type="button" class="war-calendar-day'+(active?' is-selected':'')+'" data-date="'+iso+'"'+(disabled?' disabled':'')+'>'+day+'</button>');
    }
    panel.innerHTML='<div class="war-date-picker-heading"><button type="button" class="war-calendar-nav" data-month="-1" aria-label="เดือนก่อนหน้า">‹</button><strong>'+monthLabel+'</strong><button type="button" class="war-calendar-nav" data-month="1" aria-label="เดือนถัดไป">›</button></div><div class="war-calendar-weekdays"><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span><span>อา</span></div><div class="war-calendar-grid">'+cells.join("")+'</div>';
    panel.querySelectorAll("[data-month]").forEach(button=>button.addEventListener("click",()=>{view=new Date(year,month+Number(button.dataset.month),1);render();}));
    panel.querySelectorAll("[data-date]").forEach(button=>button.addEventListener("click",()=>{dateInput.value=button.dataset.date;syncPracticeDateDisplay();closeWarDatePicker();}));
  };
  wrapper.appendChild(panel);render();
}
function openPracticeTimePicker(){
  const timeInput=$("war-start-time"),display=$("war-start-time-display");
  if(!timeInput||timeInput.disabled||!display)return;
  if(document.querySelector(".war-time-picker-popover")){closePracticeTimePicker();return;}
  closeWarDatePicker();
  const wrapper=display.closest(".war-picker-control");if(!wrapper)return;
  const current=/^\\d{2}:\\d{2}$/.test(timeInput.value)?timeInput.value:"20:00";
  const [currentHour,currentMinute]=current.split(":");
  const panel=document.createElement("div");panel.className="war-time-picker-popover";
  const hourOptions=Array.from({length:24},(_,i)=>String(i).padStart(2,"0")).map(v=>'<option value="'+v+'"'+(v===currentHour?" selected":"")+'>'+v+'</option>').join("");
  const minuteOptions=Array.from({length:60},(_,i)=>String(i).padStart(2,"0")).map(v=>'<option value="'+v+'"'+(v===currentMinute?" selected":"")+'>'+v+'</option>').join("");
  panel.innerHTML='<div class="war-time-picker-heading"><strong>เลือกเวลาเริ่มวอร์</strong><span>รูปแบบ 24 ชั่วโมง</span></div><div class="war-time-picker-selects"><label>ชั่วโมง (00–23)<select class="war-time-hour" aria-label="ชั่วโมง">'+hourOptions+'</select></label><span class="war-time-picker-colon">:</span><label>นาที (00–59)<select class="war-time-minute" aria-label="นาที">'+minuteOptions+'</select></label></div><div class="war-time-picker-actions"><button type="button" class="war-time-cancel">ยกเลิก</button><button type="button" class="war-time-apply">ยืนยันเวลา</button></div>';
  wrapper.appendChild(panel);
  panel.querySelector(".war-time-cancel").addEventListener("click",closePracticeTimePicker);
  panel.querySelector(".war-time-apply").addEventListener("click",()=>{
    timeInput.value=panel.querySelector(".war-time-hour").value+":"+panel.querySelector(".war-time-minute").value;
    syncPracticeTimeDisplay();closePracticeTimePicker();
  });
}
async function handleWarCreate(event) {
  event.preventDefault();if(!isManagement())return;
  const form=event.currentTarget,mode=form.querySelector('input[name="war-mode"]:checked')?.value||"official";
  const raidCount=mode==="practice"?Number($("war-raid-count")?.value||4):2;
  const opponent=String($("war-opponent")?.value||"").trim(),eventDate=$("war-event-date")?.value,startTime=String($("war-start-time")?.value||"").trim(),submit=$("war-create-submit");
  if(!opponent||!eventDate||!startTime){setWarCreateMessage("กรุณากรอกชื่อกิลด์คู่แข่ง วันที่ และเวลาเริ่มวอร์ให้ครบ",true);return;}
  if(mode==="official"){const requiredDate=getUpcomingWarSaturday(),rounds=getOfficialWarRounds(requiredDate);if(eventDate!==requiredDate||startTime!==rounds[0]){setWarCreateMessage("วอร์จริงต้องใช้วันเสาร์ที่ใกล้ที่สุดและเวลา "+rounds[0]+" น. ตามตาราง",true);return;}}
  if(!Number.isInteger(raidCount)||raidCount<1||raidCount>4){setWarCreateMessage("จำนวน Raid ต้องอยู่ระหว่าง 1–4",true);return;}
  submit.disabled=true;submit.textContent="กำลังสร้าง...";setWarCreateMessage("กำลังสร้างกิจกรรมและเตรียมช่องปาร์ตี้...");
  try{
    const rounds=mode==="official"?getOfficialWarRounds(eventDate):[startTime];
     const metadata=`[[WAR_CONFIG:${JSON.stringify({mode,raidCount,rounds})}]]`;
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
  if(!isManagement())return;
  const event=allWarEvents.find(item=>item.id===selectedWarEventId);
  if(!event||!event.is_draft_confirmed)return;
  const button=$("war-publish-event");if(button){button.disabled=true;button.textContent="กำลังอัปเดต...";}
  try{
    const result=await supabaseClient.from("war_events").update({is_published:true}).eq("id",event.id);if(result.error)throw result.error;
    const keepId=event.id;await loadWarEvents();selectedWarEventId=keepId;renderWarLayout(keepId);
    if($("war-attendance-content"))await loadWarAttendance();
    alert(event.is_published?"อัปเดตรายชื่อวอร์ที่ประกาศแล้วเรียบร้อย":"Publish รายชื่อวอร์เรียบร้อย");
  }catch(error){console.error("Publish/update war roster failed:",error);alert("Publish / อัปเดตรายชื่อวอร์ไม่สำเร็จ: "+(error.message||"เกิดข้อผิดพลาด"));}
  finally{if(button){button.disabled=false;button.textContent="Publish อัปเดตรายชื่อ";}}
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
async function exportWarImage(raidFilter = null){
  const event=allWarEvents.find(item=>item.id===selectedWarEventId);
  if(!event||!event.is_draft_confirmed)return;
  const config=getWarEventConfig(event),width=1600,allRaidNames=["A","B","C","D"].slice(0,config.raidCount);
  const raidNames=raidFilter?allRaidNames.filter(raid=>raid===raidFilter):allRaidNames;
  if(raidFilter&&!raidNames.length)return;
  const height=330+raidNames.length*510,esc=value=>escapeHTML(String(value??""));
  const roundTimes=config.rounds?.length?config.rounds:[formatTime(event.start_time)];
  const dateTimeLabel=config.mode==="official"
    ? `${formatDate(event.event_date)} ${roundTimes.map((time,index)=>`รอบ ${index+1} เวลา ${time} น.`).join(" | ")}`
    : `${formatDate(event.event_date)} เวลา ${formatTime(event.start_time)} น.`;
  const toDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  try{
    const [background,logo,fontCss]=await Promise.all([
      fetch("assets/4am-web-bg.jpg").then(response=>{if(!response.ok)throw Error("ไม่พบไฟล์ assets/4am-web-bg.jpg");return response.blob();}).then(toDataUrl),
      fetch("/assets/4am-guild-logo.png?v=20261111b").then(response=>{if(!response.ok)throw Error("ไม่พบไฟล์ /assets/4am-guild-logo.png?v=20261111b");return response.blob();}).then(toDataUrl),
      getThaiFontCss()
    ]);
    const rosterClassNames=[...new Set(currentWarParties.flatMap(party=>(party.war_party_members||[]).map(assignment=>{
      const member=allMembers.find(item=>item.user_id===assignment.member_id);
      return member?getMemberClass(member):null;
    }).filter(Boolean)))];
    const classIconEntries=await Promise.all(rosterClassNames.map(async className=>{
      const info=getClassInfo(className);
      if(!info?.iconPath)return [className,""];
      try{
        const response=await fetch(info.iconPath);
        if(!response.ok)return [className,""];
        return [className,await toDataUrl(await response.blob())];
      }catch{return [className,""]; }
    }));
    const classIconData=Object.fromEntries(classIconEntries);
    const parts=[`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="redLine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4655"/><stop offset=".5" stop-color="#a10f20"/><stop offset="1" stop-color="#4b0710"/></linearGradient>
        <linearGradient id="cardFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0b0e" stop-opacity=".98"/><stop offset="1" stop-color="#050506" stop-opacity=".98"/></linearGradient>
        <linearGradient id="redAccent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3b080e"/><stop offset=".52" stop-color="#b51227"/><stop offset="1" stop-color="#430810"/></linearGradient>
        <filter id="redGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <image x="0" y="0" width="1600" height="${height}" preserveAspectRatio="xMidYMid slice" href="${background}" xlink:href="${background}"/>
      <rect width="1600" height="${height}" fill="#030304" opacity=".82"/>
      <rect x="24" y="24" width="1552" height="${height-48}" rx="20" fill="#080608" fill-opacity=".58" stroke="url(#redLine)" stroke-width="4"/>
      <path d="M48 188 H1552" stroke="#e21b35" stroke-opacity=".8" stroke-width="3"/>
      <path d="M48 180 H420" stroke="#ff394d" stroke-width="5" filter="url(#redGlow)"/>
      <rect x="48" y="48" width="1504" height="122" rx="12" fill="#050506" fill-opacity=".84" stroke="#a70d22" stroke-width="2"/>
      <image x="70" y="61" width="96" height="96" preserveAspectRatio="xMidYMid meet" href="${logo}" xlink:href="${logo}"/>
      <text x="185" y="119" fill="#ffffff" font-size="48" font-family="Noto Sans Thai" font-weight="900" letter-spacing="3">4AM GUILD</text>
      <path d="M185 133 H530" stroke="#e21b35" stroke-width="5"/>
      <text x="1515" y="101" text-anchor="end" fill="#ff4054" font-size="21" font-family="Noto Sans Thai" font-weight="900" letter-spacing="3">GUILD WAR ROSTER</text>
      <text x="1515" y="139" text-anchor="end" fill="#ffffff" font-size="22" font-family="Noto Sans Thai" font-weight="700">${esc(event.event_name)}</text>
      <text x="1515" y="163" text-anchor="end" fill="#c9bfc2" font-size="16" font-family="Noto Sans Thai" font-weight="600">${esc(dateTimeLabel)}</text>`];
    let y=220;
    for(const [raidIndex,raid] of raidNames.entries()){
      parts.push(`<rect x="48" y="${y}" width="1504" height="42" rx="6" fill="url(#redAccent)" stroke="#ef263f" stroke-opacity=".95" stroke-width="2"/>
        <path d="M48 ${y+4} H1552" stroke="#ff6472" stroke-opacity=".55" stroke-width="2"/>
        <text x="70" y="${y+29}" fill="#ffffff" font-size="25" font-family="Noto Sans Thai" font-weight="900" letter-spacing="3">RAID ${raid}</text>
        <text x="1525" y="${y+28}" text-anchor="end" fill="#ffe8eb" font-size="16" font-family="Noto Sans Thai" font-weight="700">${raidIndex+1} / ${raidNames.length}</text>`);
      const cardY=y+56;
      for(let p=1;p<=5;p++){
        const party=currentWarParties.find(item=>item.raid===raid&&Number(item.party_number)===p);
        const assigned=party?.war_party_members||[],x=60+(p-1)*300;
        parts.push(`<rect x="${x}" y="${cardY}" width="284" height="426" rx="10" fill="url(#cardFill)" stroke="#bd1b31" stroke-opacity=".95" stroke-width="2.5"/>
          <path d="M${x+1} ${cardY+54} H${x+283}" stroke="#e21b35" stroke-width="4"/>
          <path d="M${x+12} ${cardY+12} H${x+88}" stroke="#ff4054" stroke-width="3"/>
          <text x="${x+16}" y="${cardY+35}" fill="#ffffff" font-size="23" font-family="Noto Sans Thai" font-weight="900">${raid}${p}</text>
          <text x="${x+266}" y="${cardY+34}" text-anchor="end" fill="#ff5365" font-size="17" font-family="Noto Sans Thai" font-weight="900">${assigned.length}/6</text>`);
        for(let slot=1;slot<=6;slot++){
          const assignment=assigned.find(item=>Number(item.position)===slot);
          const member=allMembers.find(item=>item.user_id===assignment?.member_id);
          const rowY=cardY+91+(slot-1)*54;
          if(slot>1)parts.push(`<path d="M${x+14} ${rowY-22} H${x+270}" stroke="#a11a2c" stroke-opacity=".45" stroke-width="1.5"/>`);
          const classIcon=member?classIconData[getMemberClass(member)]:"";
          parts.push(`<circle cx="${x+25}" cy="${rowY-5}" r="12" fill="${member?"#c31830":"#211619"}" stroke="${member?"#ff5264":"#6a3039"}" stroke-width="1.5"/>
            <text x="${x+25}" y="${rowY}" text-anchor="middle" fill="#ffffff" font-size="13" font-family="Noto Sans Thai" font-weight="900">${slot}</text>
            ${classIcon?`<image x="${x+45}" y="${rowY-19}" width="28" height="28" preserveAspectRatio="xMidYMid meet" href="${classIcon}" xlink:href="${classIcon}"/>`:""}
            <text x="${x+(classIcon?82:47)}" y="${rowY+1}" fill="${member?"#ffffff":"#81777a"}" font-size="16" font-family="Noto Sans Thai" font-weight="700">${esc(member?getMemberName(member):"ว่าง")}</text>`);
        }
      }
      y+=510;
    }
    parts.push(`<text x="800" y="${height-42}" text-anchor="middle" fill="#ffffff" font-size="32" font-family="Noto Sans Thai" font-weight="900" letter-spacing="4">4AM vs ${esc(event.event_name.replace(/^4AM\s+vs\s+/i,""))}</text></svg>`);
    const svg=parts.join("");
    const svgWithFonts=fontCss?svg.replace(">",`><style>${fontCss}</style>`):svg;
    const svgUrl=URL.createObjectURL(new Blob([svgWithFonts],{type:"image/svg+xml;charset=utf-8"}));
    try{
      const img=new Image();img.src=svgUrl;await img.decode();
      const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
      const context=canvas.getContext("2d");if(!context)throw Error("ไม่สามารถสร้าง Canvas ได้");
      context.drawImage(img,0,0);
      const png=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
      if(!png)throw Error("PNG export failed");
      const url=URL.createObjectURL(png),link=document.createElement("a");
      link.href=url;link.download=raidFilter?`4AM-War-Raid-${raidFilter}-${event.event_date}.png`:`4AM-War-${event.event_date}.png`;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }finally{URL.revokeObjectURL(svgUrl);}
  }catch(error){
    console.error("War image export failed:",error);
    alert("บันทึกรูปไม่สำเร็จ: "+(error.message||"เกิดข้อผิดพลาด"));
  }
}
function addWarPartyExportButtons(container,parties){
  if(!container)return;
  container.querySelectorAll(".party-card").forEach(card=>{
    const title=card.querySelector(".party-header h3")?.textContent?.trim()||"";
    const party=(parties||[]).find(item=>item.raid+String(item.party_number)===title);
    if(!party?.id||card.querySelector(".war-party-image-button"))return;
    const header=card.querySelector(".party-header");if(!header)return;
    const button=document.createElement("button");
    button.type="button";
    button.className="btn btn-outline btn-sm war-party-image-button";
    button.textContent="บันทึกรูปตี้";
    button.addEventListener("click",()=>exportWarPartyImage(party.id));
    header.appendChild(button);
  });
}
async function exportWarPartyImage(partyId){
  let party=currentWarParties.find(item=>item.id===partyId)||null;
  if(!party){
    const result=await supabaseClient.from("war_parties")
      .select("id,event_id,raid,party_number,party_name,war_party_members(id,member_id,position)")
      .eq("id",partyId).maybeSingle();
    if(result.error||!result.data){alert("ไม่พบข้อมูลปาร์ตี้");return;}
    party=result.data;
  }
  const event=allWarEvents.find(item=>item.id===party.event_id)||warAttendanceEvents.find(item=>item.id===party.event_id);
  const esc=value=>escapeHTML(String(value??""));
  const toDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  try{
    const [bg,logo,fontCss]=await Promise.all([
      fetch("assets/4am-web-bg.jpg").then(r=>{if(!r.ok)throw Error("ไม่พบภาพพื้นหลัง");return r.blob();}).then(toDataUrl),
      fetch("/assets/4am-guild-logo.png?v=20261111b").then(r=>{if(!r.ok)throw Error("ไม่พบโลโก้");return r.blob();}).then(toDataUrl),
      getThaiFontCss()
    ]);
    const members=(party.war_party_members||[]).map(row=>({row,member:allMembers.find(item=>item.user_id===row.member_id)}));
    const rows=[];
    for(let n=1;n<=6;n++){
      const entry=members.find(x=>Number(x.row.position)===n),member=entry?.member;
      const info=member?getClassInfo(getMemberClass(member)):null,y=385+(n-1)*78;
      rows.push(`<rect x="95" y="${y-43}" width="910" height="64" rx="9" fill="#100b10" fill-opacity=".92" stroke="${info?.color||"#85313d"}" stroke-width="2"/>`);
      rows.push(`<circle cx="137" cy="${y-11}" r="18" fill="#a7192e"/><text x="137" y="${y-5}" text-anchor="middle" fill="#fff" font-size="17" font-weight="900">${n}</text><text x="205" y="${y-5}" fill="${member?"#fff":"#96888e"}" font-size="25" font-weight="700">${esc(member?getMemberName(member):"ว่าง")}</text><text x="980" y="${y-5}" text-anchor="end" fill="${info?.color||"#e7c5c8"}" font-size="17" font-weight="700">${esc(member?getMemberClass(member):"")}</text>`);
    }
    const label=party.raid+party.party_number,width=1100,height=900;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="${bg}"/><rect width="100%" height="100%" fill="#050306" fill-opacity=".78"/><rect x="25" y="25" width="1050" height="850" rx="20" fill="#080608" fill-opacity=".72" stroke="#b51d34" stroke-width="4"/><image x="65" y="55" width="100" height="100" href="${logo}"/><text x="190" y="108" fill="#fff" font-size="43" font-weight="900">4AM GUILD</text><text x="190" y="145" fill="#f04a5c" font-size="18" font-weight="800">GUILD WAR ROSTER</text><text x="1015" y="100" text-anchor="end" fill="#fff" font-size="38" font-weight="900">${label}</text><text x="1015" y="140" text-anchor="end" fill="#d9c5c9" font-size="17">${esc(event?.event_name||"4AM GUILD WAR")} · ${event?formatDate(event.event_date):""}</text><rect x="75" y="215" width="950" height="82" rx="10" fill="#841526" stroke="#ef4358" stroke-width="2"/><text x="115" y="267" fill="#fff" font-size="31" font-weight="900">RAID ${esc(party.raid)} · PARTY ${label}</text><text x="985" y="267" text-anchor="end" fill="#ffe5e8" font-size="22" font-weight="800">${members.filter(x=>x.member).length}/6</text>${rows.join("")}<text x="550" y="845" text-anchor="middle" fill="#f1d8dc" font-size="19" font-weight="800">THE OUTRAGEOUS · 4AM GUILD</text></svg>`;
    const svgWithFonts=fontCss?svg.replace(">",`><style>${fontCss}</style>`):svg;
    const svgUrl=URL.createObjectURL(new Blob([svgWithFonts],{type:"image/svg+xml;charset=utf-8"}));
    try{
      const img=new Image();img.src=svgUrl;await img.decode();
      const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext("2d");if(!ctx)throw Error("ไม่สามารถสร้าง Canvas ได้");
      ctx.drawImage(img,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
      if(!blob)throw Error("สร้าง PNG ไม่สำเร็จ");
      const url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=`4AM-${label}-${event?.event_date||"War"}.png`;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1200);
    }finally{URL.revokeObjectURL(svgUrl);}
  }catch(error){console.error("Party image export failed:",error);alert("บันทึกรูปตี้ไม่สำเร็จ: "+(error.message||"เกิดข้อผิดพลาด"));}
}
window.exportWarPartyImage=exportWarPartyImage;

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
  container.innerHTML=`<div class="war-attendance-event-select"><label for="war-attendance-select">เลือกกิจกรรมวอร์</label><select id="war-attendance-select">${warAttendanceEvents.map(item=>`<option value="${escapeHTML(item.id)}" ${item.id===event.id?"selected":""}>${escapeHTML(item.event_name)} · ${formatDate(item.event_date)}</option>`).join("")}</select></div><div class="war-attendance-heading"><h3>${escapeHTML(event.event_name)}</h3><p>${formatDate(event.event_date)} · ${formatTime(event.start_time)}</p><span class="war-stage-badge war-stage-published">PUBLISHED</span></div><div class="war-attendance-boards">${["A","B","C","D"].slice(0,config.raidCount).map(raid=>`<section class="raid-section"><div class="raid-title"><span class="raid-badge raid-${raid.toLowerCase()}">${raid}</span><div><h2>Raid ${raid}</h2><p>Published roster</p></div></div><div class="raid-grid">${Array.from({length:5},(_,index)=>{const party=parties?.find(item=>item.raid===raid&&Number(item.party_number)===index+1),assigned=party?.war_party_members||[];return `<article class="party-card"><div class="party-header"><h3>${raid}${index+1}</h3></div><div class="party-slots">${Array.from({length:6},(_,slotIndex)=>{const position=slotIndex+1,assignment=assigned.find(item=>Number(item.position)===position),member=allMembers.find(item=>item.user_id===assignment?.member_id);if(!member)return `<div class="party-slot"><span class="slot-empty">Empty Slot</span></div>`;const info=getClassInfo(getMemberClass(member));return `<div class="party-slot party-slot-filled war-member-slot" style="--class-color:${info?.color||"#aaa"}"><img class="war-slot-class-icon" src="${escapeHTML(info?.iconPath||"")}" alt="${escapeHTML(info?.name||"")}"><span class="war-member-identity"><strong class="slot-member-name">${escapeHTML(getMemberName(member))}</strong><small class="war-member-class">${escapeHTML(info?.name||getMemberClass(member))}</small></span><span class="war-member-skills">${getMemberSkillIconsMarkup(member.user_id)}</span></div>`}).join("")}</div></article>`;}).join("")}</div></section>`).join("")}</div>`;
  addWarPartyExportButtons(container,parties);
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
    .select("id,event_name,event_date,start_time,registration_type,signup_opens_at,signup_closes_at,description,discord_message_id,discord_sent_at,discord_send_error")
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
    const discordAction='<button class="btn '+(event.discord_message_id?"btn-outline":"btn-primary")+' btn-sm" type="button" data-war-signup-discord="'+escapeHTML(event.id)+'">'+(event.discord_message_id?"UPDATE TO DISCORD":event.discord_send_error?"ส่ง Discord อีกครั้ง":"SEND TO DISCORD")+"</button>";
    const managementActions=isManagement()?'<div class="war-signup-management-actions">'+discordAction+'<button class="btn btn-outline btn-sm" type="button" data-war-signup-edit="'+escapeHTML(event.id)+'">แก้ไข Event</button><button class="btn btn-danger btn-sm" type="button" data-war-signup-delete="'+escapeHTML(event.id)+'">ลบ Event</button></div>'+(event.discord_send_error?'<small class="war-signup-discord-error">'+escapeHTML(event.discord_send_error)+'</small>':""):"";
    return '<article class="war-signup-card"><div class="war-signup-card-top"><div class="war-signup-card-heading"><h3>'+escapeHTML(event.event_name)+'</h3><p>'+formatDate(event.event_date)+' · เริ่มวอร์ '+formatTime(event.start_time)+'</p></div><div class="war-signup-badges"><span class="war-signup-state '+stateClass+'">'+stateLabel+'</span><span class="war-signup-type">'+typeLabel+'</span></div></div>'+managementActions+
      '<div class="war-signup-event-meta"><span>เริ่มลงชื่อ: '+warSignupDateTime(event.signup_opens_at)+'</span><span>ปิดรับ: '+warSignupDateTime(event.signup_closes_at)+'</span><span>ผู้ลงชื่อ: '+capacity+'</span></div>'+
      (event.description?'<p class="war-signup-description">'+escapeHTML(String(event.description).replace(/\[\[WAR_CONFIG:[\s\S]*?\]\]/,"").trim())+'</p>':"")+
      '<div class="war-signup-card-bottom"><div class="war-signup-action">'+action+'</div>'+(state==="closed"?'<button class="btn btn-outline btn-sm war-signup-evidence-btn" type="button" data-war-signup-evidence="'+escapeHTML(event.id)+'">บันทึกไฟล์รูปภาพ</button>':"")+'</div>'+rosterHtml+(leaveRpcUnavailable?'<p class="war-leave-roster-warning">ยังโหลดรายชื่อผู้แจ้งลาไม่ได้ กรุณาตรวจสอบ SQL ระบบแจ้งลาวอร์</p>':"")+(attendanceRpcUnavailable?'<p class="war-leave-roster-warning">ยังโหลดสถานะขาดวอร์ไม่ได้ กรุณาติดตั้ง SQL ระบบสรุปการเข้า war</p>':"")+summary+'</article>';
  }).join("");
}

async function sendWarSignupEventToDiscord(eventId,button){
  if(!isManagement())return;
  const isUpdate=String(button?.textContent||"").includes("UPDATE TO DISCORD");
  const confirmText=isUpdate
    ?"อัปเดตประกาศ War Signup Event ใน Discord โดยแก้ไขข้อความเดิมหรือไม่?"
    :"ส่งประกาศ War Signup Event นี้ไปยัง Discord ตามโหมดที่ตั้งค่าไว้หรือไม่?";
  if(!confirm(confirmText))return;
  const original=button?.textContent||(isUpdate?"UPDATE TO DISCORD":"SEND TO DISCORD");
  if(button){button.disabled=true;button.textContent=isUpdate?"กำลังอัปเดต Discord...":"กำลังส่งไป Discord...";}
  try{
    const {data,error}=await supabaseClient.functions.invoke("discord-guild-activity-notify",{body:{kind:"war_signup",event_id:eventId}});
    if(error){
      let message=error.message;
      try{if(error.context&&typeof error.context.json==="function"){const body=await error.context.json();message=body.message||message;}}catch(_){}
      throw new Error(message);
    }
    if(!data?.success)throw new Error(data?.message||"ดำเนินการกับ Discord ไม่สำเร็จ");
    alert(data.updated?"อัปเดตประกาศเดิมบน Discord สำเร็จ":data.already_notified?"Event นี้มีประกาศบน Discord แล้ว":"ส่งประกาศ War Signup Event ไป Discord สำเร็จ");
    await loadWarSignups();
  }catch(error){
    console.error("War signup Discord send/update:",error);
    alert((isUpdate?"อัปเดต Discord ไม่สำเร็จ: ":"ส่ง Discord ไม่สำเร็จ: ")+(error.message||"กรุณาตรวจสอบการตั้งค่าและลองใหม่"));
    if(button){button.disabled=false;button.textContent=original;}
    await loadWarSignups();
  }
}

async function exportWarSignupEvidence(eventId,button){
  if(button){button.disabled=true;button.textContent="กำลังสร้างภาพหลักฐาน...";}
  try{
    const [{data:event,error:eventError},{data:signups,error:signupError},{data:members,error:memberError},leaveResult]=await Promise.all([
      supabaseClient.from("war_events").select("id,event_name,event_date,start_time,signup_opens_at,signup_closes_at,registration_type").eq("id",eventId).single(),
      supabaseClient.from("war_signups").select("id,member_id,queue_position,created_at,status").eq("event_id",eventId).neq("status","cancelled").order("queue_position",{ascending:true}),
      supabaseClient.from("guild_members").select("user_id,character_name,nickname,discord_name,game_class").eq("active",true),
      supabaseClient.rpc("get_war_leave_roster",{p_event_id:eventId})
    ]);
    if(eventError)throw eventError;if(signupError)throw signupError;if(memberError)throw memberError;
    if(Date.now()<new Date(event.signup_closes_at).getTime())throw new Error("ดาวน์โหลดภาพหลักฐานได้หลังปิดรับสมัครเท่านั้น");
    if(leaveResult.error)throw new Error("โหลดรายชื่อแจ้งลาไม่สำเร็จ: "+leaveResult.error.message);
    const memberMap=new Map((members||[]).map(m=>[m.user_id,m]));
    const primary=(signups||[]).filter(x=>Number(x.queue_position)>=1&&Number(x.queue_position)<=60);
    const reserve=(signups||[]).filter(x=>Number(x.queue_position)>=61&&Number(x.queue_position)<=80);
    const leaves=(leaveResult.data||[]).filter(x=>x.status!=="rejected");
    const columns=[
      {title:"ตัวจริง",rows:primary.map(x=>({name:getMemberName(memberMap.get(x.member_id)||{}),detail:"คิว "+x.queue_position}))},
      {title:"ตัวสำรอง",rows:reserve.map(x=>({name:getMemberName(memberMap.get(x.member_id)||{}),detail:"คิว "+x.queue_position}))},
      {title:"แจ้งลาวอร์",rows:leaves.map(x=>({name:getMemberName(memberMap.get(x.member_id)||{}),detail:x.status==="approved"?"รับทราบแล้ว":x.status==="pending"?"รอตรวจสอบ":String(x.status||"")})).filter(x=>x.name)}
    ];
    const maxRows=Math.max(1,...columns.map(x=>x.rows.length)),width=1800,top=310,rowHeight=46,height=top+maxRows*rowHeight+120;
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d");if(!ctx)throw new Error("ไม่สามารถสร้างภาพหลักฐานได้");
    ctx.fillStyle="#09080b";ctx.fillRect(0,0,width,height);
    const gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,"#260b12");gradient.addColorStop(.5,"#100b10");gradient.addColorStop(1,"#070709");ctx.fillStyle=gradient;ctx.fillRect(22,22,width-44,height-44);
    ctx.strokeStyle="#b51d32";ctx.lineWidth=4;ctx.strokeRect(24,24,width-48,height-48);
    ctx.fillStyle="#fff";ctx.font="900 48px 'Noto Sans Thai',sans-serif";ctx.fillText("4AM GUILD · WAR REGISTRATION EVIDENCE",64,94);
    ctx.fillStyle="#ff6878";ctx.font="700 34px 'Noto Sans Thai',sans-serif";ctx.fillText(String(event.event_name||"Guild War"),64,151);
    ctx.fillStyle="#e7dce0";ctx.font="500 23px 'Noto Sans Thai',sans-serif";
    ctx.fillText("วันที่วอร์: "+formatDate(event.event_date)+"  |  เวลา: "+formatTime(event.start_time),64,202);
    ctx.fillText("ปิดรับสมัคร: "+warSignupDateTime(event.signup_closes_at)+"  |  บันทึกภาพ: "+warSignupDateTime(new Date().toISOString()),64,242);
    ctx.fillStyle="#c9aeb5";ctx.font="500 19px 'Noto Sans Thai',sans-serif";
    ctx.fillText("ภาพนี้แสดงรายชื่อที่บันทึกในระบบ ณ เวลาที่สร้างภาพ ไม่ใช่หลักฐานการเข้าร่วมจริงในสนามวอร์",64,278);
    const gap=24,colWidth=(width-128-gap*2)/3;
    columns.forEach((col,index)=>{
      const x=64+index*(colWidth+gap);
      ctx.fillStyle="#42101b";ctx.fillRect(x,top-10,colWidth,54);
      ctx.strokeStyle="#b51d32";ctx.lineWidth=2;ctx.strokeRect(x,top-10,colWidth,54);
      ctx.fillStyle="#fff";ctx.font="800 25px 'Noto Sans Thai',sans-serif";ctx.fillText(col.title+" · "+col.rows.length+" คน",x+18,top+26);
      if(!col.rows.length){ctx.fillStyle="#b9aab0";ctx.font="500 20px 'Noto Sans Thai',sans-serif";ctx.fillText("ไม่มีรายชื่อ",x+18,top+90);}
      col.rows.forEach((row,i)=>{
        const y=top+60+i*rowHeight;
        if(i%2===0){ctx.fillStyle="rgba(255,255,255,.045)";ctx.fillRect(x,y,colWidth,rowHeight);}
        ctx.fillStyle="#f8f2f3";ctx.font="600 19px 'Noto Sans Thai',sans-serif";
        const name=String(row.name||"ไม่พบชื่อสมาชิก");ctx.fillText(name.length>24?name.slice(0,23)+"…":name,x+18,y+29);
        ctx.fillStyle="#d5aeb6";ctx.font="500 15px 'Noto Sans Thai',sans-serif";ctx.textAlign="right";ctx.fillText(row.detail,x+colWidth-16,y+28);ctx.textAlign="left";
      });
    });
    ctx.fillStyle="#8d7d83";ctx.font="500 16px 'Noto Sans Thai',sans-serif";ctx.textAlign="center";
    ctx.fillText("4AM GUILD · SYSTEM GENERATED RECORD",width/2,height-48);ctx.textAlign="left";
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("สร้างไฟล์ PNG ไม่สำเร็จ")),"image/png"));
    const url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download="4AM-War-Registration-"+String(event.event_date||"").slice(0,10)+".png";document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(error){console.error("War signup evidence export failed:",error);alert("ดาวน์โหลดภาพหลักฐานไม่สำเร็จ: "+(error.message||"เกิดข้อผิดพลาด"));}
  finally{if(button){button.disabled=false;button.textContent="บันทึกไฟล์รูปภาพ";}}
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
function getNextTwoWarSaturdays(){
  const today=new Date();today.setHours(0,0,0,0);
  const daysUntilSaturday=(6-today.getDay()+7)%7||7;
  return Array.from({length:2},(_,index)=>{
    const date=new Date(today);date.setDate(today.getDate()+daysUntilSaturday+index*7);
    return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
  });
}
function updateWarSignupDateControls(selectedIso="",useDefault=false){
  const type=$("war-signup-type")?.value||"official";
  const select=$("war-signup-event-date-select");
  const practice=$("war-signup-event-date-practice");
  const canonical=$("war-signup-event-date");
  if(!select||!practice||!canonical)return;
  const dates=getNextTwoWarSaturdays();
  select.innerHTML='<option value="">เลือกวันเสาร์</option>'+dates.map(iso=>'<option value="'+iso+'">วันเสาร์ '+formatDisplayDate(iso)+'</option>').join("");
  const requestedDate=selectedIso||parseDisplayDate(canonical.value)||parseDisplayDate(practice.value);
  const outsideRange=Boolean(requestedDate&&!dates.includes(requestedDate));
  let wanted=requestedDate;
  if(!dates.includes(wanted))wanted=useDefault?dates[0]:"";
  select.value=wanted||"";
  if(wanted&&!practice.value)practice.value=formatDisplayDate(wanted);
  const isPractice=type==="practice";
  select.classList.toggle("hidden",isPractice);
  practice.classList.toggle("hidden",!isPractice);
  select.required=!isPractice;
  practice.required=isPractice;
  canonical.value=isPractice?(parseDisplayDate(practice.value)?practice.value:""):(select.value?formatDisplayDate(select.value):"");
  const note=$("war-signup-date-note");
  if(note)note.textContent=isPractice
    ?"ซ้อมวอร์: เลือกวันที่เองได้จากปฏิทิน"
    :(outsideRange?"Event เดิมอยู่นอก 2 วันเสาร์ถัดไป กรุณาเลือกวันใหม่จากรายการก่อนบันทึก":"วอร์จริง: เลือกได้เฉพาะ 2 วันเสาร์ที่ใกล้จะถึง");
}
async function updateWarSignupTimeForDate(){
  const type=$("war-signup-type")?.value;
  const date=parseDisplayDate($("war-signup-event-date")?.value);
  const input=$("war-signup-start-time");
  const display=$("war-signup-start-time-display");
  const note=$("war-signup-time-note");
  if(!input||!display)return;
  if(type==="practice"){
    display.readOnly=true;
    display.setAttribute("data-activity-time-input","");
    display.value=input.value||"";
    display.required=true;
    if(note)note.textContent="ซ้อมวอร์: Management กำหนดวันและเวลาเองได้ (24 ชั่วโมง)";
    return;
  }
  display.readOnly=true;
  display.removeAttribute("data-activity-time-input");
  display.required=true;
  if(!date){
    input.value="";display.value="";
    if(note)note.textContent="กรุณาเลือกวันที่วอร์จากรายการ";
    return;
  }
  const selectedDate=new Date(date+"T12:00:00");
  if(selectedDate.getDay()!==6){
    input.value="";display.value="";
    if(note)note.textContent="วอร์จริงเลือกได้เฉพาะวันเสาร์ตามตารางที่กำหนด";
    return;
  }
  const double=isDoubleOfficialSaturday(date);
  input.value=double?"20:30":"20:00";
  display.value=double?"รอบแรก 20:00 | รอบสอง 20:30":"รอบเดียว 20:00";
  if(note)note.textContent=double
    ?"วอร์จริง 2 รอบ · ระบบบันทึกเวลา Event เป็น 20:30 น. (รอบสอง)"
    :"วอร์จริง 1 รอบ · ระบบบันทึกเวลา Event เป็น 20:00 น.";
}
function resetWarSignupForm(){
  $("war-signup-create-form")?.reset();$("war-signup-edit-id").value="";
  $("war-signup-create-confirm").textContent="ยืนยันสร้าง Event ลงชื่อวอร์";
  $("war-signup-create-form")?.classList.remove("is-editing");
  updateWarSignupDateControls("",true);
  updateWarSignupTimeForDate();
}
async function startEditWarSignupEvent(id){
  if(!isManagement())return;
  const {data,error}=await supabaseClient.from("war_events").select("id,event_name,registration_type,event_date,start_time,signup_opens_at,signup_closes_at,description").eq("id",id).single();
  if(error){alert("โหลด Event ไม่สำเร็จ: "+error.message);return;}
  $("war-signup-edit-id").value=data.id;$("war-signup-event-name").value=data.event_name||"";
  $("war-signup-type").value=data.registration_type||"official";
  const eventDate=String(data.event_date||"").slice(0,10);
  $("war-signup-event-date").value=formatDisplayDate(eventDate);
  $("war-signup-event-date-practice").value=formatDisplayDate(eventDate);
  $("war-signup-start-time").value=formatTime(data.start_time)==="-"?"":formatTime(data.start_time).slice(0,5);
  $("war-signup-start-time-display").value=$("war-signup-start-time").value;
  $("war-signup-opens-at").value=formatDisplayDateTime(data.signup_opens_at);$("war-signup-closes-at").value=formatDisplayDateTime(data.signup_closes_at);
  $("war-signup-description").value=String(data.description||"").replace(/\[\[WAR_CONFIG:\s*\{[\s\S]*?\}\s*\]\]/g,"").trim();
  updateWarSignupDateControls(eventDate,false);
  $("war-signup-create-confirm").textContent="บันทึกการแก้ไข Event";$("war-signup-create-form").classList.remove("hidden");$("war-signup-create-form").classList.add("is-editing");
  updateWarSignupTimeForDate();
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
  const name=$("war-signup-event-name").value.trim(),type=$("war-signup-type").value,date=parseDisplayDate($("war-signup-event-date").value);
  const startTime=$("war-signup-start-time").value,opens=$("war-signup-opens-at").value,closes=$("war-signup-closes-at").value;
  const description=$("war-signup-description").value.trim(),editId=$("war-signup-edit-id").value;
  const openDate=parseDisplayDateTime(opens),closeDate=parseDisplayDateTime(closes),showError=t=>{message.textContent=t;message.className="message error";};
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
  if(!openDate||!closeDate||closeDate<=openDate){showError("กรุณาระบุวันที่และเวลาให้ถูกต้อง และเวลาปิดรับสมัครต้องอยู่หลังเวลาเริ่มลงชื่อ");return;}
  if(closeDate<=new Date()){showError("เวลาปิดรับสมัครต้องเป็นเวลาในอนาคต");return;}
  button.disabled=true;button.textContent=editId?"กำลังบันทึกการแก้ไข...":"กำลังสร้าง Event...";
  try{
    let result;
    if(editId){
      const {data:existingEvent,error:existingError}=await supabaseClient.from("war_events").select("description").eq("id",editId).single();
      if(existingError)throw existingError;
      const existingConfig=String(existingEvent?.description||"").match(/\[\[WAR_CONFIG:\s*\{[\s\S]*?\}\s*\]\]/);
      const savedDescription=[description,existingConfig?.[0]||""].filter(Boolean).join("\\n\\n")||null;
      result=await supabaseClient.from("war_events").update({event_name:name,registration_type:type,event_date:date,start_time:startTime,signup_opens_at:openDate.toISOString(),signup_closes_at:closeDate.toISOString(),description:savedDescription}).eq("id",editId).select("id").single();
    }
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
  $("war-signup-event-date-select")?.addEventListener("change",()=>{
    const iso=$("war-signup-event-date-select").value;
    $("war-signup-event-date").value=iso?formatDisplayDate(iso):"";
    updateWarSignupTimeForDate();
  });
  $("war-signup-event-date-practice")?.addEventListener("change",()=>{
    const iso=parseDisplayDate($("war-signup-event-date-practice").value);
    $("war-signup-event-date").value=iso?formatDisplayDate(iso):"";
    updateWarSignupTimeForDate();
  });
  $("war-signup-type")?.addEventListener("change",()=>{
    const current=parseDisplayDate($("war-signup-event-date")?.value)||parseDisplayDate($("war-signup-event-date-practice")?.value)||"";
    updateWarSignupDateControls(current,false);
    updateWarSignupTimeForDate();
  });
  $("war-signup-start-time-display")?.addEventListener("change",()=>{
    if($("war-signup-type")?.value!=="practice")return;
    const value=$("war-signup-start-time-display").value.trim();
    if(/^([01]\\d|2[0-3]):[0-5]\\d$/.test(value))$("war-signup-start-time").value=value;
  });
  $("war-signup-create-form")?.addEventListener("submit",async e=>{e.preventDefault();await createWarSignupEvent(e.currentTarget);});
  $("war-signup-content")?.addEventListener("click",e=>{
    const join=e.target.closest("[data-war-signup-join]"),edit=e.target.closest("[data-war-signup-edit]"),del=e.target.closest("[data-war-signup-delete]"),evidence=e.target.closest("[data-war-signup-evidence]"),discord=e.target.closest("[data-war-signup-discord]");
    if(join)joinWarSignup(join.dataset.warSignupJoin,join);
    if(discord)sendWarSignupEventToDiscord(discord.dataset.warSignupDiscord,discord);
    if(edit)startEditWarSignupEvent(edit.dataset.warSignupEdit);
    if(del)deleteWarSignupEvent(del.dataset.warSignupDelete,del);
    if(evidence)exportWarSignupEvidence(evidence.dataset.warSignupEvidence,evidence);
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
    .on("postgres_changes", { event: "*", schema: "public", table: "war_skill_catalog" }, () => loadWarSkillData())
    .on("postgres_changes", { event: "*", schema: "public", table: "guild_member_skills" }, async () => { await loadWarSkillData(); const eventId=currentWarAssignmentEventId||selectedWarEventId; if(eventId) renderAllWarParties(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "war_party_members" }, async () => {
      const eventId = currentWarAssignmentEventId || selectedWarEventId;
      if (eventId) await loadSelectedWarEvent(eventId);
    })
    .subscribe();
}

function registerWarCreationEvents(){
 $("war-skill-library-toggle")?.addEventListener("click",()=>{if(!isManagement())return;const panel=$("war-skill-management");panel?.classList.toggle("hidden");if(!panel?.classList.contains("hidden")){renderWarSkillManager();panel.scrollIntoView({behavior:"smooth",block:"start"});}});
 $("war-skill-add-toggle")?.addEventListener("click",()=>{if(!isManagement())return;const form=$("war-skill-form"),opening=form?.classList.contains("hidden");form?.classList.toggle("hidden");$("war-skill-add-toggle")?.setAttribute("aria-expanded",String(Boolean(opening)));if(opening)$("war-skill-name")?.focus();});
 $("war-skill-delete-mode")?.addEventListener("click",()=>{if(!isManagement())return;warSkillDeleteMode=!warSkillDeleteMode;renderWarSkillManager();});
 $("war-skill-library-close")?.addEventListener("click",()=>$("war-skill-management")?.classList.add("hidden"));
 $("war-skill-form")?.addEventListener("submit",saveWarSkillDefinition);
  document.body.addEventListener("submit",event=>{if(event.target.id==="war-member-skill-create-form")saveWarMemberSkillFromEditor(event);});
 $("war-skill-library-list")?.addEventListener("click",event=>{const button=event.target.closest("[data-war-skill-delete]"),edit=event.target.closest("[data-war-skill-edit]");if(button&&warSkillDeleteMode){deleteWarSkill(button.dataset.warSkillDelete,button);return;}if(edit&&!warSkillDeleteMode)openWarSkillEditor(edit.dataset.warSkillEdit);});
 document.body.addEventListener("submit",event=>{if(event.target.id==="war-skill-edit-form")saveWarSkillEdit(event);});
 document.body.addEventListener("click",event=>{if(event.target.closest("[data-war-skill-edit-close]"))$("war-skill-edit-modal")?.remove();});

 $("war-raid-boards")?.addEventListener("click",e=>{const add=e.target.closest("[data-war-add-slot]"),manage=e.target.closest("[data-war-manage-slot]");if(add)openWarAssignmentModal(add.dataset.partyId,Number(add.dataset.position));else if(manage)openWarAssignmentModal(manage.dataset.partyId,Number(manage.dataset.position),manage.dataset.assignmentId);});
 $("war-assignment-toolbar")?.addEventListener("click",e=>{const f=e.target.closest("[data-war-filter]"),c=e.target.closest("[data-war-class-filter]"),pool=e.target.closest("[data-war-pool-member]");if(f){warAssignmentFilter=f.dataset.warFilter||"all";applyWarAssignmentMemberFilters();}if(c){warAssignmentClassFilter=c.dataset.warClassFilter||"all";applyWarAssignmentMemberFilters();}if(pool){const p=currentWarParties.find(x=>x.raid===warAssignmentFilter&&(x.war_party_members||[]).length<6)||currentWarParties.find(x=>(x.war_party_members||[]).length<6);if(!p){alert("ไม่พบ Party ที่ว่าง");return;}const used=new Set((p.war_party_members||[]).map(x=>Number(x.position))),pos=[1,2,3,4,5,6].find(x=>!used.has(x));if(pos){openWarAssignmentModal(p.id,pos);const picked=allMembers.find(m=>m.user_id===pool.dataset.warPoolMember);const search=$("war-modal-member-search");if(picked&&search){search.value=getMemberName(picked);renderWarAssignmentModalMembers();}}}});
 $("war-assignment-toolbar")?.addEventListener("input",e=>{if(e.target.id==="war-assignment-search"){warAssignmentSearch=e.target.value;applyWarAssignmentMemberFilters();}});
 document.body.addEventListener("click",e=>{if(e.target.closest("[data-war-modal-close]")){closeWarAssignmentModal();return;}const tab=e.target.closest("[data-war-modal-tab]");if(tab){const modal=$("war-assignment-modal"),skillsPanel=$("war-modal-skills-panel"),membersPanel=$("war-modal-members-panel"),active=tab.dataset.warModalTab;if(modal)modal.dataset.activeTab=active;modal?.querySelectorAll("[data-war-modal-tab]").forEach(b=>{const selected=b===tab;b.classList.toggle("is-active",selected);b.setAttribute("aria-selected",String(selected));});if(skillsPanel)skillsPanel.hidden=active!=="skills";if(membersPanel)membersPanel.hidden=active!=="members";if(active==="members")renderWarAssignmentModalMembers();return;}const uploadToggle=e.target.closest("[data-war-skill-upload-toggle]");if(uploadToggle){const form=$("war-member-skill-create-form");if(form)form.hidden=!form.hidden;return;}const add=e.target.closest("[data-war-modal-assign]"),remove=e.target.closest("[data-war-modal-remove]"),saveSkills=e.target.closest("[data-war-save-member-skills]"),cls=e.target.closest("[data-war-modal-class]"),reserveTab=e.target.closest("[data-war-modal-reserve]");if(reserveTab){const modal=$("war-assignment-modal");if(modal){modal.dataset.reserveOnly=modal.dataset.reserveOnly==="true"?"false":"true";reserveTab.classList.toggle("is-active",modal.dataset.reserveOnly==="true");modal.querySelector("[data-war-modal-class=\"all\"]")?.classList.toggle("is-active",modal.dataset.reserveOnly!=="true");renderWarAssignmentModalMembers();}return;}if(saveSkills){saveWarMemberSkills(saveSkills.dataset.warSaveMemberSkills,saveSkills);return;}if(add){assignWarMemberToSlot(add.dataset.warModalAssign);return;}if(remove&&warAssignmentModalSlot?.assignmentId){removeWarPartyMember(warAssignmentModalSlot.assignmentId,remove);return;}if(cls){const modal=$("war-assignment-modal");if(modal)modal.dataset.classFilter=cls.dataset.warModalClass||"all";modal?.querySelectorAll("[data-war-modal-class]").forEach(b=>b.classList.toggle("is-active",b===cls));renderWarAssignmentModalMembers();}});
 document.body.addEventListener("input",e=>{if(e.target.id==="war-modal-member-search")renderWarAssignmentModalMembers();});
  $("war-events")?.addEventListener("click",event=>{
    const deleteButton=event.target.closest("[data-war-delete]");
    if(deleteButton){deleteWarEvent(deleteButton.dataset.warDelete,deleteButton);return;}
    const button=event.target.closest("[data-war-open]");
    if(!button||!isManagement())return;
    renderWarLayout(button.dataset.warOpen);
    $("war-detail-stage")?.scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("war-create-open")?.addEventListener("click",()=>{if(!isManagement())return;selectedWarEventId=null;updateWarCreateMode();$("war-detail-stage")?.classList.add("hidden");$("war-create-panel")?.classList.remove("hidden");$("war-create-message")?.classList.add("hidden");$("war-create-panel")?.scrollIntoView({behavior:"smooth",block:"start"});});
  ["war-create-close","war-create-cancel"].forEach(id=>$(id)?.addEventListener("click",()=>$("war-create-panel")?.classList.add("hidden")));
  $("war-back-to-list")?.addEventListener("click",()=>{$("war-detail-stage")?.classList.add("hidden");$("war-events")?.scrollIntoView({behavior:"smooth",block:"start"});});
  $("war-confirm-draft")?.addEventListener("click",confirmWarDraft);$("war-publish-event")?.addEventListener("click",publishWarEvent);$("war-export-image")?.addEventListener("click",exportWarImage);$("war-sync-discord")?.addEventListener("click",()=>alert("Discord Bot Sync ยังไม่เปิดใช้งานในขณะนี้"));
  document.querySelectorAll('input[name="war-mode"]').forEach(input=>input.addEventListener("change",updateWarCreateMode));$("war-raid-count")?.addEventListener("change",updateWarCreateMode);$("war-create-form")?.addEventListener("submit",handleWarCreate);$("war-event-date-display")?.addEventListener("click",openWarDatePicker);$("war-start-time-display")?.addEventListener("click",openPracticeTimePicker);$("war-event-date")?.addEventListener("change",()=>{syncPracticeDateDisplay();});$("war-start-time")?.addEventListener("change",syncPracticeTimeDisplay);$("war-event-date-display")?.addEventListener("input",syncPracticeDateDisplay);$("war-event-date-display")?.addEventListener("blur",()=>{syncPracticeDateDisplay();const input=$("war-event-date-display"),parsed=$("war-event-date")?.value;if(parsed)input.value=formatWarDateDisplay(parsed);});$("war-start-time-display")?.addEventListener("input",syncPracticeTimeDisplay);$("war-start-time-display")?.addEventListener("blur",syncPracticeTimeDisplay);
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
  { value: "admin", label: "HR" },
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
    admin: "HR",
    member: "Member"
  };
  return labels[String(role || "member").toLowerCase()] || "Member";
}

function renderSystemRoleSummary(members) {
  const counts = {
    total: members.length,
    management: members.filter(m => String(m.role || "").toLowerCase() === "management").length,
    admins: members.filter(m => String(m.role || "").toLowerCase() === "admin").length,
    leaders: members.filter(m => String(m.role || "").toLowerCase() === "leader").length,
    pending: members.filter(m => m.active === false).length
  };

  const set = (id, value) => {
    const element = $(id);
    if (element) element.textContent = String(value);
  };
  set("system-role-total", counts.total);
  set("system-role-management", counts.management);
  set("system-role-admin", counts.admins);
  set("system-role-leaders", counts.leaders);
  set("system-role-pending", counts.pending);
}

function getFilteredSystemRoleMembers() {
  const query = String($("system-role-search")?.value || "").trim().toLowerCase();
  return systemRoleMembers.filter(member => {
    const role = String(member.role || "member").toLowerCase();
    const matchesRole = systemRoleFilter === "all"
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
            ${isProtected ? '<option selected>Developer (Protected)</option>' : options}
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


// ==========================================
// GLOBAL CLICK-TO-OPEN DATE / TIME PICKERS
// ==========================================
function closeGlobalDateTimePicker(){
 document.querySelector(".global-date-time-popover")?.remove();
}
function parseDisplayDate(value){
 const match=String(value||"").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 return match?match[3]+"-"+match[2]+"-"+match[1]:"";
}
function formatDisplayDate(iso){
 const match=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
 return match?match[3]+"/"+match[2]+"/"+match[1]:"";
}
function parseDisplayDateTime(value){
 const match=String(value||"").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
 if(!match)return null;
 const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]),hour=Number(match[4]),minute=Number(match[5]);
 if(year<1000||month<1||month>12||day<1||day>31||hour>23||minute>59)return null;
 const date=new Date(year,month-1,day,hour,minute,0,0);
 return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day&&date.getHours()===hour&&date.getMinutes()===minute?date:null;
}
function formatDisplayDateTime(value){
 if(!value)return "";
 const date=new Date(value);if(Number.isNaN(date.getTime()))return "";
 return formatDisplayDate(date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0"))+" "+String(date.getHours()).padStart(2,"0")+":"+String(date.getMinutes()).padStart(2,"0");
}
function globalPickerDateValue(input){
 const value=String(input.value||"");
 if(input.matches("[data-activity-datetime-input]"))return parseDisplayDate(value.slice(0,10));
 if(input.type==="datetime-local")return value.slice(0,10);
 if(input.type==="date")return value;
 return parseDisplayDate(value);
}
function globalPickerTimeValue(input){
 const value=String(input.value||"");
 if(input.matches("[data-activity-datetime-input]"))return value.slice(11,16);
 if(input.type==="datetime-local")return value.slice(11,16);
 return /^\d{2}:\d{2}$/.test(value)?value:"";
}
function setGlobalPickerValue(input,dateValue,timeValue){
 if(input.matches("[data-activity-datetime-input]"))input.value=formatDisplayDate(dateValue)+" "+timeValue;
 else if(input.type==="date")input.value=dateValue;
 else if(input.type==="time")input.value=timeValue;
 else if(input.type==="datetime-local")input.value=dateValue+"T"+timeValue;
 else if(input.matches("[data-activity-date-input]"))input.value=formatDisplayDate(dateValue);
 else if(input.matches("[data-activity-time-input]"))input.value=timeValue;
 input.dispatchEvent(new Event("input",{bubbles:true}));
 input.dispatchEvent(new Event("change",{bubbles:true}));
}
function getNextFourWarSaturdays(){
 const today=new Date();today.setHours(0,0,0,0);
 const daysUntilSaturday=(6-today.getDay()+7)%7||7;
 return Array.from({length:4},(_,index)=>{
  const date=new Date(today);date.setDate(today.getDate()+daysUntilSaturday+index*7);
  return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
 });
}
function openGlobalDatePicker(input){
 if(!input||input.disabled||(input.readOnly&&!input.matches("[data-activity-date-input],[data-activity-datetime-input]")))return;
 closeGlobalDateTimePicker();
 const wrapper=input.closest(".form-group")||input.parentElement;if(!wrapper)return;
 const isOfficialWarDate=input.matches("[data-war-signup-date]")&&$("war-signup-type")?.value==="official";
 const allowedWarDates=isOfficialWarDate?getNextFourWarSaturdays():null;
 let dateValue=globalPickerDateValue(input);
 if(allowedWarDates&&!allowedWarDates.includes(dateValue))dateValue="";
 let chosenDate=dateValue||"";
 let chosenTime=globalPickerTimeValue(input)||"20:00";
 const isDateTime=input.type==="datetime-local"||input.matches("[data-activity-datetime-input]");
 const panel=document.createElement("div");panel.className="war-date-picker-popover global-date-time-popover";
 const render=()=>{
  if(allowedWarDates){
   panel.innerHTML='<div class="war-date-picker-heading"><strong>เลือกวันเสาร์ 4 ครั้งถัดไป</strong></div><div class="war-calendar-grid war-next-saturdays">'+allowedWarDates.map(iso=>'<button type="button" class="war-calendar-day'+(iso===chosenDate?' is-selected':'')+'" data-global-date="'+iso+'">'+formatDisplayDate(iso)+'</button>').join("")+'</div>';
   panel.querySelectorAll("[data-global-date]").forEach(btn=>btn.addEventListener("click",()=>{setGlobalPickerValue(input,btn.dataset.globalDate,"");closeGlobalDateTimePicker();}));
   wrapper.appendChild(panel);return;
  }
  const year=view.getFullYear(),month=view.getMonth(),offset=(new Date(year,month,1).getDay()+6)%7,days=new Date(year,month+1,0).getDate();
  const label=new Intl.DateTimeFormat("th-TH",{month:"long",year:"numeric"}).format(view);
  const cells=Array.from({length:offset},()=>'<span class="war-calendar-empty"></span>');
  for(let day=1;day<=days;day++){
   const iso=year+"-"+String(month+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
   cells.push('<button type="button" class="war-calendar-day'+(iso===chosenDate?' is-selected':'')+'" data-global-date="'+iso+'">'+day+'</button>');
  }
  panel.innerHTML='<div class="war-date-picker-heading"><button type="button" class="war-calendar-nav" data-global-month="-1">‹</button><strong>'+label+'</strong><button type="button" class="war-calendar-nav" data-global-month="1">›</button></div><div class="war-calendar-weekdays"><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span><span>อา</span></div><div class="war-calendar-grid">'+cells.join("")+'</div>'+(isDateTime?'<div class="global-picker-time-row"><label>เวลา</label><select class="global-picker-hour">'+Array.from({length:24},(_,i)=>'<option value="'+String(i).padStart(2,"0")+'"'+(String(i).padStart(2,"0")===chosenTime.slice(0,2)?' selected':'')+'>'+String(i).padStart(2,"0")+'</option>').join("")+'</select><span>:</span><select class="global-picker-minute">'+Array.from({length:60},(_,i)=>'<option value="'+String(i).padStart(2,"0")+'"'+(String(i).padStart(2,"0")===chosenTime.slice(3,5)?' selected':'')+'>'+String(i).padStart(2,"0")+'</option>').join("")+'</select></div><div class="war-time-picker-actions"><button type="button" class="war-time-picker-cancel">ยกเลิก</button><button type="button" class="war-time-picker-confirm">ยืนยัน</button></div>':'');
  panel.querySelectorAll("[data-global-month]").forEach(btn=>btn.addEventListener("click",()=>{view=new Date(year,month+Number(btn.dataset.globalMonth),1);render();}));
  panel.querySelectorAll("[data-global-date]").forEach(btn=>btn.addEventListener("click",()=>{chosenDate=btn.dataset.globalDate;if(isDateTime){panel.querySelectorAll("[data-global-date]").forEach(x=>x.classList.toggle("is-selected",x.dataset.globalDate===chosenDate));}else{setGlobalPickerValue(input,chosenDate,"");closeGlobalDateTimePicker();}}));
  if(isDateTime){
   panel.querySelector(".global-picker-hour").addEventListener("change",event=>{chosenTime=event.target.value+":"+chosenTime.slice(3,5);});
   panel.querySelector(".global-picker-minute").addEventListener("change",event=>{chosenTime=chosenTime.slice(0,3)+event.target.value;});
   panel.querySelector(".war-time-picker-cancel").addEventListener("click",closeGlobalDateTimePicker);
   panel.querySelector(".war-time-picker-confirm").addEventListener("click",()=>{if(!chosenDate){alert("กรุณาเลือกวันที่");return;}setGlobalPickerValue(input,chosenDate,chosenTime);closeGlobalDateTimePicker();});
  }
 };
 const initial=dateValue?new Date(dateValue+"T12:00:00"):new Date();
 let view=new Date(initial.getFullYear(),initial.getMonth(),1);
 wrapper.appendChild(panel);render();
}
function openGlobalTimePicker(input){
 if(!input||input.disabled||(input.readOnly&&!input.matches("[data-activity-time-input]")))return;
 closeGlobalDateTimePicker();
 const wrapper=input.closest(".form-group")||input.parentElement;if(!wrapper)return;
 const current=globalPickerTimeValue(input)||"20:00",[hour,minute]=current.split(":");
 const panel=document.createElement("div");panel.className="war-time-picker-popover global-date-time-popover";
 panel.innerHTML='<div class="war-time-picker-title">เลือกเวลา (24 ชั่วโมง)</div><div class="war-time-picker-selects"><select class="war-time-hour">'+Array.from({length:24},(_,i)=>'<option value="'+String(i).padStart(2,"0")+'"'+(String(i).padStart(2,"0")===hour?' selected':'')+'>'+String(i).padStart(2,"0")+'</option>').join("")+'</select><span>:</span><select class="war-time-minute">'+Array.from({length:60},(_,i)=>'<option value="'+String(i).padStart(2,"0")+'"'+(String(i).padStart(2,"0")===minute?' selected':'')+'>'+String(i).padStart(2,"0")+'</option>').join("")+'</select></div><div class="war-time-picker-actions"><button type="button" class="war-time-picker-cancel">ยกเลิก</button><button type="button" class="war-time-picker-confirm">ยืนยัน</button></div>';
 panel.querySelector(".war-time-picker-cancel").addEventListener("click",closeGlobalDateTimePicker);
 panel.querySelector(".war-time-picker-confirm").addEventListener("click",()=>{setGlobalPickerValue(input,"",panel.querySelector(".war-time-hour").value+":"+panel.querySelector(".war-time-minute").value);closeGlobalDateTimePicker();});
 wrapper.appendChild(panel);
}
function initializeGlobalDateTimePickers(){
 if(document.documentElement.dataset.globalDateTimeReady==="true")return;
 document.documentElement.dataset.globalDateTimeReady="true";
 document.querySelectorAll('input[type="date"],input[type="time"],input[type="datetime-local"],[data-activity-date-input],[data-activity-time-input],[data-activity-datetime-input]').forEach(input=>{
  if(input.classList.contains("war-native-picker-input"))return;
  input.style.cursor="pointer";
  if(input.matches("[data-activity-date-input],[data-activity-time-input],[data-activity-datetime-input]"))input.readOnly=true;
 });
 document.addEventListener("click",event=>{
  const input=event.target.closest('input[type="date"],input[type="time"],input[type="datetime-local"],[data-activity-date-input],[data-activity-time-input],[data-activity-datetime-input]');
  if(!input||input.classList.contains("war-native-picker-input"))return;
  event.preventDefault();event.stopPropagation();
  if(input.type==="time"||input.matches("[data-activity-time-input]"))openGlobalTimePicker(input);
  else openGlobalDatePicker(input);
 },true);
 document.addEventListener("keydown",event=>{if(event.key==="Escape")closeGlobalDateTimePicker();});
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
  if(["DIV","P","SPAN","TD","TH"].includes(tag)){const st=node.style||{};if(["left","center","right","justify"].includes(st.textAlign))el.style.textAlign=st.textAlign;if(/^\\d{1,2}px$/.test(st.fontSize||"")&&parseInt(st.fontSize)<=72)el.style.fontSize=Math.max(14,parseInt(st.fontSize,10))+"px";if(/^(Arial|Tahoma|Georgia|Verdana|monospace)$/i.test(st.fontFamily||""))el.style.fontFamily=st.fontFamily;if(/^#[0-9a-f]{6}$/i.test(st.color||""))el.style.color=st.color;if(/^#[0-9a-f]{6}$/i.test(st.backgroundColor||""))el.style.backgroundColor=st.backgroundColor;}if(tag==="TABLE")el.className="guild-rich-table";
  [...node.childNodes].forEach(n=>el.appendChild(clean(n)));return el;
 };
 const out=parsed.createElement("div");[...parsed.body.childNodes].forEach(n=>out.appendChild(clean(n)));return out.innerHTML;
}
function activityDateLabel(value){
 if(!value)return "";
 const date=new Date(value);if(Number.isNaN(date.getTime()))return "";
 return new Intl.DateTimeFormat("th-TH",{day:"2-digit",month:"2-digit",year:"numeric",calendar:"gregory",numberingSystem:"latn",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
}
function activityInputParts(value){
 if(!value)return {date:"",time:""};
 const date=new Date(value);if(Number.isNaN(date.getTime()))return {date:"",time:""};
 return {
  date:String(date.getDate()).padStart(2,"0")+"/"+String(date.getMonth()+1).padStart(2,"0")+"/"+date.getFullYear(),
  time:String(date.getHours()).padStart(2,"0")+":"+String(date.getMinutes()).padStart(2,"0")
 };
}
function parseActivityDateTime(dateValue,timeValue,label){
 const dateText=String(dateValue||"").trim(),timeText=String(timeValue||"").trim();
 if(!dateText&&!timeText)return null;
 if(!dateText||!timeText)throw new Error("กรุณากรอก"+label+"ทั้งวันที่และเวลา");
 const dateMatch=dateText.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 const timeMatch=timeText.match(/^(\d{2}):(\d{2})$/);
 if(!dateMatch)throw new Error("รูปแบบวันที่"+label+"ต้องเป็น dd/mm/yyyy");
 if(!timeMatch)throw new Error("รูปแบบเวลา"+label+"ต้องเป็น 24 ชั่วโมง HH:mm");
 const day=Number(dateMatch[1]),month=Number(dateMatch[2]),year=Number(dateMatch[3]);
 const hour=Number(timeMatch[1]),minute=Number(timeMatch[2]);
 const check=new Date(0);check.setFullYear(year,month-1,day);check.setHours(0,0,0,0);
 if(year<1000||year>9999||check.getFullYear()!==year||check.getMonth()!==month-1||check.getDate()!==day)
  throw new Error("วันที่"+label+"ไม่ถูกต้อง");
 if(hour>23||minute>59)throw new Error("เวลา"+label+"ไม่ถูกต้อง กรุณาใช้ 00:00–23:59");
 const local=new Date(0);local.setFullYear(year,month-1,day);local.setHours(hour,minute,0,0);
 return local.toISOString();
}
function formatActivityDateInput(value){
 const digits=String(value||"").replace(/\D/g,"").slice(0,8);
 if(digits.length<=2)return digits;
 if(digits.length<=4)return digits.slice(0,2)+"/"+digits.slice(2);
 return digits.slice(0,2)+"/"+digits.slice(2,4)+"/"+digits.slice(4);
}
function formatActivityTimeInput(value){
 const digits=String(value||"").replace(/\D/g,"").slice(0,4);
 return digits.length<=2?digits:digits.slice(0,2)+":"+digits.slice(2);
}
function activityDateRange(item){
 const start=item.starts_at?activityDateLabel(item.starts_at):"ไม่กำหนดเวลาเริ่ม";
 const end=item.ends_at?activityDateLabel(item.ends_at):"ไม่กำหนดเวลาสิ้นสุด";
 return start+" – "+end;
}
let guildActivityCommentsCache={};
let guildActivityMembersCache={};
let guildActivityRealtimeChannel=null;
let guildActivityEmojiRange=null;
const GUILD_ACTIVITY_EMOJIS=["😀","😃","😄","😁","😆","🥹","😂","🤣","😊","😍","🥰","😘","😎","🤔","😴","😭","😡","🤯","🥳","🤩","👍","👎","👏","🙌","🙏","💪","❤️","🧡","💛","💚","💙","💜","🖤","🤍","🔥","✨","⭐","🌟","🎉","🎊","🎁","🏆","🥇","⚔️","🛡️","🐉","🌸","🍀","🎮","📢","📌","📅","⏰","✅","❌","❗","💬"];
function rememberActivityEmojiSelection(){
 const editor=$("activity-editor-body");if(!editor)return;
 const selection=window.getSelection();
 if(selection&&selection.rangeCount&&editor.contains(selection.anchorNode))guildActivityEmojiRange=selection.getRangeAt(0).cloneRange();
}
function insertActivityEmoji(value){
 const editor=$("activity-editor-body");if(!editor)return;
 editor.focus();
 const selection=window.getSelection();
 if(guildActivityEmojiRange){selection.removeAllRanges();selection.addRange(guildActivityEmojiRange);}
 document.execCommand("insertText",false,value);
 guildActivityEmojiRange=null;
 $("activity-emoji-picker")?.classList.add("hidden");
}
function renderActivityEmojiPicker(){
 const picker=$("activity-emoji-picker");if(!picker)return;
 picker.innerHTML='<div class="activity-emoji-grid">'+GUILD_ACTIVITY_EMOJIS.map((emoji,index)=>'<button type="button" class="activity-emoji-option" data-activity-emoji-value="'+index+'" aria-label="Emoji '+emoji+'">'+emoji+'</button>').join("")+'</div>';
}
async function notifyGuildActivityDiscord(kind,id){
 try{
  const body=kind==="activity"?{kind,activity_id:id}:{kind,comment_id:id};
  const {data,error}=await supabaseClient.functions.invoke("discord-guild-activity-notify",{body});
  if(error||data?.success===false){console.warn("Guild activity Discord notification failed:",error||data);return false;}
  return true;
 }catch(error){console.warn("Guild activity Discord notification failed:",error);return false;}
}
function renderGuildActivities(){
 const list=$("guild-activities-list");if(!list)return;
 const view=window.activeGuildCommunityView||"community-board";
 const visibleItems=guildActivitiesCache.filter(item=>{
  if(view==="guild-news")return !item.starts_at&&!item.ends_at;
  if(view==="guild-activities")return Boolean(item.starts_at||item.ends_at);
  return true;
 });
 if(!visibleItems.length){
  const emptyCopy=view==="guild-news"?"ยังไม่มีข่าวสารที่เผยแพร่":view==="guild-activities"?"ยังไม่มีกิจกรรมที่มีกำหนดการ":"ยังไม่มีโพสต์ใน Community Board";
  list.innerHTML='<div class="empty-state"><span>◷</span><h3>'+emptyCopy+'</h3><p>'+(isManagement()?'กด “เพิ่มกิจกรรม” เพื่อเผยแพร่เนื้อหาใหม่':'ขณะนี้ยังไม่มีเนื้อหาที่เผยแพร่')+'</p></div>';
  return;
 }
 list.innerHTML=visibleItems.map(item=>{
  const id=escapeHTML(item.id),title=escapeHTML(item.title||"กิจกรรมกิลด์");
  const actions=isManagement()?'<div class="activity-card-actions"><button type="button" class="btn btn-outline btn-sm" data-activity-edit="'+id+'">แก้ไข</button><button type="button" class="btn btn-danger btn-sm" data-activity-delete="'+id+'">ลบ</button></div>':"";
  const comments=(guildActivityCommentsCache[item.id]||[]).map(comment=>{
   const cid=escapeHTML(comment.id),name=escapeHTML(comment.character_name||comment.nickname||"สมาชิกกิลด์"),when=escapeHTML(activityDateLabel(comment.created_at)),content=escapeHTML(comment.content||"");
   const mine=comment.user_id===currentUser?.id;
   const controls=(mine||isManagement())?'<div class="activity-comment-actions">'+(mine?'<button type="button" data-activity-comment-edit="'+cid+'">แก้ไข</button>':"")+'<button type="button" data-activity-comment-delete="'+cid+'">ลบ</button></div>':"";
   return '<article class="activity-comment" data-activity-comment-card="'+cid+'"><div class="activity-comment-heading"><strong>'+name+'</strong><time>'+when+'</time></div><p data-activity-comment-text>'+content+'</p>'+controls+'</article>';
  }).join("");
  return '<article class="activity-card" data-activity-card="'+id+'"><header class="activity-card-header"><div class="activity-card-title-wrap"><span class="panel-kicker">4AM GUILD · COMMUNITY</span><h3>'+title+'</h3><time>กำหนดการ: '+escapeHTML(activityDateRange(item))+'</time><small>เผยแพร่เมื่อ '+escapeHTML(activityDateLabel(item.created_at))+'</small></div>'+actions+'</header><div class="activity-card-content">'+sanitizeGuildActivityHTML(item.content_html||"")+'</div><section class="activity-comments"><h4>ความคิดเห็น <span>('+((guildActivityCommentsCache[item.id]||[]).length)+')</span></h4><div class="activity-comments-list">'+(comments||'<p class="activity-comments-empty">ยังไม่มีความคิดเห็น</p>')+'</div><form class="activity-comment-form" data-activity-comment-form="'+id+'"><textarea name="comment" rows="2" maxlength="2000" placeholder="เขียนความคิดเห็น..." required></textarea><button type="submit" class="btn btn-primary btn-sm">ส่งความคิดเห็น</button></form></section></article>';
 }).join("");
}
async function loadGuildActivityComments(){
 const {data,error}=await supabaseClient.from("guild_activity_comments").select("id,activity_id,user_id,content,created_at,updated_at").order("created_at",{ascending:true});
 if(error){console.error("Load activity comments:",error);return;}
 const comments=data||[],ids=[...new Set(comments.map(row=>row.user_id).filter(Boolean))];
 guildActivityMembersCache={};
 if(ids.length){
  const {data:members,error:memberError}=await supabaseClient.from("guild_members").select("user_id,character_name,nickname").in("user_id",ids);
  if(memberError)console.warn("Load activity comment authors:",memberError);
  (members||[]).forEach(member=>guildActivityMembersCache[member.user_id]=member);
 }
 guildActivityCommentsCache={};
 comments.forEach(comment=>{
  const member=guildActivityMembersCache[comment.user_id]||{};
  comment.character_name=member.character_name||"";
  comment.nickname=member.nickname||"";
  (guildActivityCommentsCache[comment.activity_id] ||= []).push(comment);
 });
 renderGuildActivities();
}
async function loadGuildActivities(){
 const list=$("guild-activities-list");if(list)list.innerHTML='<div class="empty-state"><span>◷</span><h3>กำลังโหลดกิจกรรม</h3><p>กรุณารอสักครู่</p></div>';
 const {data,error}=await supabaseClient.from("guild_activities").select("id,title,content_html,starts_at,ends_at,created_by,updated_by,created_at,updated_at").order("created_at",{ascending:false});
 if(error){console.error("Load guild activities:",error);if(list)list.innerHTML='<div class="empty-state"><span>!</span><h3>โหลดกิจกรรมไม่สำเร็จ</h3><p>'+escapeHTML(error.message)+'</p></div>';return;}
 guildActivitiesCache=data||[];
 await loadGuildActivityComments();
 renderGuildActivities();
}
function subscribeToGuildActivityRealtime(){
 if(guildActivityRealtimeChannel){supabaseClient.removeChannel(guildActivityRealtimeChannel);guildActivityRealtimeChannel=null;}
 if(!currentUser)return;
 guildActivityRealtimeChannel=supabaseClient.channel("guild-activities-live-"+currentUser.id)
  .on("postgres_changes",{event:"*",schema:"public",table:"guild_activities"},()=>{
   if(!$("page-community")?.classList.contains("hidden"))loadGuildActivities();
   if(!$("page-dashboard")?.classList.contains("hidden"))loadDashboardAnnouncement();
  })
  .on("postgres_changes",{event:"*",schema:"public",table:"guild_activity_comments"},()=>{if(!$("page-community")?.classList.contains("hidden"))loadGuildActivityComments();})
  .subscribe();
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
 const startParts=activityInputParts(item?.starts_at),endParts=activityInputParts(item?.ends_at);
 $("activity-start-date-input").value=startParts.date;$("activity-start-time-input").value=startParts.time;
 $("activity-end-date-input").value=endParts.date;$("activity-end-time-input").value=endParts.time;
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
 $("activity-start-date-input").value="";$("activity-start-time-input").value="";
 $("activity-end-date-input").value="";$("activity-end-time-input").value="";
 $("activity-emoji-picker")?.classList.add("hidden");
 $("activity-add-button")?.classList.toggle("hidden",!isManagement());
}
function registerGuildActivityEvents(){
 const page=$("page-community");if(!page||page.dataset.eventsReady==="true")return;page.dataset.eventsReady="true";
 renderActivityEmojiPicker();
 page.addEventListener("input",event=>{
  if(event.target.matches("[data-activity-date-input]"))event.target.value=formatActivityDateInput(event.target.value);
  if(event.target.matches("[data-activity-time-input]"))event.target.value=formatActivityTimeInput(event.target.value);
 });
 page.addEventListener("mousedown",event=>{if(event.target.closest("#activity-editor-body"))rememberActivityEmojiSelection();});
 page.addEventListener("click",async event=>{
  const add=event.target.closest("#activity-add-button"),edit=event.target.closest("[data-activity-edit]"),del=event.target.closest("[data-activity-delete]"),cmd=event.target.closest("[data-activity-command]"),emoji=event.target.closest("[data-activity-emoji]"),emojiValue=event.target.closest("[data-activity-emoji-value]"),image=event.target.closest("[data-activity-image]");
  if(add){openGuildActivityEditor();return;}
  if(edit){if(!isManagement())return;openGuildActivityEditor(edit.dataset.activityEdit);return;}
  if(del){
   if(!isManagement())return;
   const id=del.dataset.activityDelete,item=guildActivitiesCache.find(row=>row.id===id);if(!item)return;
   if(!window.confirm('ต้องการลบกิจกรรม “'+item.title+'” ใช่หรือไม่?'))return;
   del.disabled=true;
   try{const {error}=await supabaseClient.from("guild_activities").delete().eq("id",id);if(error)throw error;guildActivitiesCache=guildActivitiesCache.filter(row=>row.id!==id);delete guildActivityCommentsCache[id];renderGuildActivities();}
   catch(error){console.error("Delete guild activity:",error);alert("ลบกิจกรรมไม่สำเร็จ: "+error.message);del.disabled=false;}
   return;
  }
  if(cmd){if(!isManagement())return;const body=$("activity-editor-body");body?.focus();document.execCommand(cmd.dataset.activityCommand,false,null);return;}
  if(emoji){if(!isManagement())return;rememberActivityEmojiSelection();$("activity-emoji-picker")?.classList.toggle("hidden");return;}
  if(emojiValue){insertActivityEmoji(GUILD_ACTIVITY_EMOJIS[Number(emojiValue.dataset.activityEmojiValue)]||"✨");return;}
  if(image){if(isManagement())$("activity-image-input")?.click();return;}
  if(event.target.closest("#activity-cancel-button")){if(isManagement())closeGuildActivityEditor();return;}
  const commentEdit=event.target.closest("[data-activity-comment-edit]");
  if(commentEdit){
   const card=commentEdit.closest("[data-activity-comment-card]"),id=commentEdit.dataset.activityCommentEdit,comment=Object.values(guildActivityCommentsCache).flat().find(row=>row.id===id);
   if(!comment||comment.user_id!==currentUser?.id)return;
   const text=card.querySelector("[data-activity-comment-text]");
   if(card.querySelector("textarea"))return;
   const input=document.createElement("textarea");input.maxLength=2000;input.value=comment.content;input.className="activity-comment-edit-input";
   const save=document.createElement("button");save.type="button";save.className="btn btn-primary btn-sm";save.textContent="บันทึก";
   const cancel=document.createElement("button");cancel.type="button";cancel.className="btn btn-outline btn-sm";cancel.textContent="ยกเลิก";
   const wrap=document.createElement("div");wrap.className="activity-comment-edit-controls";wrap.append(input,save,cancel);text.replaceWith(wrap);
   save.addEventListener("click",async()=>{const content=input.value.trim();if(!content)return;save.disabled=true;const {error}=await supabaseClient.from("guild_activity_comments").update({content,updated_at:new Date().toISOString()}).eq("id",id);if(error){alert("แก้ไขความคิดเห็นไม่สำเร็จ: "+error.message);save.disabled=false;return;}await loadGuildActivityComments();});
   cancel.addEventListener("click",()=>loadGuildActivityComments());return;
  }
  const commentDelete=event.target.closest("[data-activity-comment-delete]");
  if(commentDelete){
   const id=commentDelete.dataset.activityCommentDelete,comment=Object.values(guildActivityCommentsCache).flat().find(row=>row.id===id);
   if(!comment||!(comment.user_id===currentUser?.id||isManagement()))return;
   if(!window.confirm("ต้องการลบความคิดเห็นนี้หรือไม่?"))return;
   commentDelete.disabled=true;const {error}=await supabaseClient.from("guild_activity_comments").delete().eq("id",id);
   if(error){alert("ลบความคิดเห็นไม่สำเร็จ: "+error.message);commentDelete.disabled=false;}else await loadGuildActivityComments();
   return;
  }
  if(event.target.closest("#activity-save-button")){
   if(!isManagement())return;
   const save=$("activity-save-button"),title=$("activity-title-input").value.trim(),body=$("activity-editor-body"),msg=$("activity-editor-message"),panel=$("activity-editor"),id=panel.dataset.editingId||"";
   if(!title){msg.textContent="กรุณาระบุหัวข้อกิจกรรม";msg.className="message error";$("activity-title-input").focus();return;}
   const content=sanitizeGuildActivityHTML(body.innerHTML);
   if(!content.trim()){msg.textContent="กรุณากรอกรายละเอียดกิจกรรม";msg.className="message error";body.focus();return;}
   let startsAt,endsAt;
   try{
    startsAt=parseActivityDateTime($("activity-start-date-input").value,$("activity-start-time-input").value,"เริ่ม");
    endsAt=parseActivityDateTime($("activity-end-date-input").value,$("activity-end-time-input").value,"สิ้นสุด");
   }catch(validationError){msg.textContent=validationError.message;msg.className="message error";return;}
   if(startsAt&&endsAt&&new Date(endsAt)<new Date(startsAt)){msg.textContent="เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม";msg.className="message error";return;}
   save.disabled=true;save.textContent="กำลังบันทึก...";
   try{
    const payload={title,content_html:content,starts_at:startsAt,ends_at:endsAt,updated_by:currentUser.id,updated_at:new Date().toISOString()};
    let result;
    if(id)result=await supabaseClient.from("guild_activities").update(payload).eq("id",id).select("id,title,content_html,starts_at,ends_at,created_by,updated_by,created_at,updated_at").single();
    else result=await supabaseClient.from("guild_activities").insert({...payload,created_by:currentUser.id}).select("id,title,content_html,starts_at,ends_at,created_by,updated_by,created_at,updated_at").single();
    if(result.error)throw result.error;
    const saved=result.data,index=guildActivitiesCache.findIndex(row=>row.id===saved.id);
    if(index>=0)guildActivitiesCache[index]=saved;else guildActivitiesCache.unshift(saved);
    guildActivitiesCache.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    closeGuildActivityEditor();renderGuildActivities();
    if(!id){const notified=await notifyGuildActivityDiscord("activity",saved.id);if(!notified)alert("บันทึกกิจกรรมแล้ว แต่แจ้งเตือน Discord ไม่สำเร็จ กรุณาตรวจสอบ Edge Function");}
   }catch(error){console.error("Save guild activity:",error);msg.textContent="บันทึกไม่สำเร็จ: "+error.message;msg.className="message error";}
   finally{save.disabled=false;save.textContent=id?"บันทึกการแก้ไข":"บันทึกกิจกรรม";}
  }
 });
 page.addEventListener("submit",async event=>{
  const form=event.target.closest("[data-activity-comment-form]");if(!form)return;
  event.preventDefault();if(!currentUser||!currentMember?.active)return;
  const textarea=form.querySelector("textarea"),button=form.querySelector("button"),content=textarea.value.trim();
  if(!content)return;
  button.disabled=true;button.textContent="กำลังส่ง...";
  try{
   const {data:inserted,error}=await supabaseClient.from("guild_activity_comments").insert({activity_id:form.dataset.activityCommentForm,user_id:currentUser.id,content}).select("id").single();
   if(error)throw error;
   const notified=await notifyGuildActivityDiscord("comment",inserted.id);if(!notified)console.warn("Comment saved, but Discord notification was not delivered");
   textarea.value="";await loadGuildActivityComments();
  }catch(error){console.error("Submit activity comment:",error);alert("ส่งความคิดเห็นไม่สำเร็จ: "+error.message);}
  finally{button.disabled=false;button.textContent="ส่งความคิดเห็น";}
 });
 page.addEventListener("change",async event=>{
  const input=event.target.closest("#activity-image-input");if(!input||!input.files?.length)return;
  const button=page.querySelector("[data-activity-image]"),body=$("activity-editor-body");
  try{if(button){button.disabled=true;button.textContent="กำลังอัปโหลด...";}const url=await uploadGuildActivityImage(input.files[0]);body?.focus();document.execCommand("insertHTML",false,'<img src="'+escapeHTML(url)+'" alt="Guild activity image">');}
  catch(error){alert(error.message||"อัปโหลดรูปไม่สำเร็จ");}
  finally{input.value="";if(button){button.disabled=false;button.textContent="▧ รูปภาพ";}}
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
    if (["DIV","P","SPAN","TD","TH"].includes(tag)) { const st=node.style||{}; if(["left","center","right","justify"].includes(st.textAlign)) element.style.textAlign=st.textAlign; if(/^\\d{1,2}px$/.test(st.fontSize||"")&&parseInt(st.fontSize)<=72)element.style.fontSize=Math.max(14,parseInt(st.fontSize,10))+"px"; if(/^(Arial|Tahoma|Georgia|Verdana|monospace)$/i.test(st.fontFamily||""))element.style.fontFamily=st.fontFamily; if(/^#[0-9a-f]{6}$/i.test(st.color||""))element.style.color=st.color; if(/^#[0-9a-f]{6}$/i.test(st.backgroundColor||""))element.style.backgroundColor=st.backgroundColor; } if(tag==="TABLE")element.className="guild-rich-table";
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

// GAME GUIDES
const GUILD_GUIDE_BUCKET = "guild-activity-images";
let guildGuidesCache = [];

function sanitizeGuildGuideHTML(html) {
  const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
  const allowed = new Set(["P","DIV","BR","STRONG","B","EM","I","U","UL","OL","LI","H2","H3","H4","BLOCKQUOTE","SPAN","IMG","S","STRIKE","TABLE","THEAD","TBODY","TR","TD","TH","HR","A","IFRAME"]);
  const imagePrefix = SUPABASE_URL + "/storage/v1/object/public/" + GUILD_GUIDE_BUCKET + "/";
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
    if (tag === "IMG") {
      const src = node.getAttribute("src") || "";
      if (!src.startsWith(imagePrefix)) return document.createTextNode("");
      element.src = src; element.alt = (node.alt || "Guide image").slice(0,120);
      element.loading = "lazy"; element.className = "guild-guide-image"; return element;
    }
    if (tag === "A") {
      const href = node.getAttribute("href") || "";
      if (!/^https?:\/\//i.test(href)) {
        [...node.childNodes].forEach(child => element.appendChild(clean(child)));
        return element;
      }
      element.href = href; element.target = "_blank"; element.rel = "noopener noreferrer";
    }
    if (tag === "IFRAME") {
      const src = node.getAttribute("src") || "";
      if (!/^https:\/\/(www\.)?youtube-nocookie\.com\/embed\/[\w-]{6,20}/i.test(src)) return document.createDocumentFragment();
      element.src = src; element.title = "YouTube video"; element.loading = "lazy";
      element.setAttribute("allowfullscreen",""); element.setAttribute("referrerpolicy","strict-origin-when-cross-origin");
      element.className = "guild-guide-video"; return element;
    }
    if (tag === "TABLE") element.className = "guild-rich-table";
    [...node.childNodes].forEach(child => element.appendChild(clean(child)));
    return element;
  };
  const output = document.createElement("div");
  [...parsed.body.childNodes].forEach(node => output.appendChild(clean(node)));
  return output.innerHTML;
}

function getGuideAuthorLabel(userId) {
  const member = allMembers.find(item => item.user_id === userId);
  return member ? getMemberName(member) : "สมาชิก 4AM";
}

function renderGuildGuides() {
  const list = $("guild-guides-list");
  if (!list) return;
  const search = String($("guide-search-input")?.value || "").trim().toLocaleLowerCase();
  const category = $("guide-category-filter")?.value || "all";
  let rows = [...guildGuidesCache];
  if (category !== "all") rows = rows.filter(row => row.category === category);
  if (search) rows = rows.filter(row =>
    String(row.title || "").toLocaleLowerCase().includes(search) ||
    String(row.category || "").toLocaleLowerCase().includes(search) ||
    String(row.content_html || "").replace(/<[^>]*>/g," ").toLocaleLowerCase().includes(search)
  );
  if (!rows.length) {
    showEmpty(list, "ยังไม่มีไกด์ที่ตรงกับการค้นหา", "เริ่มแบ่งปันความรู้ให้สมาชิกกิลด์ด้วยการสร้างไกด์เกมฉบับแรก");
    return;
  }
  list.innerHTML = rows.map(row => {
    const mine = row.user_id === currentUser?.id;
    const canEdit = mine || isManagement();
    const actions = canEdit
      ? '<div class="guide-card-actions"><button type="button" class="btn btn-outline btn-sm" data-guide-edit="' + escapeHTML(row.id) + '">แก้ไข</button><button type="button" class="btn btn-danger btn-sm" data-guide-delete="' + escapeHTML(row.id) + '">ลบ</button></div>' : "";
    return '<article class="guild-guide-card" data-guide-card="' + escapeHTML(row.id) + '">' +
      '<div class="guide-card-topline"><span class="guide-category-badge">' + escapeHTML(row.category || "ทั่วไป") + '</span>' +
      '<span class="guide-updated">' + (row.updated_at && row.updated_at !== row.created_at ? "แก้ไข " + escapeHTML(formatDate(row.updated_at)) : "เผยแพร่ " + escapeHTML(formatDate(row.created_at))) + '</span></div>' +
      '<h3>' + escapeHTML(row.title) + '</h3>' +
      '<div class="guide-card-content guide-content">' + sanitizeGuildGuideHTML(row.content_html) + '</div>' +
      '<div class="guide-card-footer"><span>โดย <strong>' + escapeHTML(getGuideAuthorLabel(row.user_id)) + '</strong></span>' + actions + '</div></article>';
  }).join("");
}

function refreshGuideCategoryFilter() {
  const select = $("guide-category-filter");
  if (!select) return;
  const current = select.value || "all";
  const categories = [...new Set(guildGuidesCache.map(row => row.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"th"));
  select.innerHTML = '<option value="all">ทุกหมวดหมู่</option>' + categories.map(value => '<option value="' + escapeHTML(value) + '">' + escapeHTML(value) + '</option>').join("");
  select.value = categories.includes(current) ? current : "all";
}

async function loadGuildGuides() {
  const list = $("guild-guides-list");
  if (list) list.innerHTML = '<div class="empty-state"><span>◷</span><h3>กำลังโหลดไกด์เกม</h3><p>กรุณารอสักครู่</p></div>';
  const { data, error } = await supabaseClient.from("guild_guides").select("*").order("updated_at", { ascending: false });
  if (error) {
    console.error("Load guild guides:", error);
    showEmpty(list, "โหลดไกด์เกมไม่สำเร็จ", error.message || "กรุณาตรวจสอบการตั้งค่า Supabase");
    return;
  }
  guildGuidesCache = data || [];
  refreshGuideCategoryFilter();
  renderGuildGuides();
}

function openGuildGuideEditor(id = null) {
  const panel = $("guide-editor-panel");
  const item = id ? guildGuidesCache.find(row => row.id === id) : null;
  if (id && (!item || !(item.user_id === currentUser?.id || isManagement()))) return;
  panel.dataset.editingId = item?.id || "";
  $("guide-editor-title").textContent = item ? "แก้ไขไกด์เกม" : "สร้างไกด์ใหม่";
  $("guide-title-input").value = item?.title || "";
  $("guide-category-input").value = item?.category || "ทั่วไป";
  $("guide-editor-body").innerHTML = sanitizeGuildGuideHTML(item?.content_html || "");
  $("guide-preview-panel").classList.add("hidden");
  $("guide-editor-message").textContent = "";
  $("guide-editor-message").className = "message";
  $("guide-save-button").textContent = item ? "บันทึกการแก้ไข" : "เผยแพร่ไกด์";
  panel.classList.remove("hidden");
  panel.scrollIntoView({behavior:"smooth",block:"start"});
  $("guide-title-input").focus();
}

function closeGuildGuideEditor() {
  const panel = $("guide-editor-panel");
  panel.classList.add("hidden");
  panel.dataset.editingId = "";
  $("guide-title-input").value = "";
  $("guide-category-input").value = "ทั่วไป";
  $("guide-editor-body").innerHTML = "";
  $("guide-preview-panel").classList.add("hidden");
  $("guide-editor-message").textContent = "";
}

async function uploadGuildGuideImage(file) {
  if (!currentUser || !currentMember || currentMember.active !== true) throw new Error("ไม่มีสิทธิ์อัปโหลดรูป");
  if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("รองรับ PNG, JPG, WEBP และ GIF");
  if (file.size > 8*1024*1024) throw new Error("รูปต้องมีขนาดไม่เกิน 8 MB");
  const ext = {"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"}[file.type];
  const path = currentUser.id + "/guides/" + crypto.randomUUID() + "." + ext;
  const { error } = await supabaseClient.storage.from(GUILD_GUIDE_BUCKET).upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
  if (error) throw error;
  return supabaseClient.storage.from(GUILD_GUIDE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function registerGuildGuideEvents() {
  const page = $("page-guides");
  if (!page || page.dataset.eventsReady === "true") return;
  page.dataset.eventsReady = "true";
  $("guide-create-button")?.addEventListener("click", () => openGuildGuideEditor());
  $("guide-cancel-button")?.addEventListener("click", closeGuildGuideEditor);
  $("guide-refresh-button")?.addEventListener("click", loadGuildGuides);
  $("guide-search-input")?.addEventListener("input", renderGuildGuides);
  $("guide-category-filter")?.addEventListener("change", renderGuildGuides);
  $("guide-preview-button")?.addEventListener("click", () => {
    const panel = $("guide-preview-panel");
    $("guide-preview-content").innerHTML = sanitizeGuildGuideHTML($("guide-editor-body").innerHTML);
    panel.classList.toggle("hidden");
    $("guide-preview-button").textContent = panel.classList.contains("hidden") ? "ดูตัวอย่าง" : "ซ่อนตัวอย่าง";
  });
  $("guide-link-button")?.addEventListener("click", () => {
    const url = window.prompt("วาง URL ของเว็บไซต์หรือแหล่งข้อมูล (https://...)");
    if (!url || !/^https?:\/\//i.test(url.trim())) return;
    const label = window.prompt("ข้อความที่ต้องการให้แสดงบนลิงก์", url.trim()) || url.trim();
    const body = $("guide-editor-body"); body.focus();
    document.execCommand("insertHTML", false, '<a href="' + escapeHTML(url.trim()) + '">' + escapeHTML(label) + '</a>');
  });
  $("guide-video-button")?.addEventListener("click", () => {
    const url = window.prompt("วางลิงก์วิดีโอ YouTube");
    if (!url) return;
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,20})/i);
    if (!match) { alert("ลิงก์ YouTube ไม่ถูกต้อง"); return; }
    $("guide-editor-body").focus();
    document.execCommand("insertHTML", false, '<p><iframe src="https://www.youtube-nocookie.com/embed/' + match[1] + '" title="YouTube video" allowfullscreen></iframe></p>');
  });
  $("guide-table-button")?.addEventListener("click", () => {
    $("guide-editor-body").focus();
    document.execCommand("insertHTML", false, '<table><tbody><tr><th>หัวข้อ</th><th>รายละเอียด</th></tr><tr><td>ข้อมูล</td><td>รายละเอียด</td></tr></tbody></table><p></p>');
  });
  page.addEventListener("click", async event => {
    const command = event.target.closest("[data-guide-command]");
    if (command) { $("guide-editor-body").focus(); document.execCommand(command.dataset.guideCommand,false,null); return; }
    if (event.target.closest("#guide-image-button")) { $("guide-image-input").click(); return; }
    const edit = event.target.closest("[data-guide-edit]");
    if (edit) { openGuildGuideEditor(edit.dataset.guideEdit); return; }
    const remove = event.target.closest("[data-guide-delete]");
    if (remove) {
      const item = guildGuidesCache.find(row => row.id === remove.dataset.guideDelete);
      if (!item || !(item.user_id === currentUser?.id || isManagement())) return;
      if (!window.confirm('ต้องการลบไกด์ "' + item.title + '" ใช่หรือไม่?')) return;
      remove.disabled = true;
      const { error } = await supabaseClient.from("guild_guides").delete().eq("id",item.id);
      if (error) { alert("ลบไกด์ไม่สำเร็จ: " + error.message); remove.disabled = false; return; }
      guildGuidesCache = guildGuidesCache.filter(row => row.id !== item.id);
      renderGuildGuides();
    }
  });
  page.addEventListener("change", async event => {
    const input = event.target.closest("#guide-image-input");
    if (!input?.files?.length) return;
    const button = $("guide-image-button");
    try {
      button.disabled = true; button.textContent = "กำลังอัปโหลด...";
      const url = await uploadGuildGuideImage(input.files[0]);
      $("guide-editor-body").focus();
      document.execCommand("insertHTML",false,'<p><img src="' + escapeHTML(url) + '" alt="Guide image"></p>');
    } catch (error) { alert(error.message || "อัปโหลดรูปไม่สำเร็จ"); }
    finally { input.value = ""; button.disabled = false; button.textContent = "▧ รูปภาพ"; }
  });
  $("guide-save-button")?.addEventListener("click", async () => {
    const button = $("guide-save-button"), title = $("guide-title-input").value.trim();
    const category = $("guide-category-input").value;
    const contentHTML = sanitizeGuildGuideHTML($("guide-editor-body").innerHTML);
    const textContent = $("guide-editor-body").innerText.trim();
    const editingId = $("guide-editor-panel").dataset.editingId || "";
    if (!title || !textContent) { showMessage("guide-editor-message","กรุณากรอกชื่อไกด์และเนื้อหาให้ครบถ้วน"); return; }
    if (title.length > 160 || contentHTML.length > 50000) { showMessage("guide-editor-message","ชื่อหรือเนื้อหาไกด์ยาวเกินกำหนด"); return; }
    button.disabled = true; button.textContent = "กำลังบันทึก...";
    try {
      let query;
      if (editingId) {
        const item = guildGuidesCache.find(row => row.id === editingId);
        if (!item || !(item.user_id === currentUser?.id || isManagement())) throw new Error("คุณไม่มีสิทธิ์แก้ไขไกด์นี้");
        query = supabaseClient.from("guild_guides").update({title,category,content_html:contentHTML,updated_at:new Date().toISOString()}).eq("id",editingId);
      } else {
        query = supabaseClient.from("guild_guides").insert({user_id:currentUser.id,title,category,content_html:contentHTML});
      }
      const { error } = await query;
      if (error) throw error;
      closeGuildGuideEditor();
      await loadGuildGuides();
      showMessage("guide-editor-message", "บันทึกไกด์เรียบร้อยแล้ว", "success");
    } catch (error) {
      showMessage("guide-editor-message","บันทึกไกด์ไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด"));
    } finally {
      button.disabled = false; button.textContent = editingId ? "บันทึกการแก้ไข" : "เผยแพร่ไกด์";
    }
  });
}
registerGuildGuideEvents();

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
  if(["DIV","P","SPAN","TD","TH"].includes(tag)){const st=node.style||{};if(["left","center","right","justify"].includes(st.textAlign))el.style.textAlign=st.textAlign;if(/^\\d{1,2}px$/.test(st.fontSize||"")&&parseInt(st.fontSize)<=72)el.style.fontSize=Math.max(14,parseInt(st.fontSize,10))+"px";if(/^(Arial|Tahoma|Georgia|Verdana|monospace)$/i.test(st.fontFamily||""))el.style.fontFamily=st.fontFamily;if(/^#[0-9a-f]{6}$/i.test(st.color||""))el.style.color=st.color;if(/^#[0-9a-f]{6}$/i.test(st.backgroundColor||""))el.style.backgroundColor=st.backgroundColor;}if(tag==="TABLE")el.className="guild-rich-table";
  [...node.childNodes].forEach(n=>el.appendChild(clean(n)));return el;
 };
 const out=parsed.createElement("div");[...parsed.body.childNodes].forEach(n=>out.appendChild(clean(n)));return out.innerHTML;
}
function renderGuildRuleCard(key,html){
 const content=$("rule-content-"+key);
 const edit=document.querySelector('[data-rule-edit="'+key+'"]');
 const remove=document.querySelector('[data-rule-delete="'+key+'"]');
 const add=document.querySelector('[data-rule-add="'+key+'"]');
 const has=Boolean(String(html||"").trim());
 const canManage=isManagement();
 if(content)content.innerHTML=has?sanitizeGuildRuleHTML(html):'<div class="empty-state"><span>◈</span><h3>ยังไม่มีรายละเอียด</h3><p>ฝ่ายบริหารสามารถเพิ่มรายละเอียดของหัวข้อนี้ได้</p></div>';
 edit?.classList.toggle("hidden",!has||!canManage);
 remove?.classList.toggle("hidden",!has||!canManage);
 add?.classList.toggle("hidden",has||!canManage);
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
  const add=event.target.closest("[data-rule-add]"),edit=event.target.closest("[data-rule-edit]"),remove=event.target.closest("[data-rule-delete]"),cancel=event.target.closest("[data-rule-cancel]"),save=event.target.closest("[data-rule-save]"),cmd=event.target.closest("[data-rule-command]"),emoji=event.target.closest("[data-rule-emoji]"),image=event.target.closest("[data-rule-image]");
  if(add){openGuildRuleEditor(add.dataset.ruleAdd);return;}if(edit){openGuildRuleEditor(edit.dataset.ruleEdit);return;}
  if(remove){
   const k=remove.dataset.ruleDelete;
   if(!isManagement()||!GUILD_RULE_KEYS.includes(k))return;
   const card=remove.closest(".rule-card"),heading=card?.querySelector(".panel-heading h3")?.textContent||"หัวข้อนี้";
   if(!window.confirm("ต้องการลบรายละเอียด "+heading+" ใช่หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้"))return;
   remove.disabled=true;
   try{
    const {error}=await supabaseClient.from("guild_rule_details").delete().eq("rule_key",k);
    if(error)throw error;
    delete guildRulesCache[k];
    $("rule-editor-"+k)?.classList.add("hidden");
    renderGuildRuleCard(k,"");
    const msg=document.querySelector('[data-rule-message="'+k+'"]');
    if(msg){msg.textContent="ลบรายละเอียดเรียบร้อยแล้ว";msg.className="message success";}
   }catch(error){
    console.error("Delete guild rule:",error);
    alert("ลบรายละเอียดไม่สำเร็จ: "+(error.message||"เกิดข้อผิดพลาด"));
   }finally{remove.disabled=false;}
   return;
  }
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


const APPEARANCE_THEMES={
 "4am-original":{name:"4AM Original",description:"Black · Red · Gold",colors:{primary:"#b3202e",secondary:"#d8b06a",background:"#060405",surface:"#171014"}},
 "4am-starlight":{name:"4AM Starlight",description:"Midnight Navy · Lavender · Pastel Pink · Ice Blue",colors:{primary:"#a98cff",secondary:"#f4a9d7",background:"#090b20",surface:"#171a38"}},
 "cyberpunk":{name:"Cyberpunk",description:"Deep Navy · Electric Cyan · Neon Blue",colors:{primary:"#16c8e8",secondary:"#a5f3ff",background:"#06121b",surface:"#102735"}},
 "minimal-light":{name:"Minimal Light",description:"Clean White · Silver · Soft Indigo",colors:{primary:"#5968b8",secondary:"#8c96b8",background:"#f1f3f8",surface:"#ffffff"}}
};
const APPEARANCE_LOCAL_KEY="4am-guild:appearance:v1";
const GUILD_LOGO_FALLBACK="/assets/4am-guild-logo.png?v=20261111b";
let appearanceState={themeId:"4am-original",defaultThemeId:"4am-original",customTokens:{},activeLogoUrl:GUILD_LOGO_FALLBACK,logoLibrary:[],loaded:false};
function appearanceLocal(){try{return JSON.parse(localStorage.getItem(APPEARANCE_LOCAL_KEY)||"{}")}catch{return{}}}
function applyAppearanceTheme(id,tokens={}){
 const theme=APPEARANCE_THEMES[id]||APPEARANCE_THEMES["4am-original"],root=document.documentElement;
 root.dataset.theme=APPEARANCE_THEMES[id]?id:"4am-original";
 const c={...theme.colors,...tokens};
 [["primary","--appearance-primary"],["secondary","--appearance-secondary"],["background","--appearance-background"],["surface","--appearance-card"]].forEach(([k,v])=>root.style.setProperty(v,c[k]));
 root.style.setProperty("--red",c.primary);root.style.setProperty("--red-bright",c.primary);root.style.setProperty("--red-line",c.primary+"bb");root.style.setProperty("--gold",c.secondary);root.style.setProperty("--gold-light",c.secondary);root.style.setProperty("--bg",c.background);
 updateGuildLogo(appearanceState.activeLogoUrl);
}
function updateGuildLogo(url){
 const candidate=String(url||"").trim();
 const isLegacyLogo=candidate.includes("i.postimg.cc");
 const isLocalAsset=candidate.startsWith("/")||candidate.startsWith("assets/")||candidate.startsWith("./assets/");
 const safe=(!candidate||isLegacyLogo)?GUILD_LOGO_FALLBACK:(isLocalAsset||/^https?:\/\//i.test(candidate)?candidate:GUILD_LOGO_FALLBACK);
 appearanceState.activeLogoUrl=safe;
 document.querySelectorAll(".login-emblem img,.sidebar-brand img,.registration-guild-logo img").forEach(img=>{
  img.onerror=()=>{img.onerror=null;img.src=GUILD_LOGO_FALLBACK};
  img.src=safe;
 });
 const preview=$("appearance-brand-preview");if(preview){preview.onerror=()=>{preview.onerror=null;preview.src=GUILD_LOGO_FALLBACK};preview.src=safe}
 const input=$("appearance-logo-url");if(input&&document.activeElement!==input)input.value=safe;
}
async function loadAppearanceSettings(){
 const local=appearanceLocal();appearanceState.themeId=APPEARANCE_THEMES[local.themeId]?local.themeId:"4am-original";appearanceState.customTokens=local.customTokens||{};applyAppearanceTheme(appearanceState.themeId,appearanceState.customTokens);
 try{
  const [p,g]=await Promise.all([supabaseClient.from("member_appearance_preferences").select("*").eq("user_id",currentUser.id).maybeSingle(),supabaseClient.from("guild_appearance_settings").select("*").eq("id",true).maybeSingle()]);
  if(p.error)throw p.error;if(g.error)throw g.error;
  const guild=g.data||{};appearanceState.defaultThemeId=APPEARANCE_THEMES[guild.default_theme_id]?guild.default_theme_id:"4am-original";appearanceState.activeLogoUrl=(!guild.active_logo_url||String(guild.active_logo_url).includes("i.postimg.cc"))?GUILD_LOGO_FALLBACK:guild.active_logo_url;appearanceState.logoLibrary=Array.isArray(guild.logo_library)?guild.logo_library:[];
  appearanceState.themeId=APPEARANCE_THEMES[p.data?.theme_id]?p.data.theme_id:appearanceState.defaultThemeId;appearanceState.customTokens=p.data?.custom_tokens||{};appearanceState.loaded=true;
 }catch(e){console.warn("Appearance SQL migration not applied or unavailable:",e.message||e);appearanceState.defaultThemeId="4am-original";appearanceState.loaded=false}
 applyAppearanceTheme(appearanceState.themeId,appearanceState.customTokens);updateGuildLogo(appearanceState.activeLogoUrl);
}
async function saveAppearancePreferences(){
 try{localStorage.setItem(APPEARANCE_LOCAL_KEY,JSON.stringify({themeId:appearanceState.themeId,customTokens:appearanceState.customTokens}))}catch{}
 const {error}=await supabaseClient.from("member_appearance_preferences").upsert({user_id:currentUser.id,theme_id:appearanceState.themeId,custom_tokens:appearanceState.customTokens,updated_at:new Date().toISOString()},{onConflict:"user_id"});
 if(error){showMessage("appearance-personal-message","บันทึกในเครื่องนี้แล้ว แต่ยังไม่ Sync ข้ามอุปกรณ์ กรุณารัน SQL Migration ก่อน: "+error.message);return false}
 showMessage("appearance-personal-message","บันทึกธีมและการปรับแต่งในบัญชีแล้ว","success");return true;
}
async function saveGuildAppearanceSettings(){
 if(!isManagement())throw new Error("คุณไม่มีสิทธิ์จัดการ Appearance");
 const {error}=await supabaseClient.from("guild_appearance_settings").upsert({id:true,default_theme_id:appearanceState.defaultThemeId,active_logo_url:appearanceState.activeLogoUrl,logo_library:appearanceState.logoLibrary,updated_by:currentUser.id,updated_at:new Date().toISOString()},{onConflict:"id"});
 if(error)throw error;
}
function renderAppearanceLogoLibrary(){
 const list=$("appearance-logo-list");if(!list)return;
 list.innerHTML=appearanceState.logoLibrary.length?appearanceState.logoLibrary.map((l,i)=>`<div class="appearance-logo-item"><img src="${escapeHTML(l.url)}" alt=""><span>${escapeHTML(l.name||"Guild logo")}</span><div><button type="button" class="btn btn-outline btn-sm" data-logo-activate="${i}">ใช้โลโก้นี้</button>${isManagement()?'<button type="button" class="btn btn-danger btn-sm" data-logo-remove="'+i+'">ลบ</button>':""}</div></div>`).join(""):'<p class="appearance-help">ยังไม่มีโลโก้ในคลัง</p>';
}
function renderAppearancePage(){
 const grid=$("appearance-theme-grid");if(!grid)return;
 grid.innerHTML=Object.entries(APPEARANCE_THEMES).map(([id,t])=>`<article class="appearance-theme-card ${id===appearanceState.themeId?"is-active":""}"><div class="appearance-theme-preview theme-preview-${id}"><span class="theme-preview-orbit"></span><span class="theme-preview-window"><i></i><i></i><i></i><b></b><em></em></span><strong>4AM GUILD</strong></div><div class="appearance-theme-info"><div><h4>${t.name}</h4><p>${t.description}</p></div><button class="btn ${id===appearanceState.themeId?"btn-outline":"btn-primary"} btn-sm" type="button" data-theme-select="${id}">${id===appearanceState.themeId?"กำลังใช้งาน":"ใช้ธีมนี้"}</button></div></article>`).join("");
 $("appearance-active-label").textContent=APPEARANCE_THEMES[appearanceState.themeId].name;
 const select=$("appearance-default-theme");if(select){select.innerHTML=Object.entries(APPEARANCE_THEMES).map(([id,t])=>`<option value="${id}">${t.name}</option>`).join("");select.value=appearanceState.defaultThemeId}
 $("appearance-admin-section")?.classList.toggle("hidden",!isManagement());
 const brandForm=document.querySelector(".appearance-brand-form");if(brandForm)brandForm.classList.toggle("hidden",!isManagement());
 document.querySelectorAll("[data-appearance-token]").forEach(input=>{const k=input.dataset.appearanceToken;input.value=appearanceState.customTokens[k]||APPEARANCE_THEMES[appearanceState.themeId].colors[k]});
 updateGuildLogo(appearanceState.activeLogoUrl);renderAppearanceLogoLibrary();
}
function registerAppearanceEvents(){
 const root=$("appearance-workspace");if(!root||root.dataset.bound)return;root.dataset.bound="true";
 root.addEventListener("click",async e=>{
  const theme=e.target.closest("[data-theme-select]");if(theme){appearanceState.themeId=theme.dataset.themeSelect;appearanceState.customTokens={};applyAppearanceTheme(appearanceState.themeId);renderAppearancePage();await saveAppearancePreferences();return}
  const activate=e.target.closest("[data-logo-activate]");if(activate&&isManagement()){const logo=appearanceState.logoLibrary[+activate.dataset.logoActivate];if(!logo)return;appearanceState.activeLogoUrl=logo.url;updateGuildLogo(logo.url);try{await saveGuildAppearanceSettings();renderAppearancePage();showMessage("appearance-brand-message","เปลี่ยนโลโก้แล้ว","success")}catch(err){showMessage("appearance-brand-message",err.message)}return}
  const remove=e.target.closest("[data-logo-remove]");if(remove&&isManagement()){appearanceState.logoLibrary.splice(+remove.dataset.logoRemove,1);try{await saveGuildAppearanceSettings();renderAppearanceLogoLibrary()}catch(err){showMessage("appearance-brand-message",err.message)}}
 });
 root.addEventListener("input",e=>{const input=e.target.closest("[data-appearance-token]");if(!input)return;appearanceState.customTokens[input.dataset.appearanceToken]=input.value;applyAppearanceTheme(appearanceState.themeId,appearanceState.customTokens)});
 $("appearance-save-custom")?.addEventListener("click",saveAppearancePreferences);
 $("appearance-reset-custom")?.addEventListener("click",async()=>{appearanceState.customTokens={};applyAppearanceTheme(appearanceState.themeId);renderAppearancePage();await saveAppearancePreferences()});
 $("appearance-save-default")?.addEventListener("click",async()=>{if(!isManagement())return;appearanceState.defaultThemeId=$("appearance-default-theme").value;try{await saveGuildAppearanceSettings();showMessage("appearance-admin-message","บันทึก Default Theme แล้ว","success")}catch(e){showMessage("appearance-admin-message","บันทึกไม่สำเร็จ: "+e.message)}});
 $("appearance-save-logo")?.addEventListener("click",async()=>{if(!isManagement())return;const url=$("appearance-logo-url").value.trim();if(!/^https:\/\//i.test(url)){showMessage("appearance-brand-message","กรุณาใช้ URL ที่ขึ้นต้นด้วย https://");return}appearanceState.activeLogoUrl=url;if(!appearanceState.logoLibrary.some(x=>x.url===url))appearanceState.logoLibrary.unshift({name:"Guild logo",url});updateGuildLogo(url);try{await saveGuildAppearanceSettings();renderAppearancePage();showMessage("appearance-brand-message","ตั้งโลโก้หลักแล้ว","success")}catch(e){showMessage("appearance-brand-message","บันทึกไม่สำเร็จ: "+e.message)}});
 $("appearance-logo-upload")?.addEventListener("change",async e=>{if(!isManagement())return;const file=e.target.files?.[0];if(!file)return;if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>5242880){showMessage("appearance-brand-message","รองรับ PNG/JPG/WEBP/GIF ไม่เกิน 5 MB");e.target.value="";return}try{const path="guild-logos/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"-");const {error}=await supabaseClient.storage.from("guild-assets").upload(path,file,{contentType:file.type});if(error)throw error;const url=supabaseClient.storage.from("guild-assets").getPublicUrl(path).data.publicUrl;appearanceState.activeLogoUrl=url;appearanceState.logoLibrary.unshift({name:file.name,url,storage_path:path});updateGuildLogo(url);await saveGuildAppearanceSettings();renderAppearancePage();showMessage("appearance-brand-message","อัปโหลดและตั้งโลโก้สำเร็จ","success")}catch(err){showMessage("appearance-brand-message","อัปโหลดไม่สำเร็จ: "+err.message+" — ตรวจสอบ SQL Migration / Storage policy")}finally{e.target.value=""}});
}

function syncManagementMenuVisibility() {
  document.querySelectorAll("[data-management-only]").forEach(item => {
    const allowed = isManagement();
    item.classList.toggle("is-role-hidden", !allowed);
    item.setAttribute("aria-hidden", String(!allowed));
  });
  const devMenuItems = document.querySelectorAll("[data-developer-only]");
  const developerAllowed = isDeveloper() && (!isRolePreviewActive() || rolePreviewRole === "developer");
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
  if (pageName === "member-management" && !isManagement()) pageName = "members";
  if (pageName === "system-management" && !isDeveloper()) {
    pageName = "dashboard";
  }
  if (pageName === "discord-integration" && (!isDeveloper() || isRolePreviewActive())) {
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

  const communityViews = ["community-board", "guild-news", "guild-activities"];
  const isCommunityView = communityViews.includes(pageName);
  const targetPage = $(isCommunityView ? "page-community" : "page-" + pageName);
  if (targetPage) targetPage.classList.remove("hidden");
  if (isCommunityView) {
    window.activeGuildCommunityView = pageName;
    const copy = {
      "community-board": ["COMMUNITY BOARD", "Community Board", "พื้นที่พูดคุย แสดงความคิดเห็น ของกิลด์ 4AM", "COMMUNITY BOARD", "โพสต์จากชุมชนกิลด์", "สมาชิกสามารถสร้างโพสต์และแสดงความคิดเห็นได้", "สร้างโพสต์ใหม่"],
      "guild-news": ["GUILD NEWS", "Guild News", "ประกาศข่าวสารของกิลด์ 4AM", "GUILD NEWS", "ข่าวสารจากกิลด์", "แสดงโพสต์ข่าวสารกิลด์", "สร้างข่าวสารใหม่"],
      "guild-activities": ["GUILD ACTIVITIES", "Guild Activities", "ติดตามกิจกรรมของกิลด์ 4AM", "GUILD ACTIVITIES", "กิจกรรมกิลด์", "แสดงโพสต์ที่มีกำหนดวันหรือเวลาเริ่มต้นและสิ้นสุด", "สร้างกิจกรรมใหม่"]
    }[pageName];
    ["community-page-kicker","community-page-title","community-page-description","community-feed-kicker","community-feed-title","community-feed-description"].forEach((id,index)=>{const node=$(id);if(node)node.textContent=copy[index];});
    const addDescription=$("activity-add-button")?.querySelector(".guild-add-entry-copy small");
    if(addDescription)addDescription.textContent=copy[6];
  }

  document.querySelectorAll(".nav-item[data-page], .nav-subitem").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageName);
  });

  const warPage = ["war", "war-attendance", "war-signup", "war-leave", "war-stats", "war-attendance-stats"].includes(pageName);
  const warParent = document.querySelector('[data-toggle-submenu="war-submenu"]');
  const warSubmenu = $("war-submenu");
  warParent?.classList.toggle("active", warPage);
  if (warPage && warSubmenu) warSubmenu.classList.add("is-open");

  const guildCommunityPage = ["community-board", "guild-news", "guild-activities", "duck-race"].includes(pageName);
  const guildCommunityParent = document.querySelector('[data-toggle-submenu="guild-community-submenu"]');
  const guildCommunitySubmenu = $("guild-community-submenu");
  guildCommunityParent?.classList.toggle("active", guildCommunityPage);
  if (guildCommunityPage && guildCommunitySubmenu) guildCommunitySubmenu.classList.add("is-open");

  document.title = `${PAGE_TITLES[pageName] || "4AM GUILD"} | 4AM GUILD`;

  closeUserMenu();
  window.scrollTo({ top: 0 });

  if (pageName === "members") loadMembers();
  if (pageName === "member-management" && isManagement()) loadManualMemberManagement();
  if (pageName === "system-management") loadSystemRoleMembers();
  if (pageName === "discord-integration") loadDiscordIntegrationSettings();

  const memberPages = ["members", "member-management"];
  const memberParent = document.querySelector('[data-toggle-submenu="members-submenu"]');
  const memberSubmenu = $("members-submenu");
  memberParent?.classList.toggle("active", memberPages.includes(pageName));
  if (memberPages.includes(pageName) && memberSubmenu) memberSubmenu.classList.add("is-open");

  if (pageName === "dashboard") {
    loadDashboardAnnouncement();
    subscribeToGuildActivityRealtime();
  }
  if (pageName === "settings") {
    renderAccountDetails();
    loadDiscordAccount();
  }
  if (pageName === "appearance") renderAppearancePage();

  if (pageName === "portfolio") loadPortfolios();
  if (pageName === "war") loadWarEvents();
  if (pageName === "war-attendance") loadWarAttendance();
  if (pageName === "war-signup") loadWarSignups();
  if (pageName === "war-leave") loadWarLeavePage();
  if (pageName === "war-stats") loadWarMatchRecords();
  if (pageName === "war-attendance-stats") loadWarAttendanceStatistics();
  if (pageName === "rules") loadGuildRules();
  if (["community-board", "guild-news", "guild-activities"].includes(pageName)) {
    subscribeToGuildActivityRealtime();
    loadGuildActivities();
  }
  if (pageName === "feedback") loadGuildFeedback();
  if (pageName === "guides") loadGuildGuides();
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
  const gameUID = String(form.querySelector("[name='game_uid']")?.value || "").trim();
  const button = form.querySelector("button[type='submit']");
  if (!characterName) { showMessage("account-profile-status", "กรุณากรอกชื่อตัวละคร"); return; }
  if (characterName.length > 40) { showMessage("account-profile-status", "ชื่อตัวละครต้องไม่เกิน 40 ตัวอักษร"); return; }
  if (!CLASS_DATA.some(item => item.name === gameClass)) { showMessage("account-profile-status", "กรุณาเลือกอาชีพจากรายการ"); return; }
  if (!/^[0-9]{10}$/.test(gameUID)) { showMessage("account-profile-status", "UID ตัวละครต้องเป็นตัวเลข 10 หลักเท่านั้น"); return; }
  if (button) { button.disabled = true; button.textContent = "กำลังบันทึก..."; }
  showMessage("account-profile-status", "กำลังบันทึกข้อมูลบัญชี...", "info");
  try {
    const { data, error } = await supabaseClient.from("guild_members")
      .update({ character_name: characterName, game_class: gameClass, game_uid: gameUID })
      .eq("user_id", currentUser.id)
      .select("user_id, character_name, game_class, game_uid")
      .single();
    if (error) throw error;
    Object.assign(currentMember, { character_name: data.character_name, game_class: data.game_class, game_uid: data.game_uid });
    const cachedMember = allMembers.find(member => member.user_id === currentUser.id);
    if (cachedMember) Object.assign(cachedMember, { character_name: data.character_name, game_class: data.game_class, game_uid: data.game_uid });
    renderAccountDetails();
    updateUserChip();
    renderDashboardProfile();
    renderMembers(allMembers);
    renderWarLayout();
    showMessage("account-profile-status", "บันทึกข้อมูลบัญชีสำเร็จ", "success");
  } catch (error) {
    console.error("Account profile update error:", error);
    showMessage("account-profile-status", "บันทึกไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด"));
  } finally {
    if (button) { button.disabled = false; button.textContent = "บันทึกข้อมูล"; }
  }
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
    <div class="account-information-heading">
      <div class="account-information-kicker">ACCOUNT INFORMATION</div>
      <button type="button" class="btn btn-outline btn-sm account-edit-button" id="account-edit-toggle" aria-expanded="false">✎ แก้ไข</button>
    </div>
    <div class="account-details-list">
      <div class="settings-detail"><span>ชื่อตัวละคร</span><strong>${escapeHTML(name)}</strong></div>
      <div class="settings-detail"><span>Email</span><strong>${escapeHTML(currentUser?.email || "-")}</strong></div>
      <div class="settings-detail"><span>Class อาชีพ</span><strong class="account-class-display" style="--class-color:${classColor}"><img class="account-class-icon" src="${escapeHTML(classIcon)}" alt="" onerror="this.style.display='none'"><span>${escapeHTML(currentMember?.game_class || "ยังไม่ได้เลือกอาชีพ")}</span></strong></div>
      <div class="settings-detail"><span>UID ตัวละคร</span><strong>${escapeHTML(currentMember?.game_uid || "ยังไม่ได้กรอก UID")}</strong></div>
      <div class="settings-detail"><span>Display Position</span><strong>${escapeHTML(displayPosition)}</strong></div>
      <div class="settings-detail"><span>System Permission</span><strong>${escapeHTML(permission)}</strong></div>
      <div class="settings-detail"><span>Guild</span><strong>4AM GUILD</strong></div>
      <div class="settings-detail"><span>Server</span><strong>Tideborn Dreams</strong></div>
    </div>
    <form id="account-profile-form" class="game-uid-settings-form account-character-form hidden">
      <label for="account-character-name">ชื่อตัวละคร</label>
      <input id="account-character-name" name="character_name" type="text" maxlength="40" autocomplete="off" placeholder="กรอกชื่อตัวละคร" value="${escapeHTML(currentMember?.character_name || "")}" required>
      <label for="account-game-class">Class อาชีพ</label>
      <div class="account-class-select-wrap">
        <img id="account-class-preview" class="account-class-icon" src="${escapeHTML(classIcon)}" alt="" onerror="this.style.display='none'">
        <select id="account-game-class" name="game_class" required>
          ${CLASS_DATA.map(item => '<option value="' + escapeHTML(item.name) + '" ' + (item.name === currentMember?.game_class ? 'selected' : '') + '>' + escapeHTML(item.name) + '</option>').join("")}
        </select>
      </div>
      <label for="account-game-uid">UID ตัวละคร (ตัวเลข 10 หลัก)</label>
      <input id="account-game-uid" name="game_uid" type="text" inputmode="numeric" pattern="[0-9]{10}" minlength="10" maxlength="10" placeholder="กรอก UID ตัวละคร 10 หลัก" value="${escapeHTML(currentMember?.game_uid || "")}" required>
      <div class="account-profile-actions">
        <button type="button" class="btn btn-outline" id="account-edit-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">ยืนยันข้อมูล</button>
      </div>
    </form>
    <p id="account-profile-status" class="message" aria-live="polite"></p>
  `;
}


// ==========================================
// DISCORD INTEGRATION SETTINGS (DEVELOPER ONLY)
// ==========================================

const DISCORD_EVENT_ROUTE_DEFINITIONS = [
  ["guild_activity_published", "ประกาศข่าวสาร / กิจกรรมกิลด์"],
  ["guild_activity_comment", "ความคิดเห็นในกิจกรรมกิลด์"],
  ["feedback_submitted", "แจ้งปัญหา / Feedback"],
  ["duck_race_results", "ผลการแข่งขัน Duck Race"],
  ["member_joined", "สมาชิกใหม่ / เพิ่มสมาชิก"],
  ["war_signup_submitted", "ลงชื่อเข้าร่วม Guild War"],
  ["war_leave_submitted", "แจ้งลาวอร์"],
  ["portfolio_published", "โพสต์แฟ้มผลงาน"]
];

function canManageDiscordIntegration() {
  return isDeveloper() && !isRolePreviewActive() && currentMember?.active === true;
}

function renderDiscordIntegrationRoutes(routes = []) {
  const container = $("discord-integration-routes");
  if (!container) return;
  const routeMap = new Map((routes || []).map(route => [route.event_key, route]));
  container.innerHTML = DISCORD_EVENT_ROUTE_DEFINITIONS.map(([key, label]) => {
    const route = routeMap.get(key) || {};
    return `
      <div class="discord-route-row" data-discord-route="${escapeHTML(key)}">
        <div class="discord-route-copy">
          <strong>${escapeHTML(label)}</strong>
          <small>${escapeHTML(key)}</small>
        </div>
        <label class="discord-route-enabled">
          <input type="checkbox" data-discord-route-enabled ${route.enabled ? "checked" : ""}>
          <span>เปิดใช้</span>
        </label>
        <input type="text" inputmode="numeric" autocomplete="off" maxlength="20"
          placeholder="Discord Channel ID"
          aria-label="Discord Channel ID สำหรับ ${escapeHTML(label)}"
          data-discord-route-channel value="${escapeHTML(route.channel_id || "")}">
      </div>`;
  }).join("");
}

async function loadDiscordIntegrationSettings() {
  if (!canManageDiscordIntegration()) {
    alert("Discord Integration Settings อนุญาตเฉพาะ Developer เท่านั้น และไม่สามารถแก้ไขใน Role Preview ได้");
    openGuildPage("dashboard");
    return;
  }

  const status = $("discord-integration-load-status");
  if (status) status.textContent = "กำลังโหลดการตั้งค่า...";
  const { data: settings, error: settingsError } = await supabaseClient
    .from("guild_discord_integration_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (settingsError) {
    console.error("Discord integration settings load:", settingsError);
    if (status) status.textContent = "ยังโหลดไม่ได้ กรุณารัน SQL: 4AM Discord Integration Settings";
    return;
  }

  const { data: routes, error: routesError } = await supabaseClient
    .from("guild_discord_event_routes")
    .select("*")
    .order("event_key", { ascending: true });

  if (routesError) {
    console.error("Discord integration routes load:", routesError);
    if (status) status.textContent = "โหลดรายการเส้นทางแจ้งเตือนไม่สำเร็จ";
    return;
  }

  $("discord-integration-mode").value = settings?.mode || "test";
  $("discord-integration-test-channel").value = settings?.test_channel_id || "";
  $("discord-integration-production-enabled").checked = settings?.production_enabled === true;
  $("discord-integration-current-mode").textContent =
    settings?.mode === "production" && settings?.production_enabled ? "PRODUCTION MODE" : "TEST MODE";
  $("discord-integration-current-mode").classList.toggle("is-production", settings?.mode === "production" && settings?.production_enabled);
  renderDiscordIntegrationRoutes(routes || []);
  if (status) status.textContent = "โหลดการตั้งค่าเรียบร้อย";
  updateDiscordIntegrationModeHelp();
}

function updateDiscordIntegrationModeHelp() {
  const mode = $("discord-integration-mode")?.value || "test";
  const productionEnabled = $("discord-integration-production-enabled")?.checked === true;
  const help = $("discord-integration-mode-help");
  if (!help) return;
  if (mode === "test") {
    help.textContent = "TEST MODE: การแจ้งเตือนทุกประเภทจะถูกส่งไปยังห้องทดสอบบอทเท่านั้น ไม่ใช้ Channel ID ของ Production";
  } else if (!productionEnabled) {
    help.textContent = "PRODUCTION ยังไม่เปิดใช้งาน ต้องเปิดสวิตช์อนุมัติ Production ก่อน ระบบจะยังไม่ส่งข้อความไปห้องจริง";
  } else {
    help.textContent = "PRODUCTION MODE: แต่ละเหตุการณ์จะส่งไปยัง Channel ID ที่กำหนดไว้ด้านล่าง เฉพาะรายการที่เปิดใช้งานเท่านั้น";
  }
}

async function saveDiscordIntegrationSettings() {
  if (!canManageDiscordIntegration()) {
    alert("ไม่มีสิทธิ์แก้ไข Discord Integration Settings");
    return;
  }
  const form = $("discord-integration-form");
  if (!form) return;
  const mode = $("discord-integration-mode").value === "production" ? "production" : "test";
  const testChannelId = String($("discord-integration-test-channel").value || "").trim();
  const productionEnabled = $("discord-integration-production-enabled").checked;
  const channelPattern = /^\d{17,20}$/;
  if (testChannelId && !channelPattern.test(testChannelId)) {
    showMessage("discord-integration-message", "Test Channel ID ต้องเป็นตัวเลข Discord ID ความยาว 17–20 หลัก");
    return;
  }

  const routeRows = [...document.querySelectorAll("[data-discord-route]")];
  const routes = routeRows.map(row => ({
    event_key: row.dataset.discordRoute,
    enabled: row.querySelector("[data-discord-route-enabled]")?.checked === true,
    channel_id: String(row.querySelector("[data-discord-route-channel]")?.value || "").trim() || null,
    updated_by: currentUser.id
  }));
  for (const route of routes) {
    if (route.channel_id && !channelPattern.test(route.channel_id)) {
      showMessage("discord-integration-message", "Channel ID ของ " + route.event_key + " ไม่ถูกต้อง ต้องเป็นตัวเลข 17–20 หลัก");
      return;
    }
  }
  if (mode === "production") {
    if (!productionEnabled) {
      showMessage("discord-integration-message", "ยังไม่สามารถเลือก Production Mode ได้จนกว่าจะเปิดอนุมัติ Production");
      return;
    }
    const incomplete = routes.find(route => route.enabled && !route.channel_id);
    if (incomplete) {
      showMessage("discord-integration-message", "กรุณากำหนด Channel ID ให้ครบทุกเหตุการณ์ที่เปิดใช้ ก่อนเปิด Production");
      return;
    }
    if (!routes.some(route => route.enabled)) {
      showMessage("discord-integration-message", "กรุณาเปิดใช้งานอย่างน้อยหนึ่งประเภทการแจ้งเตือน");
      return;
    }
  }

  const saveButton = $("discord-integration-save");
  if (saveButton) { saveButton.disabled = true; saveButton.textContent = "กำลังบันทึก..."; }
  try {
    const { error: settingsError } = await supabaseClient
      .from("guild_discord_integration_settings")
      .upsert({
        id: 1,
        mode,
        test_channel_id: testChannelId || null,
        production_enabled: productionEnabled,
        updated_by: currentUser.id,
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });
    if (settingsError) throw settingsError;

    const { error: routesError } = await supabaseClient
      .from("guild_discord_event_routes")
      .upsert(routes.map(route => ({ ...route, event_label: DISCORD_EVENT_ROUTE_DEFINITIONS.find(([key]) => key === route.event_key)?.[1] || route.event_key, updated_at: new Date().toISOString() })), { onConflict: "event_key" });
    if (routesError) throw routesError;

    showMessage("discord-integration-message", "บันทึกการตั้งค่า Discord Integration สำเร็จ", "success");
    await loadDiscordIntegrationSettings();
  } catch (error) {
    console.error("Discord integration save:", error);
    showMessage("discord-integration-message", "บันทึกไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด"));
  } finally {
    if (saveButton) { saveButton.disabled = false; saveButton.textContent = "บันทึกการตั้งค่า"; }
  }
}

async function sendDiscordIntegrationTest() {
  if (!canManageDiscordIntegration()) {
    alert("เฉพาะ Developer เท่านั้นที่ทดสอบบอทได้");
    return;
  }
  const channelId = String($("discord-integration-test-channel")?.value || "").trim();
  if (!/^\d{17,20}$/.test(channelId)) {
    showMessage("discord-integration-message", "กรุณากรอก Test Channel ID ให้ถูกต้อง และบันทึกการตั้งค่าก่อนทดสอบ");
    return;
  }
  const button = $("discord-integration-test");
  if (button) { button.disabled = true; button.textContent = "กำลังส่งข้อความทดสอบ..."; }
  try {
    const { error: saveError } = await supabaseClient
      .from("guild_discord_integration_settings")
      .upsert({
        id: 1,
        mode: $("discord-integration-mode").value === "production" ? "production" : "test",
        test_channel_id: channelId,
        production_enabled: $("discord-integration-production-enabled").checked,
        updated_by: currentUser.id,
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });
    if (saveError) throw saveError;

    const { data, error } = await supabaseClient.functions.invoke("discord-integration-test", { body: {} });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message || "ส่งข้อความทดสอบไม่สำเร็จ");
    showMessage("discord-integration-message", "ส่งข้อความทดสอบไปยังห้องทดสอบบอทสำเร็จ", "success");
  } catch (error) {
    console.error("Discord integration test:", error);
    showMessage("discord-integration-message", "ทดสอบไม่สำเร็จ: " + (error.message || "ตรวจสอบ Edge Function และ Bot Token"));
  } finally {
    if (button) { button.disabled = false; button.textContent = "ส่งข้อความทดสอบ"; }
  }
}

function registerDiscordIntegrationEvents() {
  $("discord-integration-form")?.addEventListener("submit", event => {
    event.preventDefault();
    void saveDiscordIntegrationSettings();
  });
  $("discord-integration-mode")?.addEventListener("change", updateDiscordIntegrationModeHelp);
  $("discord-integration-production-enabled")?.addEventListener("change", updateDiscordIntegrationModeHelp);
  $("discord-integration-test")?.addEventListener("click", () => void sendDiscordIntegrationTest());
}

// ==========================================
// EVENT LISTENERS
// ==========================================

function registerAppEventListeners() {
  $("logout-btn")?.addEventListener("click", logout);

  $("member-search")?.addEventListener("input", filterMembers);
  $("manual-member-add-trigger")?.addEventListener("click", () => {
    resetManualMemberForm();
    openManualMemberModal();
  });
  $("manual-member-form")?.addEventListener("submit", event => { event.preventDefault(); saveManualGuildMember(event.currentTarget); });
  $("manual-member-cancel")?.addEventListener("click", resetManualMemberForm);
  $("manual-member-modal")?.addEventListener("click", event => {
    if (event.target.closest("[data-manual-modal-close]")) resetManualMemberForm();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !$("manual-member-modal")?.classList.contains("hidden")) {
      resetManualMemberForm();
    }
  });
  $("manual-member-list")?.addEventListener("click", event => {
    const edit = event.target.closest("[data-manual-edit]");
    const toggle = event.target.closest("[data-manual-toggle]");
    const remove = event.target.closest("[data-manual-delete]");
    const accountEdit = event.target.closest("[data-account-edit]");
    const accountToggle = event.target.closest("[data-account-toggle]");
    if (accountEdit) editLinkedGuildMember(accountEdit.dataset.accountEdit);
    else if (accountToggle) updateLinkedGuildMemberStatus(accountToggle.dataset.accountToggle);
    else if (edit) editManualGuildMember(edit.dataset.manualEdit);
    else if (toggle) updateManualGuildMemberStatus(toggle.dataset.manualToggle);
    else if (remove) deleteManualGuildMember(remove.dataset.manualDelete);
  });
  $("refresh-members")?.addEventListener("click", loadMembers);
  $("connect-discord")?.addEventListener("click", connectDiscord);
  registerAppearanceEvents();
  registerDiscordIntegrationEvents();

  document.querySelectorAll(".nav-item[data-page], .nav-subitem").forEach((button) => {
    button.addEventListener("click", () => {
      openGuildPage(button.dataset.page);
    });
  });

  const appLayout=$("app-layout"),sidebarToggle=$("sidebar-toggle"),sidebarBackdrop=$("sidebar-backdrop");
  const mobileSidebar=()=>window.matchMedia("(max-width: 850px)").matches;
  const setSidebarState=()=>{
    const mobile=mobileSidebar(),open=appLayout?.classList.contains("mobile-sidebar-open");
    if(sidebarToggle){sidebarToggle.setAttribute("aria-expanded",String(mobile?!!open:!appLayout?.classList.contains("sidebar-collapsed")));sidebarToggle.setAttribute("aria-label",mobile?(open?"ปิดเมนู":"เปิดเมนู"):(appLayout?.classList.contains("sidebar-collapsed")?"ขยายแถบเมนู":"ย่อแถบเมนู"));sidebarToggle.title=sidebarToggle.getAttribute("aria-label");}
  };
  sidebarToggle?.addEventListener("click",()=>{
    if(mobileSidebar())appLayout?.classList.toggle("mobile-sidebar-open");
    else appLayout?.classList.toggle("sidebar-collapsed");
    setSidebarState();
  });
  sidebarBackdrop?.addEventListener("click",()=>{appLayout?.classList.remove("mobile-sidebar-open");setSidebarState();});
  document.querySelectorAll(".sidebar [data-page]").forEach(button=>button.addEventListener("click",()=>{if(mobileSidebar()){appLayout?.classList.remove("mobile-sidebar-open");setSidebarState();}}));
  window.addEventListener("resize",()=>{if(!mobileSidebar())appLayout?.classList.remove("mobile-sidebar-open");setSidebarState();});
  setSidebarState();

  document.querySelectorAll(".sidebar [data-page],.sidebar [data-toggle-submenu]").forEach(button=>{
    const label=button.querySelector(":scope > span:not(.nav-chevron):last-of-type")?.textContent?.trim()||button.textContent.trim();
    if(label)button.title=label;
  });
  document.querySelectorAll("[data-toggle-submenu]").forEach((button) => {
    button.addEventListener("click", () => {
      if(!mobileSidebar()&&appLayout?.classList.contains("sidebar-collapsed")){
        appLayout.classList.remove("sidebar-collapsed");
        setSidebarState();
      }
      const submenu = $(button.dataset.toggleSubmenu);
      const isOpen = submenu?.classList.toggle("is-open") ?? false;
      button.setAttribute("aria-expanded", String(isOpen));
    });
  });

  document.querySelectorAll("[data-go-page]").forEach((button) => {
    button.addEventListener("click", () => {
      openGuildPage(button.dataset.goPage);
      const scrollTarget = button.dataset.scrollTarget;
      if (scrollTarget) {
        window.requestAnimationFrame(() => {
          $(scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    });
  });

  $("dashboard-announcement")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openGuildPage("guild-news");
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

  registerRolePreviewEvents();
  registerPortfolioEvents();
  registerSystemRoleEvents();
  initializeGlobalDateTimePickers();
  registerWarCreationEvents();
  registerWarRecordAndAttendanceEvents();
  registerWarLeaveEvents();
  initializeGuildRichTextEnhancements();
  registerGuildRuleEvents();
  registerFeedbackEvents();
  registerGuildGuideEvents();

  $("account-details")?.addEventListener("click", (event) => {
    if (event.target.closest("#account-edit-toggle")) {
      const form = $("account-profile-form");
      const button = $("account-edit-toggle");
      const opening = form?.classList.contains("hidden");
      form?.classList.toggle("hidden", !opening);
      if (button) {
        button.textContent = opening ? "ยกเลิกการแก้ไข" : "✎ แก้ไข";
        button.setAttribute("aria-expanded", String(Boolean(opening)));
      }
      $("account-profile-status")?.replaceChildren();
      return;
    }
    if (event.target.closest("#account-edit-cancel")) {
      $("account-profile-form")?.classList.add("hidden");
      const button = $("account-edit-toggle");
      if (button) { button.textContent = "✎ แก้ไข"; button.setAttribute("aria-expanded", "false"); }
      $("account-profile-status")?.replaceChildren();
    }
  });

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
    if (event.target.id !== "account-profile-form") return;
    event.preventDefault();
    await saveOwnCharacterProfile(event.target);
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
    rolePreviewRole = null;
    applyRolePreviewState();
  }
});

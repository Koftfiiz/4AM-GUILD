async function deleteGuildFeedback(feedbackId, button) {
  if (!isManagement() || isRolePreviewActive()) {
    alert("เฉพาะ Developer, Leader และ Management ที่ไม่ได้อยู่ในโหมด Preview เท่านั้น");
    return;
  }
  if (!feedbackId) return;
  const row = feedbackRowsCache.find(item => item.id === feedbackId);
  const title = row?.title || "รายการนี้";
  if (!confirm("ยืนยันย้ายรายการนี้ไปยังรายการที่ถูกลบหรือไม่?\\n\\n" + title + "\\n\\nคุณสามารถกู้คืนได้ภายหลัง")) return;
  if (button) { button.disabled = true; button.textContent = "…"; }
  try {
    const { error } = await supabaseClient.rpc("delete_guild_feedback_secure", { p_feedback_id: feedbackId });
    if (error) throw error;
    await loadGuildFeedback();
  } catch (error) {
    console.error("Soft delete guild feedback:", error);
    alert("ลบรายการไม่สำเร็จ: " + (error.message || "กรุณาลองอีกครั้ง"));
    if (button) { button.disabled = false; button.textContent = "−"; }
  }
}

async function restoreGuildFeedback(feedbackId, button) {
  if (!isManagement() || isRolePreviewActive()) {
    alert("เฉพาะ Developer, Leader และ Management ที่ไม่ได้อยู่ในโหมด Preview เท่านั้น");
    return;
  }
  if (!feedbackId || !confirm("ยืนยันกู้คืนรายการ Feedback นี้หรือไม่?")) return;
  if (button) { button.disabled = true; button.textContent = "กำลังกู้คืน..."; }
  try {
    const { error } = await supabaseClient.rpc("restore_guild_feedback_secure", { p_feedback_id: feedbackId });
    if (error) throw error;
    await loadGuildFeedback();
  } catch (error) {
    console.error("Restore guild feedback:", error);
    alert("กู้คืนรายการไม่สำเร็จ: " + (error.message || "กรุณาลองอีกครั้ง"));
    if (button) { button.disabled = false; button.textContent = "กู้คืน"; }
  }
}// ==========================================
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
let memberDirectoryCacheExpiresAt = 0;
let portfolioDataCacheExpiresAt = 0;
let guildMemberBonds = [];
let bondRelationshipsLoadError = "";
let bondSelectedMemberIds = new Set();
let manualGuildMembers = [];
let directoryMembers = [];
let memberDirectoryClassFilter = "all";
let memberDirectoryTypeFilter = "all";
let manualMemberClassFilter = "all";
let manualMemberRecordFilter = "all";
let manualMemberActivityFilter = "all";
let manualMemberDiscordFilter = "all";
let manualMemberPositionFilter = "all";
let manualMemberIncompleteOnly = false;
let discordAccountDirectory = new Map();
const MEMBER_ADMIN_FILTERS_KEY = "4am-guild-member-admin-filters-v1";
let guildPresenceByUserId = new Map();
let presenceHeartbeatTimer = null;
let presenceRefreshTimer = null;
let presenceRefreshBusy = false;
let discordAccount = null;
let discordGuildMembersCache = [];
let allPortfolios = [];
// Reuse signed Portfolio URLs while valid so repeat renders/details can benefit
// from the browser cache instead of generating a fresh token for the same file.
const portfolioSignedUrlCache = new Map();
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

const DEFAULT_AVATAR = "/assets/4am-guild-logo.png";
const AVATAR_BUCKET = "character-avatars";
const PORTFOLIO_BUCKET = "portfolio-images";

const CLASS_DATA = [
  { name: "Ironclad", color: "#e6b84f", iconPath: "/assets/class-icon/Ironclad.png" },
  { name: "Bloodstrom", color: "#e54858", iconPath: "/assets/class-icon/Bloodstrom.png" },
  { name: "Celestune", color: "#477be8", iconPath: "/assets/class-icon/Celestune.png" },
  { name: "Numina", color: "#9b83df", iconPath: "/assets/class-icon/Numina.png" },
  { name: "Sylph", color: "#dfa6ce", iconPath: "/assets/class-icon/Sylph.png" },
  { name: "Nightwaker", color: "#9ce8ea", iconPath: "/assets/class-icon/Nightwaker.png" },
  { name: "Dragonsvelte", color: "#42c98e", iconPath: "/assets/class-icon/Dragonsvelte.png" },
  { name: "Mystech", color: "#f2dc83", iconPath: "/assets/class-icon/Mystech.png" }
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
  "member-management": "ศูนย์จัดการสมาชิก",
  "war-center": "Guild War",
  war: "จัดตี้วอร์",
  "war-attendance": "ประกาศรายชื่อวอร์",
  "war-signup": "ลงชื่อวอร์",
  "war-leave": "แจ้งลาวอร์",
  "war-stats": "สถิติกิลด์วอร์",
  "war-attendance-stats": "สถิติการเข้าร่วมวอร์",
  rules: "กฎกิลด์",
  portfolio: "แฟ้มผลงานสมาชิก",
  "portfolio-review-center": "ศูนย์ตรวจสอบแฟ้ม",
  guides: "ไกด์เกม",
  "community-board": "Community Board",
  "duck-race": "4AM Duck Race",
  "guild-news": "Guild News",
  "guild-activities": "Guild Activities",
  feedback: "แจ้งปัญหา / Feedback",
  settings: "ตั้งค่าบัญชี",
  "developer-tools": "Developer Tools",
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
  // The project owner is a permanent Developer allowlist entry.
  // This identity bypasses membership lifecycle gates even if a member row is
  // temporarily stale, pending, inactive, or has an unexpected Discord state.
  return String(currentUser?.id || "") === "378b09df-16a0-4d01-8908-2604c2c210a9" ||
    String(currentMember?.role || "").toLowerCase() === "developer";
}

function isRolePreviewActive() {
  return Boolean(rolePreviewRole);
}

function getEffectiveSystemRole() {
  return rolePreviewRole || (isDeveloper() ? "developer" : String(currentMember?.role || "member").toLowerCase());
}

// สิทธิ์สำหรับแสดงผล UI ใช้ Role จำลองได้ แต่การทำรายการจริงถูกบล็อกใน Preview
function isManagement() {
  return ["developer", "leader", "management"].includes(getEffectiveSystemRole());
}

// Permission for editing another member's profile.
// The real Developer identity is always recognized outside Role Preview,
// even if the cached member row is stale. Leader and Management require an
// active guild membership. Role Preview remains intentionally read-only.
function canManageMemberProfiles() {
  if (isRolePreviewActive()) return false;
  if (isDeveloper()) return true;
  const role = String(currentMember?.role || "").toLowerCase();
  return currentMember?.active === true &&
    currentMember?.membership_status === "active" &&
    ["leader", "management"].includes(role);
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
      if (event.target.closest("[data-war-delete],[data-war-signup-delete]")) {
        alert("ขณะนี้กำลังใช้งาน Role Preview จึงไม่สามารถลบข้อมูลจริงได้ กรุณากดออกจาก Preview แล้วลองอีกครั้ง");
      }
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

  // character-avatars is already a public bucket. Public URLs avoid a
  // signed-URL creation request for every avatar resolution and are CDN-cacheable.
  const { data } = supabaseClient.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(member.avatar_url);

  if (!data?.publicUrl) {
    console.warn("Avatar public URL unavailable for:", member.avatar_url);
    return DEFAULT_AVATAR;
  }

  return data.publicUrl;
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
// War match records use a dedicated date-only formatter so browser locale/timezone
// cannot change the requested DD/MM/YYYY display.
function formatWarRecordDate(value) {
  if(!value)return "-";
  const match=String(value).match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
  if(match)return `${match[3]}/${match[2]}/${match[1]}`;
  return formatDate(value);
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
    // Always start Discord login from a clean local Supabase session.
    // Otherwise an existing Email session can be reused and the Discord
    // identity may be linked to the wrong signed-in account.
    const { data: existingSessionData, error: sessionCheckError } =
      await supabaseClient.auth.getSession();

    if (sessionCheckError) throw sessionCheckError;

    if (existingSessionData?.session) {
      const { error: signOutError } =
        await supabaseClient.auth.signOut({ scope: "local" });

      if (signOutError) throw signOutError;

      currentUser = null;
      currentMember = null;
      discordAccount = null;
    }

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
    // Clear presence and all app-scoped Realtime channels before signing out.
    await stopGuildPresence();
    removeAppRealtimeChannels();
    if (window.__warSignupRefreshTimer) window.clearInterval(window.__warSignupRefreshTimer);
    window.__warSignupRefreshTimer = null;
    const { error } = await supabaseClient.auth.signOut({ scope: "local" });
    if (error) throw error;

    currentUser = null;
    currentMember = null;
    allMembers = [];
    memberDirectoryCacheExpiresAt = 0;
    discordAccount = null;
    allPortfolios = [];
    portfolioDataCacheExpiresAt = 0;
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
    $("manual-member-link-screen")?.remove();
    $("membership-status-screen")?.remove();
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
    // Load an existing approved profile first. OAuth login itself never creates or links membership.
    await loadCurrentMember();

    // Manual Directory is Management-prepared and already approved.
    // Check an exact Discord ID match BEFORE showing pending-review status so
    // an existing Manual member is routed to explicit name confirmation.
    if (!isDeveloper() && currentMember?.membership_status === "pending_review") {
      const { data: manualMatches, error: lookupError } =
        await supabaseClient.rpc("lookup_my_manual_member");

      if (lookupError) {
        throw new Error("ไม่สามารถตรวจสอบรายชื่อสมาชิก Manual ได้: " + lookupError.message);
      }

      const activeManualMatches = (Array.isArray(manualMatches) ? manualMatches : [])
        .filter(row => row.active === true);

      if (activeManualMatches.length > 0) {
        showManualMemberChooser(activeManualMatches);
        return;
      }

      showMembershipStatusScreen("pending_review");
      return;
    }

    // Website access remains controlled by Management through guild_members.
    if (!isDeveloper() && currentMember && (currentMember.active !== true || currentMember.membership_status === "suspended")) {
      showMembershipStatusScreen(currentMember.membership_status || "suspended");
      return;
    }

    // If no profile exists, perform a read-only exact Discord ID lookup.
    // A matching Manual record must be explicitly confirmed by the member before linking.
    if (!currentMember) {
      const { data: manualMatches, error: lookupError } =
        await supabaseClient.rpc("lookup_my_manual_member");

      if (lookupError) {
        throw new Error("ไม่สามารถตรวจสอบรายชื่อสมาชิก Manual ได้: " + lookupError.message);
      }

      if (Array.isArray(manualMatches) && manualMatches.length > 0) {
        showManualMemberChooser(manualMatches);
        return;
      }

      showRegistrationScreen();
      return;
    }

    await loadAppearanceSettings();

    // สมาชิกที่ถูกปิดใช้งาน ไม่สามารถเข้าใช้งานได้
    if (!isDeveloper() && currentMember.active !== true) {
      showRegistrationScreen(
        "บัญชีสมาชิกนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลกิลด์"
      );
      return;
    }

    $("registration-screen")?.remove();
    $("login-screen")?.classList.add("hidden");
    $("app-layout")?.classList.remove("hidden");

    updateUserChip();

    // OAuth identity has already been synchronized before membership lookup.
    // OAuth login alone never grants app access; loadCurrentMember remains the access gate.
    await loadDiscordAccount();
    startGuildPresence();

    await Promise.allSettled([
      loadDashboard(),
      loadMembers(),
      loadPortfolios(),
      loadWarEvents()
    ]);


    // Re-render after member records are available so each portfolio shows its owner.
    await renderPortfolios();
    renderClassLegend();
    renderWarLayout();

    // Resolve a direct URL first, then restore the previous page only for the site root.
    const initialPage = getLastGuildPage();
    const initialRoute = window.__guildInitialRoute;
    openGuildPage(initialPage, {
      routePath: initialRoute?.path || getGuildDefaultRoutePath(initialPage),
      warTab: initialRoute?.warTab || undefined,
      replaceHistory: true
    });

    await handleDiscordCallback();
    window.dispatchEvent(new Event("4am:app-ready"));

  } catch (error) {
    console.error("Application loading error:", error);
    setConnectionStatus(
      "ไม่สามารถตรวจสอบบัญชี Discord ได้: " + (error?.message || "Unknown error"),
      false
    );
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

// Manual member lookup and linking are intentionally split:
// lookup_my_manual_member() is read-only; confirm_my_manual_member() writes only
// after the member explicitly chooses a matching Manual character.

// ==========================================
// MANUAL MEMBER ACCOUNT LINKING
// ==========================================

let manualMemberLinkBusy = false;

function showManualMemberChooser(manualRows, errorMessage = "") {
  const loginScreen = $("login-screen");
  if (!loginScreen) return;

  $("app-layout")?.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  $("login-form")?.closest(".login-card")?.classList.add("hidden");
  $("registration-screen")?.remove();

  let screen = $("manual-member-link-screen");
  if (!screen) {
    screen = document.createElement("div");
    screen.id = "manual-member-link-screen";
    screen.className = "login-card";
    // Mount outside the login screen so its overflow cannot clip the mobile modal.
    document.body.appendChild(screen);
  }

  const identity = getDiscordOAuthIdentity();
  const rows = Array.isArray(manualRows) ? manualRows : [];
  screen.innerHTML = `
    <div class="login-logo registration-guild-logo">
      <img src="/assets/4am-guild-logo.png?v=20261111b" alt="4AM GUILD Logo" onerror="this.style.display='none'">
    </div>
    <h2>CONFIRM GUILD MEMBER</h2>
    <p class="login-description">พบรายชื่อที่ตรงกับ Discord User ID ของคุณ กรุณาตรวจสอบชื่อตัวละครก่อนยืนยันการเชื่อมบัญชี</p>
    <div class="registration-discord-info">
      <strong>Discord OAuth Identity</strong>
      <span>ชื่อแสดงผล: ${escapeHTML(identity.globalName || "ไม่พบชื่อแสดงผล")}</span>
      <span>Discord User ID: ${escapeHTML(identity.discordId || "ไม่พบ User ID")}</span>
      <small>ระบบจับคู่ด้วย Discord User ID ที่ตรงกันเท่านั้น ไม่ใช้ Username หรือชื่อตัวละครในการจับคู่</small>
    </div>
    <div class="manual-member-link-list">
      ${rows.map(row => {
        const active = row.active === true;
        return `
          <article class="manual-member-link-option">
            <div class="manual-member-link-copy">
              <strong>${escapeHTML(row.character_name || "ไม่ระบุชื่อตัวละคร")}</strong>
              <span>${escapeHTML(row.game_class || "ไม่ระบุ Class")}${row.nickname ? " · " + escapeHTML(row.nickname) : ""}</span>
              ${row.guild_position ? `<small>${escapeHTML(row.guild_position)}</small>` : ""}
              ${active ? "" : '<small class="manual-member-link-inactive">รายชื่อนี้ถูกปิดใช้งาน กรุณาติดต่อฝ่ายจัดการ</small>'}
            </div>
            <button type="button" class="btn btn-primary manual-member-link-confirm"
              data-manual-member-id="${escapeHTML(row.id)}" ${active ? "" : "disabled"}>
              ${active ? "ยืนยันตัวละครนี้" : "ไม่สามารถยืนยันได้"}
            </button>
          </article>`;
      }).join("")}
    </div>
    <p id="manual-member-link-message" class="message">${escapeHTML(errorMessage)}</p>
    <div class="registration-actions">
      <button type="button" id="manual-member-link-logout" class="btn btn-outline registration-logout">LOG OUT / ออกจากระบบ</button>
    </div>
  `;

  screen.querySelectorAll("[data-manual-member-id]").forEach(button => {
    button.addEventListener("click", () => confirmManualMemberLink(button.dataset.manualMemberId));
  });
  $("manual-member-link-logout")?.addEventListener("click", logout);
}

async function confirmManualMemberLink(manualMemberId) {
  if (manualMemberLinkBusy || !currentUser || !manualMemberId) return;
  manualMemberLinkBusy = true;

  const buttons = document.querySelectorAll("#manual-member-link-screen [data-manual-member-id]");
  buttons.forEach(button => { button.disabled = true; });
  showMessage("manual-member-link-message", "กำลังยืนยันตัวละครและเชื่อมบัญชี Discord...", "info");

  try {
    const { data, error } = await supabaseClient.functions.invoke("register-guild-member", {
      body: { action: "link_manual", manual_member_id: manualMemberId }
    });
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
    if (!data?.success) throw new Error(data?.message || "ไม่สามารถส่งคำขอเชื่อมบัญชีได้");
    $("manual-member-link-screen")?.remove();
    await loadCurrentMember();
    if (!currentMember) throw new Error("เชื่อมบัญชีแล้ว แต่ไม่พบข้อมูลสมาชิก กรุณาเข้าสู่ระบบใหม่");

    // Manual Directory records are already Management-approved when active.
    // Continue into the app immediately instead of showing the pending-review screen.
    if (currentMember.membership_status === "pending_review") {
      showMembershipStatusScreen("pending_review");
      return;
    }
    await loadApplication();
  } catch (error) {
    console.error("Manual member confirmation failed:", error);
    showMessage("manual-member-link-message", error.message || "ไม่สามารถยืนยันการเชื่อมบัญชีได้");
    buttons.forEach(button => { button.disabled = false; });
  } finally {
    manualMemberLinkBusy = false;
  }
}

// ==========================================
// CHARACTER REGISTRATION
// ==========================================

function showMembershipStatusScreen(status = "pending_review") {
  const loginScreen = $("login-screen");
  if (!loginScreen) return;
  $("app-layout")?.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  $("login-form")?.closest(".login-card")?.classList.add("hidden");
  $("registration-screen")?.remove();
  $("manual-member-link-screen")?.remove();

  let screen = $("membership-status-screen");
  if (!screen) {
    screen = document.createElement("div");
    screen.id = "membership-status-screen";
    screen.className = "login-card membership-status-card";
    loginScreen.appendChild(screen);
  }
  const isPending = status === "pending_review";
  const title = isPending ? "APPLICATION UNDER REVIEW" : "MEMBERSHIP ACCESS RESTRICTED";
  const description = isPending
    ? "ระบบได้รับข้อมูลและยืนยันบัญชี Discord ของคุณแล้ว ขณะนี้กำลังรอฝ่ายจัดการตรวจสอบและอนุมัติ คุณยังไม่สามารถเข้าใช้งานหน้าเว็บไซต์ได้"
    : "บัญชีสมาชิกนี้ถูกระงับการใช้งานเว็บไซต์ กรุณาติดต่อฝ่ายจัดการกิลด์";
  screen.innerHTML = `
    <div class="login-logo registration-guild-logo"><img src="/assets/4am-guild-logo.png?v=20261111b" alt="4AM GUILD Logo" onerror="this.style.display='none'"></div>
    <div class="membership-status-icon ${isPending ? "is-pending" : "is-blocked"}">${isPending ? "◷" : "!"}</div>
    <h2>${title}</h2>
    <p class="login-description">${description}</p>
    ${isPending ? '<div class="membership-review-steps"><span class="is-done">01 · Discord OAuth verified</span><span class="is-done">02 · Guild role verified</span><span class="is-current">03 · Waiting for management approval</span></div>' : ""}
    <button type="button" id="membership-status-logout" class="btn btn-outline registration-logout">LOG OUT / ออกจากระบบ</button>
  `;
  $("membership-status-logout")?.addEventListener("click", logout);
}

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
          pattern="[0-9]{5,12}"
          minlength="5"
          maxlength="12"
          placeholder="Enter UID (5–12 digits)"
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

  if (!/^[0-9]{5,12}$/.test(gameUID)) {
    showMessage(
      "registration-message",
      "UID ตัวละครต้องเป็นตัวเลข 5–12 หลัก"
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
    // Re-check Manual membership immediately before self-registration.
    // This is read-only and prevents a newly-added Manual member from registering twice.
    const { data: manualMatches, error: lookupError } =
      await supabaseClient.rpc("lookup_my_manual_member");

    if (lookupError) {
      throw new Error("ไม่สามารถตรวจสอบรายชื่อสมาชิก Manual ได้: " + lookupError.message);
    }

    if (Array.isArray(manualMatches) && manualMatches.length > 0) {
      registrationBusy = false;
      showManualMemberChooser(manualMatches);
      return;
    }

    const { data: existingMember, error: existingMemberError } = await supabaseClient
      .from("guild_members")
      .select("*")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (existingMemberError) {
      throw new Error("ไม่สามารถตรวจสอบโปรไฟล์สมาชิกได้: " + existingMemberError.message);
    }

    if (existingMember) {
      currentMember = existingMember;
      registrationBusy = false;
      await loadApplication();
      return;
    }

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
      "ส่งคำขอสมัครสมาชิกสำเร็จ กำลังเปิดหน้าสถานะการตรวจสอบ...",
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
  const { count: activeMemberCount, error: memberError } = await supabaseClient
    .from("guild_members")
    .select("user_id", { count: "exact", head: true })
    .eq("active", true);

  if (memberError) {
    console.error("Dashboard active member count error:", memberError);
  }
  if ($("stat-members")) {
    $("stat-members").textContent = memberError ? "--" : (Number(activeMemberCount) || 0);
  }

  // This RPC returns only an aggregate count, never other members' Discord identities.
  const { data: discordCount, error: discordError } = await supabaseClient
    .rpc("get_guild_discord_account_count");

  if (discordError) console.error("Guild Discord count error:", discordError);
  if ($("stat-discord")) {
    $("stat-discord").textContent = discordError ? "--" : (Number(discordCount) || 0);
  }
  if ($("stat-role")) $("stat-role").textContent = getAccountDisplayPosition();

  renderDashboardProfile();
  await loadDashboardActivities();
}

let dashboardAnnouncements = [];
let dashboardAnnouncementIndex = 0;
let dashboardGalleryImages = [];
const dashboardGallerySignedUrlCache = new Map();
let dashboardGalleryActiveIndex = 0;
let dashboardGalleryBusy = false;
let dashboardGalleryAutoplayTimer = null;
let dashboardGalleryScrollFrame = null;
let dashboardGalleryPointerStart = null;
let dashboardGalleryDragMoved = false;
let dashboardGallerySuppressClick = false;
function pauseDashboardGalleryAutoplay(){
  if(dashboardGalleryAutoplayTimer){clearInterval(dashboardGalleryAutoplayTimer);dashboardGalleryAutoplayTimer=null;}
}
function startDashboardGalleryAutoplay(){
  pauseDashboardGalleryAutoplay();
  const root=$("dashboard-gallery");
  if(!root||dashboardGalleryImages.length<2||document.hidden||root.matches(":hover"))return;
  dashboardGalleryAutoplayTimer=setInterval(()=>{
    if(root.isConnected&&!root.matches(":hover")&&!document.hidden){
      const next=(dashboardGalleryActiveIndex+1)%dashboardGalleryImages.length;
      dashboardGalleryActiveIndex=next;
      updateDashboardGalleryActiveState();
      centerDashboardGallerySlide(next,"smooth");
    }
  },4800);
}

function renderDashboardAnnouncementCarousel() {
  const container = $("dashboard-announcement-content");
  if (!container) return;
  if (!dashboardAnnouncements.length) {
    container.innerHTML = `
      <div class="announcement-empty">
        <span class="badge-important">GUILD NEWS</span>
        <h4>ยังไม่มีประกาศจากกิลด์</h4>
        <p>เมื่อมีการโพสต์ข่าวสาร ประกาศจะปรากฏที่นี่</p>
      </div>`;
    return;
  }

  dashboardAnnouncementIndex = Math.max(0, Math.min(dashboardAnnouncementIndex, dashboardAnnouncements.length - 1));
  const item = dashboardAnnouncements[dashboardAnnouncementIndex];
  const contentPreview = document.createElement("div");
  contentPreview.innerHTML = sanitizeGuildActivityHTML(item.content_html || "");
  const plainText = (contentPreview.textContent || "").replace(/\s+/g, " ").trim();
  const excerpt = plainText.length > 190 ? plainText.slice(0, 190).trimEnd() + "…" : plainText;

  container.innerHTML = `
    <div class="announcement-carousel-content">
      <span class="badge-important">ประกาศ ${String(dashboardAnnouncementIndex + 1).padStart(2,"0")} / ${String(dashboardAnnouncements.length).padStart(2,"0")}</span>
      <h4>${escapeHTML(item.title || "ข่าวสารจากกิลด์")}</h4>
      <p>${escapeHTML(excerpt || "กดเพื่ออ่านรายละเอียดข่าวสารจากกิลด์")}</p>
      <div class="announcement-date">
        <svg class="icon"><use href="#i-clock"/></svg>
        เผยแพร่เมื่อ ${escapeHTML(activityDateLabel(item.created_at) || "-")}
      </div>
    </div>
    <div class="announcement-carousel-controls" aria-label="เลื่อนประกาศ">
      <button type="button" data-announcement-prev aria-label="ประกาศก่อนหน้า" ${dashboardAnnouncements.length < 2 ? "disabled" : ""}>‹</button>
      <div class="announcement-carousel-dots">
        ${dashboardAnnouncements.map((_,index)=>`<button type="button" data-announcement-index="${index}" class="${index===dashboardAnnouncementIndex?"is-active":""}" aria-label="ดูประกาศที่ ${index+1}" aria-current="${index===dashboardAnnouncementIndex?"true":"false"}"></button>`).join("")}
      </div>
      <button type="button" data-announcement-next aria-label="ประกาศถัดไป" ${dashboardAnnouncements.length < 2 ? "disabled" : ""}>›</button>
    </div>`;
}

async function loadDashboardActivities() {
  const container = $("dashboard-activities-content");
  if (!container) return;
  container.innerHTML = '<div class="announcement-empty"><h4>กำลังโหลดกิจกรรม...</h4></div>';

  const { data, error } = await supabaseClient
    .from("guild_activities")
    .select("id,title,content_html,starts_at,ends_at,created_at")
    .or("starts_at.not.is.null,ends_at.not.is.null")
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(4);

  if (error) {
    console.error("Dashboard guild activities error:", error);
    container.innerHTML = '<div class="announcement-empty"><h4>โหลดกิจกรรมไม่สำเร็จ</h4><p>กรุณาลองใหม่อีกครั้ง</p></div>';
    return;
  }

  const items = data || [];
  if (!items.length) {
    container.innerHTML = '<div class="announcement-empty"><span class="badge-important">GUILD ACTIVITIES</span><h4>ยังไม่มีกิจกรรมกิลด์</h4><p>เมื่อมีการโพสต์กิจกรรมกิลด์ กิจกรรมกิลด์จะปรากฏที่นี่</p></div>';
    return;
  }

  container.innerHTML = items.map(item => {
    const preview = document.createElement("div");
    preview.innerHTML = sanitizeGuildActivityHTML(item.content_html || "");
    const excerpt = (preview.textContent || "").replace(/\s+/g, " ").trim();
    const shortText = excerpt.length > 105 ? excerpt.slice(0, 105).trimEnd() + "…" : excerpt;
    const schedule = activityDateRange(item);
    return `<article class="dashboard-activity-item">
      <div class="dashboard-activity-date"><span>◷</span><strong>${escapeHTML(schedule)}</strong></div>
      <div class="dashboard-activity-copy"><h4>${escapeHTML(item.title || "กิจกรรมกิลด์")}</h4>
      ${shortText ? `<p>${escapeHTML(shortText)}</p>` : ""}</div>
    </article>`;
  }).join("");
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
    .limit(5);

  if (error) {
    console.error("Dashboard guild announcement error:", error);
    container.innerHTML = '<div class="announcement-empty"><span class="badge-important">GUILD NEWS</span><h4>โหลดข่าวสารไม่สำเร็จ</h4><p>กรุณาลองใหม่อีกครั้ง</p></div>';
    return;
  }

  dashboardAnnouncements = data || [];
  dashboardAnnouncementIndex = 0;
  renderDashboardAnnouncementCarousel();
}

function canManageDashboardGallery() {
  return !isRolePreviewActive() && canManageMemberProfiles();
}

function updateDashboardGalleryActiveState() {
  const track = $("dashboard-gallery-track");
  if (!track) return;
  const slides = [...track.querySelectorAll(".gallery-slide")];
  slides.forEach((slide,index)=>{
    slide.classList.toggle("is-active",index===dashboardGalleryActiveIndex);
    slide.setAttribute("aria-current",index===dashboardGalleryActiveIndex?"true":"false");
  });
  const count = $("dashboard-gallery-count");
  if (count) count.textContent = dashboardGalleryImages.length
    ? `GUILD MOMENTS · ${String(dashboardGalleryActiveIndex+1).padStart(2,"0")} / ${String(dashboardGalleryImages.length).padStart(2,"0")}`
    : "GUILD MOMENTS";
  const prev=$("dashboard-gallery-prev"),next=$("dashboard-gallery-next");
  if(prev)prev.disabled=dashboardGalleryImages.length<2;
  if(next)next.disabled=dashboardGalleryImages.length<2;
  const activeItem=dashboardGalleryImages[dashboardGalleryActiveIndex];
  const deleteButton=$("dashboard-gallery-delete-active");
  if(deleteButton){
    deleteButton.dataset.galleryDelete=activeItem?.id||"";
    deleteButton.disabled=!activeItem;
    deleteButton.classList.toggle("hidden",!activeItem||!canManageDashboardGallery());
  }
  const moveLeft=$("dashboard-gallery-move-left"),moveRight=$("dashboard-gallery-move-right");
  [moveLeft,moveRight].forEach(button=>{
    if(!button)return;
    button.dataset.galleryId=activeItem?.id||"";
    button.classList.toggle("hidden",!activeItem||!canManageDashboardGallery());
  });
  if(moveLeft)moveLeft.disabled=!activeItem||dashboardGalleryActiveIndex<=0;
  if(moveRight)moveRight.disabled=!activeItem||dashboardGalleryActiveIndex>=dashboardGalleryImages.length-1;
}

function centerDashboardGallerySlide(index, behavior = "smooth") {
  const track = $("dashboard-gallery-track");
  const slide = track?.querySelector(`[data-gallery-slide="${index}"]`);
  if (!track || !slide) return;
  const target = slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2;
  track.scrollTo({ left: Math.max(0, target), behavior });
}
function ensureDashboardGalleryLightbox() {
  let viewer = $("dashboard-gallery-lightbox");
  if (viewer) return viewer;
  viewer = document.createElement("div");
  viewer.id = "dashboard-gallery-lightbox";
  viewer.className = "dashboard-gallery-lightbox hidden";
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-modal", "true");
  viewer.setAttribute("aria-label", "Guild Gallery lightbox");
  viewer.innerHTML = `<button type="button" class="dashboard-gallery-lightbox-close" data-gallery-lightbox-close aria-label="ปิดภาพ">×</button><button type="button" class="dashboard-gallery-lightbox-nav prev" data-gallery-lightbox-prev aria-label="ภาพก่อนหน้า">‹</button><figure class="dashboard-gallery-lightbox-figure"><img id="dashboard-gallery-lightbox-image" alt="ภาพความทรงจำ 4AM GUILD"><figcaption id="dashboard-gallery-lightbox-counter"></figcaption></figure><button type="button" class="dashboard-gallery-lightbox-nav next" data-gallery-lightbox-next aria-label="ภาพถัดไป">›</button>`;
  document.body.appendChild(viewer);
  viewer.addEventListener("click", event => {
    if (event.target === viewer || event.target.closest("[data-gallery-lightbox-close]")) closeDashboardGalleryLightbox();
    else if (event.target.closest("[data-gallery-lightbox-prev]")) stepDashboardGalleryLightbox(-1);
    else if (event.target.closest("[data-gallery-lightbox-next]")) stepDashboardGalleryLightbox(1);
  });
  return viewer;
}
function updateDashboardGalleryLightbox() {
  const index = Number(window.dashboardGalleryLightboxIndex || 0), item = dashboardGalleryImages[index];
  if (!item) return;
  const image = $("dashboard-gallery-lightbox-image");
  if (image) image.src = item.signedUrl;
  const counter = $("dashboard-gallery-lightbox-counter");
  if (counter) counter.textContent = `${index + 1} / ${dashboardGalleryImages.length}`;
}
function openDashboardGalleryLightbox(index) {
  if (!dashboardGalleryImages.length) return;
  window.dashboardGalleryLightboxIndex = Math.max(0, Math.min(index, dashboardGalleryImages.length - 1));
  const viewer = ensureDashboardGalleryLightbox();
  updateDashboardGalleryLightbox();
  viewer.classList.remove("hidden");
  document.body.classList.add("gallery-lightbox-open");
  pauseDashboardGalleryAutoplay();
}
function closeDashboardGalleryLightbox() {
  $("dashboard-gallery-lightbox")?.classList.add("hidden");
  document.body.classList.remove("gallery-lightbox-open");
  startDashboardGalleryAutoplay();
}
function stepDashboardGalleryLightbox(delta) {
  if (!dashboardGalleryImages.length) return;
  const current = Number(window.dashboardGalleryLightboxIndex || 0);
  window.dashboardGalleryLightboxIndex = (current + delta + dashboardGalleryImages.length) % dashboardGalleryImages.length;
  updateDashboardGalleryLightbox();
}

function renderDashboardGallery() {
  const track=$("dashboard-gallery-track");
  const admin=$("dashboard-gallery-admin");
  if(!track)return;
  if(admin)admin.classList.toggle("hidden",!canManageDashboardGallery());
  if(!dashboardGalleryImages.length){
    track.innerHTML=`
      <div class="gallery-empty-state">
        <span>✦</span>
        <strong>ยังไม่มีภาพใน Guild Gallery</strong>
        <p>${canManageDashboardGallery()?"เริ่มต้นเก็บภาพความทรงจำของกิลด์ด้วยการเพิ่มรูปภาพ":"รอภาพความทรงจำที่ฝ่ายบริหารคัดเลือกมาแสดงที่นี่"}</p>
      </div>`;
    updateDashboardGalleryActiveState();
    return;
  }

  dashboardGalleryActiveIndex=Math.max(0,Math.min(dashboardGalleryActiveIndex,dashboardGalleryImages.length-1));
  track.innerHTML=dashboardGalleryImages.map((item,index)=>`
    <article class="gallery-slide ${index===dashboardGalleryActiveIndex?"is-active":""}" data-gallery-slide="${index}" aria-current="${index===dashboardGalleryActiveIndex?"true":"false"}">
      <button type="button" class="gallery-image-button" data-gallery-focus="${index}" aria-label="ดูภาพความทรงจำ ${index+1}">
        <img src="${escapeHTML(item.signedUrl)}" alt="ภาพความทรงจำ 4AM GUILD ลำดับที่ ${index+1}" loading="lazy">
      </button>
      ${""}
    </article>`).join("");
  updateDashboardGalleryActiveState();
  const active=track.querySelector(`[data-gallery-slide="${dashboardGalleryActiveIndex}"]`);
  if(active)centerDashboardGallerySlide(dashboardGalleryActiveIndex,"auto");
  startDashboardGalleryAutoplay();
}

async function loadDashboardGallery() {
  const track=$("dashboard-gallery-track");
  if(!track)return;
  track.innerHTML='<div class="gallery-empty-state"><span>✦</span><strong>กำลังโหลดภาพจากกิลด์...</strong><p>ภาพความทรงจำของ 4AM GUILD</p></div>';
  const {data,error}=await supabaseClient.from("guild_gallery_images")
    .select("id,storage_path,caption,sort_order,created_at")
    .eq("is_published",true)
    .order("sort_order",{ascending:true})
    .order("created_at",{ascending:false});
  if(error){
    console.error("Load Guild Gallery:",error);
    track.innerHTML='<div class="gallery-empty-state"><span>!</span><strong>โหลด Guild Gallery ไม่สำเร็จ</strong><p>กรุณารีเฟรชหน้า Dashboard อีกครั้ง</p></div>';
    return;
  }
  const rows=data||[];
  const now=Date.now();
  const signed=await Promise.all(rows.map(async item=>{
    const cached=dashboardGallerySignedUrlCache.get(item.storage_path);
    if(cached&&cached.expiresAt>now+60_000){
      return {...item,signedUrl:cached.url};
    }
    const {data:signedData,error:signedError}=await supabaseClient.storage.from("guild-gallery-images").createSignedUrl(item.storage_path,3600);
    if(signedError){console.warn("Guild Gallery signed URL:",signedError);return null;}
    const signedUrl=signedData.signedUrl;
    dashboardGallerySignedUrlCache.set(item.storage_path,{url:signedUrl,expiresAt:Date.now()+55*60*1000});
    return {...item,signedUrl};
  }));
  const activePaths=new Set(rows.map(item=>item.storage_path));
  for(const path of dashboardGallerySignedUrlCache.keys()){
    if(!activePaths.has(path))dashboardGallerySignedUrlCache.delete(path);
  }
  dashboardGalleryImages=signed.filter(Boolean);
  dashboardGalleryActiveIndex=0;
  renderDashboardGallery();
}

async function prepareStorageImageForUpload(file,{maxDimension=1920,quality=0.86,forceWebP=true}={}){
  if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type))return file;
  if(typeof createImageBitmap!=="function"){
    if(forceWebP)throw new Error("เบราว์เซอร์นี้ไม่รองรับการแปลงภาพเป็น WebP");
    return file;
  }
  let bitmap;
  try{
    bitmap=await createImageBitmap(file);
    const scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height));
    if(!forceWebP&&scale>=1&&file.size<500*1024)return file;
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext("2d");
    if(!context){
      if(forceWebP)throw new Error("เบราว์เซอร์ไม่สามารถประมวลผลรูปภาพได้");
      return file;
    }
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
    if(!blob||blob.type!=="image/webp"){
      if(forceWebP)throw new Error("ไม่สามารถสร้างไฟล์ WebP ได้");
      return file;
    }
    if(!forceWebP&&blob.size>=file.size*0.95)return file;
    const baseName=file.name.replace(/\.[^.]+$/,"")||"image";
    return new File([blob],baseName+".webp",{type:"image/webp",lastModified:Date.now()});
  }catch(error){
    console.warn("Image optimization skipped:",error);
    if(forceWebP)throw new Error("แปลงภาพเป็น WebP ไม่สำเร็จ: "+(error.message||"กรุณาลองใหม่"));
    return file;
  }finally{
    bitmap?.close?.();
  }
}

async function uploadDashboardGalleryFiles(files) {
  if(!canManageDashboardGallery()||dashboardGalleryBusy)return;
  const selected=[...files];
  if(!selected.length)return;
  dashboardGalleryBusy=true;
  const status=$("dashboard-gallery-status"),trigger=$("dashboard-gallery-upload-trigger");
  if(trigger){trigger.disabled=true;trigger.textContent="กำลังอัปโหลด...";}
  let uploaded=0;
  try{
    for(const file of selected){
      if(!["image/jpeg","image/png","image/webp","image/gif","image/svg+xml"].includes(file.type))throw new Error("รองรับเฉพาะ JPG, PNG, WEBP, GIF และ SVG");
      if(file.size>10*1024*1024)throw new Error("รูปภาพแต่ละไฟล์ต้องมีขนาดไม่เกิน 10 MB");
      const uploadFile=await prepareStorageImageForUpload(file,{maxDimension:1600,quality:0.78,forceWebP:true});
      const safeName=uploadFile.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(-90)||"guild-image";
      const path="gallery/"+crypto.randomUUID()+"-"+safeName;
      const {error:uploadError}=await supabaseClient.storage.from("guild-gallery-images").upload(path,uploadFile,{contentType:uploadFile.type,cacheControl:"86400",upsert:false});
      if(uploadError)throw uploadError;
      const {error:insertError}=await supabaseClient.from("guild_gallery_images").insert({
        storage_path:path,caption:file.name.replace(/\.[^.]+$/,"").slice(0,120),sort_order:Math.max(-1,...dashboardGalleryImages.map(item=>Number(item.sort_order)||0))+1+uploaded,uploaded_by:currentUser.id
      });
      if(insertError){
        await supabaseClient.storage.from("guild-gallery-images").remove([path]);
        throw insertError;
      }
      uploaded++;
    }
    if(status)status.textContent="เพิ่มภาพ "+uploaded+" ภาพเรียบร้อยแล้ว";
    await loadDashboardGallery();
  }catch(error){
    console.error("Upload Guild Gallery:",error);
    if(status)status.textContent="อัปโหลดไม่สำเร็จ: "+(error.message||"กรุณาลองอีกครั้ง");
    alert("เพิ่มภาพใน Guild Gallery ไม่สำเร็จ: "+(error.message||"กรุณาลองอีกครั้ง"));
  }finally{
    dashboardGalleryBusy=false;
    if(trigger){trigger.disabled=false;trigger.textContent="＋ เพิ่มรูปภาพ";}
    const input=$("dashboard-gallery-upload-input");if(input)input.value="";
  }
}

async function optimizeLegacyDashboardGalleryImages() {
  if(!isDeveloper()||isRolePreviewActive()||currentMember?.active!==true||dashboardGalleryBusy)return;
  const trigger=$("developer-tools-optimize-gallery-trigger");
  const status=$("developer-tools-gallery-optimize-status");
  dashboardGalleryBusy=true;
  if(trigger){trigger.disabled=true;trigger.textContent="กำลังตรวจสอบภาพ...";}
  try{
    await loadDashboardGallery();
    const candidates=dashboardGalleryImages.filter(item=>/\.(png|jpe?g)$/i.test(item.storage_path||""));
    if(!candidates.length){if(status)status.textContent="ไม่พบภาพ PNG/JPG เก่าที่ต้องปรับขนาดใน Guild Gallery";return;}
    const estimated=candidates.length;
    if(!window.confirm("พบภาพเก่า "+estimated+" ภาพ ต้องการแปลงเป็น WebP เพื่อลด Egress หรือไม่?\n\nระบบจะอัปโหลดไฟล์ WebP ใหม่และเปลี่ยนเฉพาะ storage_path ในฐานข้อมูล โดยเก็บไฟล์ต้นฉบับเดิมไว้ ไม่ลบไฟล์เดิม"))return;
    if(trigger)trigger.textContent="กำลังปรับภาพ...";
    let completed=0,failed=0;
    for(const item of candidates){
      let newPath=null;
      try{
        if(status)status.textContent="กำลังปรับภาพ "+(completed+failed+1)+"/"+estimated+" · "+(item.caption||"Guild Gallery");
        const {data:signedData,error:signedError}=await supabaseClient.storage.from("guild-gallery-images").createSignedUrl(item.storage_path,300);
        if(signedError)throw signedError;
        const response=await fetch(signedData.signedUrl,{cache:"no-store"});
        if(!response.ok)throw new Error("ดาวน์โหลดภาพต้นฉบับไม่สำเร็จ ("+response.status+")");
        const sourceBlob=await response.blob();
        if(!/^image\/(png|jpeg)$/.test(sourceBlob.type))throw new Error("ชนิดไฟล์ต้นฉบับไม่ใช่ PNG/JPEG");
        const bitmap=await createImageBitmap(sourceBlob);
        const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));
        canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        const context=canvas.getContext("2d");
        if(!context)throw new Error("ไม่สามารถสร้าง Canvas สำหรับแปลงภาพได้");
        context.drawImage(bitmap,0,0,canvas.width,canvas.height);
        bitmap.close?.();
        const webpBlob=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("แปลง WebP ไม่สำเร็จ")),"image/webp",0.78));
        if(webpBlob.size>=sourceBlob.size*0.95)throw new Error("ขนาด WebP ลดลงไม่ถึง 5% จึงข้ามเพื่อรักษาคุณภาพ");
        newPath="gallery/optimized-"+crypto.randomUUID()+".webp";
        const {error:uploadError}=await supabaseClient.storage.from("guild-gallery-images").upload(newPath,webpBlob,{contentType:"image/webp",cacheControl:"31536000",upsert:false});
        if(uploadError)throw uploadError;
        const {data:verifyData,error:verifyError}=await supabaseClient.storage.from("guild-gallery-images").createSignedUrl(newPath,60);
        if(verifyError||!verifyData?.signedUrl)throw verifyError||new Error("ตรวจสอบไฟล์ WebP ใหม่ไม่สำเร็จ");
        const {error:updateError}=await supabaseClient.from("guild_gallery_images").update({storage_path:newPath,updated_at:new Date().toISOString()}).eq("id",item.id);
        if(updateError)throw updateError;
        dashboardGallerySignedUrlCache.delete(item.storage_path);
        completed++;
      }catch(error){
        if(newPath)await supabaseClient.storage.from("guild-gallery-images").remove([newPath]);
        failed++;
        console.warn("Optimize Guild Gallery image failed:",item.storage_path,error);
      }
    }
    if(status)status.textContent="ปรับภาพเสร็จ "+completed+" ภาพ · ข้าม/ไม่สำเร็จ "+failed+" ภาพ · เก็บไฟล์ต้นฉบับไว้ทั้งหมด";
    await loadDashboardGallery();
    alert("ปรับภาพ Guild Gallery เสร็จแล้ว\nสำเร็จ: "+completed+" ภาพ\nข้าม/ไม่สำเร็จ: "+failed+" ภาพ\nไฟล์ต้นฉบับเดิมยังอยู่ใน Storage");
  }finally{
    dashboardGalleryBusy=false;
    if(trigger){trigger.disabled=false;trigger.textContent="ลดขนาดรูปเก่าใน Guild Gallery";}
  }
}

async function moveDashboardGalleryImage(id,direction) {
  if(!canManageDashboardGallery()||dashboardGalleryBusy)return;
  const index=dashboardGalleryImages.findIndex(item=>item.id===id);
  const targetIndex=index+direction;
  if(index<0||targetIndex<0||targetIndex>=dashboardGalleryImages.length)return;
  dashboardGalleryBusy=true;
  const first=dashboardGalleryImages[index],second=dashboardGalleryImages[targetIndex];
  try{
    const firstOrder=first.sort_order,secondOrder=second.sort_order;
    const firstResult=await supabaseClient.from("guild_gallery_images").update({sort_order:secondOrder,updated_at:new Date().toISOString()}).eq("id",first.id);
    if(firstResult.error)throw firstResult.error;
    const secondResult=await supabaseClient.from("guild_gallery_images").update({sort_order:firstOrder,updated_at:new Date().toISOString()}).eq("id",second.id);
    if(secondResult.error)throw secondResult.error;
    await loadDashboardGallery();
    dashboardGalleryActiveIndex=targetIndex;
    renderDashboardGallery();
  }catch(error){
    console.error("Reorder Guild Gallery:",error);
    alert("จัดลำดับภาพไม่สำเร็จ: "+(error.message||"กรุณาลองอีกครั้ง"));
  }finally{dashboardGalleryBusy=false;}
}

async function deleteDashboardGalleryImage(id) {
  if(!canManageDashboardGallery()||dashboardGalleryBusy)return;
  const item=dashboardGalleryImages.find(row=>row.id===id);
  if(!item||!window.confirm("ต้องการลบภาพนี้ออกจาก Guild Gallery ใช่หรือไม่?"))return;
  dashboardGalleryBusy=true;
  try{
    const {error}=await supabaseClient.from("guild_gallery_images").delete().eq("id",id);
    if(error)throw error;
    const {error:storageError}=await supabaseClient.storage.from("guild-gallery-images").remove([item.storage_path]);
    if(storageError)console.warn("Gallery image metadata removed; storage cleanup needs review:",storageError);
    await loadDashboardGallery();
  }catch(error){
    console.error("Delete Guild Gallery image:",error);
    alert("ลบภาพไม่สำเร็จ: "+(error.message||"กรุณาลองอีกครั้ง"));
  }finally{dashboardGalleryBusy=false;}
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
        <button type="button" class="profile-avatar-trigger" aria-label="เปลี่ยนรูปโปรไฟล์" title="คลิกเพื่อเปลี่ยนรูปโปรไฟล์">
          <img src="${escapeHTML(avatar)}" alt="รูปโปรไฟล์"
            onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'">
          <span class="profile-avatar-overlay" aria-hidden="true">
            <svg class="profile-avatar-camera" viewBox="0 0 24 24" fill="none">
              <path d="M4 7.5h3l1.5-2h7l1.5 2h3A1.5 1.5 0 0 1 21.5 9v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
              <circle cx="12" cy="13" r="3.5" stroke="currentColor" stroke-width="1.7"/>
            </svg>
            <span>เปลี่ยนรูปโปรไฟล์</span>
          </span>
        </button>
        <input type="file" id="profile-avatar-input" accept="image/*" hidden>
      </div>

      <div class="profile-meta">
        <div class="profile-identity-row">
          <div class="profile-name">
            <strong>${escapeHTML(name)}</strong>
            <svg class="icon icon-fill is-stroke"><use href="#i-crown"/></svg>
          </div>
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

        <small class="profile-avatar-upload-status" aria-live="polite">
          คลิกที่รูปเพื่อเปลี่ยน · รองรับไฟล์ไม่เกิน 5 MB
        </small>
      </div>
    </div>
  `;
}

// ==========================================
// MEMBERS
// ==========================================

async function loadBondRelationships() {
  const { data, error } = await supabaseClient.from("guild_member_bonds")
    .select("id, member_id, partner_member_id, created_at");
  if (error) {
    guildMemberBonds = [];
    bondRelationshipsLoadError = error.message || "โหลดข้อมูลสายใยไม่สำเร็จ";
    console.warn("Bond relationships are not ready:", bondRelationshipsLoadError);
    return;
  }
  guildMemberBonds = data || [];
  bondRelationshipsLoadError = "";
}
function getMemberSelectedBondIds(memberId) {
  return guildMemberBonds.filter(row => row.member_id === memberId).map(row => row.partner_member_id);
}
function getMemberSelectedBondNames(memberId) {
  return getMemberSelectedBondIds(memberId).map(id => allMembers.find(member => member.user_id === id && member.active !== false)).filter(Boolean).map(getMemberName);
}
function getWarBondMarkup(memberId, partyMemberIds = []) {
  const partnerIds = [...new Set(guildMemberBonds.filter(row => row.member_id === memberId || row.partner_member_id === memberId).map(row => row.member_id === memberId ? row.partner_member_id : row.member_id))];
  const partners = partnerIds.map(id => ({ id, member: allMembers.find(member => member.user_id === id) })).filter(item => item.member && (item.member.active !== false || partyMemberIds.includes(item.id)));
  if (!partners.length) return "";
  const html = partners.map(({ id, member }) => {
    const inParty = partyMemberIds.includes(id);
    return `<span class="war-bond-partner ${inParty ? "is-in-party" : "is-outside-party"}"><span aria-hidden="true">${inParty ? "✓" : "↗"}</span><span>${escapeHTML(getMemberName(member))}</span></span>`;
  }).join("");
  const samePartyCount = partners.filter(item => partyMemberIds.includes(item.id)).length;
  return `<section class="war-modal-bond-section" aria-label="สายใยผูกพัน"><div class="war-modal-bond-heading"><strong>สายใยผูกพัน</strong><span>${samePartyCount}/${partners.length} คนอยู่ในตี้</span></div><div class="war-modal-bond-list">${html}</div></section>`;
}
function renderOwnBondProfileSection() {
  const root = $("portfolio-own-bond-profile");
  if (!root) return;
  const member = allMembers.find(item => item.user_id === currentUser?.id && item.active !== false);
  if (!member) { root.classList.add("hidden"); return; }
  root.classList.remove("hidden");
  const names = getMemberSelectedBondNames(member.user_id);
  root.innerHTML = `<div class="portfolio-own-bond-copy"><span class="panel-kicker">YOUR CHARACTER CONNECTIONS</span><div class="portfolio-own-bond-title-row"><h3>สายใยผูกพันของคุณ</h3><span class="portfolio-own-bond-count">${names.length} คน</span></div><p>เลือกสมาชิกที่คุณมีสายใยผูกพันด้วย ระบบจะแสดงข้อมูลให้โดยอัตโนมัติในหน้าจัดตี้วอร์</p><div class="portfolio-own-bond-selected">${names.length ? names.map(name => `<span class="portfolio-own-bond-chip"><i></i>${escapeHTML(name)}</span>`).join("") : '<span class="portfolio-own-bond-empty">ยังไม่ได้เลือกสมาชิกสายใย</span>'}</div></div><button type="button" class="btn btn-outline portfolio-own-bond-manage" data-open-bond-profile>✦ จัดการสายใย</button>`;
  root.querySelector("[data-open-bond-profile]")?.addEventListener("click", () => void openBondProfileEditor());
}
function renderBondMemberPicker() {
  const selectedRoot = $("bond-profile-selected"), list = $("bond-profile-member-list"), searchInput = $("bond-profile-search");
  if (!selectedRoot || !list) return;
  const activeMembers = allMembers.filter(member => member.active === true && member.user_id !== currentUser?.id).sort((a,b)=>getMemberName(a).localeCompare(getMemberName(b),"th"));
  const selectedMembers = activeMembers.filter(member => bondSelectedMemberIds.has(member.user_id));
  selectedRoot.innerHTML = selectedMembers.length ? selectedMembers.map(member => `<button type="button" class="bond-selected-chip" data-bond-toggle="${escapeHTML(member.user_id)}"><span>${escapeHTML(getMemberName(member))}</span><b aria-hidden="true">×</b></button>`).join("") : '<span class="bond-picker-empty">ยังไม่ได้เลือกสายใย · เลือกสมาชิกจากรายชื่อด้านล่าง</span>';
  const query = String(searchInput?.value || "").trim().toLocaleLowerCase();
  const filtered = activeMembers.filter(member => !query || [getMemberName(member),member.nickname,member.discord_name,getMemberClass(member)].filter(Boolean).join(" ").toLocaleLowerCase().includes(query));
  list.innerHTML = filtered.length ? filtered.map(member => {
    const selected = bondSelectedMemberIds.has(member.user_id), info = getClassInfo(getMemberClass(member));
    return `<button type="button" class="bond-member-option ${selected?"is-selected":""}" data-bond-toggle="${escapeHTML(member.user_id)}" aria-pressed="${selected}"><span class="bond-member-avatar">${info?.iconPath ? `<img src="${escapeHTML(info.iconPath)}" alt="">` : "✦"}</span><span class="bond-member-option-copy"><strong>${escapeHTML(getMemberName(member))}</strong><small>${escapeHTML(getMemberClass(member))}${member.nickname ? " · "+escapeHTML(member.nickname) : ""}</small></span><span class="bond-member-option-action">${selected?"เลือกแล้ว ✓":"＋ เพิ่ม"}</span></button>`;
  }).join("") : '<div class="bond-picker-empty">ไม่พบสมาชิกที่ตรงกับคำค้นหา</div>';
  const count = $("bond-profile-selected-count"); if (count) count.textContent = String(selectedMembers.length);
}

async function fetchAllRowsPaged(queryFactory, pageSize = 100) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: rows, error: null };
}

// Keep the public member-card directory in the same order as the
// Member Management Center: affiliation first, then guild rank (highest first).
function compareGuildDirectoryMembers(a, b) {
  const guildRank = code => code === "4AM" ? 0 : code === "4PM" ? 1 : 2;
  const affiliationDiff = guildRank(a.guild_code) - guildRank(b.guild_code);
  if (affiliationDiff) return affiliationDiff;

  const positionA = String(a.guild_position || "").trim();
  const positionB = String(b.guild_position || "").trim();
  const missingA = positionA ? 0 : 1;
  const missingB = positionB ? 0 : 1;
  if (missingA !== missingB) return missingA - missingB;

  const positionOrder = new Map(GUILD_POSITIONS.map((position, index) => [position, index]));
  const rankA = positionOrder.has(positionA) ? positionOrder.get(positionA) : Number.MAX_SAFE_INTEGER;
  const rankB = positionOrder.has(positionB) ? positionOrder.get(positionB) : Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) return rankA - rankB;

  return String(a.character_name || "").localeCompare(String(b.character_name || ""), "th");
}

async function loadMembers(forceRefresh = false) {
  const container = $("members-list");
  if (!forceRefresh && Date.now() < memberDirectoryCacheExpiresAt) {
    renderMembers(directoryMembers);
    if ($("portfolio-member-grid")) await renderPortfolioMemberDirectory();
    return;
  }
  memberDirectoryCacheExpiresAt = 0;
  if (container) container.innerHTML = `<p class="muted">กำลังโหลดรายชื่อสมาชิก...</p>`;

  const [accountsResult, manualResult, affiliationResult] = await Promise.all([
    fetchAllRowsPaged(() => supabaseClient.from("guild_members")
      .select("user_id,character_name,game_class,nickname,discord_name,age,role,active,created_at,updated_at,display_position,avatar_url,guild_position,game_uid,member_cover_crop_settings,member_cover_url,membership_status,reviewed_at,avatar_crop_settings")
      .order("created_at", { ascending: true })),
    fetchAllRowsPaged(() => supabaseClient.from("guild_manual_members")
      .select("id,character_name,game_class,nickname,discord_name,age,guild_position,active,discord_user_id,discord_username,discord_global_name,discord_server_nickname,discord_avatar_url,linked_user_id,linked_at,created_at,updated_at")
      .eq("active", true).is("linked_user_id", null)
      .order("character_name", { ascending: true })),
    fetchAllRowsPaged(() => supabaseClient.from("guild_member_affiliations")
      .select("user_id,manual_member_id,guilds(code)")
      .is("ended_at", null))
  ]);

  if (accountsResult.error) {
    console.error("Load members error:", accountsResult.error);
    showEmpty(container, "ไม่สามารถโหลดรายชื่อสมาชิกได้", accountsResult.error.message);
    return;
  }

  allMembers = accountsResult.data || [];
  await loadBondRelationships();
  manualGuildMembers = manualResult.error ? [] : (manualResult.data || []);
  if (manualResult.error && !/guild_manual_members|relation.*does not exist/i.test(manualResult.error.message || "")) {
    console.warn("Load manual guild members:", manualResult.error);
  }

  const affiliationByMember = new Map();
  if (affiliationResult.error) {
    console.warn("Load current guild affiliations:", affiliationResult.error);
  } else {
    (affiliationResult.data || []).forEach(item => {
      const guild = Array.isArray(item.guilds) ? item.guilds[0] : item.guilds;
      const code = guild?.code || null;
      if (item.user_id) affiliationByMember.set("account:" + String(item.user_id), code);
      if (item.manual_member_id) affiliationByMember.set("manual:" + String(item.manual_member_id), code);
    });
  }

  directoryMembers = [
    ...allMembers.map(member => ({
      ...member,
      guild_code: affiliationByMember.get("account:" + String(member.user_id)) || null,
      is_manual_record: false
    })),
    ...manualGuildMembers.map(member => ({
      ...member,
      user_id: null,
      guild_code: affiliationByMember.get("manual:" + String(member.id)) || null,
      role: "member",
      is_manual_record: true
    }))
  ].sort(compareGuildDirectoryMembers);

  memberDirectoryCacheExpiresAt = Date.now() + 45 * 1000;
  renderMembers(directoryMembers);
  if ($("portfolio-member-grid")) await renderPortfolioMemberDirectory();
}

function renderMembers(members) {
  const container = $("members-list");
  if (!container) return;
  const source = Array.isArray(directoryMembers) ? directoryMembers : members;
  const classSummary = $("members-class-summary");
  if (classSummary) {
    const counts = new Map();
    source.forEach(member => {
      const name = String(getMemberClass(member) || "").trim().toLocaleLowerCase();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    classSummary.innerHTML = '<button type="button" class="war-class-filter member-class-filter ' + (memberDirectoryClassFilter === "all" ? "is-active" : "") + '" data-member-class-filter="all" title="สมาชิกทุกอาชีพ">ALL</button>' + CLASS_DATA.map(item => {
      const count = counts.get(String(item.name).toLocaleLowerCase()) || 0;
      return `<button type="button" class="war-class-filter member-class-filter" data-member-class-filter="${escapeHTML(item.name)}" style="--class-color:${escapeHTML(item.color)}" title="${escapeHTML(item.name)}: ${count} คน" aria-label="${escapeHTML(item.name)} ${count} คน"><img src="${escapeHTML(item.iconPath)}" alt="" loading="lazy"><span>${count}</span></button>`;
    }).join("");
    classSummary.querySelectorAll("[data-member-class-filter]").forEach(button => button.classList.toggle("is-active", button.dataset.memberClassFilter === memberDirectoryClassFilter));
  }
  const registeredCount = source.filter(member => !member.is_manual_record).length;
  const manualCount = source.filter(member => member.is_manual_record).length;
  const stats = $("member-directory-stats");
  if (stats) stats.innerHTML = [
    {label:"สมาชิกทั้งหมด",value:source.length,key:"all"},
    {label:"ลงทะเบียนแล้ว",value:registeredCount,key:"account"},
    {label:"Manual",value:manualCount,key:"manual"}
  ].map(item => `<button type="button" class="member-directory-stat ${memberDirectoryTypeFilter===item.key?"is-active":""}" data-member-type-filter="${item.key}"><span>${item.label}</span><strong>${item.value}</strong></button>`).join("");
  const typeFilter = $("member-type-filter");
  if (typeFilter) typeFilter.value = memberDirectoryTypeFilter;
  if (!members.length) {
    showEmpty(container, "ไม่พบสมาชิกที่ตรงกับเงื่อนไข", "ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองเพื่อดูสมาชิกทั้งหมด");
    return;
  }
  container.innerHTML = members.map(member => {
    const name = getMemberName(member), className = getMemberClass(member);
    const classInfo = getClassInfo(className), classColor = classInfo?.color || "#8b8b8b";
    const guildPosition = member.guild_position || "ยังไม่ได้กำหนดตำแหน่ง";
    const guildCode = member.guild_code || "unassigned";
    const guildLabel = guildCode === "unassigned" ? "ยังไม่ระบุสังกัด" : guildCode;
    const gameUID = String(member.game_uid || "");
    const recordType = member.is_manual_record ? "manual" : "account";
    const avatarKey = member.user_id || member.id || name;
    const isOwn = Boolean(currentUser?.id && member.user_id && String(member.user_id) === String(currentUser.id));
    const canEdit = !isRolePreviewActive() && isOwn && !member.is_manual_record;
    const editButton = canEdit ? `<button type="button" class="member-card-edit" data-member-card-edit="${escapeHTML(member.user_id || "")}" data-member-card-manual="${member.is_manual_record ? escapeHTML(member.id) : ""}" aria-label="แก้ไขข้อมูล ${escapeHTML(name)}" title="แก้ไขข้อมูลสมาชิก"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button>` : "";
    return `
      <article class="member-card member-directory-card" data-member-kind="${recordType}" style="--member-class-color:${escapeHTML(classColor)}">
        ${editButton}
        <div class="member-avatar"><img class="member-avatar-image" data-member-avatar-user-id="${escapeHTML(avatarKey)}" src="${DEFAULT_AVATAR}" alt="รูปโปรไฟล์ ${escapeHTML(name)}" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'"></div>
        <div class="member-info">
          <div class="member-details"><h4>${escapeHTML(name)}</h4><span class="member-guild-position-badge">${escapeHTML(guildPosition)}</span><span class="member-guild-affiliation-badge is-${guildCode==="4AM"?"4am":guildCode==="4PM"?"4pm":"unassigned"}">${escapeHTML(guildLabel)}</span><small class="member-secondary-name"><strong>ชื่อเล่น:</strong> <span>${escapeHTML(member.nickname || "-")}</span></small><small class="member-secondary-name"><strong>Discord:</strong> <span>${escapeHTML(member.discord_name || "-")}</span></small><small class="member-secondary-name"><strong>อายุ:</strong> <span>${member.age ? `${escapeHTML(member.age)} ปี` : "-"}</span></small></div>
          <div class="member-game-uid"><span class="member-uid-label">UID ตัวละคร</span><span class="member-uid-value">${escapeHTML(gameUID || "-")}</span>${gameUID ? `<button type="button" class="btn btn-outline copy-member-game-uid" data-game-uid="${escapeHTML(gameUID)}">คัดลอก UID</button>` : ""}</div>
        </div>
        <div class="member-class" style="--class-color:${escapeHTML(classColor)}">${classInfo?.iconPath ? `<img class="member-class-icon" src="${escapeHTML(classInfo.iconPath)}" alt="${escapeHTML(className)}" loading="lazy" onerror="this.style.display='none'">` : ""}<span>${escapeHTML(className)}</span>${member.is_manual_record ? '<span class="member-record-status">Manual</span>' : ""}</div>
      </article>`;
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

function openMemberCardEditor(member) {
  const modal = $("member-card-edit-modal"), form = $("member-card-edit-form");
  if (!modal || !form || !member || member.is_manual_record || !member.user_id) return;
  $("member-card-edit-user-id").value = member.user_id;
  form.elements.character_name.value = member.character_name || "";
  form.elements.nickname.value = member.nickname || "";
  form.elements.age.value = member.age ?? "";
  form.elements.game_class.value = member.game_class || "";
  form.elements.game_uid.value = member.game_uid || "";
  const cls = getClassInfo(member.game_class), preview = $("member-card-edit-class-icon");
  if (preview) { preview.src = cls?.iconPath || ""; preview.style.display = cls ? "" : "none"; }
  $("member-card-edit-status").textContent = "";
  if (modal.parentElement !== document.body) document.body.appendChild(modal);
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("member-card-edit-open");
  window.setTimeout(() => form.elements.character_name.focus(), 60);
}
function closeMemberCardEditor() {
  const modal = $("member-card-edit-modal");
  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("member-card-edit-open");
}
async function saveMemberCardEditor(form) {
  if (!form || !currentUser) return;
  const userId = String($("member-card-edit-user-id")?.value || "");
  const target = directoryMembers.find(member => !member.is_manual_record && String(member.user_id) === userId);
  if (!target) return;
  const isOwn = userId === String(currentUser.id);
  if (!isOwn && !canManageMemberProfiles()) { alert("ไม่มีสิทธิ์แก้ไขข้อมูลสมาชิกคนนี้"); return; }
  if (isRolePreviewActive()) { alert("Role Preview เป็นโหมดอ่านอย่างเดียว"); return; }
  const characterName = String(form.elements.character_name.value || "").trim();
  const nickname = String(form.elements.nickname.value || "").trim();
  const gameClass = String(form.elements.game_class.value || "").trim();
  const gameUID = String(form.elements.game_uid.value || "").trim();
  const ageRaw = String(form.elements.age.value || "").trim(), age = ageRaw ? Number(ageRaw) : null;
  const status = $("member-card-edit-status");
  if (!characterName || characterName.length > 40) { status.textContent = "กรุณากรอกชื่อตัวละครไม่เกิน 40 ตัวอักษร"; return; }
  if (!nickname || nickname.length > 40) { status.textContent = "กรุณากรอกชื่อเล่นไม่เกิน 40 ตัวอักษร"; return; }
  if (ageRaw && (!Number.isInteger(age) || age < 1 || age > 120)) { status.textContent = "อายุต้องเป็นตัวเลข 1–120 ปี"; return; }
  if (!CLASS_DATA.some(item => item.name === gameClass)) { status.textContent = "กรุณาเลือกอาชีพจากรายการ"; return; }
  if (gameUID !== String(target.game_uid || "") && !/^[0-9]{5,12}$/.test(gameUID)) { status.textContent = "UID ตัวละครใหม่ต้องเป็นตัวเลข 5–12 หลัก"; return; }
  const button = form.querySelector('button[type="submit"]');
  if (button) { button.disabled = true; button.textContent = "กำลังบันทึก..."; }
  status.textContent = "กำลังบันทึกข้อมูล...";
  try {
    const {data,error}=await supabaseClient.from("guild_members").update({character_name:characterName,nickname,age,game_class:gameClass,game_uid:gameUID}).eq("user_id",userId).select("user_id,character_name,nickname,age,game_class,game_uid").single();
    if(error)throw error;
    const patch={character_name:data.character_name,nickname:data.nickname,age:data.age,game_class:data.game_class,game_uid:data.game_uid};
    const account=allMembers.find(item=>String(item.user_id)===userId); if(account)Object.assign(account,patch);
    const row=directoryMembers.find(item=>!item.is_manual_record&&String(item.user_id)===userId); if(row)Object.assign(row,patch);
    if(isOwn&&currentMember)Object.assign(currentMember,patch);
    filterMembers();
    if(isOwn){renderAccountDetails();updateUserChip();renderDashboardProfile();}
    renderWarLayout();
    status.textContent="บันทึกข้อมูลสมาชิกเรียบร้อยแล้ว";
    window.setTimeout(closeMemberCardEditor,500);
  } catch(error) {
    console.error("Member card profile update:",error);
    status.textContent="บันทึกไม่สำเร็จ: "+(error.message||"กรุณาลองอีกครั้ง");
  } finally {if(button){button.disabled=false;button.textContent="บันทึกข้อมูล";}}
}

// ==========================================
// DISCORD SERVER MEMBER PICKER
// ==========================================

function closeDiscordMemberPicker() {
  const picker = $("discord-member-picker");
  picker?.classList.add("hidden");
  picker?.setAttribute("aria-hidden", "true");
}

function setManualDiscordMember(member) {
  const fields = {
    "manual-member-discord-id": member?.id || "",
    "manual-member-discord-username": member?.username || "",
    "manual-member-discord-global-name": member?.global_name || "",
    "manual-member-discord-nickname": member?.nick || "",
    "manual-member-discord-avatar": member?.avatar_url || "",
    "manual-member-discord-name": member?.username || ""
  };
  Object.entries(fields).forEach(([id, value]) => { if ($(id)) $(id).value = value; });
  const display = $("manual-member-discord-selected");
  const clear = $("manual-member-discord-clear");
  if (!display) return;
  if (!member) {
    display.classList.add("is-empty");
    display.innerHTML = '<span class="discord-member-selected-icon">◈</span><span>ยังไม่ได้เลือกบัญชี Discord</span>';
    clear?.classList.add("hidden");
    return;
  }
  const label = member.nick || member.global_name || member.username || "Discord Member";
  const avatar = member.avatar_url ? '<img src="' + escapeHTML(member.avatar_url) + '" alt="" loading="lazy">' : '<span class="discord-member-selected-icon">◈</span>';
  display.classList.remove("is-empty");
  display.innerHTML = avatar + '<span class="discord-member-selected-copy"><strong>' + escapeHTML(label) +
    '</strong><small>@' + escapeHTML(member.username || "unknown") + ' · ID: ' + escapeHTML(member.id) +
    '</small></span><span class="discord-member-selected-check">✓</span>';
  clear?.classList.remove("hidden");
}

async function openDiscordMemberPicker() {
  if (!canManageMemberProfiles() || $("manual-member-type")?.value === "account") return;
  const picker = $("discord-member-picker");
  if (picker && picker.parentElement !== document.body) document.body.appendChild(picker);
  picker?.classList.remove("hidden");
  picker?.setAttribute("aria-hidden", "false");
  const search = $("discord-member-picker-search");
  if (search) { search.value = ""; search.focus(); }
  await loadDiscordGuildMembers(false);
}

async function loadDiscordGuildMembers(forceRefresh = false) {
  if (!canManageMemberProfiles()) return;
  const status = $("discord-member-picker-status");
  const list = $("discord-member-picker-list");
  const refresh = $("discord-member-picker-refresh");
  if (!forceRefresh && discordGuildMembersCache.length) {
    renderDiscordMemberPicker();
    if (status) status.textContent = "โหลดสมาชิกแล้ว " + discordGuildMembersCache.length + " บัญชี";
    return;
  }
  if (status) status.textContent = "กำลังดึงรายชื่อสมาชิกจาก Discord Server...";
  if (list) list.innerHTML = '<div class="discord-member-picker-loading">กำลังเชื่อมต่อ Discord Bot...</div>';
  if (refresh) refresh.disabled = true;
  try {
    const { data, error } = await supabaseClient.functions.invoke("discord-member-directory", { body: {} });
    if (error) throw new Error(error.message || "เรียก Discord Bot ไม่สำเร็จ");
    if (!data?.success || !Array.isArray(data.members)) throw new Error(data?.message || "ไม่สามารถโหลดรายชื่อสมาชิก Discord ได้");
    discordGuildMembersCache = data.members;
    renderDiscordMemberPicker();
    if (status) status.textContent = "พบสมาชิกใน Discord Server " + data.members.length + " บัญชี";
  } catch (error) {
    console.error("Discord member directory:", error);
    if (status) status.textContent = "โหลดรายชื่อไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด");
    if (list) list.innerHTML = '<div class="discord-member-picker-error">ตรวจสอบ Bot Token, Server ID และ Server Members Intent ใน Discord Developer Portal</div>';
  } finally {
    if (refresh) refresh.disabled = false;
  }
}

function renderDiscordMemberPicker() {
  const list = $("discord-member-picker-list");
  const status = $("discord-member-picker-status");
  if (!list) return;
  const query = String($("discord-member-picker-search")?.value || "").trim().toLowerCase();
  const members = discordGuildMembersCache.filter(member =>
    [member.username, member.global_name, member.nick, member.id].some(value => String(value || "").toLowerCase().includes(query))
  );
  if (!members.length) {
    list.innerHTML = '<div class="discord-member-picker-empty">' + (discordGuildMembersCache.length ? "ไม่พบสมาชิกที่ตรงกับคำค้นหา" : "ยังไม่มีรายชื่อให้แสดง") + '</div>';
    if (status && discordGuildMembersCache.length) status.textContent = "ไม่พบผลลัพธ์ · ทั้งหมด " + discordGuildMembersCache.length + " บัญชี";
    return;
  }
  list.innerHTML = members.map(member => {
    const title = member.nick || member.global_name || member.username || "Discord Member";
    const avatar = member.avatar_url
      ? '<img src="' + escapeHTML(member.avatar_url) + '" alt="" loading="lazy">'
      : '<span class="discord-member-option-avatar-fallback">◈</span>';
    return '<button type="button" class="discord-member-option" data-discord-member-id="' + escapeHTML(member.id) + '">' +
      '<span class="discord-member-option-avatar">' + avatar + '</span><span class="discord-member-option-copy"><strong>' +
      escapeHTML(title) + '</strong><small>@' + escapeHTML(member.username || "unknown") +
      (member.global_name ? ' · ' + escapeHTML(member.global_name) : '') +
      '</small></span><span class="discord-member-option-select">เลือก</span></button>';
  }).join("");
  if (status) status.textContent = "แสดง " + members.length + " จาก " + discordGuildMembersCache.length + " บัญชี";
}

// ==========================================
// MANUAL MEMBER MANAGEMENT
// ==========================================

function renderGuildPositionOptions(selected = "") {
  return '<option value="">เลือกตำแหน่งกิลด์</option>' + GUILD_POSITIONS.map(position =>
    `<option value="${escapeHTML(position)}" ${selected === position ? "selected" : ""}>${escapeHTML(position)}</option>`
  ).join("");
}

// The member-card pencil can open this editor directly from the Directory page,
// before the management page has initialized its dynamic select options.
function ensureManualMemberFormOptions() {
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
}

function openManualMemberModal() {
  ensureManualMemberFormOptions();
  const modal = $("manual-member-modal");
  if (!modal) return;
  // Reparent this overlay so it is not trapped inside a hidden page section.
  if (modal.parentElement !== document.body) document.body.appendChild(modal);
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("manual-member-modal-open");
  window.setTimeout(() => modal.querySelector('input[name="character_name"]')?.focus(), 80);
}

function closeManualMemberModal() {
  const modal = $("manual-member-modal");
  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("manual-member-modal-open");
}

function resetManualMemberForm() {
  const form = $("manual-member-form");
  if (!form) return;
  form.reset();
  $("manual-member-discord-select")?.classList.remove("hidden");
  if ($("manual-member-discord-select")) $("manual-member-discord-select").disabled = false;
  $("manual-member-discord-clear")?.classList.add("hidden");
  if ($("manual-member-discord-clear")) $("manual-member-discord-clear").disabled = false;
  $("manual-member-discord-lock-note")?.classList.add("hidden");
  $("manual-member-id").value = "";
  $("manual-member-type").value = "manual";
  $("manual-member-user-id").value = "";
  $("manual-member-form-title").textContent = "เพิ่มสมาชิกใหม่";
  $("manual-member-submit").textContent = "บันทึกสมาชิก";
  $("manual-member-cancel").classList.add("hidden");
  $("manual-member-active").checked = true;
  setManualDiscordMember(null);
  closeDiscordMemberPicker();
  closeManualMemberModal();
}

// ==========================================
// WEBSITE MEMBER PRESENCE
// ==========================================

// Reduce background traffic while keeping presence reliable.
// Heartbeats run every 4 minutes; the 10-minute stale window allows
// for delayed/backgrounded browser tabs without showing active members offline.
const GUILD_PRESENCE_STALE_MS = 10 * 60 * 1000;
const GUILD_PRESENCE_HEARTBEAT_MS = 4 * 60 * 1000;
const GUILD_PRESENCE_REFRESH_MS = 3 * 60 * 1000;

async function sendGuildPresenceHeartbeat() {
  if (!currentUser?.id || currentMember?.active !== true) return;
  const { error } = await supabaseClient
    .from("guild_member_presence")
    .upsert({ user_id: currentUser.id, last_seen_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) console.warn("Guild presence heartbeat failed:", error.message);
}

async function refreshGuildPresence() {
  if (presenceRefreshBusy || !isManagement()) return;
  presenceRefreshBusy = true;
  try {
    const { data, error } = await supabaseClient
      .from("guild_member_presence")
      .select("user_id,last_seen_at");
    if (error) throw error;
    guildPresenceByUserId = new Map((data || []).map(row => [String(row.user_id), row.last_seen_at]));
    if ($("manual-member-list")) renderManualMemberManagement();
  } catch (error) {
    console.warn("Guild presence refresh failed:", error.message);
  } finally {
    presenceRefreshBusy = false;
  }
}

function isGuildMemberOnline(userId) {
  const lastSeen = userId ? guildPresenceByUserId.get(String(userId)) : null;
  if (!lastSeen) return false;
  const timestamp = new Date(lastSeen).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= GUILD_PRESENCE_STALE_MS;
}

function renderGuildPresenceStatus(userId) {
  const online = isGuildMemberOnline(userId);
  return `<span class="guild-presence-status ${online ? "is-online" : "is-offline"}"><span class="guild-presence-dot" aria-hidden="true"></span>${online ? "ออนไลน์" : "ออฟไลน์"}</span>`;
}

function handleGuildPresenceVisibility() {
  if (document.visibilityState === "visible") {
    void sendGuildPresenceHeartbeat();
    if (isManagement()) void refreshGuildPresence();
  }
}

function startGuildPresence() {
  if (!currentUser?.id || currentMember?.active !== true) return;
  if (presenceHeartbeatTimer) window.clearInterval(presenceHeartbeatTimer);
  if (presenceRefreshTimer) window.clearInterval(presenceRefreshTimer);
  void sendGuildPresenceHeartbeat();
  void refreshGuildPresence();
  presenceHeartbeatTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") void sendGuildPresenceHeartbeat();
  }, GUILD_PRESENCE_HEARTBEAT_MS);
  presenceRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === "visible" && isManagement()) {
      void refreshGuildPresence();
    }
  }, GUILD_PRESENCE_REFRESH_MS);
  document.removeEventListener("visibilitychange", handleGuildPresenceVisibility);
  document.addEventListener("visibilitychange", handleGuildPresenceVisibility);
}

async function stopGuildPresence() {
  if (presenceHeartbeatTimer) window.clearInterval(presenceHeartbeatTimer);
  if (presenceRefreshTimer) window.clearInterval(presenceRefreshTimer);
  presenceHeartbeatTimer = null;
  presenceRefreshTimer = null;
  document.removeEventListener("visibilitychange", handleGuildPresenceVisibility);
  if (!currentUser?.id) return;
  const { error } = await supabaseClient.from("guild_member_presence").delete().eq("user_id", currentUser.id);
  if (error) console.warn("Guild presence logout cleanup failed:", error.message);
}

async function loadManualMemberManagement() {
  if (!isManagement()) return;
  const list = $("manual-member-list");
  if (list) list.innerHTML = '<p class="muted">กำลังโหลดข้อมูลสมาชิก...</p>';
  await loadMembers(true);
  discordAccountDirectory = new Map();
  const discordResult = await supabaseClient.from("discord_accounts").select("user_id,discord_user_id,discord_username,discord_global_name,verified,guild_member_verified,discord_connection_status,verified_at,last_checked_at");
  if (!discordResult.error) discordAccountDirectory = new Map((discordResult.data || []).map(row => [String(row.user_id), row]));
  else console.info("Discord health details limited by current RLS permissions:", discordResult.error.message);

  ensureManualMemberFormOptions();
  const positionFilter = $("manual-member-position-filter");
  if (positionFilter && positionFilter.options.length <= 1) positionFilter.innerHTML = '<option value="all">ทุกตำแหน่ง</option>' + GUILD_POSITIONS.map(p => '<option value="' + escapeHTML(p) + '">' + escapeHTML(p) + '</option>').join("");
  renderMemberAdminSavedFilters();

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


function getMemberAdminDiscordHealth(member) {
  const uid = String(member?.user_id || member?.linked_user_id || "");
  const account = uid ? discordAccountDirectory.get(uid) : null;
  const status = account?.discord_connection_status;
  if (status === "disconnected") return {key:"pending",label:"ออกจาก Discord Server",detail:"สมาชิกยังคงเข้าเว็บไซต์ได้ตามปกติ รอ Management ตรวจสอบสถานะในกิลด์เกม",tone:"pending",account};
  if (status === "guest_role") return {key:"pending",label:"Role: 4AM Guest",detail:"Discord Role เปลี่ยนเป็น 4AM Guest แต่ระบบไม่ระงับสิทธิ์เว็บไซต์",tone:"pending",account};
  if (status === "role_missing") return {key:"pending",label:"ไม่พบ Guild Member Role",detail:"ไม่พบ Role 4AM Guild Member แต่ระบบไม่ระงับสิทธิ์เว็บไซต์",tone:"pending",account};
  if (status === "identity_mismatch") return {key:"pending",label:"Discord ไม่ตรงบัญชี",detail:"Discord OAuth ไม่ตรงกับบัญชีที่ผูกไว้ กรุณาตรวจสอบ",tone:"pending",account};
  // Verified identity + verified guild membership are authoritative.
  // "unknown" connection status means no current presence classification,
  // not that the linked Discord account is unverified.
  if (account?.verified === true && account?.guild_member_verified === true) return {key:"verified",label:"Verified",detail:"ยืนยันบัญชี Discord และการเป็นสมาชิก 4AM Guild แล้ว",tone:"good",account};
  if (account) return {key:"pending",label:"รอตรวจสอบ",detail:"พบข้อมูลบัญชี Discord แต่ยังไม่มีผลยืนยันตัวตนหรือสมาชิกกิลด์ครบถ้วน",tone:"pending",account};
  if (member?._recordType === "account" || member?.linked_user_id) return {key:"unknown",label:"ตรวจสอบไม่ได้",detail:"สิทธิ์ฐานข้อมูลปัจจุบันไม่เปิดเผยผลตรวจสอบ Discord ของบัญชีนี้",tone:"muted",account:null};
  if (member?.discord_user_id) return {key:"pending",label:"รอสมาชิกยืนยัน",detail:"มีการกำหนด Discord Account ในรายชื่อ Manual แต่ยังไม่พบผลยืนยันจากบัญชีผู้ใช้",tone:"pending",account:null};
  return {key:"missing",label:"ยังไม่เชื่อมต่อ",detail:"ยังไม่พบข้อมูลบัญชี Discord ที่เชื่อมโยง",tone:"muted",account:null};
}
function getMemberAdminSavedFilters(){try{const x=JSON.parse(localStorage.getItem(MEMBER_ADMIN_FILTERS_KEY)||"[]");return Array.isArray(x)?x.filter(v=>v&&typeof v.name==="string"&&v.filters):[]}catch(_){return[]}}
function renderMemberAdminSavedFilters(){const el=$("manual-member-saved-filters");if(!el)return;const old=el.value,items=getMemberAdminSavedFilters();el.innerHTML='<option value="">เลือกตัวกรองที่บันทึกไว้</option>'+items.map((x,i)=>'<option value="'+i+'">'+escapeHTML(x.name)+'</option>').join("");if(old&&items[Number(old)])el.value=old}
function getMemberAdminFilterState(){return{search:String($("manual-member-search")?.value||""),record:manualMemberRecordFilter,activity:manualMemberActivityFilter,discord:manualMemberDiscordFilter,position:manualMemberPositionFilter,className:manualMemberClassFilter,incompleteOnly:manualMemberIncompleteOnly}}
function setMemberAdminFilterState(f){f=f||{};if($("manual-member-search"))$("manual-member-search").value=f.search||"";manualMemberRecordFilter=f.record||"all";manualMemberActivityFilter=f.activity||"all";manualMemberDiscordFilter=f.discord||"all";manualMemberPositionFilter=f.position||"all";manualMemberClassFilter=f.className||"all";manualMemberIncompleteOnly=f.incompleteOnly===true;[["manual-member-record-filter",manualMemberRecordFilter],["manual-member-activity-filter",manualMemberActivityFilter],["manual-member-discord-filter",manualMemberDiscordFilter],["manual-member-position-filter",manualMemberPositionFilter]].forEach(([id,v])=>{if($(id))$(id).value=v});renderManualMemberManagement()}
async function setGuildMemberLifecycleStatus(userId, status, reason = "") {
  if (!isManagement() || !userId || !["active", "suspended"].includes(status)) return;
  try {
    const { error } = await supabaseClient.rpc("set_guild_member_lifecycle_status", {
      p_target_user_id: userId,
      p_status: status,
      p_reason: reason || null
    });
    if (error) throw error;
    await loadManualMemberManagement();
    const refreshed = allMembers.find(item => String(item.user_id) === String(userId));
    if (refreshed) openMemberAdminProfile(refreshed);
    alert(status === "suspended"
      ? "ระงับบัญชีเว็บไซต์เรียบร้อยแล้ว"
      : "คืนสิทธิ์เข้าเว็บไซต์เรียบร้อยแล้ว");
  } catch (error) {
    console.error("Guild member lifecycle update failed:", error);
    alert("เปลี่ยนสถานะสมาชิกไม่สำเร็จ: " + (error?.message || "Unknown error"));
  }
}

function openMemberAdminProfile(member){
  if(!member||!isManagement())return;
  const drawer=$("member-admin-profile-drawer"),content=$("member-admin-profile-content");if(!drawer||!content)return;
  const isAccount=member._recordType==="account",discord=getMemberAdminDiscordHealth(member),avatar=member.discord_avatar_url||member.avatar_url||"";
  const row=(label,value)=>'<div class="member-admin-profile-row"><span>'+label+'</span><strong>'+escapeHTML(value||"—")+'</strong></div>';
  content.innerHTML='<div class="member-admin-profile-identity">'+(avatar?'<img src="'+escapeHTML(avatar)+'" alt="">':'<span class="member-admin-profile-avatar">◈</span>')+'<div><h4>'+escapeHTML(member.character_name||"ไม่ระบุชื่อ")+'</h4><span>'+escapeHTML(member.game_class||"ยังไม่ระบุ Class")+'</span></div></div>'+
  '<section class="member-admin-profile-section"><h4>Character & Personal</h4>'+row("Character UID",member.game_uid)+row("Nickname",member.nickname)+row("อายุ",member.age?String(member.age):"")+row("Class",member.game_class)+row("ตำแหน่งกิลด์",member.guild_position)+'</section>'+
  '<section class="member-admin-profile-section"><h4>Discord Account</h4><div class="member-admin-health-pill is-'+discord.tone+'">'+escapeHTML(discord.label)+'</div><p class="member-admin-health-detail">'+escapeHTML(discord.detail)+'</p>'+row("Username",member.discord_username||member.discord_name)+row("Global Name",member.discord_global_name)+row("Server Nickname",member.discord_server_nickname)+row("Discord User ID",member.discord_user_id||discord.account?.discord_user_id)+row("ตรวจสอบล่าสุด",discord.account?.last_checked_at?new Date(discord.account.last_checked_at).toLocaleString("th-TH"):"")+'</section>'+
  '<section class="member-admin-profile-section"><h4>Account & Guild</h4>'+row("ประเภทบัญชี",isAccount?"ลงทะเบียนผ่านเว็บไซต์":"Manual")+row("สถานะสมาชิก",member.membership_status|| (member.active===false?"suspended":"active"))+row("Role",member.role||"member")+row("วันที่เพิ่ม",member.created_at?new Date(member.created_at).toLocaleString("th-TH"):"")+'</section>'+
  '<div class="member-admin-profile-actions">'+(isAccount?'<button type="button" class="btn btn-primary" data-drawer-edit-account="'+escapeHTML(member.user_id)+'">แก้ไขข้อมูลสมาชิก</button>':'<button type="button" class="btn btn-primary" data-drawer-edit-manual="'+escapeHTML(member.id)+'">แก้ไขข้อมูลสมาชิก</button>')+(isAccount&&member.membership_status!=="pending_review"?(member.active===true?'<button type="button" class="btn btn-outline" data-member-lifecycle="suspended" data-member-id="'+escapeHTML(member.user_id)+'">ระงับบัญชีเว็บไซต์</button>':'<button type="button" class="btn btn-outline" data-member-lifecycle="active" data-member-id="'+escapeHTML(member.user_id)+'">คืนสิทธิ์เข้าเว็บไซต์</button>'):'')+'</div>';
  content.querySelector("[data-member-lifecycle]")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    const status = button.dataset.memberLifecycle;
    const userId = button.dataset.memberId;
    let reason = "";
    if (status === "suspended") {
      reason = window.prompt("ระบุเหตุผลในการระงับบัญชีเว็บไซต์:");
      if (!reason || !reason.trim()) return;
    }
    const message = status === "suspended"
      ? "ยืนยันระงับบัญชีเว็บไซต์นี้หรือไม่? ข้อมูลสมาชิกและผลงานเดิมจะยังถูกเก็บไว้"
      : "ยืนยันคืนสิทธิ์เข้าเว็บไซต์หรือไม่?";
    if (!window.confirm(message)) return;
    button.disabled = true;
    await setGuildMemberLifecycleStatus(userId, status, reason);
  });
  $("member-admin-profile-title").textContent=member.character_name||"ข้อมูลสมาชิก";drawer.classList.remove("hidden");document.body.classList.add("member-admin-drawer-open");
}
function closeMemberAdminProfile(){$("member-admin-profile-drawer")?.classList.add("hidden");document.body.classList.remove("member-admin-drawer-open")}

async function reviewPendingGuildMember(userId, decision, reason = "") {
  if (!isManagement() || !userId || !["approve","reject"].includes(decision)) return;
  try {
    const { error } = await supabaseClient.rpc("review_pending_guild_member", {
      p_target_user_id: userId,
      p_decision: decision,
      p_reason: reason || null
    });
    if (error) throw error;
    await loadManualMemberManagement();
    alert(decision === "approve" ? "อนุมัติสมาชิกเรียบร้อยแล้ว" : "บันทึกผลไม่อนุมัติเรียบร้อยแล้ว");
  } catch (error) {
    console.error("Pending member review failed:", error);
    alert("ดำเนินการไม่สำเร็จ: " + (error?.message || "Unknown error"));
  }
}

function renderManualMemberManagement() {
  const list = $("manual-member-list");
  const summary = $("manual-member-summary");
  if (!list) return;

  let pendingPanel = $("member-pending-review-panel");
  if (!pendingPanel) {
    pendingPanel = document.createElement("section");
    pendingPanel.id = "member-pending-review-panel";
    pendingPanel.className = "member-pending-review-panel";
  }
  // Always enforce the panel's position, including when an earlier render or
  // an older page version left it nested inside the member/suspended list.
  const memberListPanel = list.closest(".manual-member-list-panel");
  if (memberListPanel?.parentElement) {
    if (pendingPanel.parentElement !== memberListPanel.parentElement ||
        pendingPanel.nextElementSibling !== memberListPanel) {
      memberListPanel.parentElement.insertBefore(pendingPanel, memberListPanel);
    }
  } else if (list.parentElement && pendingPanel.parentElement !== list.parentElement) {
    list.parentElement.insertBefore(pendingPanel, list);
  }
  pendingPanel.setAttribute("aria-label", "สมาชิกใหม่ที่รออนุมัติ");
  const pendingMembers = allMembers.filter(member =>
    String(member.membership_status || "").trim().toLowerCase() === "pending_review"
  );
  pendingPanel.innerHTML = pendingMembers.length ? `
    <div class="member-pending-review-heading">
      <div><span class="member-pending-review-eyebrow">MEMBERSHIP CONTROL</span><h3>สมาชิกใหม่รออนุมัติ</h3><p>ผู้สมัครผ่านการตรวจสอบ Discord Server และ Role แล้ว แต่ยังไม่มีสิทธิ์เข้าเว็บไซต์จนกว่าจะได้รับอนุมัติ</p></div>
      <strong>${pendingMembers.length} รายการ</strong>
    </div>
    <div class="member-pending-review-list">${pendingMembers.map(member => `
      <article class="member-pending-review-item">
        <div class="member-pending-review-main"><strong>${escapeHTML(member.character_name || "ไม่ระบุชื่อตัวละคร")}</strong><span>${escapeHTML(member.game_class || "-")} · ${escapeHTML(member.nickname || "-")}</span><small>Discord: ${escapeHTML(member.discord_name || "-")} · UID: ${escapeHTML(member.game_uid || "-")}</small></div>
        <div class="member-pending-review-actions"><button type="button" class="btn btn-sm member-pending-approve-btn" data-review-member="${escapeHTML(member.user_id)}" data-review-decision="approve">✓ อนุมัติ</button><button type="button" class="btn btn-outline btn-sm" data-review-member="${escapeHTML(member.user_id)}" data-review-decision="reject">ไม่อนุมัติ</button></div>
      </article>`).join("")}</div>` : "";
  pendingPanel.classList.toggle("hidden", pendingMembers.length === 0);
  pendingPanel.querySelectorAll("[data-review-member]").forEach(button => {
    button.addEventListener("click", () => {
      const decision = button.dataset.reviewDecision;
      const userId = button.dataset.reviewMember;
      const reason = decision === "reject" ? window.prompt("ระบุเหตุผลที่ไม่อนุมัติ (ไม่บังคับ):") : "";
      if (decision === "reject" && reason === null) return;
      const message = decision === "approve" ? "ยืนยันอนุมัติสมาชิกคนนี้หรือไม่?" : "ยืนยันไม่อนุมัติคำขอนี้หรือไม่?";
      if (window.confirm(message)) void reviewPendingGuildMember(userId, decision, reason || "");
    });
  });

  // Pending applications are reviewed in their own panel and must never
  // appear in the active/inactive member directory or suspended-member area.
  const approvedAccountRows = allMembers.filter(member => String(member.membership_status || "").trim().toLowerCase() !== "pending_review");
  const linkedCount = approvedAccountRows.length;
  // A linked Manual row is represented by its real guild_members account row.
  // Keep the source record for administration, but do not render/count it twice.
  const unlinkedManualMembers = manualGuildMembers.filter(member => !member.linked_user_id);
  const manualCount = unlinkedManualMembers.length;
  const activeCount =
    allMembers.filter(member => member.active).length +
    unlinkedManualMembers.filter(member => member.active).length;
  if (summary) summary.textContent = `สมาชิกในระบบ ${linkedCount} คน · Manual ที่ยังไม่เชื่อม ${manualCount} คน · Active ${activeCount} คน`;

  const classSummary = $("manual-member-class-summary");
  if (classSummary) {
    const classCounts = new Map();
    const countableMembers = [
      ...approvedAccountRows,
      ...unlinkedManualMembers
    ];
    countableMembers.forEach(member => {
      const className = String(member.game_class || "").trim().toLocaleLowerCase();
      if (className) classCounts.set(className, (classCounts.get(className) || 0) + 1);
    });
    classSummary.innerHTML = '<button type="button" class="war-class-filter manual-member-class-filter ' + (manualMemberClassFilter === "all" ? "is-active" : "") + '" data-manual-member-class="all" title="สมาชิกทุกอาชีพ">ALL</button>' + CLASS_DATA.map(item => {
      const count = classCounts.get(item.name.toLocaleLowerCase()) || 0;
      return `<button type="button" class="war-class-filter manual-member-class-filter" data-manual-member-class="${escapeHTML(item.name)}" style="--class-color:${escapeHTML(item.color)}" title="${escapeHTML(item.name)}: ${count} คน" aria-label="${escapeHTML(item.name)} ${count} คน"><img src="${escapeHTML(item.iconPath)}" alt="" loading="lazy"><span>${count}</span></button>`;
    }).join("");
    classSummary.querySelectorAll("[data-manual-member-class]").forEach(button => button.classList.toggle("is-active", button.dataset.manualMemberClass === manualMemberClassFilter));
  }

  if (!linkedCount && !manualCount) {
    list.innerHTML = '<div class="manual-member-empty"><span>＋</span><strong>ยังไม่มีรายชื่อสมาชิก</strong><p>เพิ่มสมาชิกที่ยังไม่มีบัญชีเข้าใช้งานแอปได้จากแบบฟอร์มด้านบน</p></div>';
    return;
  }

  // Sort every visible row together, regardless of whether the member has
  // linked a website account. GUILD_POSITIONS defines highest-to-lowest order.
  const guildPositionOrder = new Map(
    GUILD_POSITIONS.map((position, index) => [position, index])
  );
  // When a Manual member links their Discord login, the original Manual row
  // remains the source of the full Discord profile. Merge those fields into the
  // account-backed row for management display/editing without changing DB data.
  const linkedManualByUserId = new Map(
    manualGuildMembers
      .filter(member => member.linked_user_id)
      .map(member => [String(member.linked_user_id), member])
  );
  const accountRowsWithDiscord = allMembers.map(member => {
    const linkedManual = linkedManualByUserId.get(String(member.user_id));
    if (!linkedManual) return { ...member, _recordType: "account" };
    return {
      ...linkedManual,
      ...member,
      discord_name: linkedManual.discord_name || member.discord_name || "",
      discord_user_id: linkedManual.discord_user_id || "",
      discord_username: linkedManual.discord_username || "",
      discord_global_name: linkedManual.discord_global_name || "",
      discord_server_nickname: linkedManual.discord_server_nickname || "",
      discord_avatar_url: linkedManual.discord_avatar_url || "",
      _recordType: "account"
    };
  });
  const allVisibleMembers = [
    ...accountRowsWithDiscord.filter(member => String(member.membership_status || "").trim().toLowerCase() !== "pending_review"),
    ...unlinkedManualMembers.map(member => ({ ...member, _recordType: "manual" }))
  ].sort((a, b) => {
    const rankA = guildPositionOrder.has(a.guild_position)
      ? guildPositionOrder.get(a.guild_position)
      : Number.MAX_SAFE_INTEGER;
    const rankB = guildPositionOrder.has(b.guild_position)
      ? guildPositionOrder.get(b.guild_position)
      : Number.MAX_SAFE_INTEGER;

    if (rankA !== rankB) return rankA - rankB;
    return String(a.character_name || "").localeCompare(
      String(b.character_name || ""),
      "th"
    );
  });

  const searchInput = $("manual-member-search"), searchQuery = String(searchInput?.value || "").trim().toLocaleLowerCase();
  const filteredVisibleMembers = allVisibleMembers.filter(member => {
    const health = getMemberAdminDiscordHealth(member);
    const fields = [member.character_name,member.nickname,member.game_class,member.guild_position,member.game_uid,member.discord_name,member.discord_username,member.discord_global_name,member.discord_server_nickname,member.discord_user_id,member.user_id];
    const matchesSearch = !searchQuery || fields.some(value => String(value || "").toLocaleLowerCase().includes(searchQuery));
    const matchesClass = manualMemberClassFilter === "all" || String(member.game_class || "").toLowerCase() === manualMemberClassFilter.toLowerCase();
    const matchesRecord = manualMemberRecordFilter === "all" || (manualMemberRecordFilter === "account" ? member._recordType === "account" : member._recordType === "manual");
    const matchesActivity = manualMemberActivityFilter === "all" || (manualMemberActivityFilter === "pending_review" ? member.membership_status === "pending_review" : manualMemberActivityFilter === "active" ? member.active !== false : member.active === false);
    const matchesDiscord = manualMemberDiscordFilter === "all" || health.key === manualMemberDiscordFilter;
    const matchesPosition = manualMemberPositionFilter === "all" || String(member.guild_position || "") === manualMemberPositionFilter;
    const matchesIncomplete = !manualMemberIncompleteOnly || !member.game_uid || !member.nickname || !member.guild_position;
    return matchesSearch && matchesClass && matchesRecord && matchesActivity && matchesDiscord && matchesPosition && matchesIncomplete;
  });
  const quality = $("manual-member-quality-strip");
  if (quality) {
    const count = key => allVisibleMembers.filter(member => getMemberAdminDiscordHealth(member).key === key).length;
    const incomplete = allVisibleMembers.filter(member => !member.game_uid || !member.nickname || !member.guild_position).length;
    quality.innerHTML = [{label:"สมาชิกทั้งหมด",value:allVisibleMembers.length,key:"all"},{label:"Discord Verified",value:count("verified"),key:"verified"},{label:"รอตรวจสอบ",value:count("pending"),key:"pending"},{label:"ตรวจสอบไม่ได้",value:count("unknown"),key:"unknown"},{label:"ยังไม่เชื่อม Discord",value:count("missing"),key:"missing"},{label:"ข้อมูลไม่ครบ",value:incomplete,key:"incomplete"}].map(x=>'<button type="button" class="member-admin-quality-card" data-quality-filter="'+x.key+'"><span>'+x.label+'</span><strong>'+x.value+'</strong></button>').join("");
  }
  const resultLabel = $("manual-member-filter-result"); if (resultLabel) resultLabel.textContent = "แสดง " + filteredVisibleMembers.length + " จาก " + allVisibleMembers.length + " รายชื่อ";

  const memberRows = filteredVisibleMembers.map((member, index) => {
    const cls = getClassInfo(member.game_class);
    const isAccount = member._recordType === "account";
    const name = member.character_name || (isAccount ? getMemberName(member) : "");
    const identityNote = isAccount
      ? "บัญชีเชื่อมต่อแล้ว"
      : "ยังไม่มีบัญชีเข้าใช้งาน";
    const presence = isAccount
      ? renderGuildPresenceStatus(member.user_id)
      : renderGuildPresenceStatus(null);
    const discordHealth = getMemberAdminDiscordHealth(member);
    const actions = isAccount
      ? `<button type="button" class="btn btn-outline btn-sm" data-member-admin-view="${escapeHTML(member.user_id)}" data-member-admin-type="account">ดูข้อมูล</button><button type="button" class="btn btn-outline btn-sm" data-account-edit="${escapeHTML(member.user_id)}">แก้ไข</button><button type="button" class="btn btn-sm manual-member-toggle-btn ${member.active ? "is-suspend" : "is-activate"}" data-account-toggle="${escapeHTML(member.user_id)}">${member.active ? "ระงับ" : "เปิดใช้งาน"}</button><button type="button" class="member-row-remove" data-member-remove-account="${escapeHTML(member.user_id)}" aria-label="นำบัญชีสมาชิกออกจากกิลด์" title="นำบัญชีสมาชิกออกจากกิลด์">−</button>`
      : `<button type="button" class="btn btn-outline btn-sm" data-member-admin-view="${escapeHTML(member.id)}" data-member-admin-type="manual">ดูข้อมูล</button><button type="button" class="btn btn-outline btn-sm" data-manual-edit="${escapeHTML(member.id)}">แก้ไข</button><button type="button" class="btn btn-sm manual-member-toggle-btn ${member.active ? "is-suspend" : "is-activate"}" data-manual-toggle="${escapeHTML(member.id)}">${member.active ? "ระงับ" : "เปิดใช้งาน"}</button><button type="button" class="member-row-remove" data-member-remove-manual="${escapeHTML(member.id)}" aria-label="ลบรายชื่อ Manual" title="ลบรายชื่อ Manual">−</button>`;

    return `<tr>
      <td class="manual-member-number" style="text-align:center;font-weight:700;">${index + 1}</td>
      <td><strong>${escapeHTML(name)}</strong><small>ชื่อเล่น: ${escapeHTML(member.nickname || "-")} · ${identityNote}</small></td>
      <td><span class="manual-member-class" style="--class-color:${cls?.color || "#aaa"}">${escapeHTML(member.game_class || "ยังไม่ระบุ")}</span></td>
      <td>${escapeHTML(member.guild_position || "ยังไม่ได้กำหนด")}</td>
      <td><span class="member-admin-health-pill is-${discordHealth.tone}">${escapeHTML(discordHealth.label)}</span></td>
      <td><span class="manual-member-status ${member.active ? "is-active" : "is-inactive"}">${member.active ? "Active" : "Inactive"}</span></td>
      <td>${presence}</td>
      <td><div class="manual-member-actions">${actions}</div></td>
    </tr>`;
  }).join("");

  list.innerHTML = filteredVisibleMembers.length
    ? `
      <div class="manual-member-table-wrap">
        <table class="manual-member-table">
          <thead><tr><th style="text-align:center;">ลำดับ</th><th>สมาชิก</th><th>Class</th><th>ตำแหน่งกิลด์</th><th>Discord Health</th><th>สถานะ</th><th>ออนไลน์</th><th>จัดการ</th></tr></thead>
          <tbody>${memberRows}</tbody>
        </table>
      </div>`
    : '<div class="manual-member-empty manual-member-search-empty"><strong>ไม่พบสมาชิกที่ค้นหา</strong><p>ลองตรวจสอบคำค้นหา หรือค้นหาด้วยชื่อตัวละคร ชื่อเล่น Class หรือ Discord</p></div>';
}

async function saveManualGuildMember(form) {
  if (!canManageMemberProfiles() || !form) return;
  const formData = new FormData(form);
  const id = String(formData.get("id") || "");
  const requestedRecordType = String(formData.get("record_type") || "manual");
  const userId = String(formData.get("user_id") || "");
  // A linked account is identified by its immutable auth user_id, not only
  // by the hidden record_type field. This prevents account edits from
  // accidentally entering Manual duplicate validation if that field is stale.
  const recordType = userId ? "account" : requestedRecordType;
  const payload = {
    character_name: String(formData.get("character_name") || "").trim(),
    game_class: String(formData.get("game_class") || "").trim(),
    nickname: String(formData.get("nickname") || "").trim() || null,
    discord_name: String(formData.get("discord_username") || formData.get("discord_name") || "").trim() || null,
    discord_user_id: String(formData.get("discord_user_id") || "").trim() || null,
    discord_username: String(formData.get("discord_username") || "").trim() || null,
    discord_global_name: String(formData.get("discord_global_name") || "").trim() || null,
    discord_server_nickname: String(formData.get("discord_server_nickname") || "").trim() || null,
    discord_avatar_url: String(formData.get("discord_avatar_url") || "").trim() || null,
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
    // Manual duplicate checks apply only when creating/editing a Manual record.
    // An account-backed member may have its own source Manual row; that row must
    // never block editing the linked guild_members profile.
    if (recordType !== "account" && !userId) {
      const duplicate = await supabaseClient.from("guild_manual_members")
        .select("id").ilike("character_name", payload.character_name);
      if (duplicate.error) throw duplicate.error;
      if ((duplicate.data || []).some(row => row.id !== id)) {
        throw new Error("มีชื่อตัวละครนี้ในรายชื่อ Manual แล้ว");
      }

      if (payload.discord_user_id && manualGuildMembers.some(member =>
        member.discord_user_id === payload.discord_user_id && member.id !== id
      )) {
        throw new Error("Discord Account นี้ถูกผูกกับรายชื่อ Manual อื่นแล้ว");
      }
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
      // Discord OAuth identity is canonical and cannot be changed from this profile editor.
      delete accountPayload.discord_name;
      delete accountPayload.discord_user_id;
      delete accountPayload.discord_username;
      delete accountPayload.discord_global_name;
      delete accountPayload.discord_server_nickname;
      delete accountPayload.discord_avatar_url;
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
    await loadMembers(true);
  } catch (error) {
    console.error("Save member record:", error);
    if (status) status.textContent = "บันทึกไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด");
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = $("manual-member-id")?.value ? "บันทึกการแก้ไข" : "บันทึกสมาชิก"; }
  }
}

function fillManualMemberForm(member, type = "manual") {
  const form = $("manual-member-form");
  if (!member || !form || (type === "account" && !canManageMemberProfiles())) return;
  ensureManualMemberFormOptions();
  $("manual-member-id").value = type === "manual" ? member.id : "";
  $("manual-member-type").value = type;
  $("manual-member-user-id").value = type === "account" ? member.user_id : "";
  form.elements.character_name.value = member.character_name || "";
  form.elements.game_class.value = member.game_class || "";
  form.elements.nickname.value = member.nickname || "";
  form.elements.discord_name.value = member.discord_name || member.discord_username || "";
  $("manual-member-discord-id").value = member.discord_user_id || "";
  $("manual-member-discord-username").value = member.discord_username || "";
  $("manual-member-discord-global-name").value = member.discord_global_name || "";
  $("manual-member-discord-nickname").value = member.discord_server_nickname || "";
  $("manual-member-discord-avatar").value = member.discord_avatar_url || "";
  setManualDiscordMember(member.discord_user_id ? {
    id: member.discord_user_id, username: member.discord_username || member.discord_name || "",
    global_name: member.discord_global_name || "", nick: member.discord_server_nickname || "",
    avatar_url: member.discord_avatar_url || ""
  } : null);
  const isLinkedAccount = type === "account";
  const discordSelectButton = $("manual-member-discord-select");
  const discordClearButton = $("manual-member-discord-clear");
  const discordLockNote = $("manual-member-discord-lock-note");
  if (discordSelectButton) {
    discordSelectButton.classList.toggle("hidden", isLinkedAccount);
    discordSelectButton.disabled = isLinkedAccount;
  }
  if (discordClearButton) {
    discordClearButton.classList.toggle("hidden", isLinkedAccount || !member.discord_user_id);
    discordClearButton.disabled = isLinkedAccount;
  }
  if (discordLockNote) discordLockNote.classList.toggle("hidden", !isLinkedAccount);
  if (isLinkedAccount && !member.discord_user_id) {
    const display = $("manual-member-discord-selected");
    if (display) {
      display.classList.add("is-empty");
      display.innerHTML = '<span class="discord-member-selected-icon">◈</span><span>ไม่พบข้อมูล Discord ที่เชื่อมโยงกับบัญชีนี้</span>';
    }
  }
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
  if (!canManageMemberProfiles()) return;
  const member = manualGuildMembers.find(item => item.id === id);
  if (!member) return;
  fillManualMemberForm(member, "manual");
}

async function editLinkedGuildMember(userId) {
  if (!canManageMemberProfiles()) return;
  const account = allMembers.find(item => String(item.user_id) === String(userId));
  if (!account) return;
  const linkedManual = manualGuildMembers.find(item => String(item.linked_user_id || "") === String(userId));

  // discord_accounts is authoritative for registered users; the Manual row is only a fallback snapshot.
  let discordRecord = discordAccountDirectory.get(String(userId)) || null;
  if (!discordRecord) {
    const { data, error } = await supabaseClient.from("discord_accounts")
      .select("user_id,discord_user_id,discord_username,discord_global_name,verified,guild_member_verified,discord_connection_status")
      .eq("user_id", userId).maybeSingle();
    if (error) console.warn("Load linked Discord identity for member edit:", error.message);
    if (data) {
      discordRecord = data;
      discordAccountDirectory.set(String(userId), data);
    }
  }

  const discordUserId = String(discordRecord?.discord_user_id || linkedManual?.discord_user_id || "");
  const botDiscordMember = discordUserId
    ? discordGuildMembersCache.find(item => String(item.id) === discordUserId) || null
    : null;
  const storedUsername = String(discordRecord?.discord_username || "");
  const username = botDiscordMember?.username ||
    linkedManual?.discord_username ||
    (storedUsername && !/^discord_[0-9]+$/i.test(storedUsername) ? storedUsername : "") ||
    account.discord_name || storedUsername;
  const profile = {
    id: discordUserId,
    username,
    global_name: botDiscordMember?.global_name || discordRecord?.discord_global_name || linkedManual?.discord_global_name || "",
    nick: botDiscordMember?.nick || linkedManual?.discord_server_nickname || "",
    avatar_url: botDiscordMember?.avatar_url || linkedManual?.discord_avatar_url || ""
  };

  // Open the editor immediately with the verified identity from the database.
  // Fetch the Bot directory afterward to enrich it with the current Discord avatar.
  fillManualMemberForm({
    ...(linkedManual || {}),
    ...account,
    discord_name: username || account.discord_name || "",
    discord_user_id: discordUserId,
    discord_username: profile.username,
    discord_global_name: profile.global_name,
    discord_server_nickname: profile.nick,
    discord_avatar_url: profile.avatar_url
  }, "account");

  if (discordUserId && !botDiscordMember) {
    await loadDiscordGuildMembers(false);
    const refreshedBotMember = discordGuildMembersCache.find(item => String(item.id) === discordUserId);
    const stillEditingThisAccount =
      String($("manual-member-user-id")?.value || "") === String(userId) &&
      $("manual-member-type")?.value === "account";
    if (refreshedBotMember && stillEditingThisAccount) {
      setManualDiscordMember({
        id: discordUserId,
        username: refreshedBotMember.username || profile.username,
        global_name: refreshedBotMember.global_name || profile.global_name,
        nick: refreshedBotMember.nick || profile.nick,
        avatar_url: refreshedBotMember.avatar_url || profile.avatar_url
      });
    }
  }
}

async function updateManualGuildMemberStatus(id) {
  if (!isManagement()) return;
  const member = manualGuildMembers.find(item => item.id === id);
  if (!member) return;
  const { data, error } = await supabaseClient.from("guild_manual_members")
    .update({ active: !member.active })
    .eq("id", id).select("*").single();
  if (error) { alert("เปลี่ยนสถานะไม่สำเร็จ: " + error.message); return; }
  Object.assign(member, data);
  renderManualMemberManagement();
  await loadMembers(true);
}

async function removeGuildMemberRecord(recordType, recordId) {
  if (!isManagement()) return;
  if (recordType === "manual") {
    const member = manualGuildMembers.find(item => String(item.id) === String(recordId));
    if (!member) {
      alert("ไม่พบรายชื่อ Manual นี้ กรุณารีเฟรชหน้าแล้วลองใหม่");
      return;
    }
    // A Discord ID on a Manual row is only a profile association, not a website account.
    // Keep the hard-delete guard for rows already linked to a real guild_members account.
    if (member.linked_user_id) {
      alert("ลบรายชื่อนี้ไม่ได้ เพราะเชื่อมกับบัญชีเว็บไซต์แล้ว กรุณาจัดการสมาชิกผ่านบัญชีที่เชื่อมโยงแทน");
      return;
    }
    const name = member.character_name || "สมาชิก Manual";
    const discordNote = member.discord_user_id
      ? "\\n\\nการลบจะลบเฉพาะรายชื่อ Manual และการผูก Discord ID ในรายการนี้ ไม่ได้ลบบัญชี Discord ของบุคคลนั้น"
      : "";
    if (!window.confirm(`ยืนยันลบรายชื่อ Manual “${name}” หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้${discordNote}`)) return;
    const { error } = await supabaseClient.from("guild_manual_members")
      .delete().eq("id", recordId).is("linked_user_id", null);
    if (error) { alert("ลบรายชื่อไม่สำเร็จ: " + error.message); return; }
    await loadMembers(true);
    return;
  }
  const member = allMembers.find(item => String(item.user_id) === String(recordId));
  if (!member || String(member.user_id) === "378b09df-16a0-4d01-8908-2604c2c210a9") {
    alert("ไม่สามารถนำบัญชี Developer หลักออกจากกิลด์ได้");
    return;
  }
  const name = member.character_name || getMemberName(member);
  if (!window.confirm(`ยืนยันนำ “${name}” ออกจากรายชื่อสมาชิกกิลด์หรือไม่? บัญชีเว็บไซต์และข้อมูล Auth จะไม่ถูกลบ แต่จะระงับสถานะสมาชิกกิลด์`)) return;
  const { error } = await supabaseClient.from("guild_members")
    .update({ active: false, membership_status: "suspended" })
    .eq("user_id", recordId);
  if (error) { alert("นำสมาชิกออกจากกิลด์ไม่สำเร็จ: " + error.message); return; }
  await loadMembers(true);
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
  await loadMembers(true);
}

// Manual member records are retained for reactivation; use the status toggle instead of hard deletion.

function filterMembers() {
  const search = $("member-search")?.value.trim().toLowerCase() || "";
  const filtered = directoryMembers.filter(member => {
    const searchable = [getMemberName(member), member.nickname, member.discord_name, member.role, member.display_position, member.guild_position, getMemberClass(member), member.user_id, member.game_uid].join(" ").toLowerCase();
    const matchesClass = memberDirectoryClassFilter === "all" || getMemberClass(member).toLowerCase() === memberDirectoryClassFilter.toLowerCase();
    const matchesType = memberDirectoryTypeFilter === "all" || (member.is_manual_record ? "manual" : "account") === memberDirectoryTypeFilter;
    return searchable.includes(search) && matchesClass && matchesType;
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

async function uploadMemberAvatar(file, croppedBlob) {
  if (!currentUser || !currentMember) {
    throw new Error("ไม่พบข้อมูลสมาชิกของบัญชีนี้");
  }
  if (!(croppedBlob instanceof Blob) || !croppedBlob.type.startsWith("image/")) {
    throw new Error("ไม่สามารถสร้างภาพ Crop ได้ กรุณาลองใหม่");
  }

  const stamp = Date.now();
  const extension = file.name.split(".").pop().toLowerCase();
  const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : "bin";
  const originalPath = `${currentUser.id}/original-${stamp}.${safeExtension}`;
  const croppedExtension = croppedBlob.type === "image/webp" ? "webp" : "png";
  const croppedPath = `${currentUser.id}/avatar-${stamp}.${croppedExtension}`;

  // Preserve the uploaded source unchanged, and store the exact square crop as the live avatar.
  const { error: originalUploadError } = await supabaseClient.storage
    .from(AVATAR_BUCKET)
    .upload(originalPath, file, {
      cacheControl: "86400",
      upsert: false,
      contentType: file.type
    });
  if (originalUploadError) throw originalUploadError;

  const { error: cropUploadError } = await supabaseClient.storage
    .from(AVATAR_BUCKET)
    .upload(croppedPath, croppedBlob, {
      cacheControl: "86400",
      upsert: false,
      contentType: croppedBlob.type
    });
  if (cropUploadError) {
    await supabaseClient.storage.from(AVATAR_BUCKET).remove([originalPath]);
    throw cropUploadError;
  }

  const { error: updateError } = await supabaseClient
    .from("guild_members")
    .update({
      avatar_url: croppedPath,
      avatar_crop_settings: { x: 50, y: 50, zoom: 1 }
    })
    .eq("user_id", currentUser.id);

  if (updateError) {
    await supabaseClient.storage.from(AVATAR_BUCKET).remove([originalPath, croppedPath]);
    throw updateError;
  }

  currentMember.avatar_url = croppedPath;
  currentMember.avatar_crop_settings = { x: 50, y: 50, zoom: 1 };
  updateUserChip();
  await renderDashboardProfile();
  return croppedPath;
}

function closeAvatarCropEditor() {
  const modal = document.getElementById("avatar-crop-editor");
  if (!modal) return;
  if (modal.dataset.previewUrl) URL.revokeObjectURL(modal.dataset.previewUrl);
  modal.remove();
}

function openAvatarCropEditor(file) {
  closeAvatarCropEditor();
  const previewUrl = URL.createObjectURL(file);
  const modal = document.createElement("div");
  modal.id = "avatar-crop-editor";
  modal.className = "avatar-crop-editor";
  modal.dataset.previewUrl = previewUrl;
  modal.innerHTML = `
    <div class="avatar-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
      <div class="avatar-crop-heading">
        <div><span class="avatar-crop-eyebrow">PROFILE IMAGE</span><h2 id="avatar-crop-title">จัดกรอบรูปโปรไฟล์</h2></div>
        <button type="button" class="avatar-crop-close" data-avatar-crop-cancel aria-label="ปิด">×</button>
      </div>
      <p class="avatar-crop-description">ลากรูปเพื่อจัดตำแหน่ง และซูมเข้าออกได้ พื้นที่สี่เหลี่ยม 1:1 ภายในกรอบสีแดงคือภาพที่จะปรากฏบนเว็บไซต์จริง</p>
      <div class="avatar-crop-stage">
        <div class="avatar-crop-viewport">
          <img src="${previewUrl}" alt="ตัวอย่างรูปโปรไฟล์">
        </div>
      </div>
      <div class="avatar-crop-controls">
        <label>ซูมภาพ <output data-crop-value="zoom">100%</output>
          <input type="range" min="100" max="300" step="1" value="100" data-crop-control="zoom">
        </label>
      </div>
      <div class="avatar-crop-result-row">
        <span>ตัวอย่างหลัง Crop</span>
        <div class="avatar-crop-result"><img src="${previewUrl}" alt="ตัวอย่างผลลัพธ์รูปโปรไฟล์"></div>
        <small>สัดส่วนจริง 1:1 · 512 × 512 px</small>
      </div>
      <div class="avatar-crop-actions">
        <button type="button" class="avatar-crop-reset" data-avatar-crop-reset>รีเซ็ตตำแหน่ง</button>
        <span class="avatar-crop-error" aria-live="polite"></span>
        <button type="button" class="avatar-crop-save" data-avatar-crop-save>ยืนยันและบันทึกรูป</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const image = modal.querySelector(".avatar-crop-viewport img");
  const resultImage = modal.querySelector(".avatar-crop-result img");
  const viewport = modal.querySelector(".avatar-crop-viewport");
  const zoomControl = modal.querySelector('[data-crop-control="zoom"]');
  const zoomOutput = modal.querySelector('[data-crop-value="zoom"]');
  const values = { zoom: 1, x: 0, y: 0 };
  let frameSize = 320;
  let baseScale = 1;
  let renderedWidth = 0;
  let renderedHeight = 0;
  let dragging = false;
  let pointerStart = null;

  const clampPosition = () => {
    const maxX = Math.max(0, (renderedWidth - frameSize) / 2);
    const maxY = Math.max(0, (renderedHeight - frameSize) / 2);
    values.x = Math.min(maxX, Math.max(-maxX, values.x));
    values.y = Math.min(maxY, Math.max(-maxY, values.y));
  };

  const updatePreview = () => {
    renderedWidth = image.naturalWidth * baseScale * values.zoom;
    renderedHeight = image.naturalHeight * baseScale * values.zoom;
    clampPosition();
    const left = (frameSize - renderedWidth) / 2 + values.x;
    const top = (frameSize - renderedHeight) / 2 + values.y;
    image.style.width = renderedWidth + "px";
    image.style.height = renderedHeight + "px";
    image.style.left = left + "px";
    image.style.top = top + "px";
    zoomOutput.textContent = Math.round(values.zoom * 100) + "%";
    if (resultImage) {
      const resultScale = 76 / frameSize;
      resultImage.style.width = (renderedWidth * resultScale) + "px";
      resultImage.style.height = (renderedHeight * resultScale) + "px";
      resultImage.style.left = (left * resultScale) + "px";
      resultImage.style.top = (top * resultScale) + "px";
    }
  };

  const initializeCrop = () => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    frameSize = viewport.clientWidth || 320;
    baseScale = Math.max(frameSize / image.naturalWidth, frameSize / image.naturalHeight);
    updatePreview();
  };
  if (image.complete && image.naturalWidth) initializeCrop();
  else image.addEventListener("load", initializeCrop, { once: true });

  zoomControl.addEventListener("input", () => {
    values.zoom = Number(zoomControl.value) / 100;
    updatePreview();
  });

  viewport.addEventListener("pointerdown", event => {
    if (!image.naturalWidth) return;
    dragging = true;
    pointerStart = { x: event.clientX, y: event.clientY, offsetX: values.x, offsetY: values.y };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-dragging");
    event.preventDefault();
  });
  viewport.addEventListener("pointermove", event => {
    if (!dragging || !pointerStart) return;
    values.x = pointerStart.offsetX + event.clientX - pointerStart.x;
    values.y = pointerStart.offsetY + event.clientY - pointerStart.y;
    updatePreview();
  });
  const stopDragging = () => {
    dragging = false;
    pointerStart = null;
    viewport.classList.remove("is-dragging");
  };
  viewport.addEventListener("pointerup", stopDragging);
  viewport.addEventListener("pointercancel", stopDragging);
  viewport.addEventListener("lostpointercapture", stopDragging);

  modal.querySelector("[data-avatar-crop-reset]").addEventListener("click", () => {
    values.zoom = 1;
    values.x = 0;
    values.y = 0;
    zoomControl.value = "100";
    updatePreview();
  });
  modal.querySelectorAll("[data-avatar-crop-cancel]").forEach(button => button.addEventListener("click", closeAvatarCropEditor));
  modal.addEventListener("click", event => {
    if (event.target === modal) closeAvatarCropEditor();
  });

  modal.querySelector("[data-avatar-crop-save]").addEventListener("click", async event => {
    const button = event.currentTarget;
    const errorBox = modal.querySelector(".avatar-crop-error");
    button.disabled = true;
    button.textContent = "กำลัง Crop และบันทึก...";
    errorBox.textContent = "";
    try {
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("รูปภาพยังโหลดไม่เสร็จ กรุณารอสักครู่");
      const scale = baseScale * values.zoom;
      const renderedLeft = (frameSize - renderedWidth) / 2 + values.x;
      const renderedTop = (frameSize - renderedHeight) / 2 + values.y;
      const sourceX = Math.max(0, (0 - renderedLeft) / scale);
      const sourceY = Math.max(0, (0 - renderedTop) / scale);
      const sourceSize = frameSize / scale;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("เบราว์เซอร์ไม่สามารถประมวลผลรูปภาพได้");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512);
      const croppedBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.94));
      if (!croppedBlob) throw new Error("สร้างไฟล์ Crop ไม่สำเร็จ กรุณาลองใหม่");
      await uploadMemberAvatar(file, croppedBlob);
      closeAvatarCropEditor();
    } catch (error) {
      console.error("Profile avatar crop/upload error:", error);
      errorBox.textContent = error.message || "บันทึกรูปไม่สำเร็จ";
      button.disabled = false;
      button.textContent = "ลองบันทึกอีกครั้ง";
    }
  });
  modal.querySelector(".avatar-crop-close").focus();
}

// ==========================================
// PORTFOLIO
// ==========================================

async function loadPortfolios(forceRefresh = false) {
  if (!forceRefresh && Date.now() < portfolioDataCacheExpiresAt) {
    renderPortfolios();
    renderPortfolioReviewCenter();
    return;
  }
  portfolioDataCacheExpiresAt = 0;
  const pageSize = 50;
  const rows = [];
  let error = null;
  for (let from = 0; ; from += pageSize) {
    const result = await supabaseClient
      .from("portfolios")
      .select(`
        id, member_id, title, description, game_class, portfolio_type, created_at, updated_at,
        portfolio_versions (
          id, version_number, version_name, round_id, patch_label, title, description, game_class,
          portfolio_type, created_by, created_at,
          portfolio_version_images (
            id, image_url, cover_image_url, crop_settings, image_type,
            section_key, caption, created_at, sort_order
          ),
          portfolio_version_reviews ( status, reason, reviewer_user_id, reviewed_at )
        )
      `)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (result.error) { error = result.error; break; }
    rows.push(...(result.data || []));
    if ((result.data || []).length < pageSize) break;
  }
  const data = rows;

  if (error) {
    console.error("Portfolio loading error:", error);
    allPortfolios = [];
    renderPortfolios();
    renderPortfolioReviewCenter();
    return;
  }

  allPortfolios = (data || []).map((portfolio) => {
    const versions = (portfolio.portfolio_versions || [])
      .map((version) => {
        const versionImages = (version.portfolio_version_images || []).sort((a, b) =>
          (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
          new Date(a.created_at) - new Date(b.created_at)
        );
        const reviewValue = version.portfolio_version_reviews;
        const versionReview = Array.isArray(reviewValue) ? (reviewValue[0] || null) : (reviewValue || null);
        return {
          ...version,
          portfolio_images: versionImages,
          portfolio_reviews: versionReview
        };
      })
      .sort((a, b) => Number(b.version_number) - Number(a.version_number));

    const patchCounters = new Map();
    [...versions].sort((a, b) =>
      new Date(a.created_at || 0) - new Date(b.created_at || 0) ||
      Number(a.version_number) - Number(b.version_number)
    ).forEach(version => {
      const key = getPortfolioPatchKey(version);
      const next = (patchCounters.get(key) || 0) + 1;
      patchCounters.set(key, next);
      version.patch_sequence_number = next;
    });

    const latest = versions[0] || null;
    return {
      ...portfolio,
      portfolio_versions: versions,
      current_version: latest,
      portfolio_images: latest?.portfolio_images || [],
      portfolio_reviews: latest?.portfolio_reviews || null
    };
  });

  portfolioDataCacheExpiresAt = Date.now() + 90 * 1000;
  renderPortfolios();
  renderPortfolioReviewCenter();
}

async function getPortfolioImageUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;

  const now = Date.now();
  const cached = portfolioSignedUrlCache.get(path);
  if (cached && cached.expiresAt > now + 60_000) return cached.url;

  const { data, error } = await supabaseClient.storage
    .from(PORTFOLIO_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) {
    console.error("Portfolio image URL error:", error);
    return "";
  }

  const signedUrl = data?.signedUrl || "";
  if (signedUrl) {
    portfolioSignedUrlCache.set(path, {
      url: signedUrl,
      expiresAt: now + 55 * 60 * 1000
    });
  }
  return signedUrl;
}

function getPortfolioClasses(value) {
  return String(value || "")
    .split(/[,|]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

// Keep the database sequence unique; calculate the visible Snapshot number per Patch.
function getPortfolioPatchName(version) {
  let value = String(version?.version_name || "").trim();
  if (/^Version\s+\d+$/i.test(value)) value = "";
  if (!value) value = String(version?.patch_label || "").trim();
  value = value.replace(/^Patch\s*/i, "").trim();
  return value || "ไม่ระบุ Patch";
}
function getPortfolioPatchKey(version) {
  return getPortfolioPatchName(version).normalize("NFKC").toLocaleLowerCase("th").replace(/\s+/g, " ");
}
function getPortfolioSnapshotLabel(version) {
  return "Patch " + getPortfolioPatchName(version) + " (" + Number(version?.patch_sequence_number || 1) + ")";
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

const PORTFOLIO_PASTE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

function addPortfolioImagesToSection(files, sectionKey) {
  const images = [...(files || [])].filter(file => file && file.type && file.type.startsWith("image/"));
  if (!images.length) return 0;
  const accepted = [];
  const rejected = [];
  images.forEach(file => {
    if (file.size > PORTFOLIO_PASTE_IMAGE_MAX_BYTES) rejected.push(file.name || "รูปภาพจาก Clipboard");
    else accepted.push(file);
  });
  if (accepted.length) {
    const existing = window.portfolioDraftFiles || [];
    window.portfolioDraftFiles = [...existing, ...accepted.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      existing: false,
      sectionKey,
      caption: "",
      cropBlob: null,
      cropSettings: null
    }))];
    window.portfolioActiveUploadSection = sectionKey;
    renderPortfolioSelectedFiles();
  }
  if (rejected.length) alert("มีรูปภาพที่ไม่ได้เพิ่ม เนื่องจากมีขนาดเกิน 12 MB ต่อรูป");
  return accepted.length;
}

function renderPortfolioSelectedFiles() {
  const container = $("portfolio-image-preview");
  const files = window.portfolioDraftFiles || [];
  if (!container) return;
  const portfolioType = $("portfolio-type")?.value || "pvp";
  const zones = portfolioType === "cultivation_skills"
    ? [
        { key: "cultivation", label: "คัมภีร์หู่เฉียน (หน้าฝึกฝน)", hint: "ภาพข้อมูลและรายละเอียดคัมภีร์หู่เฉียน" },
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
      <section class="portfolio-upload-zone portfolio-upload-zone-${zone.key}" data-portfolio-paste-zone="${zone.key}" tabindex="0" aria-label="โซนอัปโหลดรูป ${zone.label}">
        <header class="portfolio-upload-zone-heading">
          <div><span class="portfolio-upload-zone-index">${String(zoneIndex + 1).padStart(2, "0")}</span><div><h4>${zone.label}</h4><p>${zone.hint}</p><p class="portfolio-paste-hint"><kbd>Ctrl</kbd> + <kbd>V</kbd> วางรูปภาพ (คลิกโซนนี้ก่อน) หรือ ลากรูปมาวางที่นี่</p></div></div>
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
let portfolioMemberCoverCropMode = "free";
function closePortfolioCropEditor() {
  if (portfolioCropper) { portfolioCropper.destroy(); portfolioCropper = null; }
  if (portfolioCropSourceUrl?.startsWith("blob:")) URL.revokeObjectURL(portfolioCropSourceUrl);
  portfolioCropSourceUrl = null; portfolioCropIndex = null;
  portfolioMemberCoverMode = false; portfolioMemberCoverMemberId = null;
  portfolioMemberCoverCropMode = "free";
  $("portfolio-member-cover-crop-modes")?.classList.add("hidden");
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
  const member = allMembers.find(item => item.user_id === currentUser.id && item.active !== false);
  if (!member) { alert("ไม่พบข้อมูลสมาชิกของบัญชีนี้"); return; }
  if (bondRelationshipsLoadError) { alert("ระบบสายใยยังไม่พร้อมใช้งาน กรุณารัน Query: 4AM_GUILD_BOND_PARTNERS_SETUP ใน Supabase ก่อน"); return; }
  bondSelectedMemberIds = new Set(getMemberSelectedBondIds(currentUser.id));
  const modal=$("bond-profile-modal"), image=$("bond-profile-current-cover");
  if(image)image.src=DEFAULT_AVATAR;
  if($("bond-profile-search"))$("bond-profile-search").value="";
  renderBondMemberPicker();
  modal?.classList.remove("hidden");
  document.body.classList.add("bond-panel-open");
  try {
    const cover=member.member_cover_url?await resolveAvatarUrl({...member,avatar_url:member.member_cover_url}):await resolveAvatarUrl(member);
    if(image&&modal&&!modal.classList.contains("hidden"))image.src=cover||DEFAULT_AVATAR;
  } catch(error){console.warn("Bond profile cover preview could not be loaded:",error);if(image)image.src=DEFAULT_AVATAR;}
}
function closeBondProfileEditor(){$("bond-profile-modal")?.classList.add("hidden");document.body.classList.remove("bond-panel-open");}
async function saveBondProfile(event) {
  event.preventDefault(); if(!currentUser)return;
  const button=$("bond-profile-save");
  const activeIds=new Set(allMembers.filter(member=>member.active===true&&member.user_id!==currentUser.id).map(member=>member.user_id));
  const selectedIds=[...bondSelectedMemberIds].filter(id=>activeIds.has(id));
  const existingIds=getMemberSelectedBondIds(currentUser.id);
  const addIds=selectedIds.filter(id=>!existingIds.includes(id)),removeIds=existingIds.filter(id=>!selectedIds.includes(id));
  if(button){button.disabled=true;button.textContent="กำลังบันทึก...";}
  try{
    if(addIds.length){const {error}=await supabaseClient.from("guild_member_bonds").insert(addIds.map(partnerId=>({member_id:currentUser.id,partner_member_id:partnerId})));if(error)throw error;}
    if(removeIds.length){const {error}=await supabaseClient.from("guild_member_bonds").delete().eq("member_id",currentUser.id).in("partner_member_id",removeIds);if(error)throw error;}
    await loadBondRelationships(); if(bondRelationshipsLoadError)throw new Error(bondRelationshipsLoadError);
    closeBondProfileEditor(); renderOwnBondProfileSection(); await renderPortfolioMemberDirectory();
    if(currentWarAssignmentEventId)renderAllWarParties();
  }catch(error){console.error("Bond profile save error:",error);alert("บันทึกสายใยผูกพันไม่สำเร็จ: "+(error.message||"Unknown error"));await loadBondRelationships();bondSelectedMemberIds=new Set(getMemberSelectedBondIds(currentUser.id));renderBondMemberPicker();}
  finally{if(button){button.disabled=false;button.textContent="บันทึกสายใย";}}
}
function openPortfolioMemberCoverPicker() {
  if(!currentUser||!allMembers.some(m=>m.user_id===currentUser.id)){alert("ไม่พบข้อมูลสมาชิกของบัญชีนี้");return;}
  const input=$("portfolio-member-cover-input");
  if(input)input.click();
}
function initializePortfolioMemberCoverCropper() {
  const image=$("portfolio-crop-image");
  if(!image||!portfolioCropSourceUrl)return;
  if(portfolioCropper){portfolioCropper.destroy();portfolioCropper=null;}
  const isCardFit=portfolioMemberCoverCropMode==="fit";
  portfolioCropper=new Cropper(image,{
    aspectRatio:isCardFit?4/3:NaN,
    viewMode:1,
    dragMode:isCardFit?"move":"crop",
    autoCropArea:isCardFit?.92:.72,
    responsive:true,
    restore:false,
    background:false,
    guides:true,
    center:true,
    highlight:true,
    cropBoxMovable:true,
    cropBoxResizable:!isCardFit,
    minCropBoxWidth:48,
    minCropBoxHeight:48,
    zoomOnWheel:true,
    zoomOnTouch:true,
    wheelZoomRatio:.08,
    zoomRatio:.08,
    toggleDragModeOnDblclick:false,
    ready(){
      const zoom=$("portfolio-crop-zoom");
      if(zoom){zoom.min=".5";zoom.max="3";zoom.step=".01";zoom.value="1";}
      const zoomValue=$("portfolio-crop-zoom-value");
      if(zoomValue)zoomValue.textContent="100%";
    }
  });
}
function setPortfolioMemberCoverCropMode(mode) {
  if(!portfolioMemberCoverMode||!["free","fit"].includes(mode)||mode===portfolioMemberCoverCropMode)return;
  portfolioMemberCoverCropMode=mode;
  document.querySelectorAll("[data-member-cover-crop-mode]").forEach(button=>{
    const active=button.dataset.memberCoverCropMode===mode;
    button.classList.toggle("is-active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  initializePortfolioMemberCoverCropper();
}
async function openPortfolioMemberCoverCrop(file) {
  if(typeof window.Cropper!=="function"){alert("โหลดเครื่องมือ Crop ภาพไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ");return;}
  closePortfolioCropEditor();
  portfolioMemberCoverMode=true;
  portfolioMemberCoverMemberId=currentUser.id;
  portfolioMemberCoverCropMode="free";
  portfolioCropSourceUrl=URL.createObjectURL(file);
  $("portfolio-crop-title").textContent="เปลี่ยนรูปหน้าปกการ์ดสมาชิก";
  $("portfolio-crop-save").textContent="บันทึกรูปหน้าปก";
  $("portfolio-member-cover-crop-modes")?.classList.remove("hidden");
  document.querySelectorAll("[data-member-cover-crop-mode]").forEach(button=>{
    const active=button.dataset.memberCoverCropMode==="free";
    button.classList.toggle("is-active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  const image=$("portfolio-crop-image");
  image.onload=()=>initializePortfolioMemberCoverCropper();
  $("portfolio-crop-modal")?.classList.remove("hidden");
  image.src=portfolioCropSourceUrl;
}

async function savePortfolioCrop() {
  if (!portfolioCropper) return;
  if (portfolioMemberCoverMode) {
    const button=$("portfolio-crop-save"); button.disabled=true; button.textContent="กำลังบันทึก...";
    try {
      if (!currentUser || portfolioMemberCoverMemberId !== currentUser.id) throw new Error("คุณแก้ไขรูปหน้าปกได้เฉพาะการ์ดของตัวเอง");
      const cropData=portfolioCropper.getData(true);const cropScale=Math.min(1,2400/Math.max(cropData.width,cropData.height));const canvas=portfolioMemberCoverCropMode==="fit"?portfolioCropper.getCroppedCanvas({width:1600,height:1200,minWidth:800,minHeight:600,imageSmoothingEnabled:true,imageSmoothingQuality:"high",fillColor:"#090909"}):portfolioCropper.getCroppedCanvas({width:Math.max(1,Math.round(cropData.width*cropScale)),height:Math.max(1,Math.round(cropData.height*cropScale)),imageSmoothingEnabled:true,imageSmoothingQuality:"high",fillColor:"#090909"});
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error("ไม่สามารถสร้างภาพหน้าปกได้")),"image/webp",.9));
      const path=`${currentUser.id}/portfolio-cover-${Date.now()}.webp`;
      const {error:uploadError}=await supabaseClient.storage.from(AVATAR_BUCKET).upload(path,blob,{cacheControl:"86400",upsert:false,contentType:"image/webp"});
      if(uploadError)throw uploadError;
      const oldPath=allMembers.find(m=>m.user_id===currentUser.id)?.member_cover_url||null;
      const cropSettings={...portfolioCropper.getData(true),mode:portfolioMemberCoverCropMode,aspectRatio:portfolioMemberCoverCropMode==="fit"?"4:3":null};
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

function setPortfolioTitlePlaceholder(portfolioType = $("portfolio-type")?.value || "pvp") {
  const titleInput = $("portfolio-title");
  if (!titleInput) return;
  titleInput.placeholder = portfolioType === "pve"
    ? "เช่น PvE เทสหุ่น, PvE ดัน (ไฟทอง), PvE ดัน (ฟูลแทงค์), PvE ฟูลซัพ ฯลฯ"
    : portfolioType === "pvp"
      ? "เช่น GvG ดินไฟ, GvG ไฟทอง, GvG ตีป้อม, GvG Heal, GvG ฟูลแทงค์ ฯลฯ"
      : "เช่น ดินไฟ, DPS, Support";
}

function setPortfolioTitleFieldVisibility(portfolioType = $("portfolio-type")?.value || "pvp") {
  const titleField = $("portfolio-title")?.closest(".portfolio-field");
  const isCultivationSkills = portfolioType === "cultivation_skills";
  titleField?.classList.toggle("hidden", isCultivationSkills);
  const titleInput = $("portfolio-title");
  if (titleInput) titleInput.required = !isCultivationSkills;
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
  if ($("portfolio-version-name")) $("portfolio-version-name").value = "";
  setPortfolioTitleFieldVisibility("pvp");
  setPortfolioTitlePlaceholder("pvp");
  window.editingPortfolioId = null;
  window.editingPortfolioVersionId = null;
  if ($("portfolio-title")) $("portfolio-title").readOnly = false;
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

function getPortfolioReviewCenterStatus(portfolio) {
  const review = getPortfolioReview(portfolio) || { status: "pending" };
  if (review.status === "approved") return "approved";
  if (review.status === "rejected") return "rejected";
  // รายละเอียดเพิ่มเติมเป็น Optional: ใช้เฉพาะรูปภาพในการพิจารณาความครบถ้วนของแฟ้ม
  return !(portfolio.portfolio_images || []).length ? "incomplete" : "pending";
}

function renderPortfolioReviewCenter() {
  const queue=$("portfolio-review-queue"); if(!queue)return;
  if(!isPortfolioReviewer()){queue.innerHTML='<div class="empty-state"><h3>ไม่มีสิทธิ์เข้าถึง</h3><p>หน้านี้สำหรับ Developer, Leader และ Management เท่านั้น</p></div>';return;}
  const members=(allMembers||[]).filter(m=>m.active!==false),portfolios=allPortfolios||[],byMember=new Map();
  portfolios.forEach(p=>{if(!byMember.has(p.member_id))byMember.set(p.member_id,[]);byMember.get(p.member_id).push(p);});
  const has=new Set(byMember.keys()),counts={members:members.length,"with-portfolios":members.filter(m=>has.has(m.user_id)).length,"no-portfolios":members.filter(m=>!has.has(m.user_id)).length,pending:0,incomplete:0,approved:0,rejected:0};
  portfolios.forEach(p=>counts[getPortfolioReviewCenterStatus(p)]++);
  Object.entries(counts).forEach(([key,value])=>{const node=document.querySelector('[data-review-stat="'+key+'"]');if(node)node.textContent=Number(value).toLocaleString("th-TH");});
  const search=String($("portfolio-review-search")?.value||"").trim().toLocaleLowerCase("th"),statusFilter=$("portfolio-review-filter")?.value||"all",classFilter=window.portfolioReviewClassFilter||"all";
  const classCounts=new Map(CLASS_DATA.map(c=>[c.name,0]));members.forEach(m=>{const n=getMemberClass(m);if(classCounts.has(n))classCounts.set(n,classCounts.get(n)+1);});
  const filterHost=$("portfolio-review-class-filters");
  if(filterHost){const options=[{name:"all",label:"ทุกอาชีพ",count:members.length,color:"#e8333f",icon:""}].concat(CLASS_DATA.map(c=>({name:c.name,label:c.name,count:classCounts.get(c.name)||0,color:c.color,icon:c.iconPath})));
    filterHost.innerHTML=options.map(c=>'<button type="button" class="portfolio-review-class-filter '+(classFilter===c.name?'is-active':'')+'" data-review-class="'+escapeHTML(c.name)+'" style="--class-color:'+c.color+'" aria-pressed="'+(classFilter===c.name)+'">'+(c.icon?'<img src="'+escapeHTML(c.icon)+'" alt="">':'')+'<span>'+escapeHTML(c.label)+'</span><strong>'+c.count+'</strong></button>').join('');
  }
  const labels={pending:"รอตรวจสอบ",incomplete:"ข้อมูลไม่ครบ",approved:"ผ่านแล้ว",rejected:"ยังไม่ผ่าน"},priority={pending:0,incomplete:1,rejected:2,approved:3};
  const groups=members.map(member=>{
    const className=getMemberClass(member),all=byMember.get(member.user_id)||[];
    const files=all.filter(p=>{const status=getPortfolioReviewCenterStatus(p),hay=[getMemberName(member),member.nickname,member.discord_name,className,p.title,p.game_class,p.portfolio_type].filter(Boolean).join(" ").toLocaleLowerCase("th");return(statusFilter==="all"||statusFilter===status)&&(!search||hay.includes(search));}).sort((a,b)=>priority[getPortfolioReviewCenterStatus(a)]-priority[getPortfolioReviewCenterStatus(b)]||new Date(b.updated_at||b.created_at)-new Date(a.updated_at||a.created_at));
    const memberHay=[getMemberName(member),member.nickname,member.discord_name,className].filter(Boolean).join(" ").toLocaleLowerCase("th");
    return{member,className,all,files,memberMatches:!search||memberHay.includes(search)};
  }).filter(g=>(classFilter==="all"||g.className.toLowerCase()===classFilter.toLowerCase())&&(g.memberMatches||g.files.length>0)&&(g.files.length>0||(g.all.length===0&&statusFilter==="all")));
  groups.sort((a,b)=>getMemberName(a.member).localeCompare(getMemberName(b.member),"th"));
  if(!groups.length){showEmpty(queue,"ไม่พบสมาชิก","ลองเปลี่ยนคำค้นหา หรือตัวกรองอาชีพและสถานะ");return;}
  queue.innerHTML=groups.map(g=>{
    const info=getClassInfo(g.className),color=info?.color||"#aaa",summary={pending:0,incomplete:0,approved:0,rejected:0};
    g.all.forEach(p=>summary[getPortfolioReviewCenterStatus(p)]++);
    const badges=Object.keys(summary).filter(k=>summary[k]>0).map(k=>'<span class="portfolio-review-member-status is-'+k+'">'+labels[k]+' '+summary[k]+'</span>').join('');
    const rows=g.files.length?g.files.map(p=>{
      const status=getPortfolioReviewCenterStatus(p),review=getPortfolioReview(p),images=p.portfolio_images||[],missing=[!images.length?"รูปภาพ":""].filter(Boolean);
      return '<article class="portfolio-review-row"><div class="portfolio-review-row-main"><strong>'+escapeHTML(p.title||"ไม่มีชื่อแฟ้ม")+'</strong><span class="portfolio-review-row-meta">'+escapeHTML(p.game_class||g.className)+' · '+images.length+' รูป · อัปเดต '+escapeHTML(formatDate(p.updated_at||p.created_at))+'</span>'+(missing.length?'<span class="portfolio-review-missing">ขาด: '+escapeHTML(missing.join(" และ "))+'</span>':'')+(status==="rejected"&&review?.reason?'<span class="portfolio-review-reason-preview">เหตุผลล่าสุด: '+escapeHTML(review.reason)+'</span>':'')+'</div><div class="portfolio-review-row-side"><span class="portfolio-review-queue-status is-'+status+'">'+labels[status]+'</span><button type="button" class="btn btn-outline portfolio-review-open" data-review-center-open="'+escapeHTML(p.member_id)+'">เปิดตรวจแฟ้ม ↗</button></div></article>';
    }).join(''):'<div class="portfolio-review-no-files">'+(g.all.length?"ไม่มีแฟ้มที่ตรงกับตัวกรองสถานะ":"สมาชิกยังไม่มีแฟ้มผลงาน")+'</div>';
    return '<section class="portfolio-review-member-group" style="--class-color:'+color+'"><header class="portfolio-review-member-header"><div class="portfolio-review-member-identity"><span class="portfolio-review-member-class">'+(info?.iconPath?'<img src="'+escapeHTML(info.iconPath)+'" alt="">':'')+'<span>'+escapeHTML(g.className)+'</span></span><h3>'+escapeHTML(getMemberName(g.member))+'</h3><span class="portfolio-review-member-meta">'+g.all.length+' แฟ้มทั้งหมด</span></div><div class="portfolio-review-member-summary">'+badges+'</div></header><div class="portfolio-review-member-files">'+rows+'</div></section>';
  }).join('');
}
async function renderPortfolioMemberDirectory() {
  const container=$("portfolio-member-grid"); if(!container)return;
  const search=String($("portfolio-member-search")?.value||"").trim().toLowerCase();
  const members=(allMembers||[]).filter(m=>m.active!==false)
    .filter(m=>portfolioClassFilter==="all"||getMemberClass(m).toLowerCase()===portfolioClassFilter.toLowerCase())
    .filter(m=>!search||[getMemberName(m),m.nickname,m.discord_name,getMemberClass(m)].filter(Boolean).join(" ").toLowerCase().includes(search))
    .sort((a,b)=>getMemberName(a).localeCompare(getMemberName(b),"th"));
  renderOwnBondProfileSection();
  if(!members.length){showEmpty(container,"ไม่พบสมาชิก","ลองค้นหาด้วยชื่อตัวละคร ชื่อเล่น หรือคลาสอาชีพ");return;}
  const cards=await Promise.all(members.map(async m=>{
    const ps=allPortfolios.filter(p=>p.member_id===m.user_id);
    const cn=getMemberClass(m),ci=getClassInfo(cn),color=ci?.color||"#aaa";
    // Use each member's profile avatar as the portfolio directory cover.
    // Fall back to the guild logo only when the member has no usable avatar.
    let src=m.member_cover_url?await resolveAvatarUrl({...m,avatar_url:m.member_cover_url}):await resolveAvatarUrl(m);
    if(!src||src===DEFAULT_AVATAR)src="/assets/4am-guild-logo.png?v=20261111b";
    const bondNames = getMemberSelectedBondNames(m.user_id);
    return `<article class="portfolio-member-card" style="--class-color:${color}">
      <button type="button" class="portfolio-member-open" data-portfolio-member-id="${escapeHTML(m.user_id)}">
        <div class="portfolio-member-cover ${m.member_cover_url?"has-custom-cover":""} ${m.member_cover_crop_settings?.mode==="fit"?"has-fixed-cover-crop":""}"><img src="${escapeHTML(src)}" alt="รูปหน้าปก ${escapeHTML(getMemberName(m))}" loading="lazy"><span class="portfolio-member-count">${ps.length} แฟ้ม</span></div>
        <div class="portfolio-member-card-content"><div class="portfolio-member-class">${ci?.iconPath?`<img src="${escapeHTML(ci.iconPath)}" alt="">`:""}<span>${escapeHTML(cn||"ยังไม่ระบุคลาส")}</span></div>
        <h3>${escapeHTML(getMemberName(m))}</h3>
        <div class="portfolio-member-bonds"><strong>สายใยผูกพันธ์</strong><span>${bondNames.length ? escapeHTML(bondNames.join(" · ")) : "ยังไม่ได้ระบุรายชื่อ"}</span></div>
        <span class="portfolio-member-open-label">${m.user_id===currentUser?.id?"แฟ้มผลงานของคุณ":"ดูแฟ้มผลงาน"} <span>↗</span></span></div>
      </button>
      ${m.user_id===currentUser?.id?'<button type="button" class="portfolio-member-cover-edit" data-bond-profile-edit="true" aria-label="แก้ไข Bond Profile" title="แก้ไข Bond Profile">✎</button>':""}
    </article>`;
  }));
  container.innerHTML=cards.join("");
  renderOwnBondProfileSection();
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

function closePortfolioLightbox() {
  const viewer = $("portfolio-lightbox");
  if (viewer) viewer.classList.add("hidden");
}
function updatePortfolioLightbox(index) {
  const images = window.portfolioLightboxImages || [];
  if (!images.length) return;
  const nextIndex = (index + images.length) % images.length;
  window.portfolioLightboxIndex = nextIndex;
  const item = images[nextIndex];
  const image = $("portfolio-lightbox-image");
  if (image) { image.src = item.url; image.alt = item.label || "Portfolio image"; }
  const caption = $("portfolio-lightbox-caption");
  if (caption) caption.textContent = item.label || "รูปภาพ";
  const counter = $("portfolio-lightbox-counter");
  if (counter) counter.textContent = (nextIndex + 1) + " / " + images.length;
  const prev = $("portfolio-lightbox-prev"), next = $("portfolio-lightbox-next");
  if (prev) prev.disabled = images.length < 2;
  if (next) next.disabled = images.length < 2;
}
function openPortfolioLightbox(index) {
  const images = window.portfolioLightboxImages || [];
  if (!images.length) return;
  let viewer = $("portfolio-lightbox");
  if (!viewer) {
    viewer = document.createElement("div");
    viewer.id = "portfolio-lightbox";
    viewer.className = "portfolio-lightbox hidden";
    viewer.innerHTML = '<button type="button" class="portfolio-lightbox-close" data-lightbox-close aria-label="ปิดภาพ">×</button><button type="button" id="portfolio-lightbox-prev" class="portfolio-lightbox-nav portfolio-lightbox-prev" aria-label="รูปก่อนหน้า">‹</button><div class="portfolio-lightbox-stage"><img id="portfolio-lightbox-image" alt=""><div class="portfolio-lightbox-meta"><span id="portfolio-lightbox-caption"></span><span id="portfolio-lightbox-counter"></span></div></div><button type="button" id="portfolio-lightbox-next" class="portfolio-lightbox-nav portfolio-lightbox-next" aria-label="รูปถัดไป">›</button>';
    document.body.appendChild(viewer);
    viewer.addEventListener("click", event => {
      if (event.target === viewer || event.target.closest("[data-lightbox-close]")) closePortfolioLightbox();
      else if (event.target.closest("#portfolio-lightbox-prev")) updatePortfolioLightbox((window.portfolioLightboxIndex || 0) - 1);
      else if (event.target.closest("#portfolio-lightbox-next")) updatePortfolioLightbox((window.portfolioLightboxIndex || 0) + 1);
    });
  }
  updatePortfolioLightbox(index);
  viewer.classList.remove("hidden");
}
function closePortfolioDetail() {
  const modal = $("portfolio-detail-modal");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("portfolio-detail-open");
}

async function renamePortfolioVersion(versionId, portfolioId) {
  const portfolio = allPortfolios.find(item => item.id === portfolioId);
  const version = portfolio?.portfolio_versions?.find(item => item.id === versionId);
  if (!portfolio || portfolio.member_id !== currentUser?.id || !version) {
    alert("เปลี่ยนชื่อได้เฉพาะ Version ในแฟ้มของคุณเท่านั้น");
    return;
  }
  const currentName = "Patch " + getPortfolioPatchName(version);
  const entered = prompt("ระบุเวอร์ชั่นแพทช์ (ไม่เกิน 80 ตัวอักษร)", currentName);
  if (entered === null) return;
  const newName = entered.trim();
  if (!newName || newName.length > 80) {
    alert("กรุณาระบุชื่อ Version ตั้งแต่ 1–80 ตัวอักษร");
    return;
  }
  if (newName === currentName) return;
  try {
    const { error } = await supabaseClient.rpc("rename_portfolio_version", {
      target_version_id: versionId,
      new_version_name: newName
    });
    if (error) throw error;
    await loadPortfolios(true);
    await openPortfolioDetail(portfolioId, versionId);
  } catch (error) {
    console.error("Rename portfolio version:", error);
    alert("เปลี่ยนชื่อ Version ไม่สำเร็จ: " + (error.message || "Unknown error"));
  }
}

async function deletePortfolioVersion(versionId, portfolioId, button) {
  const portfolio = allPortfolios.find(item => item.id === portfolioId);
  const version = portfolio?.portfolio_versions?.find(item => item.id === versionId);
  if (!portfolio || portfolio.member_id !== currentUser?.id || !version) { alert("ลบได้เฉพาะ Version ในแฟ้มผลงานของคุณเท่านั้น"); return; }
  const versionLabel = getPortfolioSnapshotLabel(version);
  if (!confirm("ยืนยันลบ " + versionLabel + " ใช่หรือไม่?\n\nระบบจะลบเฉพาะ Version นี้ พร้อมรูปภาพและผลตรวจที่อยู่ภายใน Version นี้\n\nแฟ้ม Portfolio หลักและ Version อื่นจะไม่ถูกลบ\n\nหาก Version นี้ยังมีประวัติการส่ง PATCH ระบบจะไม่อนุญาตให้ลบ")) return;
  if (button) { button.disabled = true; button.textContent = "…"; }
  try {
    const { data: imageRows, error: imageError } = await supabaseClient.from("portfolio_version_images").select("image_url, cover_image_url").eq("version_id", versionId);
    if (imageError) throw imageError;
    const paths = [...new Set((imageRows || []).flatMap(image => [image.image_url, image.cover_image_url]).filter(path => path && !/^https?:\/\//i.test(path)))];
    const { data: submissions, error: submissionError } = await supabaseClient.from("portfolio_patch_submissions").select("id").eq("version_id", versionId).limit(1);
    if (submissionError) throw submissionError;
    if (submissions?.length) throw new Error("Version นี้ยังมีประวัติการส่ง PATCH อยู่ จึงไม่สามารถลบได้ เพื่อรักษาประวัติการส่งงาน");
    const { data: deletedRows, error } = await supabaseClient.from("portfolio_versions").delete().eq("id", versionId).select("id");
    if (error) { if (error.code === "23503") throw new Error("Version นี้ยังถูกอ้างอิงโดยประวัติ PATCH จึงไม่สามารถลบได้"); throw error; }
    if (!deletedRows?.length) throw new Error("ไม่พบ Version ที่ลบได้ หรือบัญชีไม่มีสิทธิ์ลบ");
    let storageWarning = "";
    if (paths.length) { const { error: storageError } = await supabaseClient.storage.from(PORTFOLIO_BUCKET).remove(paths); if (storageError) { console.warn("Portfolio Version Storage cleanup failed:", storageError); storageWarning = "\nแต่มีรูปภาพบางไฟล์ที่ยังลบจาก Storage ไม่สำเร็จ กรุณาแจ้ง Developer ตรวจสอบ"; } }
    await loadPortfolios(true); await openPortfolioDetail(portfolioId);
    alert("ลบ " + versionLabel + " เรียบร้อยแล้ว โดยแฟ้มหลักและ Version อื่นยังอยู่ครบ" + storageWarning);
  } catch (error) { console.error("Portfolio Version delete error:", error); alert("ลบ Version ไม่สำเร็จ: " + (error.message || "Unknown error")); if (button) { button.disabled = false; button.textContent = "−"; } }
}
async function openPortfolioDetail(portfolioId, selectedVersionId = null) {
  const portfolio = allPortfolios.find(item => item.id === portfolioId);
  if (!portfolio) return;
  let modal = $("portfolio-detail-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "portfolio-detail-modal";
    modal.className = "portfolio-detail-modal hidden";
    modal.innerHTML = '<div class="portfolio-detail-backdrop" data-portfolio-detail-close></div><section class="portfolio-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="portfolio-detail-title"><button type="button" class="portfolio-detail-close" data-portfolio-detail-close aria-label="ปิด">×</button><div class="portfolio-detail-body" id="portfolio-detail-body"></div></section>';
    document.body.appendChild(modal);
    modal.addEventListener("click", event => {
      const addVersionButton = event.target.closest("[data-portfolio-add-version]");
      if (addVersionButton) {
        const portfolioId = addVersionButton.dataset.portfolioAddVersion;
        closePortfolioDetail();
        void startPortfolioEdit(portfolioId);
        return;
      }
      const editVersionButton = event.target.closest("[data-portfolio-version-edit]");
      if (editVersionButton) {
        event.stopPropagation();
        const versionId = editVersionButton.dataset.portfolioVersionEdit;
        const portfolioId = modal.dataset.portfolioId;
        closePortfolioDetail();
        void startPortfolioVersionEdit(portfolioId, versionId);
        return;
      }
      const renameVersionButton = event.target.closest("[data-portfolio-version-rename]");
      if (renameVersionButton) {
        event.stopPropagation();
        void renamePortfolioVersion(renameVersionButton.dataset.portfolioVersionRename, modal.dataset.portfolioId);
        return;
      }
      const deleteVersionButton = event.target.closest("[data-portfolio-version-delete]");
      if (deleteVersionButton) { event.stopPropagation(); void deletePortfolioVersion(deleteVersionButton.dataset.portfolioVersionDelete, modal.dataset.portfolioId, deleteVersionButton); return; }
      const historyToggle = event.target.closest("[data-portfolio-history-toggle]");
      if (historyToggle) {
        const list = modal.querySelector("[data-portfolio-history-list]");
        const expanded = historyToggle.getAttribute("aria-expanded") === "true";
        historyToggle.setAttribute("aria-expanded", String(!expanded));
        if (list) list.classList.toggle("hidden", expanded);
        historyToggle.textContent = expanded
          ? "ดูประวัติเวอร์ชั่นทั้งหมด (" + (historyToggle.dataset.count || "0") + ")"
          : "ซ่อนประวัติเวอร์ชั่น";
        return;
      }
      const versionButton = event.target.closest("[data-portfolio-version-select]");
      if (versionButton) {
        void openPortfolioDetail(modal.dataset.portfolioId, versionButton.dataset.portfolioVersionSelect);
        return;
      }
      const imageButton = event.target.closest("[data-lightbox-index]");
      if (imageButton) { openPortfolioLightbox(Number(imageButton.dataset.lightboxIndex)); return; }
      if (event.target.closest("[data-portfolio-detail-close]")) closePortfolioDetail();
    });
  }

  modal.dataset.portfolioId = portfolioId;
  const body = $("portfolio-detail-body");
  const owner = allMembers.find(member => member.user_id === portfolio.member_id);
  const versions = [...(portfolio.portfolio_versions || [])]
    .sort((a, b) => Number(b.version_number) - Number(a.version_number));
  const activeVersion = versions.find(version => version.id === selectedVersionId) || versions[0] || null;
  const snapshot = activeVersion || portfolio;
  const images = snapshot.portfolio_images || portfolio.portfolio_images || [];
  const portfolioType = snapshot.portfolio_type || portfolio.portfolio_type;
  const title = portfolioType === "cultivation_skills"
    ? "คัมภีร์หู่เฉียน / ขั้นสกิล"
    : (/^build\b/i.test(snapshot.title || "") ? snapshot.title : "Build " + (snapshot.title || "Untitled"));
  const sectionLabels = {
    cultivation:"คัมภีร์หู่เฉียน",
    hero_skills:"ขั้นสกิลเหล่าผู้กล้า / อัลติ",
    stats:"Stats ตัวละคร",
    inner_power:"กำลังภายใน",
    affixes:"ออฟสร้าง",
    weapons:"ศาสตราวุธ"
  };
  const lightboxImages = [];
  const imageCards = await Promise.all(images.map(async image => {
    const url = await getPortfolioImageUrl(image.cover_image_url || image.image_url);
    if (!url) return "";
    const label = sectionLabels[image.section_key] || (image.image_type === "cover" ? "ภาพหน้าปก" : "รูปภาพ");
    const index = lightboxImages.push({url, label: image.caption ? label + " · " + image.caption : label}) - 1;
    return '<figure class="portfolio-detail-image-card"><button type="button" class="portfolio-detail-image-open" data-lightbox-index="' + index + '" aria-label="ดูรูป ' + escapeHTML(label) + ' แบบเต็มหน้าจอ"><img src="' + escapeHTML(url) + '" alt="' + escapeHTML(label) + '" loading="lazy"><span class="portfolio-image-zoom-hint">⌕ ดูภาพเต็ม</span></button><figcaption><strong>' + escapeHTML(label) + '</strong>' + (image.caption ? '<p>' + escapeHTML(image.caption) + '</p>' : '') + '</figcaption></figure>';
  }));
  window.portfolioLightboxImages = lightboxImages;
  window.portfolioLightboxIndex = 0;

  const classes = getPortfolioClasses(snapshot.game_class || portfolio.game_class);
  const history = versions.length ? '<section class="portfolio-version-history"><div class="portfolio-version-history-heading"><h3>ประวัติเวอร์ชั่น</h3><button type="button" class="btn btn-outline portfolio-history-toggle" data-portfolio-history-toggle data-count="' + versions.length + '" aria-expanded="false">ดูประวัติเวอร์ชั่นทั้งหมด (' + versions.length + ')</button></div><div class="portfolio-version-list hidden" data-portfolio-history-list>' +
    versions.map(version => {
      const selected = version.id === activeVersion?.id;
      const patchLabel = getPortfolioSnapshotLabel(version);
      return '<div class="portfolio-version-row"><button type="button" class="portfolio-version-item ' + (selected ? 'is-active' : '') +
        '" data-portfolio-version-select="' + escapeHTML(version.id) + '" aria-pressed="' + selected + '">' +
        '<strong>' + escapeHTML(patchLabel) + '</strong><small>' + escapeHTML(formatDate(version.created_at)) + '</small></button>' +
        (portfolio.member_id === currentUser?.id ? '<button type="button" class="portfolio-version-edit" data-portfolio-version-edit="' + escapeHTML(version.id) + '">แก้ไข Snapshot</button><button type="button" class="portfolio-version-rename" data-portfolio-version-rename="' + escapeHTML(version.id) + '" aria-label="เปลี่ยนเวอร์ชั่นแพทช์ ' + escapeHTML(patchLabel) + '">เปลี่ยน Patch</button><button type="button" class="portfolio-version-delete" data-portfolio-version-delete="' + escapeHTML(version.id) + '" aria-label="ลบ ' + escapeHTML(patchLabel) + '" title="ลบเฉพาะ Snapshot นี้">−</button>' : '') +
        '</div>';
    }).join("") + '</div></section>' : "";

  body.innerHTML =
    '<div class="portfolio-detail-heading"><span class="portfolio-type-chip">' +
    escapeHTML(portfolioType === "cultivation_skills" ? "คัมภีร์หู่เฉียน / ขั้นสกิล" : portfolioType === "pve" ? "PvE Build" : "PvP Build") +
    '</span><h2 id="portfolio-detail-title">' + escapeHTML(title) + '</h2>' +
    '<p class="portfolio-detail-owner">' + escapeHTML(owner ? getMemberName(owner) : "Guild Member") + '</p>' +
    '<div class="portfolio-card-tags">' + classes.map(name => '<span class="portfolio-card-tag">' + escapeHTML(name) + '</span>').join("") + '</div>' +
    '<p class="portfolio-version-current-label">กำลังดู ' + escapeHTML(getPortfolioSnapshotLabel(activeVersion || {})) + '</p>' +
    (portfolio.member_id === currentUser?.id ? '<button type="button" class="btn btn-primary" data-portfolio-add-version="' + escapeHTML(portfolio.id) + '">＋ เพิ่มเวอร์ชันใหม่</button>' : '') +
    '</div>' +
    (snapshot.description ? '<div class="portfolio-detail-description"><h3>Description</h3><p>' + escapeHTML(snapshot.description) + '</p></div>' : '') +
    history +
    '<div class="portfolio-detail-gallery">' + (imageCards.filter(Boolean).join("") || '<p class="muted">ไม่มีรูปภาพในเวอร์ชันนี้</p>') + '</div>';

  modal.classList.remove("hidden");
  document.body.classList.add("portfolio-detail-open");
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
  // Keep the shared Portfolio Gallery visible to every member. Only the creation controls are owner-only.
  $("portfolio-create-section")?.classList.remove("hidden");
  $("portfolio-add-button")?.classList.toggle("hidden",!ownCollection);
  if (!ownCollection) $("portfolio-create-panel")?.classList.add("hidden");
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
    const reviewVersionId = portfolio.current_version?.id || "";
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

    const reviewControls = reviewer && reviewVersionId ? `
      <div class="portfolio-review-controls" data-portfolio-review="${escapeHTML(reviewVersionId)}">
        <div class="portfolio-review-actions">
          <button type="button" class="portfolio-review-approve" data-review-action="approve" data-version-id="${escapeHTML(reviewVersionId)}">
            ✓ ตรวจแล้ว · ผ่าน
          </button>
          <button type="button" class="portfolio-review-reject" data-review-action="toggle-reject" data-version-id="${escapeHTML(reviewVersionId)}">
            ✕ ยังไม่ผ่าน
          </button>
        </div>
        <div class="portfolio-review-reject-form hidden" data-reject-form="${escapeHTML(reviewVersionId)}">
          <label>
            <span>เหตุผลที่ไม่ผ่าน <i>*</i></span>
            <textarea rows="3" maxlength="1000" data-rejection-reason="${escapeHTML(reviewVersionId)}" placeholder="ระบุสิ่งที่สมาชิกต้องแก้ไข..."></textarea>
          </label>
          <div class="portfolio-review-reject-footer">
            <small>สมาชิกเจ้าของแฟ้มผลงานจะเห็นเหตุผลนี้</small>
            <button type="button" class="portfolio-review-submit-reject" data-review-action="submit-rejection" data-version-id="${escapeHTML(reviewVersionId)}">ยืนยันไม่ผ่าน</button>
          </div>
        </div>
        <p class="portfolio-review-feedback" data-review-feedback="${escapeHTML(reviewVersionId)}" aria-live="polite"></p>
      </div>
    ` : "";

    return `
      <article class="portfolio-card ${portfolioManageMode && (isOwner || reviewer) ? "is-jiggling" : ""}" data-portfolio-card-id="${escapeHTML(portfolio.id)}" role="button" tabindex="0" aria-label="เปิดแฟ้ม ${escapeHTML(portfolio.portfolio_type === "cultivation_skills" ? "คัมภีร์หู่เฉียน / ขั้นสกิล" : portfolio.title || "ผลงาน")}" ${color ? `style="--class-color:${color}"` : ""}>
        ${imageUrl ? `<img class="portfolio-card-image" src="${escapeHTML(imageUrl)}" alt="${escapeHTML(portfolio.title)}" loading="lazy">` : '<div class="portfolio-card-no-image">4AM GUILD</div>'}
        <div class="portfolio-card-content">
          <div class="portfolio-card-owner">${escapeHTML(ownerName)}</div>
          <span class="portfolio-type-chip">${portfolio.portfolio_type === "cultivation_skills" ? "คัมภีร์หู่เฉียน / ขั้นสกิล" : portfolio.portfolio_type === "pve" ? "PvE Build" : "PvP Build"}</span>
          <div class="portfolio-card-tags">${classTags || '<span class="portfolio-card-tag">Unassigned</span>'}</div>
          <h3>${escapeHTML(portfolio.portfolio_type === "cultivation_skills" ? "คัมภีร์หู่เฉียน / ขั้นสกิล" : (/^build\b/i.test(portfolio.title||"")?(portfolio.title||"Untitled"):"Build "+(portfolio.title||"Untitled")))}</h3>
          <p>${escapeHTML(portfolio.description || "")}</p>
          <div class="portfolio-card-footer">
            <small>${images.length} รูป · ${portfolio.portfolio_versions?.length || 1} เวอร์ชัน · ล่าสุด ${formatDate(portfolio.current_version?.created_at || portfolio.created_at)}</small>
            ${isOwner ? '<span class="portfolio-owner-label">ผลงานของคุณ</span>' : ""}
          </div>
          <div class="portfolio-card-management">
            ${isOwner ? `
              <button type="button" class="portfolio-edit-button" data-portfolio-action="edit-folder" data-portfolio-id="${escapeHTML(portfolio.id)}" aria-label="แก้ไขข้อมูลแฟ้มผลงาน" title="แก้ไขข้อมูลแฟ้มผลงาน">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                <span>แก้ไขแฟ้ม</span>
              </button>
              <button type="button" class="portfolio-add-version-button" data-portfolio-action="add-version" data-portfolio-id="${escapeHTML(portfolio.id)}" aria-label="เพิ่ม Version ใหม่" title="เพิ่ม Version ใหม่">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                <span>อัปเดตแฟ้ม</span>
              </button>
              <button type="button" class="portfolio-delete-button" data-portfolio-action="delete" data-portfolio-id="${escapeHTML(portfolio.id)}" aria-label="ลบแฟ้มผลงาน" title="ลบแฟ้มผลงาน">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>
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

async function savePortfolioReview(versionId, status, reason = "") {
  if (!isPortfolioReviewer()) {
    alert("เฉพาะ Developer, Leader และ Management เท่านั้นที่ตรวจ Portfolio ได้");
    return;
  }

  const feedback = document.querySelector(`[data-review-feedback="${CSS.escape(versionId)}"]`);
  const buttons = document.querySelectorAll(`[data-portfolio-review="${CSS.escape(versionId)}"] button`);
  buttons.forEach((button) => { button.disabled = true; });
  if (feedback) feedback.textContent = "กำลังบันทึกผลตรวจเวอร์ชัน...";

  try {
    const { error } = await supabaseClient.rpc("set_portfolio_version_review", {
      target_version_id: versionId,
      new_status: status,
      rejection_reason: status === "rejected" ? reason.trim() : null
    });
    if (error) throw error;
    await loadPortfolios(true);
  } catch (error) {
    console.error("Portfolio version review error:", error);
    if (feedback) feedback.textContent = error.message || "บันทึกผลตรวจไม่สำเร็จ";
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function handlePortfolioReviewAction(event) {
  const button = event.target instanceof Element
    ? event.target.closest("[data-review-action]")
    : null;
  if (!button) return;

  const versionId = button.dataset.versionId;
  const feedback = versionId
    ? document.querySelector(`[data-review-feedback="${CSS.escape(versionId)}"]`)
    : null;

  if (!isPortfolioReviewer()) {
    if (feedback) feedback.textContent = "บัญชีนี้ไม่มีสิทธิ์ตรวจ Portfolio (ต้องเป็น Developer, Leader หรือ Management)";
    else alert("บัญชีนี้ไม่มีสิทธิ์ตรวจ Portfolio");
    return;
  }
  if (!versionId) {
    if (feedback) feedback.textContent = "ไม่พบรหัสเวอร์ชัน กรุณารีเฟรชหน้าเว็บ";
    return;
  }

  const action = button.dataset.reviewAction;
  if (action === "toggle-reject") {
    const form = document.querySelector(`[data-reject-form="${CSS.escape(versionId)}"]`);
    if (!form) {
      if (feedback) feedback.textContent = "ไม่พบแบบฟอร์มระบุเหตุผล กรุณารีเฟรชหน้าเว็บ";
      return;
    }
    form.classList.toggle("hidden");
    if (feedback) feedback.textContent = form.classList.contains("hidden")
      ? ""
      : "กรุณากรอกเหตุผลที่ยังไม่ผ่าน แล้วกด “ยืนยันไม่ผ่าน”";
    if (!form.classList.contains("hidden")) form.querySelector("textarea")?.focus();
    return;
  }

  if (action === "approve") {
    void savePortfolioReview(versionId, "approved");
    return;
  }

  if (action === "submit-rejection") {
    const input = document.querySelector(`[data-rejection-reason="${CSS.escape(versionId)}"]`);
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
    void savePortfolioReview(versionId, "rejected", reason);
  }
}

async function uploadPortfolioImage(file, portfolioId, caption="", sortOrder=0, coverBlob=null, cropSettings=null, sectionKey="stats") {
  if (!currentUser) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  if (!file || !file.type.startsWith("image/")) throw new Error("กรุณาเลือกรูปภาพ");

  // Prefer WebP to reduce storage, but keep the original if browser decoding
  // or conversion fails. This must never block a valid original image upload.
  // Animated GIF and SVG files are preserved unchanged.
  const uploadFile = file.type === "image/gif" || file.type === "image/svg+xml"
    ? file
    : await prepareStorageImageForUpload(file, { maxDimension: 2880, quality: 0.92, forceWebP: false });
  if (!["image/webp","image/jpeg","image/png","image/gif","image/svg+xml"].includes(uploadFile.type)) {
    throw new Error("รองรับภาพ Portfolio เป็น JPG, PNG, WEBP, GIF หรือ SVG เท่านั้น");
  }
  const ext = (uploadFile.name.split(".").pop() || "jpg").toLowerCase();
  const safe = /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
  const base = `${currentUser.id}/${portfolioId}/versions/${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const originalPath = `${base}.${safe}`;
  const coverPath = coverBlob ? `${base}-cover.webp` : null;
  const storage = supabaseClient.storage.from(PORTFOLIO_BUCKET);

  const { error: originalError } = await storage.upload(originalPath, uploadFile, {
    cacheControl: "86400", upsert: false, contentType: uploadFile.type
  });
  if (originalError) throw originalError;

  if (coverBlob) {
    const { error } = await storage.upload(coverPath, coverBlob, {
      cacheControl: "31536000", upsert: false, contentType: "image/webp"
    });
    if (error) {
      await storage.remove([originalPath]);
      throw error;
    }
  }

  return {
    image_url: originalPath,
    cover_image_url: coverPath,
    crop_settings: cropSettings || null,
    image_type: "other",
    section_key: sectionKey || "stats",
    caption: caption || "",
    sort_order: sortOrder
  };
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
  const portfolioType = $("portfolio-type")?.value || "pvp";
  const isCultivationSkills = portfolioType === "cultivation_skills";
  const title = isCultivationSkills ? "คัมภีร์หู่เฉียน / ขั้นสกิล" : ($("portfolio-title")?.value.trim() || "");
  const versionName = $("portfolio-version-name")?.value.trim() || "";
  const description = $("portfolio-description")?.value.trim() || "";
  const files = window.portfolioDraftFiles || [];
  const selectedClasses = [...document.querySelectorAll(".portfolio-class-tag.is-selected")]
    .map(button => button.dataset.class);
  const status = $("portfolio-form-status");
  const submit = $("portfolio-create-submit");
  const editingId = window.editingPortfolioId || null;
  const editingVersionId = window.editingPortfolioVersionId || null;

  if (!versionName || versionName.length > 80) {
    if (status) status.textContent = "กรุณากรอกชื่อ Version (ไม่เกิน 80 ตัวอักษร)";
    $("portfolio-version-name")?.focus();
    return;
  }
  if (!editingVersionId && !isCultivationSkills && !title) {
    if (status) status.textContent = "กรุณากรอกชื่อผลงาน";
    $("portfolio-title")?.focus();
    return;
  }
  if (!files.length) {
    if (status) status.textContent = "กรุณาเก็บรูปภาพไว้อย่างน้อย 1 รูป";
    return;
  }
  if (!isCultivationSkills && !files[0].existing && !files[0].cropBlob) {
    if (status) status.textContent = "กรุณาจัดตำแหน่งและ Crop ภาพหน้าปกก่อนบันทึก";
    await openPortfolioCropEditor(0);
    return;
  }
  if (!selectedClasses.length) {
    if (status) status.textContent = "กรุณาเลือก Class Tags อย่างน้อย 1 คลาส";
    return;
  }
  if (files.some(item => item.file && item.file.size > 12 * 1024 * 1024)) {
    if (status) status.textContent = "รูปภาพแต่ละไฟล์ต้องมีขนาดไม่เกิน 12 MB";
    return;
  }

  submit.disabled = true;
  submit.textContent = editingVersionId ? "กำลังบันทึกการแก้ไข..." : editingId ? "กำลังสร้างเวอร์ชันใหม่..." : "กำลังสร้างแฟ้มและ Version 1...";
  if (status) status.textContent = editingVersionId
    ? "กำลังบันทึกการแก้ไขเฉพาะ Version ที่เลือก..."
    : editingId
      ? "กำลังบันทึก Snapshot ใหม่ โดยเก็บเวอร์ชันก่อนหน้าไว้ครบถ้วน..."
      : "กำลังสร้างแฟ้มหลักและบันทึก Version 1...";

  const folderId = editingId || (editingVersionId ? allPortfolios.find(p => p.portfolio_versions?.some(v => v.id === editingVersionId))?.id : null) || crypto.randomUUID();
  const uploadedPaths = [];

  try {
    const imagePayload = [];
    for (let index = 0; index < files.length; index++) {
      const item = files[index];
      let image;

      if (item.existing) {
        let coverPath = item.coverPath || null;
        if (index === 0 && item.cropBlob) {
          coverPath = `${currentUser.id}/${folderId}/versions/${Date.now()}-${Math.random().toString(36).slice(2,8)}-cover.webp`;
          const { error } = await supabaseClient.storage.from(PORTFOLIO_BUCKET).upload(coverPath, item.cropBlob, {
            cacheControl: "31536000", upsert: false, contentType: "image/webp"
          });
          if (error) throw error;
          uploadedPaths.push(coverPath);
        }
        image = {
          image_url: item.path,
          cover_image_url: index === 0 && !coverPath ? item.path : coverPath,
          crop_settings: item.cropBlob ? (item.cropSettings || null) : (item.cropSettings || null),
          image_type: item.imageType || "other",
          section_key: item.sectionKey || "stats",
          caption: item.caption || "",
          sort_order: index
        };
      } else {
        image = await uploadPortfolioImage(
          item.file, folderId, item.caption || "", index,
          index === 0 ? item.cropBlob : null,
          index === 0 ? item.cropSettings : null,
          item.sectionKey || "stats"
        );
        uploadedPaths.push(image.image_url);
        if (image.cover_image_url) uploadedPaths.push(image.cover_image_url);
      }

      imagePayload.push(image);
      if (status) status.textContent = `กำลังเตรียม Snapshot ${index + 1}/${files.length}...`;
    }

    if (editingVersionId) {
      const { error } = await supabaseClient.rpc("update_portfolio_version", {
        target_version_id: editingVersionId,
        new_version_name: versionName,
        version_description: description,
        version_game_class: selectedClasses.join(", "),
        version_portfolio_type: portfolioType,
        image_payload: imagePayload
      });
      if (error) throw error;

      const retainedPaths = new Set(imagePayload.flatMap(image => [image.image_url, image.cover_image_url]).filter(Boolean));
      const obsoletePaths = [...new Set((window.portfolioOriginalImages || []).flatMap(image => [image.image_url, image.cover_image_url])
        .filter(path => path && !/^https?:\/\//i.test(path) && !retainedPaths.has(path)))];
      if (obsoletePaths.length) {
        const { error: cleanupError } = await supabaseClient.storage.from(PORTFOLIO_BUCKET).remove(obsoletePaths);
        if (cleanupError) console.warn("Edited Portfolio Version Storage cleanup failed:", cleanupError);
      }
    } else {
      const { error } = await supabaseClient.rpc("save_portfolio_version", {
        target_portfolio_id: folderId,
        create_new_folder: !editingId,
        folder_title: title,
        folder_description: description,
        folder_game_class: selectedClasses.join(", "),
        folder_portfolio_type: portfolioType,
        folder_version_name: versionName,
        image_payload: imagePayload
      });
      if (error) throw error;
    }

    portfolioClassFilter = "all";
    await loadPortfolios(true);
    await window.loadPortfolioTracker?.();
    renderClassLegend();
    resetPortfolioForm();
    if (editingVersionId) await openPortfolioDetail(folderId, editingVersionId);

    const savedNow = new Date();
    const savedAt = formatDate(savedNow.toLocaleDateString("en-CA", {timeZone:"Asia/Bangkok"})) + " " +
      new Intl.DateTimeFormat("en-GB", {hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",timeZone:"Asia/Bangkok"}).format(savedNow);
    if (status) status.textContent = `บันทึก Version ใหม่สำเร็จ · ${savedAt} น. (เวลาไทย)`;
  } catch (error) {
    console.error("Portfolio version save error:", error);
    if (uploadedPaths.length) {
      const { error: cleanupError } = await supabaseClient.storage.from(PORTFOLIO_BUCKET).remove([...new Set(uploadedPaths)]);
      if (cleanupError) console.warn("Portfolio version upload cleanup failed:", cleanupError);
    }
    if (status) status.textContent = "บันทึกเวอร์ชันไม่สำเร็จ: " + (error.message || "Unknown error");
  } finally {
    submit.disabled = false;
    submit.textContent = window.editingPortfolioVersionId ? "บันทึกการแก้ไข" : window.editingPortfolioId ? "บันทึกเวอร์ชันใหม่" : "บันทึก Portfolio";
  }
}

async function startPortfolioEdit(portfolioId) {
  const portfolio = allPortfolios.find(item => item.id === portfolioId);
  if (!portfolio || portfolio.member_id !== currentUser?.id) {
    alert("คุณเพิ่มเวอร์ชันได้เฉพาะแฟ้มผลงานของตัวเองเท่านั้น");
    return;
  }
  resetPortfolioForm();
  window.editingPortfolioId = portfolio.id;
  const latest = portfolio.current_version || portfolio.portfolio_versions?.[0] || null;

  // New versions are independent snapshots. Never preload old text, classes, or images.
  window.portfolioOriginalImages = [];
  window.portfolioDraftFiles = [];
  $("portfolio-title").value = "";
  $("portfolio-version-name").value = "";
  $("portfolio-description").value = "";
  $("portfolio-type").value = latest?.portfolio_type || portfolio.portfolio_type || "pvp";
  setPortfolioTitleFieldVisibility($("portfolio-type").value);
  setPortfolioTitlePlaceholder($("portfolio-type").value);
  document.querySelectorAll("[data-portfolio-type]").forEach(button =>
    button.classList.toggle("is-selected", button.dataset.portfolioType === $("portfolio-type").value)
  );
  $("portfolio-type-step")?.classList.add("hidden");
  $("portfolio-create-form")?.classList.remove("hidden");
  $("portfolio-title-label").textContent = "ชื่อ Build";
  renderPortfolioClassChoices();
  document.querySelectorAll(".portfolio-class-tag").forEach(button => {
    button.classList.remove("is-selected");
    button.setAttribute("aria-pressed", "false");
  });
  renderPortfolioSelectedFiles();

  const heading = $("portfolio-form-heading");
  if (heading) {
    heading.querySelector("h3").textContent = "เพิ่มเวอร์ชันใหม่";
    heading.querySelector("p").textContent = "เริ่มต้น Snapshot ใหม่ทั้งหมด กรุณากรอกชื่อ Version รายละเอียด เลือกคลาส และอัปโหลดรูปภาพใหม่ โดยไม่มีการนำข้อมูลหรือรูปจากเวอร์ชันก่อนหน้ามาใช้";
  }
  const submit = $("portfolio-create-submit");
  if (submit) submit.textContent = "บันทึกเวอร์ชันใหม่";
  const status = $("portfolio-form-status");
  if (status) status.textContent = "";
  $("portfolio-create-panel")?.classList.remove("hidden");
  $("portfolio-add-button")?.setAttribute("aria-expanded", "true");
  $("portfolio-create-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function startPortfolioVersionEdit(portfolioId, versionId) {
  const portfolio = allPortfolios.find(item => item.id === portfolioId);
  const version = portfolio?.portfolio_versions?.find(item => item.id === versionId);
  if (!portfolio || portfolio.member_id !== currentUser?.id || !version || isRolePreviewActive()) {
    alert("แก้ไขได้เฉพาะ Version ในแฟ้มของคุณเท่านั้น");
    return;
  }
  try {
    const { data: submissions, error } = await supabaseClient
      .from("portfolio_patch_submissions").select("id").eq("version_id", versionId).limit(1);
    if (error) throw error;
    if (submissions?.length) {
      alert("Version นี้มีประวัติการส่ง PATCH จึงล็อกการแก้ไขไว้ เพื่อรักษาประวัติการส่งงานและผลตรวจ");
      return;
    }
    resetPortfolioForm();
    window.editingPortfolioVersionId = version.id;
    window.editingPortfolioId = null;
    window.portfolioOriginalImages = [...(version.portfolio_images || [])];
    $("portfolio-title").value = portfolio.title || "";
    $("portfolio-title").readOnly = true;
    $("portfolio-version-name").value = "Patch " + getPortfolioPatchName(version);
    $("portfolio-description").value = version.description || "";
    $("portfolio-type").value = version.portfolio_type || portfolio.portfolio_type || "pvp";
    setPortfolioTitleFieldVisibility($("portfolio-type").value);
    setPortfolioTitlePlaceholder($("portfolio-type").value);
    $("portfolio-title-label").textContent = "ชื่อแฟ้ม (ไม่สามารถแก้ไขจากหน้านี้)";
    $("portfolio-type-step")?.classList.add("hidden");
    $("portfolio-create-form")?.classList.remove("hidden");
    renderPortfolioClassChoices();
    const selectedClasses = new Set(getPortfolioClasses(version.game_class || portfolio.game_class).map(name => name.toLowerCase()));
    document.querySelectorAll(".portfolio-class-tag").forEach(button => {
      const selected = selectedClasses.has(String(button.dataset.class || "").toLowerCase());
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    window.portfolioDraftFiles = await Promise.all((version.portfolio_images || []).map(async image => ({
      existing: true, file: null, path: image.image_url, coverPath: image.cover_image_url || null,
      preview: await getPortfolioImageUrl(image.cover_image_url || image.image_url),
      cropSettings: image.crop_settings || null, imageType: image.image_type || "other",
      sectionKey: image.section_key || "stats", caption: image.caption || "", cropBlob: null
    })));
    if (window.portfolioDraftFiles.some(item => !item.preview)) throw new Error("โหลดรูปภาพเดิมบางรูปไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่");
    document.querySelectorAll("[data-portfolio-type]").forEach(button =>
      button.classList.toggle("is-selected", button.dataset.portfolioType === $("portfolio-type").value)
    );
    renderPortfolioSelectedFiles();
    const heading = $("portfolio-form-heading");
    if (heading) {
      heading.querySelector("h3").textContent = "แก้ไข Snapshot · " + getPortfolioSnapshotLabel(version);
      heading.querySelector("p").textContent = "แก้ไขเวอร์ชั่นแพทช์ รายละเอียด Class Tags และรูปภาพของ Snapshot นี้ โดยไม่กระทบประวัติ Snapshot อื่น";
    }
    const submit = $("portfolio-create-submit");
    if (submit) submit.textContent = "บันทึกการแก้ไข";
    const status = $("portfolio-form-status");
    if (status) status.textContent = "";
    closePortfolioDetail();
    $("portfolio-create-panel")?.classList.remove("hidden");
    $("portfolio-add-button")?.setAttribute("aria-expanded", "true");
    $("portfolio-create-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error("Open Portfolio Version editor:", error);
    alert("เปิดหน้าแก้ไข Version ไม่สำเร็จ: " + (error.message || "Unknown error"));
    resetPortfolioForm();
  }
}

async function editPortfolioFolder(portfolioId, button) {
  const portfolio = allPortfolios.find(item => item.id === portfolioId);
  if (!portfolio || portfolio.member_id !== currentUser?.id || isRolePreviewActive()) {
    alert("แก้ไขได้เฉพาะแฟ้มผลงานของคุณเท่านั้น");
    return;
  }
  await openPortfolioDetail(portfolioId);
}
async function deletePortfolioFolder(portfolioId, button) {
  const portfolio = allPortfolios.find(item => item.id === portfolioId);
  if (!portfolio || portfolio.member_id !== currentUser?.id || isRolePreviewActive()) {
    alert("ลบได้เฉพาะแฟ้มผลงานของคุณเท่านั้น");
    return;
  }
  const label = portfolio.portfolio_type === "cultivation_skills"
    ? "คัมภีร์หู่เฉียน / ขั้นสกิล"
    : (portfolio.title || "แฟ้มผลงาน");
  if (!confirm("ยืนยันลบแฟ้ม “" + label + "” ถาวรหรือไม่?\n\nระบบจะลบแฟ้มนี้พร้อม Versions รูปภาพ และผลตรวจทั้งหมดของแฟ้มนี้\n\nแฟ้มอื่นของคุณจะไม่ได้รับผลกระทบ\n\nหากแฟ้มนี้มีประวัติการส่ง PATCH ระบบจะไม่อนุญาตให้ลบ เพื่อรักษาประวัติการส่งงาน")) return;

  if (button) { button.disabled = true; button.textContent = "…"; }
  try {
    const [submissionResult, legacyImageResult, versionResult] = await Promise.all([
      supabaseClient.from("portfolio_patch_submissions").select("id").eq("portfolio_id", portfolioId).limit(1),
      supabaseClient.from("portfolio_images").select("image_url, cover_image_url").eq("portfolio_id", portfolioId),
      supabaseClient.from("portfolio_versions").select("id").eq("portfolio_id", portfolioId)
    ]);
    for (const result of [submissionResult, legacyImageResult, versionResult]) {
      if (result.error) throw result.error;
    }
    if (submissionResult.data?.length) {
      throw new Error("แฟ้มนี้มีประวัติการส่ง PATCH อยู่ จึงยังลบไม่ได้ เพื่อเก็บประวัติการส่งและผลตรวจไว้ครบถ้วน");
    }

    const versionIds = (versionResult.data || []).map(row => row.id);
    let versionImages = [];
    if (versionIds.length) {
      const { data, error } = await supabaseClient.from("portfolio_version_images")
        .select("image_url, cover_image_url").in("version_id", versionIds);
      if (error) throw error;
      versionImages = data || [];
    }
    const allImageRows = [...(legacyImageResult.data || []), ...versionImages];
    const paths = [...new Set(allImageRows.flatMap(row => [row.image_url, row.cover_image_url])
      .filter(path => path && !/^https?:\/\//i.test(path)))];

    const { data: deleted, error } = await supabaseClient.from("portfolios")
      .delete().eq("id", portfolioId).eq("member_id", currentUser.id).select("id");
    if (error) {
      if (error.code === "23503") throw new Error("แฟ้มนี้ยังมีประวัติ PATCH เชื่อมโยงอยู่ จึงไม่สามารถลบได้");
      throw error;
    }
    if (!deleted?.length) throw new Error("ไม่พบแฟ้มที่ลบได้ หรือบัญชีนี้ไม่มีสิทธิ์ลบ");

    let storageWarning = "";
    if (paths.length) {
      const { error: storageError } = await supabaseClient.storage.from(PORTFOLIO_BUCKET).remove(paths);
      if (storageError) {
        console.warn("Portfolio folder Storage cleanup failed:", storageError);
        storageWarning = "\nหมายเหตุ: มีไฟล์รูปบางส่วนที่ลบจาก Storage ไม่สำเร็จ กรุณาแจ้ง Developer ตรวจสอบ";
      }
    }
    await loadPortfolios(true);
    await renderPortfolios();
    alert("ลบแฟ้ม “" + label + "” เรียบร้อยแล้ว" + storageWarning);
  } catch (error) {
    console.error("Portfolio folder delete error:", error);
    alert("ลบแฟ้มไม่สำเร็จ: " + (error.message || "Unknown error"));
    if (button) { button.disabled = false; button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>'; }
  }
}

async function handlePortfolioCardAction(event) {
  const button = event.target.closest("[data-portfolio-action]");
  if (!button) return;
  const portfolioId = button.dataset.portfolioId;
  if (!portfolioId) return;

  const portfolio = allPortfolios.find((item) => item.id === portfolioId);
  if (!portfolio) return;

  const action = button.dataset.portfolioAction;
  if (action === "edit-folder") {
    await editPortfolioFolder(portfolioId, button);
    return;
  }
  if (action === "add-version") {
    await startPortfolioEdit(portfolioId);
    return;
  }
  if (action === "delete") {
    await deletePortfolioFolder(portfolioId, button);
  }
}

function registerPortfolioEvents() {
  window.portfolioDraftFiles = [];
  $("portfolio-member-search")?.addEventListener("input",()=>{void renderPortfolioMemberDirectory();});
  $("portfolio-review-search")?.addEventListener("input", renderPortfolioReviewCenter);
  $("portfolio-review-filter")?.addEventListener("change", renderPortfolioReviewCenter);
  $("portfolio-review-class-filters")?.addEventListener("click", event => { const button=event.target instanceof Element?event.target.closest("[data-review-class]"):null; if(!button)return; window.portfolioReviewClassFilter=button.dataset.reviewClass||"all"; renderPortfolioReviewCenter(); });
  $("portfolio-review-refresh")?.addEventListener("click", () => { void loadPortfolios(true); });
  $("portfolio-review-queue")?.addEventListener("click", async event => {
    const button = event.target instanceof Element ? event.target.closest("[data-review-center-open]") : null;
    if (!button || !isPortfolioReviewer()) return;
    currentPortfolioMemberId = button.dataset.reviewCenterOpen;
    portfolioClassFilter = "all"; portfolioManageMode = false;
    openGuildPage("portfolio"); await renderPortfolios();
  });
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
  $("portfolio-grid")?.addEventListener("click", event => {
    const card = event.target instanceof Element ? event.target.closest("[data-portfolio-card-id]") : null;
    if (!card || event.target.closest("button,a,input,textarea,select,[data-portfolio-review]")) return;
    void openPortfolioDetail(card.dataset.portfolioCardId);
  });
  $("portfolio-grid")?.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target instanceof Element ? event.target.closest("[data-portfolio-card-id]") : null;
    if (!card || event.target !== card) return;
    event.preventDefault();
    void openPortfolioDetail(card.dataset.portfolioCardId);
  });
  document.addEventListener("keydown", event => {
    const viewerOpen = !$("portfolio-lightbox")?.classList.contains("hidden");
    if (viewerOpen && event.key === "Escape") { closePortfolioLightbox(); return; }
    if (viewerOpen && event.key === "ArrowLeft") { updatePortfolioLightbox((window.portfolioLightboxIndex || 0) - 1); return; }
    if (viewerOpen && event.key === "ArrowRight") { updatePortfolioLightbox((window.portfolioLightboxIndex || 0) + 1); return; }
    if (event.key === "Escape" && !$("portfolio-detail-modal")?.classList.contains("hidden")) closePortfolioDetail();
  });

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
    setPortfolioTitleFieldVisibility(choice.dataset.portfolioType);
    setPortfolioTitlePlaceholder(choice.dataset.portfolioType);
    $("portfolio-title-label").textContent = "ชื่อ Build";
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
  $("bond-profile-search")?.addEventListener("input", renderBondMemberPicker);
  $("bond-profile-member-list")?.addEventListener("click", event => { const button=event.target.closest("[data-bond-toggle]"); if(!button)return; const id=button.dataset.bondToggle; if(bondSelectedMemberIds.has(id))bondSelectedMemberIds.delete(id);else bondSelectedMemberIds.add(id);renderBondMemberPicker(); });
  $("bond-profile-selected")?.addEventListener("click", event => { const button=event.target.closest("[data-bond-toggle]");if(!button)return;bondSelectedMemberIds.delete(button.dataset.bondToggle);renderBondMemberPicker(); });
  $("bond-profile-modal")?.addEventListener("click", event => { if(event.target===$("bond-profile-modal") || event.target.closest("[data-bond-close]"))closeBondProfileEditor(); });
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
  document.querySelectorAll("[data-member-cover-crop-mode]").forEach(button=>button.addEventListener("click",()=>setPortfolioMemberCoverCropMode(button.dataset.memberCoverCropMode)));
  $("portfolio-crop-save")?.addEventListener("click",()=>{void savePortfolioCrop();});
  $("portfolio-crop-rotate-left")?.addEventListener("click",()=>portfolioCropper?.rotate(-90));
  $("portfolio-crop-rotate-right")?.addEventListener("click",()=>portfolioCropper?.rotate(90));
  $("portfolio-crop-reset")?.addEventListener("click",()=>{
    portfolioCropper?.reset();
    const zoom=$("portfolio-crop-zoom");if(zoom)zoom.value="1";
    const output=$("portfolio-crop-zoom-value");if(output)output.textContent="100%";
  });
  $("portfolio-crop-zoom")?.addEventListener("input",event=>{
    const v=Math.max(.5,Math.min(3,Number(event.target.value)||1));
    if(portfolioCropper)portfolioCropper.zoomTo(v);
    const output=$("portfolio-crop-zoom-value");
    if(output)output.textContent=`${Math.round(v*100)}%`;
  });
  $("portfolio-crop-modal")?.addEventListener("click",event=>{if(event.target.id==="portfolio-crop-modal")closePortfolioCropEditor();});

  const portfolioImagePreview = $("portfolio-image-preview");
  portfolioImagePreview?.addEventListener("pointerdown", event => {
    const zone = event.target instanceof Element ? event.target.closest("[data-portfolio-paste-zone]") : null;
    if (zone) window.portfolioActiveUploadSection = zone.dataset.portfolioPasteZone;
  }, true);
  portfolioImagePreview?.addEventListener("focusin", event => {
    const zone = event.target instanceof Element ? event.target.closest("[data-portfolio-paste-zone]") : null;
    if (zone) window.portfolioActiveUploadSection = zone.dataset.portfolioPasteZone;
  });
  // Capture paste at document level so the upload zones receive screenshots
  // even when the browser focus remains on the surrounding form/panel.
  document.addEventListener("paste", event => {
    const form = $("portfolio-create-form");
    if (!form || form.classList.contains("hidden") || !portfolioImagePreview) return;

    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

    const clipboard = event.clipboardData;
    const items = [...(clipboard?.items || [])];
    let pastedImages = items
      .filter(item => item.kind === "file" && /^image\//i.test(item.type || ""))
      .map(item => item.getAsFile())
      .filter(Boolean);
    if (!pastedImages.length && clipboard?.files?.length) {
      pastedImages = [...clipboard.files].filter(file => file.type.startsWith("image/"));
    }
    if (!pastedImages.length) return;

    const activeElement = document.activeElement;
    if (activeElement?.closest?.("input, textarea, select, [contenteditable='true']")) return;

    const zoneKeys = [...portfolioImagePreview.querySelectorAll("[data-portfolio-paste-zone]")].map(zone => zone.dataset.portfolioPasteZone);
    const eventZone = (event.composedPath?.() || []).find(node => node instanceof Element && node.matches?.("[data-portfolio-paste-zone]"));
    const focusedZone = activeElement instanceof Element ? activeElement.closest("[data-portfolio-paste-zone]") : null;
    const selectedSection = eventZone?.dataset.portfolioPasteZone || focusedZone?.dataset.portfolioPasteZone || window.portfolioActiveUploadSection;
    const sectionKey = zoneKeys.includes(selectedSection) ? selectedSection : zoneKeys[0];
    if (!sectionKey) return;

    event.preventDefault();
    window.portfolioActiveUploadSection = sectionKey;
    const added = addPortfolioImagesToSection(pastedImages, sectionKey);
    if (!added && pastedImages.length) {
      const hint = portfolioImagePreview.querySelector("[data-portfolio-paste-zone]");
      hint?.classList.add("is-paste-target");
      window.setTimeout(() => hint?.classList.remove("is-paste-target"), 700);
    }
  }, true);

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
    const zone = event.target.closest("[data-portfolio-paste-zone]");
    const hasExternalFiles = [...(event.dataTransfer?.types || [])].includes("Files");
    if (zone && hasExternalFiles) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      zone.classList.add("is-paste-target");
      return;
    }
    if (event.target.closest(".portfolio-preview-item")) event.preventDefault();
  });
  $("portfolio-image-preview")?.addEventListener("dragenter", event => {
    const zone = event.target.closest("[data-portfolio-paste-zone]");
    if (zone && [...(event.dataTransfer?.types || [])].includes("Files")) {
      event.preventDefault();
      zone.classList.add("is-paste-target");
    }
  });
  $("portfolio-image-preview")?.addEventListener("dragleave", event => {
    const zone = event.target.closest("[data-portfolio-paste-zone]");
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove("is-paste-target");
  });
  $("portfolio-image-preview")?.addEventListener("drop", (event) => {
    const zone = event.target.closest("[data-portfolio-paste-zone]");
    const droppedFiles = [...(event.dataTransfer?.files || [])].filter(file => file.type.startsWith("image/"));
    if (zone && droppedFiles.length) {
      event.preventDefault();
      event.stopPropagation();
      zone.classList.remove("is-paste-target");
      addPortfolioImagesToSection(droppedFiles, zone.dataset.portfolioPasteZone);
      return;
    }
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
    $("portfolio-image-preview")?.querySelectorAll(".is-paste-target").forEach(zone => zone.classList.remove("is-paste-target"));
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
  if (event?.status === "cancelled") return "cancelled";
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
    const label=stage==="cancelled"?"CANCELLED":stage==="published"?"PUBLISHED":stage==="draft"?"DRAFT":"กำลังจัดตี้";
    const partyCount=config.raidCount*5,memberCapacity=config.raidCount*30;
    const deleteAction=event.registration_type==="official"&&!event.created_by?"":'<button class="btn btn-danger btn-sm" type="button" data-war-delete="'+escapeHTML(event.id)+'">ลบวอร์</button>';
    const eventDetail=config.mode==="practice"
      ? `ซ้อมวอร์ ${formatDate(event.event_date)} · ${formatTime(event.start_time)} น. · ${config.raidCount} Raid · ${partyCount} ปาร์ตี้ · รองรับ ${memberCapacity} คน`
      : `วอร์จริงวันเสาร์ ${formatDate(event.event_date)} · ${config.rounds?.length||1} รอบ (${(config.rounds?.length?config.rounds:[formatTime(event.start_time)]).join(" / ")}) น. · ${config.raidCount} Raid · ${partyCount} ปาร์ตี้ · รองรับ ${memberCapacity} คน`;
    return `<article class="war-event-card war-event-card-selectable"><div class="war-event-main"><h3>${escapeHTML(event.event_name)}</h3><p>${eventDetail}</p>${description?`<small>${escapeHTML(description)}</small>`:""}</div><div class="war-event-actions"><span class="war-stage-badge war-stage-${stage}">${label}</span><button class="btn btn-outline btn-sm" type="button" data-war-open="${escapeHTML(event.id)}">${stage==="published"?"ดูรายละเอียด":"จัดการตี้"}</button>${deleteAction}</div></article>`;
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
 button.addEventListener("click",()=>exportWarImage(raidName,currentWarAssignmentEventId));
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
 const uploadFile=/^image\/(svg\+xml|gif)$/.test(file.type)?file:await prepareStorageImageForUpload(file,{maxDimension:512,quality:0.88,forceWebP:true});
 const extension=(uploadFile.name.split(".").pop()||"png").toLowerCase().replace(/[^a-z0-9]/g,"")||"png";
 const path=`skills/${Date.now()}-${Math.random().toString(36).slice(2,9)}.${extension}`;
 try{
  const upload=await supabaseClient.storage.from(WAR_SKILL_BUCKET).upload(path,uploadFile,{cacheControl:"3600",upsert:false,contentType:uploadFile.type});
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
 // This submit handler is delegated from document.body, so currentTarget is BODY.
 // Read the actual submitted form and its own named fields to avoid false empty-name validation.
 const form=event.target instanceof HTMLFormElement?event.target:null;
 if(!form||form.id!=="war-skill-edit-form")return;
 const skillId=form.dataset.skillId,skill=warSkillCatalog.find(item=>item.id===skillId);
 const name=String(form.elements.namedItem("skill-name")?.value||"").trim();
 const file=form.elements.namedItem("skill-icon")?.files?.[0]||null;
 const status=form.querySelector("#war-skill-edit-status"),button=form.querySelector("#war-skill-edit-submit");
 if(!skill){if(status)status.textContent="ไม่พบ Skill ที่ต้องการแก้ไข กรุณาปิดหน้าต่างแล้วเปิดใหม่";return;}
 if(!name){if(status)status.textContent="กรุณากรอกชื่อ Skill";form.querySelector("#war-skill-edit-name")?.focus();return;}
 if(file&&(!file.type.startsWith("image/")||file.size>3*1024*1024)){if(status)status.textContent="ไฟล์ต้องเป็นรูปภาพและมีขนาดไม่เกิน 3 MB";return;}
 if(button){button.disabled=true;button.textContent="กำลังบันทึก...";}
 let newPath=null;
 try{
  if(file){
   const uploadFile=/^image\/(svg\+xml|gif)$/.test(file.type)?file:await prepareStorageImageForUpload(file,{maxDimension:512,quality:0.88,forceWebP:true});
   const extension=(uploadFile.name.split(".").pop()||"png").toLowerCase().replace(/[^a-z0-9]/g,"")||"png";
   newPath=`skills/${Date.now()}-${Math.random().toString(36).slice(2,9)}.${extension}`;
   const upload=await supabaseClient.storage.from(WAR_SKILL_BUCKET).upload(newPath,uploadFile,{cacheControl:"3600",upsert:false,contentType:uploadFile.type});
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
  const uploadFile=/^image\/(svg\+xml|gif)$/.test(file.type)?file:await prepareStorageImageForUpload(file,{maxDimension:512,quality:0.88,forceWebP:true});
  const extension=(uploadFile.name.split(".").pop()||"png").toLowerCase().replace(/[^a-z0-9]/g,"")||"png";
  const path=`skills/${Date.now()}-${Math.random().toString(36).slice(2,9)}.${extension}`;
  try{
    const upload=await supabaseClient.storage.from(WAR_SKILL_BUCKET).upload(path,uploadFile,{cacheControl:"3600",upsert:false,contentType:uploadFile.type});
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
 container.innerHTML=Array.from({length:5},(_,i)=>{const n=i+1,p=parties.find(x=>Number(x.party_number)===n),members=p?.war_party_members||[],partyMemberIds=members.map(slot=>slot.member_id).filter(Boolean);
 return `<article class="party-card" data-party-card data-raid="${raidName}"><div class="party-header"><div class="party-heading-fields"><h3>${raidName}${n}</h3>${p?.party_name&&p.party_name!==`${raidName}${n}`?`<small class="war-party-role-label">${escapeHTML(p.party_name)}</small>`:""}</div></div><div class="party-slots">${Array.from({length:6},(_,j)=>{const pos=j+1,slot=members.find(x=>Number(x.position)===pos),member=allMembers.find(x=>x.user_id===slot?.member_id);
 if(slot&&member){const info=getClassInfo(getMemberClass(member));return `<button class="party-slot party-slot-filled war-member-slot" type="button" data-war-manage-slot data-assignment-id="${escapeHTML(slot.id)}" data-party-id="${escapeHTML(p.id)}" data-position="${pos}" ${canArrange?'draggable="true"':""} style="--class-color:${info?.color||"#aaa"}" ${canArrange?"":"disabled"}><img class="war-slot-class-icon" src="${escapeHTML(info?.iconPath||"")}" alt="${escapeHTML(info?.name||"")}"><span class="war-member-identity"><strong class="slot-member-name">${escapeHTML(getMemberName(member))}</strong><small class="war-member-class">${escapeHTML(info?.name||getMemberClass(member))}</small></span><span class="war-member-skills" aria-label="Skill ของสมาชิก">${getMemberSkillIconsMarkup(member.user_id)}</span><span class="war-member-slot-edit">${canArrange?"MANAGE":""}</span></button>`;}
 return `<div class="party-slot ${canArrange&&p?"party-slot-editor":""}" ${canArrange&&p?`data-war-drop-slot data-party-id="${escapeHTML(p.id)}" data-position="${pos}"`:""}>${canArrange&&p?`<button class="war-slot-add-button" type="button" aria-label="เพิ่มสมาชิกในตำแหน่งนี้" data-war-add-slot data-party-id="${escapeHTML(p.id)}" data-position="${pos}"><span class="war-slot-add-icon" aria-hidden="true">+</span><span class="war-slot-add-label">ว่าง</span></button>`:'<span class="slot-empty war-empty-slot-display"><span class="war-slot-add-icon" aria-hidden="true">+</span><span class="war-slot-add-label">ว่าง</span></span>'}</div>`;
 }).join("")}</div></article>`;}).join("");
}

function warMemberStatus(id){const signup=warAssignmentSignups.find(x=>x.member_id===id),leaveRow=warAssignmentLeaves.find(x=>x.member_id===id&&x.status!=="rejected"),snapshot=warAssignmentRosterSnapshot.find(x=>x.member_id===id),alreadyAssigned=currentWarPartyAssignments.some(x=>x.member_id===id),leave=snapshot?.roster_status==="leave"||!!leaveRow;return {signup,leave,leaveRow,snapshot,absent:snapshot?.roster_status==="absent",addedByManagement:snapshot?.roster_status==="added_by_management",reserve:(snapshot?.roster_status==="reserve"||(!snapshot&&!!signup&&Number(signup.queue_position)>=61))&&!alreadyAssigned,raid:signup?.raid||""};}
function getWarAssignmentRosterMembers(){
 const event=allWarEvents.find(item=>item.id===currentWarAssignmentEventId);
 if(!event?.signup_closes_at||Date.now()<new Date(event.signup_closes_at).getTime())return [];
 const signupIds=new Set(warAssignmentSignups.filter(x=>x.status!=="cancelled").map(x=>x.member_id));
 const managementAddedIds=new Set(warAssignmentRosterSnapshot.filter(x=>x.roster_status==="added_by_management").map(x=>x.member_id));
 const snapshotIds=new Set(warAssignmentRosterSnapshot.map(x=>x.member_id));
 return allMembers.filter(m=>(m.active===true||snapshotIds.has(m.user_id))&&(signupIds.has(m.user_id)||managementAddedIds.has(m.user_id)));
}
function renderWarAssignmentToolbar(raidCount=2){
 const root=$("war-assignment-toolbar");if(!root)return;const active=getWarAssignmentRosterMembers(),reserve=warAssignmentRosterSnapshot.length?warAssignmentRosterSnapshot.filter(x=>x.roster_status==="reserve"&&!currentWarPartyAssignments.some(a=>a.member_id===x.member_id)).length:warAssignmentSignups.filter(x=>Number(x.queue_position)>=61).length;
 const leaveIds=new Set([...warAssignmentLeaves.filter(x=>x.status!=="rejected").map(x=>x.member_id),...warAssignmentRosterSnapshot.filter(x=>x.roster_status==="leave").map(x=>x.member_id)]);const teams=["A","B","C","D"].slice(0,raidCount).map(x=>`<button class="war-filter-chip" data-war-filter="${x}" type="button">Raid ${x}</button>`).join("");
 const classes=CLASS_DATA.map(info=>{const count=active.filter(x=>getMemberClass(x).toLowerCase()===info.name.toLowerCase()).length;return `<button class="war-class-filter" data-war-class-filter="${escapeHTML(info.name)}" type="button" title="${escapeHTML(info.name)}"><img src="${escapeHTML(info.iconPath)}" alt=""><span>${count}</span></button>`;}).join("");
 root.innerHTML=`<div class="war-assignment-filter-row"><div class="war-filter-group"><button class="war-filter-chip is-active" data-war-filter="all" type="button">สมาชิกทั้งหมด</button>${teams}<button class="war-filter-chip" data-war-filter="reserve" type="button">สำรอง · ${reserve}</button><button class="war-filter-chip" data-war-filter="leave" type="button">ลาวอร์ · ${leaveIds.size}</button><button class="war-filter-chip" data-war-filter="absent" type="button">ขาดวอร์ · ${warAssignmentAbsentees.length}</button></div></div><div class="war-assignment-search-row"><label class="war-assignment-search"><span>⌕</span><input id="war-assignment-search" type="search" placeholder="ค้นหาชื่อตัวละคร หรือ UID..." value="${escapeHTML(warAssignmentSearch)}"></label><button class="war-count-chip" data-war-filter="all" type="button">TOTAL <strong>${active.length}</strong></button><button class="war-count-chip is-reserve" data-war-filter="reserve" type="button">RESERVE <strong>${reserve}</strong></button></div><div class="war-assignment-class-row"><span class="war-filter-caption">FILTER BY CLASS</span><button class="war-class-filter is-active" data-war-class-filter="all" type="button">ALL</button>${classes}</div><div class="war-assignment-results" id="war-assignment-results" aria-label="ลากสมาชิกจากตี้มาวางที่นี่เพื่อนำออกจากตี้"></div>`;
 applyWarAssignmentMemberFilters();
}
function applyWarAssignmentMemberFilters(){
 const assignedIds=getAssignedWarMemberIds(),q=warAssignmentSearch.trim().toLowerCase(),leaveIds=new Set([...warAssignmentLeaves.filter(x=>x.status!=="rejected").map(x=>x.member_id),...warAssignmentRosterSnapshot.filter(x=>x.roster_status==="leave").map(x=>x.member_id)]),sourceMembers=warAssignmentFilter==="leave"?allMembers.filter(m=>leaveIds.has(m.user_id)):warAssignmentFilter==="absent"?allMembers.filter(m=>m.active===true):getWarAssignmentRosterMembers(),members=sourceMembers.filter(m=>{if(warAssignmentFilter!=="leave"&&assignedIds.has(m.user_id))return false;const st=warMemberStatus(m.user_id);if(warAssignmentFilter==="leave"&&!st.leave)return false;if(warAssignmentFilter==="reserve"&&!st.reserve)return false;if(warAssignmentFilter==="absent"&&!st.absent)return false;if(["A","B","C","D"].includes(warAssignmentFilter)&&st.raid!==warAssignmentFilter)return false;if(warAssignmentClassFilter!=="all"&&getMemberClass(m).toLowerCase()!==warAssignmentClassFilter.toLowerCase())return false;return !q||getMemberName(m).toLowerCase().includes(q)||String(m.game_uid||"").includes(q);});
 const out=$("war-assignment-results");if(out){out.innerHTML=members.length?members.slice(0,40).map(m=>{const info=getClassInfo(getMemberClass(m)),status=warMemberStatus(m.user_id),readOnly=status.leave||status.absent;if(readOnly)return `<div class="war-assignment-member-pill is-leave-readonly" aria-label="สมาชิกสถานะ ${status.leave?"ลาวอร์":"ขาดวอร์"}: ${escapeHTML(getMemberName(m))}" title="${status.leave?"ลาวอร์":"ขาดวอร์"} · ไม่สามารถลากเข้าปาร์ตี้ได้" style="--class-color:${info?.color||"#aaa"}"><img src="${escapeHTML(info?.iconPath||"")}" alt=""><span>${escapeHTML(getMemberName(m))}</span></div>`;return `<button class="war-assignment-member-pill" data-war-pool-member="${escapeHTML(m.user_id)}" ${isManagement()?'draggable="true"':""} type="button" style="--class-color:${info?.color||"#aaa"}" title="${escapeHTML(getMemberName(m))}"><img src="${escapeHTML(info?.iconPath||"")}" alt=""><span>${escapeHTML(getMemberName(m))}</span></button>`;}).join(""):'<p class="war-assignment-no-results">ไม่พบสมาชิกที่ตรงกับตัวกรอง</p>';if(members.length>40)out.insertAdjacentHTML("beforeend",`<small class="war-assignment-more">แสดง 40 จาก ${members.length} คน · ใช้ช่องค้นหาเพื่อจำกัดผลลัพธ์</small>`);}
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
  </div>${getWarBondMarkup(current.user_id,currentWarPartyAssignments.filter(item=>item.party_id===party.id).map(item=>item.member_id))}`:""}
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
 const eligibleIds=new Set(getWarAssignmentRosterMembers().filter(m=>{const status=warMemberStatus(m.user_id);return !status.leave&&!status.absent;}).map(m=>m.user_id));
 const members=allMembers.filter(m=>m.active===true&&eligibleIds.has(m.user_id)&&!assigned.has(m.user_id)).filter(m=>!reserveOnly||warMemberStatus(m.user_id).reserve).filter(m=>cls==="all"||getMemberClass(m).toLowerCase()===cls.toLowerCase()).filter(m=>!q||getMemberName(m).toLowerCase().includes(q)||String(m.game_uid||"").includes(q)).sort((a,b)=>getMemberName(a).localeCompare(getMemberName(b),"th"));
 list.innerHTML=members.length?members.map(m=>{const info=getClassInfo(getMemberClass(m));return `<button class="war-modal-member-option" data-war-modal-assign="${escapeHTML(m.user_id)}" style="--class-color:${info?.color||"#aaa"}" type="button"><img src="${escapeHTML(info?.iconPath||"")}" alt=""><span><strong>${escapeHTML(getMemberName(m))}</strong><small>${escapeHTML(getMemberClass(m))} · UID ${escapeHTML(m.game_uid||"—")}</small></span><b>ADD</b></button>`;}).join(""):'<p class="war-assignment-no-results">ไม่พบสมาชิกที่สามารถเพิ่มได้</p>';
}
async function persistWarMemberToPartySlot(memberId,slot){
 const event=allWarEvents.find(x=>x.id===currentWarAssignmentEventId);
 if(!isManagement()||!event||!slot)return;
 const party=currentWarParties.find(x=>x.id===slot.partyId);if(!party)return;
 if(getAssignedWarMemberIds(slot.assignmentId).has(memberId))throw new Error("สมาชิกคนนี้ถูกจัดลงปาร์ตี้อื่นในวอร์รอบนี้แล้ว");
 const eligible=getWarAssignmentRosterMembers().some(member=>member.user_id===memberId);
 const status=warMemberStatus(memberId);
 if(!eligible||status.leave||status.absent){
  throw new Error(status.leave?"สมาชิกที่แจ้งลาวอร์ไม่สามารถจัดลงปาร์ตี้ได้":"เลือกสมาชิกได้เฉพาะผู้ที่ลงชื่อหรืออยู่ในรายชื่อสำรองเท่านั้น");
 }
 const result=slot.assignmentId
  ?await supabaseClient.from("war_party_members").update({member_id:memberId}).eq("id",slot.assignmentId).select().single()
  :await supabaseClient.from("war_party_members").insert({party_id:slot.partyId,member_id:memberId,position:slot.position}).select().single();
 if(result.error)throw result.error;
 await loadSelectedWarEvent(currentWarAssignmentEventId);
 return true;
}
async function assignWarMemberToSlot(id){
 const slot=warAssignmentModalSlot;if(!slot)return;
 try{const saved=await persistWarMemberToPartySlot(id,slot);if(saved)closeWarAssignmentModal();}
 catch(e){console.error(e);const status=$("war-modal-status");if(status)status.textContent="บันทึกไม่สำเร็จ: "+(e.message||"กรุณาลองใหม่");}
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
    const {data:createdEvent,error:eventError}=await supabaseClient.from("war_events").insert({event_name:`4AM vs ${opponent}`,event_date:eventDate,start_time:startTime,registration_type:mode,description:metadata,status:"open",is_draft_confirmed:false,is_published:false}).select().single();
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
  if(isRolePreviewActive()){
    alert("ขณะนี้กำลังใช้งาน Role Preview จึงไม่สามารถลบข้อมูลจริงได้ กรุณากดออกจาก Preview แล้วลองอีกครั้ง");
    return;
  }
  if(!isManagement()){
    alert("บัญชีนี้ไม่มีสิทธิ์ลบ War Event");
    return;
  }
  const event=allWarEvents.find(item=>item.id===eventId);
  if(!event){
    alert("ไม่พบ War Event นี้ในรายการปัจจุบัน กรุณารีเฟรชหน้าแล้วลองอีกครั้ง");
    return;
  }
  if(!window.confirm(`ยืนยันลบวอร์ "${event.event_name}" (${getWarEventStage(event).toUpperCase()}) ใช่หรือไม่?\\n\\nระบบจะลบข้อมูลปาร์ตี้ สมาชิกในปาร์ตี้ การสมัคร ประวัติการจัดตี้ และกิจกรรมที่ผูกกับวอร์นี้ทั้งหมด ไม่สามารถกู้คืนได้`))return;
  if(button){button.disabled=true;button.textContent="กำลังลบ...";}
  try{
    // Perform the complete deletion in one database transaction through the secured RPC.
    const { error: deleteError } = await supabaseClient.rpc("delete_war_event_secure", {
      p_event_id: eventId
    });
    if(deleteError)throw new Error(deleteError.message);

    const check=await supabaseClient.from("war_events").select("id").eq("id",eventId).maybeSingle();
    if(check.error)throw check.error;
    if(check.data)throw new Error("รายการยังอยู่ในฐานข้อมูลหลังสั่งลบ กรุณาตรวจสอบสิทธิ์ DELETE (RLS) ของตารางที่เกี่ยวข้อง");
    if(selectedWarEventId===eventId)selectedWarEventId=null;
    if(warAttendanceEventId===eventId)warAttendanceEventId=null;
    await loadWarEvents();
    if($("war-attendance-content"))await loadWarAttendance();
    renderWarLayout(selectedWarEventId||undefined);
    alert("ลบ War Event เรียบร้อยแล้ว");
  }catch(error){
    console.error("War event deletion failed:",error);
    alert("ลบวอร์ไม่สำเร็จ: "+(error.message||"เกิดข้อผิดพลาด"));
    if(button){button.disabled=false;button.textContent="ลบวอร์";}
  }
}
// Bind the destructive War Event action at script initialization, independently
// of page-specific listener registration and page re-render timing.
if(!document.documentElement.dataset.warDeleteHandlerBound){
  document.documentElement.dataset.warDeleteHandlerBound="true";
  document.addEventListener("click",event=>{
    const target=event.target instanceof Element?event.target:event.target?.parentElement;
    const deleteButton=target?.closest("[data-war-delete]");
    if(!deleteButton)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void deleteWarEvent(deleteButton.dataset.warDelete,deleteButton);
  },true);
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
async function loadWarHtml2Canvas(){
  if(typeof window.html2canvas==="function")return window.html2canvas;
  if(window.__warHtml2CanvasPromise)return window.__warHtml2CanvasPromise;
  window.__warHtml2CanvasPromise=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.async=true;
    script.onload=()=>typeof window.html2canvas==="function"?resolve(window.html2canvas):reject(new Error("โหลดระบบจับภาพหน้าเว็บไม่สำเร็จ"));
    script.onerror=()=>reject(new Error("โหลดระบบจับภาพหน้าเว็บไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต"));
    document.head.appendChild(script);
  }).catch(error=>{window.__warHtml2CanvasPromise=null;throw error;});
  return window.__warHtml2CanvasPromise;
}
function deliverWarPng(blob,filename){
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download=filename;link.style.display="none";
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
// html2canvas 1.4.1 cannot parse CSS Color 4 color() values.
// Normalize those values only in the cloned capture DOM; the live page is untouched.
function normalizeWarCaptureColorFunctions(value,context,cache){
  const input=String(value||"");
  if(!/color\(/i.test(input))return input;
  let output="",cursor=0;
  while(cursor<input.length){
    const start=input.toLowerCase().indexOf("color(",cursor);
    if(start<0){output+=input.slice(cursor);break;}
    output+=input.slice(cursor,start);
    let depth=1,end=start+6;
    while(end<input.length&&depth>0){
      if(input[end]==="(")depth++;
      else if(input[end]===")")depth--;
      end++;
    }
    if(depth!==0){output+=input.slice(start);break;}
    const token=input.slice(start,end);
    if(!cache.has(token)){
      context.clearRect(0,0,1,1);
      context.fillStyle="#000";
      context.fillStyle=token;
      context.fillRect(0,0,1,1);
      const pixel=context.getImageData(0,0,1,1).data;
      cache.set(token,"rgba("+pixel[0]+", "+pixel[1]+", "+pixel[2]+", "+(pixel[3]/255)+")");
    }
    output+=cache.get(token);
    cursor=end;
  }
  return output;
}
function normalizeWarCaptureCloneColors(clonedDocument){
  const canvas=clonedDocument.createElement("canvas");
  canvas.width=canvas.height=1;
  const context=canvas.getContext("2d",{willReadFrequently:true});
  if(context){
    const cache=new Map();
    const nodes=[clonedDocument.documentElement,...clonedDocument.querySelectorAll("body *")];
    nodes.forEach(node=>{
      if(!node||node.nodeType!==1)return;
      const computed=clonedDocument.defaultView.getComputedStyle(node);
      for(let index=0;index<computed.length;index++){
        const property=computed[index],value=computed.getPropertyValue(property);
        if(!/color\(/i.test(value))continue;
        const normalized=normalizeWarCaptureColorFunctions(value,context,cache);
        if(normalized!==value)node.style.setProperty(property,normalized,"important");
      }
    });
  }
  // Expand the complete Raid strip in the capture clone. The scroll width
  // belongs to .raid-grid, not its .raid-section parent, so expand both.
  clonedDocument.querySelectorAll(".raid-section .raid-grid,.war-attendance-boards .raid-grid").forEach(grid=>{
    const fullWidth=Math.max(grid.scrollWidth,grid.clientWidth,grid.getBoundingClientRect().width);
    grid.style.setProperty("overflow","visible","important");
    grid.style.setProperty("width",fullWidth+"px","important");
    grid.style.setProperty("min-width",fullWidth+"px","important");
    grid.style.setProperty("max-width","none","important");
    grid.style.setProperty("grid-template-columns","repeat(5,minmax(380px,1fr))","important");
    const section=grid.closest(".raid-section");
    if(section){
      section.style.setProperty("width",fullWidth+"px","important");
      section.style.setProperty("min-width",fullWidth+"px","important");
      section.style.setProperty("max-width","none","important");
      section.style.setProperty("overflow","visible","important");
    }
  });

}
async function captureWarDomElement(element,filename,event=null){
  if(!element)throw new Error("ไม่พบตารางที่ต้องการบันทึกภาพ");
  const html2canvas=await loadWarHtml2Canvas();
  if(document.fonts?.ready)await document.fonts.ready;
  const raidGrid=element.querySelector(".raid-grid");
  const liveCards=raidGrid?[...raidGrid.children]:[];
  const cardWidth=Math.max(380,...liveCards.map(card=>Math.ceil(card.getBoundingClientRect().width||0)));
  const gridGap=raidGrid?parseFloat(getComputedStyle(raidGrid).columnGap)||8:8;
  const columns=Math.max(5,liveCards.length);
  const fullGridWidth=raidGrid?Math.max(raidGrid.scrollWidth,cardWidth*columns+gridGap*(columns-1)):0;
  // Leave a generous canvas margin around the complete Raid board.
  const capturePadding=104;
  const captureWidth=Math.max(element.clientWidth,fullGridWidth)+capturePadding*2;
  const eventType=event?.registration_type==="practice"?"ซ้อมวอร์":"Guild War";
  const eventTime=event?.start_time?formatTime(event.start_time)+" น.":"ไม่ระบุเวลา";
  const eventDate=event?.event_date?formatDate(event.event_date):"";
  const canvas=await html2canvas(element,{
    scale:2,
    useCORS:true,
    allowTaint:false,
    backgroundColor:null,
    logging:false,
    width:captureWidth,
    windowWidth:captureWidth,
    height:Math.max(element.scrollHeight,element.clientHeight)+100+capturePadding*2,
    scrollX:0,
    scrollY:-window.scrollY,
    onclone:clonedDocument=>{
      normalizeWarCaptureCloneColors(clonedDocument);
      const raid=element.dataset?.raidSection;
      const clonedSection=raid?clonedDocument.querySelector('[data-raid-section="'+raid+'"]'):null;
      const clonedGrid=clonedSection?.querySelector(".raid-grid");
      if(clonedSection&&clonedGrid){
        const cards=[...clonedGrid.children];
        // Recreate the live War page's class-colored member-card treatment in
        // the export clone. The published attendance page is outside #page-war,
        // so its scoped live-page CSS would otherwise be missing in the PNG.
        const toClassRgba=(value,alpha)=>{
          const raw=String(value||"").trim();
          let parts=null;
          const hex=raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
          if(hex){
            const full=hex[1].length===3?hex[1].split("").map(char=>char+char).join(""):hex[1];
            parts=[parseInt(full.slice(0,2),16),parseInt(full.slice(2,4),16),parseInt(full.slice(4,6),16)];
          }else{
            const rgb=raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
            if(rgb)parts=[Number(rgb[1]),Number(rgb[2]),Number(rgb[3])];
          }
          if(!parts)parts=[170,170,170];
          return "rgba("+parts[0]+","+parts[1]+","+parts[2]+","+alpha+")";
        };
        clonedSection.classList.add("war-export-capture");
        clonedGrid.querySelectorAll(".war-member-slot").forEach(memberCard=>{
          const color=clonedDocument.defaultView.getComputedStyle(memberCard).getPropertyValue("--class-color").trim()||memberCard.style.getPropertyValue("--class-color").trim();
          const glow=toClassRgba(color,.42);
          memberCard.style.setProperty("display","flex","important");
          memberCard.style.setProperty("box-sizing","border-box","important");
          memberCard.style.setProperty("align-items","center","important");
          memberCard.style.setProperty("gap","13px","important");
          memberCard.style.setProperty("min-width","0","important");
          memberCard.style.setProperty("min-height","108px","important");
          memberCard.style.setProperty("height","108px","important");
          memberCard.style.setProperty("padding","12px 10px","important");
          memberCard.style.setProperty("border","1px solid "+toClassRgba(color,.96),"important");
          memberCard.style.setProperty("border-radius","11px","important");
          memberCard.style.setProperty("background","linear-gradient(112deg,"+toClassRgba(color,.24)+",rgba(18,17,30,.42))","important");
          memberCard.style.setProperty("border-width","2px","important");
          memberCard.style.setProperty("box-shadow","0 0 7px "+toClassRgba(color,.95)+",0 0 18px "+toClassRgba(color,.72)+",0 0 34px "+toClassRgba(color,.42)+",inset 0 0 20px "+toClassRgba(color,.2)+",inset 0 1px 0 rgba(255,255,255,.12)","important");
          const classIcon=memberCard.querySelector(".war-slot-class-icon");
          if(classIcon){classIcon.style.setProperty("display","block","important");classIcon.style.setProperty("width","58px","important");classIcon.style.setProperty("height","58px","important");classIcon.style.setProperty("flex","0 0 58px","important");classIcon.style.setProperty("object-fit","contain","important");}
          const identity=memberCard.querySelector(".war-member-identity");
          if(identity){identity.style.setProperty("display","flex","important");identity.style.setProperty("flex","1 1 auto","important");identity.style.setProperty("min-width","0","important");identity.style.setProperty("flex-direction","column","important");identity.style.setProperty("align-items","flex-start","important");identity.style.setProperty("justify-content","center","important");identity.style.setProperty("gap","4px","important");}
          const memberName=memberCard.querySelector(".slot-member-name");
          if(memberName){memberName.style.setProperty("display","block","important");memberName.style.setProperty("max-width","100%","important");memberName.style.setProperty("overflow","hidden","important");memberName.style.setProperty("color","#fff","important");memberName.style.setProperty("font-size","15px","important");memberName.style.setProperty("line-height","1.25","important");memberName.style.setProperty("font-weight","850","important");memberName.style.setProperty("text-overflow","ellipsis","important");memberName.style.setProperty("white-space","nowrap","important");}
          const memberClass=memberCard.querySelector(".war-member-class");
          if(memberClass){memberClass.style.setProperty("color",color||"#aaa","important");memberClass.style.setProperty("font-size","15px","important");memberClass.style.setProperty("line-height","1.15","important");memberClass.style.setProperty("font-weight","950","important");memberClass.style.setProperty("letter-spacing","1px","important");}
          const skills=memberCard.querySelector(".war-member-skills");
          if(skills){skills.style.setProperty("display","flex","important");skills.style.setProperty("flex","0 0 auto","important");skills.style.setProperty("align-items","center","important");skills.style.setProperty("gap","4px","important");skills.style.setProperty("max-width","205px","important");}
          memberCard.querySelectorAll(".war-member-skill-icon").forEach(skillIcon=>{skillIcon.style.setProperty("width","46px","important");skillIcon.style.setProperty("height","46px","important");skillIcon.style.setProperty("flex","0 0 46px","important");skillIcon.style.setProperty("object-fit","contain","important");skillIcon.style.setProperty("filter","drop-shadow(0 2px 4px rgba(0,0,0,.5))","important");});
        });
        const cardW=Math.max(380,...cards.map(card=>Math.ceil(card.getBoundingClientRect().width||0)));
        const gap=8;
        const count=Math.max(5,cards.length);
        const width=cardW*count+gap*(count-1);
        clonedSection.style.setProperty("display","block","important");
        clonedSection.style.setProperty("box-sizing","border-box","important");
        clonedSection.style.setProperty("padding","56px","important");
        clonedSection.style.setProperty("background","#09090d","important");
        clonedSection.style.setProperty("border-radius","22px","important");
        clonedSection.style.setProperty("width",(width+capturePadding*2)+"px","important");
        clonedSection.style.setProperty("min-width",(width+capturePadding*2)+"px","important");
        clonedSection.style.setProperty("max-width","none","important");
        clonedSection.style.setProperty("overflow","visible","important");
        clonedGrid.style.setProperty("display","grid","important");
        clonedGrid.style.setProperty("grid-template-columns","repeat("+count+","+cardW+"px)","important");
        clonedGrid.style.setProperty("column-gap",gap+"px","important");
        clonedGrid.style.setProperty("width",width+"px","important");
        clonedGrid.style.setProperty("min-width",width+"px","important");
        clonedGrid.style.setProperty("max-width","none","important");
        clonedGrid.style.setProperty("overflow","visible","important");
        clonedGrid.style.setProperty("padding-right","0","important");
        clonedGrid.style.setProperty("scrollbar-width","none","important");
        const header=clonedDocument.createElement("div");
        header.className="war-export-image-heading";
        header.style.cssText="box-sizing:border-box;width:100%;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 4px 26px;margin:0 0 28px;border-bottom:2px solid rgba(190,45,60,.55);";
        const identity=clonedDocument.createElement("div");
        identity.style.cssText="display:flex;flex-direction:column;gap:7px;min-width:0;";
        const guild=clonedDocument.createElement("strong");
        guild.textContent="◥◣④AM◥◣";
        guild.style.cssText="font-size:34px;font-weight:900;letter-spacing:2px;color:#ff5365;text-shadow:0 0 12px rgba(220,40,65,.32);";
        const label=clonedDocument.createElement("span");
        label.textContent=eventType+" · "+(event?.event_name||"Guild War");
        label.style.cssText="font-size:20px;font-weight:800;color:#f4e9eb;";
        identity.append(guild,label);
        const details=clonedDocument.createElement("div");
        details.textContent=(eventDate?eventDate+"  ·  ":"")+"เวลา "+eventTime;
        details.style.cssText="flex:0 0 auto;text-align:right;font-size:19px;font-weight:800;color:#f4e9eb;white-space:nowrap;";
        header.append(identity,details);
        const raidTitle=clonedSection.querySelector(".raid-title");
        clonedSection.insertBefore(header,raidTitle||clonedGrid);
      }
    },
    ignoreElements:node=>node?.classList?.contains("war-raid-image-button")||node?.classList?.contains("war-party-image-button")
  });
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error("สร้างไฟล์ PNG ไม่สำเร็จ")),"image/png"));
  deliverWarPng(blob,filename);
}
function getWarExportDate(eventId){
  const event=allWarEvents.find(item=>item.id===eventId)||warAttendanceEvents.find(item=>item.id===eventId);
  return event?.event_date||new Date().toISOString().slice(0,10);
}
async function exportWarImage(raidFilter=null,eventId=selectedWarEventId){
  const event=allWarEvents.find(item=>item.id===eventId);
  if(!event){alert("ไม่พบกิจกรรมวอร์ที่ต้องการบันทึกภาพ กรุณาปิดหน้าต่างจัดตี้แล้วเปิดใหม่อีกครั้ง");return;}
  if(!event.is_draft_confirmed){alert("กรุณายืนยันการสร้างตี้วอร์ก่อน จึงจะสามารถบันทึกเป็นรูปภาพได้");return;}
  const sections=[...document.querySelectorAll("#war-raid-boards [data-raid-section]")];
  const targets=raidFilter?sections.filter(section=>section.dataset.raidSection===raidFilter):sections;
  if(!targets.length){alert("ไม่พบตาราง Raid ที่ต้องการบันทึกภาพ");return;}
  try{
    for(const section of targets){
      const raid=section.dataset.raidSection;
      await captureWarDomElement(section,`4AM-War-Raid-${raid}-${getWarExportDate(eventId)}.png`,event);
    }
  }catch(error){
    console.error("War DOM image capture failed:",error);
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
    button.type="button";button.className="btn btn-outline btn-sm war-party-image-button";
    button.textContent="บันทึกรูปตี้";
    button.addEventListener("click",()=>exportWarPartyImage(party.id,party.raid+String(party.party_number),party.event_id));
    header.appendChild(button);
  });
}
async function exportWarPartyImage(partyId,partyLabel="",eventIdHint=null){
  const party=currentWarParties.find(item=>item.id===partyId)||null;
  const candidates=[...document.querySelectorAll(".party-card")];
  const label=partyLabel||(party?party.raid+String(party.party_number):"");
  const card=candidates.find(item=>item.querySelector(".party-header h3")?.textContent?.trim()===label);
  if(!card){alert("ไม่พบการ์ดตี้บนหน้าจอ กรุณาเปิดหน้ารายชื่อตี้ก่อนบันทึกภาพ");return;}
  const eventId=eventIdHint||party?.event_id||warAttendanceEventId||selectedWarEventId;
  try{
    await captureWarDomElement(card,`4AM-War-Party-${label}-${getWarExportDate(eventId)}.png`);
  }catch(error){
    console.error("War party DOM image capture failed:",error);
    alert("บันทึกรูปตี้ไม่สำเร็จ: "+(error.message||"เกิดข้อผิดพลาด"));
  }
}
window.exportWarPartyImage=exportWarPartyImage;

async function loadWarAttendance(){
  const container=$("war-attendance-content");if(!container)return;container.innerHTML='<p class="muted">กำลังโหลดวอร์ที่เผยแพร่แล้ว...</p>';
  const {data,error}=await supabaseClient.from("war_events").select("id,event_name,event_date,start_time,description").eq("is_published",true).order("event_date",{ascending:false});
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

const WAR_RECORD_BUCKET="war-record-images";
let warMatchRecords=[];
let warRecordEvents=[];
let warAttendanceEditEventId=null;
let warMatchRecordViewType="official";
function showWarRecordMessage(m,bad=false){const e=$("war-record-message");if(!e)return;e.textContent=m;e.classList.remove("hidden","error","success");e.classList.add(bad?"error":"success");}
function isWarRecordEventCancelled(event){return ["cancelled","canceled","deleted"].includes(String(event?.status||"").toLowerCase());}
function isWarRecordEventFuture(event){
 const date=String(event?.event_date||"");
 if(!date)return false;
 const time=String(event?.start_time||"23:59:59").slice(0,8);
 const scheduled=new Date(date+"T"+time+"+07:00");
 return !Number.isNaN(scheduled.getTime())&&scheduled.getTime()>Date.now();
}
function renderWarRecordEventOptions(selectedEventId="",includeRecorded=false){
 const select=$("war-record-event");if(!select)return;
 const recorded=new Set((warMatchRecords||[]).map(x=>x.event_id).filter(Boolean));
 const events=(warRecordEvents||[]).filter(x=>x.registration_type===warMatchRecordViewType&&!isWarRecordEventCancelled(x));
 const available=events.filter(x=>!recorded.has(x.id)|| (includeRecorded&&x.id===selectedEventId));
 const editingRecorded=Boolean(includeRecorded&&selectedEventId&&recorded.has(selectedEventId));
 const past=available.filter(x=>!isWarRecordEventFuture(x)&&!(editingRecorded&&x.id===selectedEventId));
 const future=available.filter(x=>isWarRecordEventFuture(x)&&!(editingRecorded&&x.id===selectedEventId));
 select.innerHTML='<option value="">เลือกกิจกรรมที่แข่งขันแล้ว</option>'+
  past.map(x=>'<option value="'+escapeHTML(x.id)+'">'+escapeHTML(x.event_name)+' · '+formatDate(x.event_date)+' '+formatTime(x.start_time)+'</option>').join("")+
  future.map(x=>'<option value="'+escapeHTML(x.id)+'" disabled>'+escapeHTML(x.event_name)+' · '+formatDate(x.event_date)+' '+formatTime(x.start_time)+' · ยังไม่ถึงวันแข่ง</option>').join("");
 if(editingRecorded){
  const event=available.find(x=>x.id===selectedEventId);
  select.insertAdjacentHTML("beforeend",'<option value="'+escapeHTML(event.id)+'" disabled>'+escapeHTML(event.event_name)+' · บันทึกผลแล้ว (กำลังแก้ไข)</option>');
  select.value=selectedEventId;
 }else if(selectedEventId&&available.some(x=>x.id===selectedEventId))select.value=selectedEventId;
 else select.value="";
 const hint=$("war-record-event-hint");
 if(hint){
  const done=events.filter(x=>recorded.has(x.id)).length;
  hint.textContent=(past.length?"เลือกกิจกรรมที่แข่งขันแล้วและยังไม่มีผลได้":"ยังไม่มีกิจกรรมที่ผ่านมาและรอบันทึกผล")+
   (future.length?" · มีกิจกรรมในอนาคต "+future.length+" รายการที่ล็อกไว้":"")+
   (done?" · บันทึกผลแล้ว "+done+" รายการ":"");
 }
}
async function loadWarRecordEvents(){
 const q=await supabaseClient.from("war_events").select("id,event_name,event_date,start_time,status,registration_type").order("event_date",{ascending:false}).order("start_time",{ascending:false});
 if(q.error){showWarRecordMessage("โหลดกิจกรรมวอร์ไม่สำเร็จ: "+q.error.message,true);return;}
 warRecordEvents=q.data||[];
 renderWarRecordEventOptions();
}
function syncWarRecordEventFields(){
 const event=warRecordEvents.find(x=>x.id===$("war-record-event")?.value);
 const date=$("war-record-date");
 if(date){date.value=event?.event_date||"";date.readOnly=true;}
 const type=$("war-record-type");
 if(type){type.value=warMatchRecordViewType;type.disabled=true;}
 const opponent=$("war-record-opponent");
 if(opponent&&event&&!opponent.value){
  const match=String(event.event_name||"").match(/^4AM\s+vs\s+(.+)$/i);
  if(match)opponent.value=match[1].trim();
 }
}
async function loadWarMatchRecords(){
 if(!isManagement())return;
 const box=$("war-record-history");if(box)box.innerHTML='<p class="muted">กำลังโหลดประวัติผลวอร์...</p>';
 const q=await supabaseClient.from("war_match_records").select("id,event_id,opponent_guild,war_date,result,image_paths,registration_type").eq("is_confirmed",true).order("war_date",{ascending:false}).order("created_at",{ascending:false});
 if(q.error){if(box)box.innerHTML='<div class="system-role-error">'+escapeHTML(q.error.message)+'<br>กรุณาตรวจสอบโครงสร้างตารางผลวอร์</div>';return;}
 warMatchRecords=q.data||[];
 await loadWarRecordEvents();
 await renderWarMatchRecords();
}
async function renderWarMatchRecords(){
 const r=(warMatchRecords||[]).filter(x=>(x.registration_type||"official")===warMatchRecordViewType),w=r.filter(x=>x.result==="win").length,l=r.filter(x=>x.result==="loss").length,n=w+l,p=x=>n?(x/n*100).toFixed(1):"0.0";
 const modeLabel=warMatchRecordViewType==="practice"?"ซ้อมวอร์ (SCRIM)":"วอร์จริง (GUILD WAR)";const modeLabelEl=$("war-record-current-mode");if(modeLabelEl)modeLabelEl.textContent=modeLabel;
 $("war-record-total").textContent=n;$("war-record-wins").textContent=w;$("war-record-losses").textContent=l;$("war-record-win-rate").textContent=p(w)+"% Win Rate";$("war-record-loss-rate").textContent=p(l)+"% Loss Rate";$("war-record-opponent-count").textContent=new Set(r.map(x=>String(x.opponent_guild||"").trim().toLowerCase()).filter(Boolean)).size;
 const g={};r.forEach(x=>{const k=x.opponent_guild;if(!g[k])g[k]={w:0,l:0};g[k][x.result==="win"?"w":"l"]++;});
 const stats=$("war-record-opponent-stats");if(stats){const names=Object.keys(g).sort((a,b)=>a.localeCompare(b,"th"));stats.innerHTML=names.length?'<div class="war-record-table-wrap"><table class="war-record-table"><thead><tr><th>กิลด์</th><th>แข่ง</th><th>4AM ชนะ</th><th>4AM แพ้</th><th>ชนะ %</th><th>แพ้ %</th></tr></thead><tbody>'+names.map(k=>{const x=g[k],t=x.w+x.l;return "<tr><td>"+escapeHTML(k)+"</td><td>"+t+"</td><td>"+x.w+"</td><td>"+x.l+"</td><td>"+(x.w/t*100).toFixed(1)+"%</td><td>"+(x.l/t*100).toFixed(1)+"%</td></tr>";}).join("")+"</tbody></table></div>":'<div class="empty-state"><h3>ยังไม่มีผลวอร์</h3></div>';}
 const box=$("war-record-history");if(!box)return;if(!r.length){box.innerHTML='<div class="empty-state"><h3>ยังไม่มีประวัติผลวอร์</h3></div>';return;}
 const urls=await Promise.all(r.map(async x=>Promise.all((x.image_paths||[]).map(async path=>{const z=await supabaseClient.storage.from(WAR_RECORD_BUCKET).createSignedUrl(path,3600);return z.error?"":z.data.signedUrl;}))));
 const warLightboxImages=[];
 const imageButtons=urls.map((list,i)=>list.filter(Boolean).map((url,j)=>{
  const index=warLightboxImages.push({url,label:"ผลวอร์ · "+(r[i].opponent_guild||"คู่แข่ง")+" · "+formatWarRecordDate(r[i].war_date)+" · หลักฐาน "+(j+1)})-1;
  return '<button type="button" class="war-record-image-open" data-war-record-lightbox-index="'+index+'" aria-label="ดูภาพหลักฐานผลวอร์แบบเต็มหน้าจอ"><img src="'+escapeHTML(url)+'" alt="หลักฐานผลวอร์ '+(j+1)+'" loading="lazy"></button>';
 }));
 window.portfolioLightboxImages=warLightboxImages;window.portfolioLightboxIndex=0;
 box.innerHTML='<div class="war-record-table-wrap"><table class="war-record-table"><thead><tr><th>วันที่</th><th>กิจกรรม</th><th>คู่แข่ง</th><th>ผล</th><th>รูป</th><th>จัดการ</th></tr></thead><tbody>'+r.map((x,i)=>{
  const event=warRecordEvents.find(item=>item.id===x.event_id);
  return '<tr><td>'+formatWarRecordDate(x.war_date)+'</td><td>'+escapeHTML(event?.event_name||"กิจกรรมวอร์")+'</td><td>'+escapeHTML(x.opponent_guild)+'</td><td><span class="war-record-result '+x.result+'">'+(x.result==="win"?"4AM ชนะ":"4AM แพ้")+'</span></td><td><div class="war-record-images">'+imageButtons[i].join("")+'</div></td><td><div class="war-record-row-actions"><button class="btn btn-outline btn-sm" type="button" data-war-record-edit="'+escapeHTML(x.id)+'">แก้ไข</button><button class="btn btn-danger btn-sm" type="button" data-war-record-delete="'+escapeHTML(x.id)+'">ลบ</button></div></td></tr>';
 }).join("")+'</tbody></table></div>';
 box.querySelectorAll("[data-war-record-lightbox-index]").forEach(button=>button.addEventListener("click",()=>openPortfolioLightbox(Number(button.dataset.warRecordLightboxIndex))));
}
function resetWarRecordEditor(){
 $("war-record-form")?.reset();
 const type=$("war-record-type");if(type){type.value=warMatchRecordViewType;type.disabled=true;}
 const eventSelect=$("war-record-event");if(eventSelect){eventSelect.disabled=false;renderWarRecordEventOptions();}
 const date=$("war-record-date");if(date){date.value="";date.readOnly=true;}
 $("war-record-edit-id").value="";$("war-record-existing-images").innerHTML="";$("war-record-images").required=true;$("war-record-submit").textContent="ยืนยันและบันทึกผลวอร์";$("war-record-cancel-edit")?.classList.add("hidden");$("war-record-message")?.classList.add("hidden");
}
async function startEditWarMatchRecord(id){
 if(!isManagement())return;
 const x=warMatchRecords.find(r=>r.id===id);if(!x)return;
 $("war-record-edit-id").value=x.id;
 renderWarRecordEventOptions(x.event_id,true);
 $("war-record-event").disabled=true;
 $("war-record-opponent").value=x.opponent_guild||"";
 $("war-record-date").value=x.war_date||"";$("war-record-date").readOnly=true;
 $("war-record-type").value=x.registration_type||"official";$("war-record-type").disabled=true;
 $("war-record-result").value=x.result||"";$("war-record-images").value="";$("war-record-images").required=false;
 $("war-record-submit").textContent="บันทึกการแก้ไขผลวอร์";$("war-record-cancel-edit").classList.remove("hidden");
 const links=await Promise.all((x.image_paths||[]).map(async path=>{const q=await supabaseClient.storage.from(WAR_RECORD_BUCKET).createSignedUrl(path,3600);return q.error?"":'<a href="'+escapeHTML(q.data.signedUrl)+'" target="_blank" rel="noopener">ดูรูปเดิม</a>';}));
 $("war-record-existing-images").innerHTML=links.filter(Boolean).join(" · ")||"ไม่มีรูปเดิม";
 $("war-record-form").scrollIntoView({behavior:"smooth",block:"center"});
}
async function deleteWarMatchRecord(id,button){
 if(!isManagement())return;
 const x=warMatchRecords.find(r=>r.id===id);if(!x||!confirm("ยืนยันลบผลวอร์และรูปหลักฐานทั้งหมดใช่หรือไม่?"))return;
 button.disabled=true;button.textContent="กำลังลบ...";
 const q=await supabaseClient.from("war_match_records").delete().eq("id",id).select("id").single();
 if(q.error){alert("ลบไม่สำเร็จ: "+q.error.message);button.disabled=false;button.textContent="ลบ";return;}
 if(x.image_paths?.length){const rm=await supabaseClient.storage.from(WAR_RECORD_BUCKET).remove(x.image_paths);if(rm.error)console.warn(rm.error);}
 await loadWarMatchRecords();
}
async function saveWarMatchRecord(form){
 if(!isManagement())return;
 const editId=$("war-record-edit-id").value,old=editId?warMatchRecords.find(x=>x.id===editId):null;
 const eventId=editId?old?.event_id:$("war-record-event").value;
 const selectedEvent=warRecordEvents.find(x=>x.id===eventId);
 const registrationType=selectedEvent?.registration_type;
 const opponent=$("war-record-opponent").value.trim(),date=selectedEvent?.event_date||"",result=$("war-record-result").value;
 const files=Array.from($("war-record-images").files||[]),btn=$("war-record-submit");
 if(!selectedEvent||isWarRecordEventCancelled(selectedEvent)){showWarRecordMessage("กรุณาเลือกกิจกรรมวอร์ที่ยังเปิดให้บันทึกผล",true);return;}
 if(registrationType!==warMatchRecordViewType){showWarRecordMessage("ประเภทกิจกรรมไม่ตรงกับแท็บที่เลือก กรุณาเลือกใหม่",true);return;}
 if(!editId&&isWarRecordEventFuture(selectedEvent)){showWarRecordMessage("กิจกรรมนี้ยังไม่ถึงเวลาแข่งขัน จึงยังบันทึกผลไม่ได้",true);return;}
 if((warMatchRecords||[]).some(x=>x.event_id===eventId&&x.id!==editId)){showWarRecordMessage("กิจกรรมนี้มีการบันทึกผลแล้ว ไม่สามารถบันทึกซ้ำได้",true);return;}
 if(!opponent||!date||!["win","loss"].includes(result)||(!editId&&!files.length)){showWarRecordMessage("กรุณากรอกชื่อกิลด์คู่แข่ง เลือกผลการแข่งขัน และแนบรูปภาพให้ครบ",true);return;}
 if(files.length>10||files.some(f=>!f.type.startsWith("image/")||f.size>10485760)){showWarRecordMessage("แนบรูปได้สูงสุด 10 รูป และไม่เกิน 10 MB ต่อรูป",true);return;}
 if(editId&&!old){showWarRecordMessage("ไม่พบรายการที่ต้องการแก้ไข กรุณาโหลดหน้าใหม่",true);return;}
 btn.disabled=true;const newPaths=[];btn.textContent=editId?"กำลังบันทึกการแก้ไข...":"กำลังอัปโหลดและยืนยัน...";
 try{
  for(const file of files){
   const uploadFile=file.type==="image/gif"?file:await prepareStorageImageForUpload(file,{maxDimension:2400,quality:0.9,forceWebP:true});
   const id=crypto.randomUUID?.()||String(Date.now())+Math.random().toString(16).slice(2),path=currentUser.id+"/"+id+"-"+uploadFile.name.replace(/[^a-zA-Z0-9._-]/g,"_"),up=await supabaseClient.storage.from(WAR_RECORD_BUCKET).upload(path,uploadFile,{upsert:false,contentType:uploadFile.type});
   if(up.error)throw up.error;newPaths.push(path);
  }
  const payload={event_id:eventId,registration_type:registrationType,opponent_guild:opponent,war_date:date,result,image_paths:editId?[...(old.image_paths||[]),...newPaths]:newPaths};
  const q=editId?await supabaseClient.from("war_match_records").update(payload).eq("id",editId).select("id").single():await supabaseClient.from("war_match_records").insert({...payload,is_confirmed:true,confirmed_by:currentUser.id,confirmed_at:new Date().toISOString(),created_by:currentUser.id});
  if(q.error)throw q.error;
  resetWarRecordEditor();showWarRecordMessage(editId?"แก้ไขผลวอร์เรียบร้อยแล้ว":"บันทึกผลวอร์เรียบร้อยแล้ว");await loadWarMatchRecords();
 }catch(e){
  if(newPaths.length)await supabaseClient.storage.from(WAR_RECORD_BUCKET).remove(newPaths);
  showWarRecordMessage("บันทึกไม่สำเร็จ: "+e.message,true);
 }finally{btn.disabled=false;btn.textContent=editId?"บันทึกการแก้ไขผลวอร์":"ยืนยันและบันทึกผลวอร์";}
}

async function loadWarAttendanceStatistics(){
  if(!isManagement()||isRolePreviewActive())return;
  const select=$("war-attendance-stats-event");
  const events=(allWarEvents||[]).filter(x=>x.is_published);
  if(select)select.innerHTML=events.length?events.map(x=>'<option value="'+escapeHTML(x.id)+'">'+escapeHTML(x.event_name)+' · '+formatDate(x.event_date)+'</option>').join(""):'<option value="">ยังไม่มีวอร์ที่ Publish</option>';
  warAttendanceEditEventId=events[0]?.id||null;
  await loadWarAttendanceEditor();
  await loadWarAttendanceMemberSummary();
}
async function loadWarAttendanceEditor(){
  const box=$("war-attendance-stats-editor"),save=$("war-attendance-stats-save"),finalize=$("war-attendance-stats-finalize");
  if(!box||!isManagement()||isRolePreviewActive())return;
  const id=$("war-attendance-stats-event")?.value||warAttendanceEditEventId;
  if(!id){box.innerHTML='<div class="empty-state"><h3>ยังไม่มีวอร์ที่เผยแพร่</h3><p>เมื่อมีการ Publish กิจกรรมวอร์ รายชื่อจะปรากฏที่นี่</p></div>';if(save)save.disabled=true;if(finalize)finalize.disabled=true;return;}
  warAttendanceEditEventId=id;
  box.innerHTML='<p class="muted">กำลังโหลด Planned Roster และรายงานหลังวอร์...</p>';
  const [partyResult,recordResult,reportResult,memberResult]=await Promise.all([
    supabaseClient.from("war_parties").select("id,raid,party_number,war_party_members(member_id,position)").eq("event_id",id).order("party_number",{ascending:true}),
    supabaseClient.from("war_attendance_round_records").select("*").eq("event_id",id),
    supabaseClient.from("war_attendance_reports").select("*").eq("event_id",id).maybeSingle(),
    supabaseClient.from("guild_members").select("user_id,character_name,nickname,game_class,active").eq("active",true).order("character_name")
  ]);
  const failure=partyResult.error||recordResult.error||reportResult.error||memberResult.error;
  if(failure){box.innerHTML='<div class="system-role-error">โหลดข้อมูลไม่สำเร็จ: '+escapeHTML(failure.message)+'<br>ตรวจสอบสิทธิ์ RLS และโครงสร้างตารางที่ติดตั้ง</div>';if(save)save.disabled=true;if(finalize)finalize.disabled=true;return;}
  const parties=partyResult.data||[],members=memberResult.data||[],memberMap=new Map(members.map(m=>[m.user_id,m]));
  const planned=[...new Set(parties.flatMap(p=>(p.war_party_members||[]).map(x=>x.member_id)))].map(id=>memberMap.get(id)).filter(Boolean).sort((a,b)=>getMemberName(a).localeCompare(getMemberName(b),"th"));
  const recordMap=new Map((recordResult.data||[]).map(r=>[r.round_number+":"+r.member_id,r]));
  const report=reportResult.data;
  const statusOptions=[["attended","เข้าร่วมวอร์"],["emergency_leave","ลากะทันหัน"],["absent","ขาดวอร์"]];
  const roundMarkup=round=>'<section class="war-attendance-round-panel"><div class="war-attendance-round-heading"><div><span class="panel-kicker">WAR ROUND 0'+round+'</span><h3>Round 0'+round+'</h3></div><span class="war-attendance-round-count">'+planned.length+' คนใน Planned Roster</span></div>'+
    (planned.length?'<div class="war-record-table-wrap"><table class="war-record-table war-attendance-member-table"><thead><tr><th>สมาชิก / Planned Roster</th><th>สถานะจริง</th></tr></thead><tbody>'+planned.map(m=>{const r=recordMap.get(round+":"+m.user_id),v=r?.attendance_status||"";return '<tr><td><strong>'+escapeHTML(getMemberName(m))+'</strong><small class="war-attendance-class">'+escapeHTML(m.game_class||"ไม่ระบุอาชีพ")+'</small></td><td><select data-attendance-round="'+round+'" data-attendance-member="'+escapeHTML(m.user_id)+'"><option value="">รอระบุสถานะ</option>'+statusOptions.map(([value,label])=>'<option value="'+value+'" '+(v===value?"selected":"")+'>'+label+'</option>').join("")+'</select></td></tr>';}).join("")+'</tbody></table></div>':'<div class="empty-state"><h3>ยังไม่มีสมาชิกใน Planned Roster</h3><p>กรุณาจัดตี้และ Publish รายชื่อก่อน</p></div>')+'</section>';
  box.innerHTML='<div class="war-attendance-report-status"><span>สถานะรายงาน</span><strong class="'+(report?.report_status==="finalized"?"is-finalized":"is-draft")+'">'+(report?.report_status==="finalized"?"FINALIZED":"DRAFT / ยังไม่ปิดรายงาน")+'</strong><small>Planned Roster จะไม่ถูกเขียนทับจากผลการเข้าร่วมจริง</small></div>'+
    '<div class="war-attendance-round-grid">'+roundMarkup(1)+roundMarkup(2)+'</div>'+
    '<p class="war-attendance-save-hint">บันทึกแบบร่างได้หลายครั้ง · ต้องระบุสถานะให้ครบทั้งสองรอบก่อนปิดรายงาน · หลังปิดรายงาน การแก้ไขต้องดำเนินการโดยผู้มีสิทธิ์และมีประวัติ Audit</p>';
  const locked=report?.report_status==="finalized";
  if(save){save.disabled=!planned.length||locked;save.textContent=locked?"รายงานปิดแล้ว":"บันทึกแบบร่าง";}
  if(finalize){finalize.disabled=!planned.length||locked;finalize.textContent=locked?"ปิดรายงานแล้ว":"ยืนยันปิดรายงานทั้ง 2 รอบ";}
}
async function saveWarAttendanceStatistics(){
  if(!isManagement()||isRolePreviewActive()||!warAttendanceEditEventId)return;
  const box=$("war-attendance-stats-editor"),btn=$("war-attendance-stats-save");
  const controls=Array.from(box?.querySelectorAll("[data-attendance-round][data-attendance-member]")||[]);
  if(!controls.length)return;
  const incomplete=controls.filter(x=>!x.value);
  if(incomplete.length){alert("กรุณาระบุสถานะให้ครบทั้งสองรอบก่อนบันทึกแบบร่าง");return;}
  if(btn){btn.disabled=true;btn.textContent="กำลังบันทึก...";}
  try{
    const rows=controls.map(x=>({event_id:warAttendanceEditEventId,round_number:Number(x.dataset.attendanceRound),member_id:x.dataset.attendanceMember,attendance_status:x.value,recorded_by:currentUser.id,updated_at:new Date().toISOString()}));
    const q=await supabaseClient.from("war_attendance_round_records").upsert(rows,{onConflict:"event_id,round_number,member_id"});
    if(q.error)throw q.error;
    const report=await supabaseClient.from("war_attendance_reports").upsert({event_id:warAttendanceEditEventId,report_status:"draft",updated_by:currentUser.id,updated_at:new Date().toISOString()},{onConflict:"event_id"});
    if(report.error)throw report.error;
    alert("บันทึก Post-War Report แบบร่างเรียบร้อยแล้ว");
    await loadWarAttendanceEditor();
    await loadWarAttendanceMemberSummary();
  }catch(e){alert("บันทึกแบบร่างไม่สำเร็จ: "+e.message);}
  finally{if(btn){btn.disabled=false;btn.textContent="บันทึกแบบร่าง";}}
}
async function finalizeWarAttendanceStatistics(){
  if(!isManagement()||isRolePreviewActive()||!warAttendanceEditEventId)return;
  if(!confirm("ยืนยันปิดรายงาน Guild War ทั้ง Round 01 และ Round 02 ใช่หรือไม่? เมื่อปิดแล้วจะไม่สามารถแก้ไขผ่านหน้าปกติได้"))return;
  const btn=$("war-attendance-stats-finalize");if(btn){btn.disabled=true;btn.textContent="กำลังตรวจสอบ...";}
  try{
    const {error}=await supabaseClient.rpc("finalize_war_attendance_report",{p_event_id:warAttendanceEditEventId});
    if(error)throw error;
    alert("ปิดรายงานทั้งสองรอบเรียบร้อยแล้ว");
    await loadWarAttendanceEditor();
    await loadWarAttendanceMemberSummary();
  }catch(e){alert("ปิดรายงานไม่สำเร็จ: "+e.message);}
  finally{if(btn){btn.disabled=false;btn.textContent="ยืนยันปิดรายงานทั้ง 2 รอบ";}}
}
async function loadWarAttendanceMemberSummary(){
  const box=$("war-attendance-member-summary");if(!box||!isManagement()||isRolePreviewActive())return;
  const [recordsResult,membersResult]=await Promise.all([
    supabaseClient.from("war_attendance_round_records").select("member_id,round_number,attendance_status,event_id,war_attendance_reports!inner(report_status)").eq("war_attendance_reports.report_status","finalized"),
    supabaseClient.from("guild_members").select("user_id,character_name,nickname,game_class,active").eq("active",true).order("character_name")
  ]);
  const failure=recordsResult.error||membersResult.error;
  if(failure){box.innerHTML='<div class="system-role-error">'+escapeHTML(failure.message)+'</div>';return;}
  const records=recordsResult.data||[],members=membersResult.data||[];
  const totals={attended:0,emergency_leave:0,absent:0};
  const map=new Map();
  records.forEach(r=>{if(!map.has(r.member_id))map.set(r.member_id,{attended:0,emergency_leave:0,absent:0,total:0});const x=map.get(r.member_id);if(Object.prototype.hasOwnProperty.call(x,r.attendance_status)){x[r.attendance_status]++;x.total++;totals[r.attendance_status]++;}});
  const expected=totals.attended+totals.absent,rate=expected?(totals.attended/expected*100).toFixed(1):"0.0";
  box.innerHTML='<div class="attendance-overview-grid"><div><span>บันทึกจากรายงานที่ปิดแล้ว</span><strong>'+records.length+'</strong></div><div><span>เข้าร่วมจริง</span><strong>'+totals.attended+'</strong></div><div><span>ลากะทันหัน</span><strong>'+totals.emergency_leave+'</strong></div><div><span>ขาดวอร์</span><strong>'+totals.absent+'</strong></div><div><span>อัตราเข้าร่วมจริง</span><strong>'+rate+'%</strong></div></div>'+
    (members.length?'<div class="war-record-table-wrap"><table class="war-record-table"><thead><tr><th>สมาชิก</th><th>เข้าร่วม</th><th>ลากะทันหัน</th><th>ขาด</th><th>บันทึก</th></tr></thead><tbody>'+members.map(m=>{const x=map.get(m.user_id)||{attended:0,emergency_leave:0,absent:0,total:0};return '<tr><td>'+escapeHTML(getMemberName(m))+'</td><td>'+x.attended+'</td><td>'+x.emergency_leave+'</td><td>'+x.absent+'</td><td>'+x.total+'</td></tr>';}).join("")+'</tbody></table></div>':'<div class="empty-state">ยังไม่มีสมาชิก</div>');
}

function warSignupDateTime(value){
  if(!value)return "—";
  const date=new Date(value);if(Number.isNaN(date.getTime()))return "—";
  return formatDate(date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0"))+" "+String(date.getHours()).padStart(2,"0")+":"+String(date.getMinutes()).padStart(2,"0");
}
function warSignupEventState(event,now=Date.now()){
  if(event?.status==="cancelled")return "cancelled";
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
    if(!classes.has(key))classes.set(key,{name:key,total:0});
    classes.get(key).total++;
  });
  return [...classes.values()].sort((a,b)=>a.name.localeCompare(b.name,"th"));
}
function renderWarSignupSummary(rows,members=allMembers){
  const primary=(rows||[]).filter(row=>Number(row.queue_position)>=1&&Number(row.queue_position)<=60);
  const summary=warSignupClassSummary(rows,members);
  return '<div class="war-signup-summary"><div class="war-signup-summary-head"><strong>REGISTRATION SUMMARY</strong><span>สรุปจำนวนสมาชิกแยกตามอาชีพ</span></div>'+
    '<div class="war-signup-summary-stats"><div><strong>'+rows.length+'</strong><span>ผู้ลงชื่อทั้งหมด</span></div><div><strong>'+primary.length+'</strong><span>คนลงชื่อวอร์</span></div></div>'+
    '<div class="war-signup-class-summary">'+(summary.length?summary.map(item=>{
      const info=getClassInfo(item.name),icon=info?.iconPath?'<img src="'+escapeHTML(info.iconPath)+'" alt="">':"";
      return '<div class="war-signup-class-row">'+icon+'<strong>'+escapeHTML(item.name)+'</strong><span>'+item.total+' คน</span></div>';
    }).join(""):'<p class="muted">ยังไม่มีผู้ลงชื่อ</p>')+'</div></div>';
}
const WAR_SIGNUP_CARD_STATE_KEY="4am-war-signup-card-expanded-v1";
function getWarSignupCardStates(){
  try{
    const value=JSON.parse(localStorage.getItem(WAR_SIGNUP_CARD_STATE_KEY)||"{}");
    return value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  }catch{return {};}
}
function saveWarSignupCardStates(states){
  try{localStorage.setItem(WAR_SIGNUP_CARD_STATE_KEY,JSON.stringify(states));}catch(error){console.warn("Unable to save war signup card display state:",error);}
}
function getWarSignupDefaultExpandedEventId(events,now=Date.now()){
  const upcoming=(events||[]).map(event=>{
    const date=String(event.event_date||"").slice(0,10);
    const time=String(event.start_time||"23:59").slice(0,5);
    const timestamp=Date.parse(date+"T"+time);
    return {id:event.id,timestamp,status:event.status};
  }).filter(item=>item.status!=="cancelled"&&Number.isFinite(item.timestamp)&&item.timestamp>=now)
    .sort((a,b)=>a.timestamp-b.timestamp);
  return upcoming[0]?.id||(events||[]).find(event=>event.status!=="cancelled")?.id||(events||[])[0]?.id||null;
}
function setWarSignupCardExpanded(card,expanded){
  if(!card)return;
  const details=card.querySelector(".war-signup-card-details");
  const button=card.querySelector("[data-war-signup-collapse]");
  card.classList.toggle("is-collapsed",!expanded);
  if(details)details.hidden=!expanded;
  if(button){
    button.setAttribute("aria-expanded",expanded?"true":"false");
    button.innerHTML=(expanded?"<span aria-hidden=\"true\">⌃</span> ซ่อนรายละเอียด":"<span aria-hidden=\"true\">⌄</span> แสดงรายละเอียด");
  }
}
function bindWarSignupCardControls(box){
  if(!box||box.dataset.warSignupCollapseBound==="true")return;
  box.dataset.warSignupCollapseBound="true";
  box.addEventListener("click",event=>{
    const collapseButton=event.target.closest("[data-war-signup-collapse]");
    const bulkButton=event.target.closest("[data-war-signup-collapse-all]");
    if(!collapseButton&&!bulkButton)return;
    event.preventDefault();
    event.stopPropagation();
    const states=getWarSignupCardStates();
    if(bulkButton){
      const expanded=bulkButton.dataset.warSignupCollapseAll==="expand";
      box.querySelectorAll("[data-war-signup-card]").forEach(card=>{
        setWarSignupCardExpanded(card,expanded);
        states[card.dataset.warSignupCard]=expanded;
      });
      saveWarSignupCardStates(states);
      return;
    }
    const card=collapseButton.closest("[data-war-signup-card]");
    if(!card)return;
    const expanded=card.classList.contains("is-collapsed");
    setWarSignupCardExpanded(card,expanded);
    states[card.dataset.warSignupCard]=expanded;
    saveWarSignupCardStates(states);
  });
}
async function loadWarSignups(){
  const box=$("war-signup-content");
  if(!box||!currentUser)return;
  if(!window.__warSignupRefreshTimer){window.__warSignupRefreshTimer=window.setInterval(()=>{if(currentUser&&document.visibilityState==="visible"&&!$("page-war-signup")?.classList.contains("hidden"))loadWarSignups();},60000);}
  $("war-signup-management")?.classList.toggle("hidden",!isManagement());
  $("war-signup-add")?.classList.toggle("hidden",!isManagement());
  box.innerHTML='<p class="muted">กำลังโหลดกิจกรรมวอร์...</p>';
  const {data:events,error}=await supabaseClient.from("war_events")
    .select("id,event_name,event_date,start_time,registration_type,signup_opens_at,signup_closes_at,description,created_by,status,discord_message_id,discord_sent_at,discord_send_error")
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
    .select("id,event_id,member_id,raid,status,queue_position,available_rounds,created_at")
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
  const savedCardStates=getWarSignupCardStates();
  const defaultExpandedEventId=getWarSignupDefaultExpandedEventId(events,now);
  bindWarSignupCardControls(box);
  box.innerHTML='<div class="war-signup-display-controls"><span>การแสดงผลรายการวอร์</span><div><button class="btn btn-outline btn-sm" type="button" data-war-signup-collapse-all="collapse">ย่อทั้งหมด</button><button class="btn btn-outline btn-sm" type="button" data-war-signup-collapse-all="expand">ขยายทั้งหมด</button></div></div>'+events.map(event=>{
    const isExpanded=Object.prototype.hasOwnProperty.call(savedCardStates,event.id)?Boolean(savedCardStates[event.id]):event.id===defaultExpandedEventId;
    const rows=allSignups.filter(row=>row.event_id===event.id);
    const leaveRows=leaveByEvent.get(event.id)||[];
    const attendanceRows=attendanceByEvent.get(event.id)||[];
    const state=warSignupEventState(event,now);
    const own=rows.find(row=>row.member_id===currentUser.id);
    const stateLabel=state==="cancelled"?"ยกเลิกแล้ว":state==="scheduled"?"ยังไม่เปิดรับสมัคร":state==="open"?"เปิดรับสมัคร":state==="closed"?"ปิดรับสมัคร":"ข้อมูลเวลาไม่ถูกต้อง";
    const stateClass=state==="open"?"is-open":state==="closed"?"is-closed":state==="cancelled"?"is-cancelled":"is-scheduled";
    const typeLabel=event.registration_type==="practice"?"ซ้อมวอร์":"วอร์จริง";
    const eventConfig=getWarEventConfig(event);
    const warTimes=event.registration_type==="official"&&eventConfig.rounds?.length
      ?eventConfig.rounds.join(" / ")+" น."
      :formatTime(event.start_time)+" น.";
    const capacity=rows.length+"/80";
    let action="";
    const ownRounds=Array.isArray(own?.available_rounds)?own.available_rounds.map(Number):[1,2];
    const ownAvailability=ownRounds.length===2?"พร้อมทั้งสองรอบ":ownRounds.includes(1)?"พร้อมเฉพาะ Round 1":"พร้อมเฉพาะ Round 2";
    const ownStatus=own?'<div class="war-signup-own-status"><strong>คุณลงชื่อแล้ว · คิวที่ '+(own.queue_position||"—")+'</strong><span>คนลงชื่อวอร์</span>'+(Number(own.queue_position)>60?'<small>'+ownAvailability+'</small>':"")+'</div>':"";
    if(state==="cancelled"){
      action='<span class="war-signup-status">กิจกรรมนี้ถูกยกเลิกแล้ว</span>';
    }else if(state==="closed"){
      action='<div class="war-signup-closed-banner" role="status" aria-live="polite">ปิดการลงชื่อแล้ว</div>';
    }else if(own){
      action=ownStatus+'<button class="btn btn-danger btn-sm war-signup-withdraw-btn" type="button" data-war-signup-withdraw="'+escapeHTML(event.id)+'">ถอนชื่อออก</button>';
    }else if(state==="open"&&rows.length<80){
      action='<button class="btn btn-sm war-signup-join-btn" type="button" data-war-signup-join="'+escapeHTML(event.id)+'">เข้าร่วม</button>';
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
    const isAutoGenerated=event.registration_type==="official"&&!event.created_by;
    const managementActions=isManagement()?'<div class="war-signup-management-actions">'+(event.status==="cancelled"?"":discordAction)+(isAutoGenerated?('<span class="war-signup-auto-label">'+(event.status==="cancelled"?"ยกเลิกแล้ว · เก็บประวัติไว้":"สร้างโดยระบบอัตโนมัติ")+'</span>'+(event.status==="cancelled"?"":'<button class="btn btn-danger btn-sm" type="button" data-war-signup-cancel="'+escapeHTML(event.id)+'">ยกเลิกวอร์</button>')+'<button class="btn btn-outline btn-sm" type="button" data-war-signup-delete="'+escapeHTML(event.id)+'">ลบ Event</button>'):'<button class="btn btn-outline btn-sm" type="button" data-war-signup-edit="'+escapeHTML(event.id)+'">แก้ไข Event</button><button class="btn btn-danger btn-sm" type="button" data-war-signup-delete="'+escapeHTML(event.id)+'">ลบ Event</button>')+'</div>'+(event.discord_send_error?'<small class="war-signup-discord-error">'+escapeHTML(event.discord_send_error)+'</small>':""):"";
    return '<article class="war-signup-card'+(isExpanded?"":" is-collapsed")+'" data-war-signup-card="'+escapeHTML(event.id)+'">'+
      '<div class="war-signup-card-summary"><div class="war-signup-card-heading"><h3>'+escapeHTML(event.event_name)+' '+formatDate(event.event_date)+' <span class="war-signup-type">'+typeLabel+'</span></h3><p>เวลาแข่งขัน '+warTimes+'</p></div><button class="btn btn-outline btn-sm war-signup-collapse-btn" type="button" data-war-signup-collapse aria-expanded="'+(isExpanded?"true":"false")+'" aria-label="'+(isExpanded?"ซ่อนรายละเอียด":"แสดงรายละเอียด")+'"><span aria-hidden="true">'+(isExpanded?"⌃":"⌄")+'</span> '+(isExpanded?"ซ่อนรายละเอียด":"แสดงรายละเอียด")+'</button></div>'+
      '<div class="war-signup-card-details"'+(isExpanded?"":" hidden")+'><div class="war-signup-card-top"><div class="war-signup-badges"><span class="war-signup-state '+stateClass+'">'+stateLabel+'</span></div></div>'+managementActions+
      '<div class="war-signup-event-meta"><span>เริ่มลงชื่อ: '+warSignupDateTime(event.signup_opens_at)+'</span><span>ปิดรับ: '+warSignupDateTime(event.signup_closes_at)+'</span><span>ผู้ลงชื่อ: '+capacity+'</span></div>'+
      (event.description?'<p class="war-signup-description">'+escapeHTML(String(event.description).replace(/\[\[WAR_CONFIG:[\s\S]*?\]\]/,"").trim())+'</p>':"")+
      '<div class="war-signup-card-bottom"><div class="war-signup-action">'+action+'</div>'+(state==="closed"?'<button class="btn btn-outline btn-sm war-signup-evidence-btn" type="button" data-war-signup-evidence="'+escapeHTML(event.id)+'">บันทึกไฟล์รูปภาพ</button>':"")+'</div>'+rosterHtml+(leaveRpcUnavailable?'<p class="war-leave-roster-warning">ยังโหลดรายชื่อผู้แจ้งลาไม่ได้ กรุณาตรวจสอบ SQL ระบบแจ้งลาวอร์</p>':"")+(attendanceRpcUnavailable?'<p class="war-leave-roster-warning">ยังโหลดสถานะขาดวอร์ไม่ได้ กรุณาติดตั้ง SQL ระบบสรุปการเข้า war</p>':"")+summary+'</div></article>';
  }).join("");
}

async function sendWarSignupEventToDiscord(eventId,button){
  if(!isManagement())return;
  const isUpdate=String(button?.textContent||"").includes("UPDATE TO DISCORD");
  const confirmText=isUpdate
    ?"อัปเดตประกาศ War Signup Event ใน Discord โดยแก้ไขข้อความเดิมหรือไม่?"
    :"ส่งประกาศ Guild War ไปยัง Channel ID ที่กำหนดบนการ์ดประกาศลงชื่อวอร์ใน Production Mode หรือไม่?";
  if(!confirm(confirmText))return;
  const original=button?.textContent||(isUpdate?"UPDATE TO DISCORD":"SEND TO DISCORD");
  if(button){button.disabled=true;button.textContent=isUpdate?"กำลังอัปเดต Discord...":"กำลังส่งไป Discord...";}
  try{
    const {data,error}=await supabaseClient.functions.invoke("discord-guild-activity-notify",{body:{kind:"war_signup",event_id:eventId,manual_send:true}});
    if(error){
      let message=error.message;
      try{if(error.context&&typeof error.context.json==="function"){const body=await error.context.json();message=body.details?String(body.message||message)+" ("+String(body.details)+")":body.message||message;}}catch(_){}
      throw new Error(message);
    }
    if(data?.skipped)throw new Error(data?.message||"ระบบข้ามการส่งประกาศ Discord ตามการตั้งค่า Event Route");
    if(!data?.success)throw new Error(data?.message||"ดำเนินการกับ Discord ไม่สำเร็จ");
    alert(data.recreated?"ข้อความประกาศเดิมถูกลบจาก Discord แล้ว ระบบสร้างประกาศใหม่ให้เรียบร้อย":data.updated?"อัปเดตประกาศเดิมบน Discord สำเร็จ":data.already_notified?"Event นี้มีประกาศบน Discord แล้ว":"ส่งประกาศ War Signup Event ไป Discord สำเร็จ");
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
  const signupRows=(signups||[]).slice().sort((a,b)=>Number(a.queue_position)-Number(b.queue_position));
  const renderSignupList=items=>{
    if(!items.length)return '<div class="war-roster-empty">ยังไม่มีรายชื่อ</div>';
    return '<div class="war-roster-list">'+items.map(row=>{
      const member=memberMap.get(row.member_id)||{};
      const className=getMemberClass(member),info=getClassInfo(className);
      const icon=info?.iconPath?'<img class="war-roster-class-icon" src="'+escapeHTML(info.iconPath)+'" alt="'+escapeHTML(className)+'" loading="lazy">':'<span class="war-roster-class-fallback">✦</span>';
      const rounds=Array.isArray(row.available_rounds)?row.available_rounds.map(Number):[1,2];
      const availability=Number(row.queue_position)>60?(rounds.length===2?" · ทั้งสองรอบ":rounds.includes(1)?" · R1 เท่านั้น":" · R2 เท่านั้น"):"";
      return '<div class="war-roster-row"><span class="war-roster-number">#'+Number(row.queue_position||0)+'</span>'+icon+'<strong>'+escapeHTML(getMemberName(member))+'</strong><span class="war-roster-row-note">คนลงชื่อวอร์'+availability+'</span></div>';
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
  return '<section class="war-signup-roster-board"><div class="war-roster-section"><div class="war-roster-section-head"><h4>คนลงชื่อวอร์</h4><span>'+signupRows.length+' คน</span></div>'+renderSignupList(signupRows)+'</div>'+
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
  const selectedEvent=warLeaveEvents.find(event=>event.id===eventId);
  const deadline=selectedEvent?.registration_type==="official"&&selectedEvent?.event_date
    ?new Date(selectedEvent.event_date+"T14:00:00+07:00").getTime()
    :new Date(selectedEvent?.signup_closes_at||0).getTime();
  const deadlinePassed=Number.isFinite(deadline)&&deadline>0&&Date.now()>=deadline;
  const reason=$("war-leave-reason"),status=$("war-leave-own-status"),button=$("war-leave-submit");
  if(reason){reason.value=request?.reason||"";reason.disabled=request?.status==="approved"||deadlinePassed;}
  if(status)status.innerHTML=request?'<strong>สถานะคำแจ้งลา: '+warLeaveStatusLabel(request.status)+'</strong><span> ส่งเมื่อ '+warSignupDateTime(request.created_at)+'</span>':"ยังไม่มีการแจ้งลาสำหรับรอบวอร์ที่เลือก";const deadlineNote=$("war-leave-deadline-note");if(deadlineNote){const isPractice=selectedEvent?.registration_type==="practice";const deadlineCopy=isPractice?'🚨 สมาชิกสามารถแจ้งลา <strong>ซ้อมวอร์</strong> ได้จนถึงวัน/เวลาปิดรับสมัครที่กำหนดไว้':'🚨 สมาชิกสามารถแจ้งลา <strong>วอร์จริง</strong> ได้ถึงวันเสาร์ 14:00 น. ของสัปดาห์นั้นๆ';deadlineNote.innerHTML='<span>'+deadlineCopy+'</span>';deadlineNote.classList.toggle("is-practice",isPractice);deadlineNote.classList.toggle("is-official",!isPractice);deadlineNote.classList.toggle("is-closed",deadlinePassed);}
  if(button){button.disabled=request?.status==="approved"||deadlinePassed;button.textContent=request?.status==="approved"?"รับทราบคำแจ้งลาแล้ว":deadlinePassed?"ปิดรับแจ้งลาแล้ว":request?"อัปเดตคำแจ้งลา":"ยืนยันแจ้งลาวอร์";}
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
    supabaseClient.from("war_events").select("id,event_name,event_date,start_time,signup_opens_at,signup_closes_at,status,registration_type").not("signup_opens_at","is",null).order("event_date",{ascending:true}),
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
  const selectable=warLeaveEvents.filter(event=>event.event_date>=today&&event.status!=="cancelled");
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
    message.textContent="ส่งคำแจ้งลาวอร์เรียบร้อยแล้ว · ระบบอนุมัติให้อัตโนมัติ";message.className="message success";
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

async function syncWarSignupDiscord(eventId){
  try{
    const {data,error}=await supabaseClient.functions.invoke("discord-guild-activity-notify",{body:{kind:"war_signup",event_id:eventId}});
    if(error){
      let message=error.message||"เรียก Discord Sync ไม่สำเร็จ";
      try{if(error.context&&typeof error.context.json==="function"){const body=await error.context.json();message=body.message||body.details||message;}}catch(_){}
      return {ok:false,message};
    }
    if(!data?.success)return {ok:false,message:data?.message||"Discord Sync ไม่สำเร็จ"};
    return {ok:true,skipped:Boolean(data.skipped)};
  }catch(error){
    return {ok:false,message:error?.message||"Discord Sync ไม่สำเร็จ"};
  }
}

async function joinWarSignup(eventId,button){
  if(!currentUser||!eventId||!button)return;
  try{
    let event=allWarEvents.find(item=>item.id===eventId);
    if(!event){
      const lookup=await supabaseClient.from("war_events")
        .select("id,event_name,event_date,start_time,registration_type,description,status")
        .eq("id",eventId).maybeSingle();
      if(lookup.error)throw lookup.error;
      event=lookup.data;
    }
    if(!event)throw new Error("ไม่พบกิจกรรม Guild War ที่เลือก");
    if(event.status==="cancelled")throw new Error("กิจกรรม Guild War นี้ถูกยกเลิกแล้ว");
    const config=getWarEventConfig(event);
    const roundCount=config.rounds?.length||2;
    let choice="1";
    if(roundCount>1){
      const selected=window.prompt(
        "กรณีวันเสาร์ที่มีวอร์สองรอบ หากคิวของคุณอยู่ลำดับ 61–80\nคุณสามารถเข้าร่วมวอร์รอบใดได้บ้าง?\n\nพิมพ์ 12 = ได้ทั้ง รอบแรก และ รอบสอง\nพิมพ์ 1 = ได้เฉพาะ รอบแรก\nพิมพ์ 2 = ได้เฉพาะ รอบสอง\n\nข้อมูลนี้ใช้ประกอบการจัดรายชื่อเมื่อคิวของคุณอยู่ลำดับ 61–80",
        "12"
      );
      if(selected===null)return;
      choice=String(selected).trim();
    }
    const availableRounds=roundCount===1?[1]:choice==="12"?[1,2]:choice==="1"?[1]:choice==="2"?[2]:null;
    if(!availableRounds||availableRounds.some(round=>round>roundCount)){
      alert(roundCount===1?"กิจกรรมนี้มีเพียง Round 1":"ตัวเลือกไม่ถูกต้อง กรุณาพิมพ์ 12, 1 หรือ 2");
      return;
    }
    button.disabled=true;button.textContent="กำลังลงชื่อ...";
    const {data,error}=await supabaseClient.rpc("join_war_signup",{
      p_event_id:eventId,
      p_available_rounds:availableRounds
    });
    if(error)throw error;
    const result=Array.isArray(data)?data[0]:data;
    const availabilityLabel=roundCount===1?"พร้อม Round 1":choice==="12"?"พร้อมทั้งสองรอบ":choice==="1"?"พร้อมเฉพาะ Round 1":"พร้อมเฉพาะ Round 2";
    const discordSync=await syncWarSignupDiscord(eventId);
    await loadWarSignups();
    alert("ลงชื่อวอร์เรียบร้อยแล้ว · คิวที่ "+(result?.queue_position??"—")+
      "\nความพร้อมที่บันทึก: "+availabilityLabel+
      (discordSync.ok?(discordSync.skipped?"":"\nอัปเดตประกาศ Discord แล้ว"):"\n⚠️ บันทึกบนเว็บไซต์แล้ว แต่ซิงก์ Discord ไม่สำเร็จ: "+discordSync.message));
  }catch(error){
    console.error("War signup error:",error);
    alert(error.message||"ลงชื่อวอร์ไม่สำเร็จ");
    button.disabled=false;button.textContent="เข้าร่วม";
  }
}
async function withdrawWarSignup(eventId,button){
  if(!currentUser||!eventId||!button)return;
  if(!confirm("ยืนยันถอนชื่อออกจากกิจกรรม Guild War นี้ใช่หรือไม่?"))return;
  button.disabled=true;button.textContent="กำลังถอนชื่อ...";
  try{
    const {data,error}=await supabaseClient.rpc("cancel_war_signup",{p_event_id:eventId});
    if(error)throw error;
    const discordSync=await syncWarSignupDiscord(eventId);
    await loadWarSignups();
    alert((data?.message||"ถอนชื่อออกจากกิจกรรมเรียบร้อยแล้ว")+
      (discordSync.ok?(discordSync.skipped?"":"\nอัปเดตประกาศ Discord แล้ว"):"\n⚠️ ถอนชื่อบนเว็บไซต์แล้ว แต่ซิงก์ Discord ไม่สำเร็จ: "+discordSync.message));
  }catch(error){
    console.error("War signup withdrawal error:",error);
    alert(error.message||"ถอนชื่อออกไม่สำเร็จ");
    button.disabled=false;button.textContent="ถอนชื่อออก";
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
  const raidGroup=$("war-signup-raid-count")?.closest(".form-group");
  if(raidGroup)raidGroup.classList.toggle("hidden",type!=="practice");
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
function openWarSignupTimePicker(){
  const input=$("war-signup-start-time"),display=$("war-signup-start-time-display");
  if(!input||!display||$("war-signup-type")?.value!=="practice")return;
  const wrapper=display.closest(".form-group");if(!wrapper)return;
  const existing=wrapper.querySelector(".war-time-picker-popover");
  if(existing){existing.remove();return;}
  document.querySelectorAll(".war-time-picker-popover").forEach(panel=>panel.remove());
  const current=/^([01]\d|2[0-3]):[0-5]\d$/.test(input.value)?input.value:"20:00";
  const [currentHour,currentMinute]=current.split(":");
  const hourOptions=Array.from({length:24},(_,i)=>String(i).padStart(2,"0")).map(v=>'<option value="'+v+'"'+(v===currentHour?" selected":"")+'>'+v+'</option>').join("");
  const minuteOptions=Array.from({length:60},(_,i)=>String(i).padStart(2,"0")).map(v=>'<option value="'+v+'"'+(v===currentMinute?" selected":"")+'>'+v+'</option>').join("");
  const panel=document.createElement("div");panel.className="war-time-picker-popover";
  panel.innerHTML='<div class="war-time-picker-heading"><strong>เลือกเวลาเริ่มวอร์</strong><span>24 ชั่วโมง</span></div><div class="war-time-picker-selects"><label>ชั่วโมง (00–23)<select class="war-time-hour" aria-label="ชั่วโมง">'+hourOptions+'</select></label><span class="war-time-picker-colon">:</span><label>นาที (00–59)<select class="war-time-minute" aria-label="นาที">'+minuteOptions+'</select></label></div><div class="war-time-picker-actions"><button type="button" class="war-time-cancel">ยกเลิก</button><button type="button" class="war-time-apply">ยืนยันเวลา</button></div>';
  wrapper.appendChild(panel);
  panel.querySelector(".war-time-cancel").addEventListener("click",()=>panel.remove());
  panel.querySelector(".war-time-apply").addEventListener("click",()=>{
    const value=panel.querySelector(".war-time-hour").value+":"+panel.querySelector(".war-time-minute").value;
    input.value=value;display.value=value;panel.remove();
  });
}
async function updateWarSignupTimeForDate(){
  const type=$("war-signup-type")?.value;
  const date=parseDisplayDate($("war-signup-event-date")?.value);
  const input=$("war-signup-start-time");
  const display=$("war-signup-start-time-display");
  const note=$("war-signup-time-note");
  if(!input||!display)return;
  if(type==="practice"){
    // Practice signup events use a dedicated 24-hour picker (00:00–23:59).
    input.value=input.value||"20:00";
    display.readOnly=true;
    display.setAttribute("aria-haspopup","dialog");
    display.setAttribute("aria-label","เลือกเวลาเริ่มวอร์ รูปแบบ 24 ชั่วโมง");
    display.value=input.value;
    display.required=true;
    display.style.cursor="pointer";
    if(note)note.textContent="ซ้อมวอร์: เลือกเวลาได้ทุกนาที ตั้งแต่ 00:00–23:59 (24 ชั่วโมง)";
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
  if($("war-signup-raid-count"))$("war-signup-raid-count").value="4";
  updateWarSignupDateControls("",true);
  updateWarSignupTimeForDate();
}
async function startEditWarSignupEvent(id){
  if(!isManagement())return;
  const {data,error}=await supabaseClient.from("war_events").select("id,event_name,registration_type,event_date,start_time,signup_opens_at,signup_closes_at,description").eq("id",id).single();
  if(error){alert("โหลด Event ไม่สำเร็จ: "+error.message);return;}
  $("war-signup-edit-id").value=data.id;$("war-signup-event-name").value=data.event_name||"";
  $("war-signup-type").value=data.registration_type||"official";
  const savedConfig=String(data.description||"").match(/\[\[WAR_CONFIG:\s*(\{[\s\S]*?\})\s*\]\]/);
  try{$("war-signup-raid-count").value=String(data.registration_type==="official"?2:(JSON.parse(savedConfig?.[1]||"{}").raidCount||4));}catch{$("war-signup-raid-count").value="4";}
  updateWarSignupDateControls(String(data.event_date||"").slice(0,10),false);
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
async function cancelWarSignupEvent(id){
  if(!isManagement()||!id||!confirm("ยืนยันยกเลิก Guild War Event นี้ใช่หรือไม่?\\nระบบจะเก็บข้อมูลและประวัติเดิมไว้ แต่ปิดการลงชื่อและแจ้งลาวอร์"))return;
  const {data,error}=await supabaseClient.from("war_events").update({status:"cancelled"}).eq("id",id).select("id").single();
  if(error){alert("ยกเลิกวอร์ไม่สำเร็จ: "+error.message);return;}
  await Promise.all([loadWarSignups(),loadWarEvents()]);
}
async function deleteWarSignupEvent(id,button){
  if(isRolePreviewActive()){
    alert("ขณะนี้กำลังใช้งาน Role Preview จึงไม่สามารถลบข้อมูลจริงได้ กรุณากดออกจาก Preview แล้วลองอีกครั้ง");
    return;
  }
  if(!isManagement()){
    alert("บัญชีนี้ไม่มีสิทธิ์ลบ Event ลงชื่อวอร์");
    return;
  }
  if(!id)return;
  const event=allWarEvents.find(item=>item.id===id);
  const eventName=event?.event_name||"Event ลงชื่อวอร์นี้";
  if(!window.confirm("ยืนยันลบ "+eventName+" ใช่หรือไม่?\\n\\nระบบจะลบ Event นี้พร้อมข้อมูลการสมัคร รายชื่อ Snapshot ประวัติการจัดตี้ และกิจกรรมที่ผูกกับวอร์นี้ทั้งหมด ไม่สามารถกู้คืนได้"))return;
  if(button){button.disabled=true;button.textContent="กำลังลบ...";}
  try{
    const {error}=await supabaseClient.rpc("delete_war_event_secure",{p_event_id:id});
    if(error)throw error;
    const check=await supabaseClient.from("war_events").select("id").eq("id",id).maybeSingle();
    if(check.error)throw check.error;
    if(check.data)throw new Error("Event ยังอยู่ในฐานข้อมูลหลังสั่งลบ กรุณาตรวจสอบผลการลบ");
    if(selectedWarEventId===id)selectedWarEventId=null;
    if(currentWarAssignmentEventId===id)currentWarAssignmentEventId=null;
    if(warAttendanceEventId===id)warAttendanceEventId=null;
    await Promise.all([loadWarSignups(),loadWarEvents()]);
    if($("war-attendance-content"))await loadWarAttendance();
    if($("war-raid-boards"))renderWarLayout(selectedWarEventId||undefined);
    alert("ลบ Event เรียบร้อยแล้ว");
  }catch(error){
    console.error("War signup event deletion failed:",error);
    alert("ลบ Event ไม่สำเร็จ: "+(error.message||"เกิดข้อผิดพลาด"));
    if(button){button.disabled=false;button.textContent="ลบ Event";}
  }
}
async function createWarSignupEvent(form){
  if(!isManagement())return;
  const button=$("war-signup-create-confirm"),message=$("war-signup-create-message");
  const name=$("war-signup-event-name").value.trim(),type=$("war-signup-type").value,date=parseDisplayDate($("war-signup-event-date").value);
  const startTime=$("war-signup-start-time").value,opens=$("war-signup-opens-at").value,closes=$("war-signup-closes-at").value;
  const description=$("war-signup-description").value.trim(),editId=$("war-signup-edit-id").value;
  const openDate=parseDisplayDateTime(opens),closeDate=parseDisplayDateTime(closes),showError=t=>{message.textContent=t;message.className="message error";};
  if(!name||!date||!startTime||!opens||!closes){showError("กรุณากรอกข้อมูลที่จำเป็นให้ครบ");return;}
  if(type==="practice"&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)){
    showError("กรุณาเลือกเวลาเริ่มวอร์ระหว่าง 00:00–23:59 ในรูปแบบ HH:mm");
    return;
  }
  if(type==="official"&&!editId){
    showError("วอร์จริงสร้างโดยระบบอัตโนมัติแล้ว ไม่ต้องสร้าง Event เอง");
    return;
  }
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
    else result=await supabaseClient.rpc("create_war_signup_event",{p_event_name:name,p_registration_type:type,p_event_date:date,p_start_time:startTime,p_signup_opens_at:openDate.toISOString(),p_signup_closes_at:closeDate.toISOString(),p_description:description||null,p_raid_count:type==="official"?2:Number($("war-signup-raid-count")?.value||4)});
    if(result.error)throw result.error;
    resetWarSignupForm();form.classList.add("hidden");message.classList.add("hidden");
    alert(editId?"แก้ไข Event เรียบร้อยแล้ว":"ยืนยันสร้าง Event ลงชื่อวอร์เรียบร้อยแล้ว");
    await loadWarSignups();
  }catch(error){console.error("Save war signup event:",error);showError(error.message||"บันทึก Event ไม่สำเร็จ");}
  finally{button.disabled=false;button.textContent=$("war-signup-edit-id").value?"บันทึกการแก้ไข Event":"ยืนยันสร้าง Event ลงชื่อวอร์";}
}

function registerWarRecordAndAttendanceEvents(){
  $("war-signup-refresh")?.addEventListener("click",loadWarSignups);
  $("war-signup-add")?.addEventListener("click",()=>{if(isManagement()){resetWarSignupForm();const type=$("war-signup-type");if(type){type.value="practice";updateWarSignupDateControls("",true);updateWarSignupTimeForDate();}$("war-signup-create-form")?.classList.toggle("hidden");}});
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
  const syncWarSignupStartTime=()=>{
    const display=$("war-signup-start-time-display"),hidden=$("war-signup-start-time");
    if(!display||!hidden||$("war-signup-type")?.value!=="practice")return;
    const value=String(display.value||"").trim();
    if(/^([01]\d|2[0-3]):[0-5]\d$/.test(value))hidden.value=value;
  };
  $("war-signup-start-time-display")?.addEventListener("click",()=>openWarSignupTimePicker());
  $("war-signup-start-time-display")?.addEventListener("keydown",event=>{
    if(event.key==="Enter"||event.key===" "){event.preventDefault();openWarSignupTimePicker();}
  });
  $("war-signup-start-time-display")?.addEventListener("input",syncWarSignupStartTime);
  $("war-signup-start-time-display")?.addEventListener("change",syncWarSignupStartTime);
  $("war-signup-create-form")?.addEventListener("submit",async e=>{e.preventDefault();await createWarSignupEvent(e.currentTarget);});
  $("war-signup-content")?.addEventListener("click",e=>{
    const join=e.target.closest("[data-war-signup-join]"),withdraw=e.target.closest("[data-war-signup-withdraw]"),edit=e.target.closest("[data-war-signup-edit]"),del=e.target.closest("[data-war-signup-delete]"),cancel=e.target.closest("[data-war-signup-cancel]"),evidence=e.target.closest("[data-war-signup-evidence]"),discord=e.target.closest("[data-war-signup-discord]");
    if(join)joinWarSignup(join.dataset.warSignupJoin,join);
    if(withdraw)withdrawWarSignup(withdraw.dataset.warSignupWithdraw,withdraw);
    if(discord)sendWarSignupEventToDiscord(discord.dataset.warSignupDiscord,discord);
    if(edit)startEditWarSignupEvent(edit.dataset.warSignupEdit);
    if(evidence)exportWarSignupEvidence(evidence.dataset.warSignupEvidence,evidence);
    if(cancel)cancelWarSignupEvent(cancel.dataset.warSignupCancel);
  });
  $("war-record-cancel-edit")?.addEventListener("click",resetWarRecordEditor);
  $("war-record-mode-switch")?.addEventListener("click",async e=>{const button=e.target.closest("[data-war-record-view-type]");if(!button)return;const next=button.dataset.warRecordViewType;if(!["practice","official"].includes(next)||next===warMatchRecordViewType)return;warMatchRecordViewType=next;$("war-record-mode-switch").querySelectorAll("[data-war-record-view-type]").forEach(item=>{const active=item.dataset.warRecordViewType===next;item.classList.toggle("is-active",active);item.setAttribute("aria-pressed",String(active));});resetWarRecordEditor();await loadWarRecordEvents();await renderWarMatchRecords();});
  $("war-record-history")?.addEventListener("click",e=>{const ed=e.target.closest("[data-war-record-edit]"),del=e.target.closest("[data-war-record-delete]");if(ed)startEditWarMatchRecord(ed.dataset.warRecordEdit);if(del)deleteWarMatchRecord(del.dataset.warRecordDelete,del);});
  $("war-record-form")?.addEventListener("submit",async e=>{e.preventDefault();await saveWarMatchRecord(e.currentTarget);});$("war-record-event")?.addEventListener("change",syncWarRecordEventFields);
  $("war-attendance-stats-load")?.addEventListener("click",loadWarAttendanceEditor);$("war-attendance-stats-event")?.addEventListener("change",loadWarAttendanceEditor);$("war-attendance-stats-save")?.addEventListener("click",saveWarAttendanceStatistics);$("war-attendance-stats-finalize")?.addEventListener("click",finalizeWarAttendanceStatistics);
}
function isWarRealtimePageActive() {
  return Boolean(document.querySelector(".page[id^='page-war']:not(.hidden)"));
}

function syncAppRealtimeSubscriptions(pageName) {
  const communityPages = ["community-board", "guild-news", "guild-activities"];
  const shouldSubscribeToWar = pageName === "war-center" || pageName === "war-signup";
  const shouldSubscribeToActivity = pageName === "dashboard" || communityPages.includes(pageName);
  const shouldSubscribeToFeedback = pageName === "feedback";

  // Keep high-volume table subscriptions active only while their pages are open.
  if (shouldSubscribeToWar) {
    if (!warRealtimeChannel) subscribeToWarRealtime();
  } else if (warRealtimeChannel) {
    void supabaseClient.removeChannel(warRealtimeChannel);
    warRealtimeChannel = null;
  }

  if (shouldSubscribeToActivity) {
    if (!guildActivityRealtimeChannel) subscribeToGuildActivityRealtime();
    if (communityPages.includes(pageName)) {
      if (!guildActivityCommentsRealtimeChannel) subscribeToGuildActivityCommentsRealtime();
    } else if (guildActivityCommentsRealtimeChannel) {
      void supabaseClient.removeChannel(guildActivityCommentsRealtimeChannel);
      guildActivityCommentsRealtimeChannel = null;
    }
  } else {
    if (guildActivityRealtimeChannel) {
      void supabaseClient.removeChannel(guildActivityRealtimeChannel);
      guildActivityRealtimeChannel = null;
    }
    if (guildActivityCommentsRealtimeChannel) {
      void supabaseClient.removeChannel(guildActivityCommentsRealtimeChannel);
      guildActivityCommentsRealtimeChannel = null;
    }
  }

  if (shouldSubscribeToFeedback) {
    if (!feedbackRealtimeChannel) subscribeToFeedbackRealtime();
  } else if (feedbackRealtimeChannel) {
    void supabaseClient.removeChannel(feedbackRealtimeChannel);
    feedbackRealtimeChannel = null;
  }
}

function removeAppRealtimeChannels() {
  for (const channel of [warRealtimeChannel, guildActivityRealtimeChannel, guildActivityCommentsRealtimeChannel, feedbackRealtimeChannel]) {
    if (channel) void supabaseClient.removeChannel(channel);
  }
  warRealtimeChannel = null;
  guildActivityRealtimeChannel = null;
  guildActivityCommentsRealtimeChannel = null;
  feedbackRealtimeChannel = null;
}

function subscribeToWarRealtime() {
  if (warRealtimeChannel) {
    void supabaseClient.removeChannel(warRealtimeChannel);
    warRealtimeChannel = null;
  }

  warRealtimeChannel = supabaseClient
    .channel("guild-war-live-updates")
    .on("postgres_changes", { event: "*", schema: "public", table: "war_events" }, () => {
      if (!isWarRealtimePageActive()) return;
      if (!$("page-war-signup")?.classList.contains("hidden")) void loadWarSignups();
      else void loadWarEvents();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "war_signups" }, () => {
      if (!$("page-war-signup")?.classList.contains("hidden")) void loadWarSignups();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "war_parties" }, async () => {
      if (!isWarRealtimePageActive()) return;
      const eventId = currentWarAssignmentEventId || selectedWarEventId;
      if (eventId) await loadSelectedWarEvent(eventId);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "war_skill_catalog" }, () => {
      if (isWarRealtimePageActive()) void loadWarSkillData();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "guild_member_skills" }, async () => {
      if (!isWarRealtimePageActive()) return;
      await loadWarSkillData();
      const eventId = currentWarAssignmentEventId || selectedWarEventId;
      if (eventId) renderAllWarParties();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "war_party_members" }, async () => {
      if (!isWarRealtimePageActive()) return;
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
 // Keep a local payload as a reliable fallback: browsers (notably Firefox) hide
 // DataTransfer.getData() during dragover, so drop zones must not depend on it.
 let activeWarDragPayload=null;
 const getWarDragPayload=e=>{try{const transfer=e?.dataTransfer;const raw=transfer?.getData("application/x-4am-war-member")||transfer?.getData("text/plain")||"";if(raw){const payload=JSON.parse(raw);if(payload&&typeof payload==="object")return payload;}}catch{}return activeWarDragPayload||{};};
 const startWarDrag=(e,source)=>{if(!isManagement()||isRolePreviewActive()||!e.dataTransfer)return;activeWarDragPayload=source;e.dataTransfer.effectAllowed="move";const payload=JSON.stringify(source);try{e.dataTransfer.setData("application/x-4am-war-member",payload);}catch(error){console.debug("Custom drag type unavailable; using text/plain fallback.",error);}try{e.dataTransfer.setData("text/plain",payload);}catch(error){console.debug("Plain-text drag payload unavailable; using in-memory fallback.",error);}e.target.closest("[draggable=\"true\"]")?.classList.add("is-war-dragging");};
 $("war-assignment-toolbar")?.addEventListener("dragstart",e=>{const pill=e.target.closest("[data-war-pool-member]");if(!pill)return;startWarDrag(e,{type:"pool",memberId:pill.dataset.warPoolMember});});
 $("war-raid-boards")?.addEventListener("dragstart",e=>{const slot=e.target.closest("[data-war-manage-slot]");if(!slot||!slot.dataset.assignmentId)return;startWarDrag(e,{type:"assigned",assignmentId:slot.dataset.assignmentId,memberId:currentWarPartyAssignments.find(x=>x.id===slot.dataset.assignmentId)?.member_id});});
 document.addEventListener("dragend",e=>{activeWarDragPayload=null;document.querySelectorAll(".is-war-dragging,.is-war-drop-active").forEach(el=>el.classList.remove("is-war-dragging","is-war-drop-active"));});
 $("war-raid-boards")?.addEventListener("dragover",e=>{const target=e.target.closest("[data-war-drop-slot]");if(!target||!isManagement()||isRolePreviewActive())return;e.preventDefault();e.dataTransfer.dropEffect="move";target.classList.add("is-war-drop-active");});
 $("war-raid-boards")?.addEventListener("dragleave",e=>{const target=e.target.closest("[data-war-drop-slot]");if(target&&!target.contains(e.relatedTarget))target.classList.remove("is-war-drop-active");});
 $("war-raid-boards")?.addEventListener("drop",async e=>{
  const target=e.target.closest("[data-war-drop-slot]");if(!target)return;e.preventDefault();target.classList.remove("is-war-drop-active");
  if(!isManagement()||isRolePreviewActive())return;
  const payload=getWarDragPayload(e),partyId=target.dataset.partyId,position=Number(target.dataset.position),party=currentWarParties.find(x=>x.id===partyId);
  if(!party||!position||!payload.memberId)return;
  const slots=party.war_party_members||[];
  if(slots.some(x=>Number(x.position)===position)){alert("ช่องนี้มีสมาชิกอยู่แล้ว");return;}
  if(payload.type==="pool"){
   if(getAssignedWarMemberIds().has(payload.memberId)){alert("สมาชิกคนนี้ถูกจัดลงปาร์ตี้แล้ว");return;}
   try{const saved=await persistWarMemberToPartySlot(payload.memberId,{partyId,position});if(saved){target.classList.add("is-war-drop-saved");setTimeout(()=>target.classList.remove("is-war-drop-saved"),650);}}
   catch(error){console.error("War drag assignment failed:",error);alert("จัดสมาชิกไม่สำเร็จ: "+(error.message||"กรุณาลองใหม่"));}
   return;
  }
  if(payload.type==="assigned"){
   const assignment=currentWarPartyAssignments.find(x=>x.id===payload.assignmentId);if(!assignment||assignment.member_id!==payload.memberId)return;
   if(assignment.party_id===partyId&&Number(assignment.position)===position)return;
   try{
    const result=await supabaseClient.from("war_party_members").update({party_id:partyId,position}).eq("id",assignment.id);
    if(result.error)throw result.error;
    await loadSelectedWarEvent(currentWarAssignmentEventId);
   }catch(error){console.error("War drag move failed:",error);alert("ย้ายสมาชิกไม่สำเร็จ: "+(error.message||"กรุณาลองใหม่"));}
  }
 });
 // Return an assigned member to the unassigned pool by dropping it over the member list.
 const warPoolDropZone=$("war-assignment-toolbar");
 warPoolDropZone?.addEventListener("dragover",e=>{
  const zone=e.target.closest("#war-assignment-results");
  if(!zone||!isManagement()||isRolePreviewActive())return;
  const payload=activeWarDragPayload||getWarDragPayload(e);
  if(payload.type!=="assigned")return;
  e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect="move";zone.classList.add("is-war-drop-active");
 });
 warPoolDropZone?.addEventListener("dragleave",e=>{
  const zone=e.target.closest("#war-assignment-results");
  if(zone&&!zone.contains(e.relatedTarget))zone.classList.remove("is-war-drop-active");
 });
 warPoolDropZone?.addEventListener("drop",async e=>{
  const zone=e.target.closest("#war-assignment-results");
  if(!zone)return;
  const payload=getWarDragPayload(e);
  if(payload.type!=="assigned")return;
  e.preventDefault();e.stopPropagation();zone.classList.remove("is-war-drop-active");
  if(!isManagement()||isRolePreviewActive()||!payload.assignmentId||!payload.memberId)return;
  const assignment=currentWarPartyAssignments.find(x=>x.id===payload.assignmentId);
  if(!assignment||assignment.member_id!==payload.memberId)return;
  try{
   const result=await supabaseClient.from("war_party_members").delete().eq("id",assignment.id);
   if(result.error)throw result.error;
   await loadSelectedWarEvent(currentWarAssignmentEventId);
  }catch(error){
   console.error("War drag unassign failed:",error);
   alert("นำสมาชิกออกจากตี้ไม่สำเร็จ: "+(error.message||"กรุณาลองใหม่"));
  }
 });

 $("war-assignment-toolbar")?.addEventListener("click",e=>{const f=e.target.closest("[data-war-filter]"),c=e.target.closest("[data-war-class-filter]"),pool=e.target.closest("[data-war-pool-member]");if(f){warAssignmentFilter=f.dataset.warFilter||"all";applyWarAssignmentMemberFilters();}if(c){warAssignmentClassFilter=c.dataset.warClassFilter||"all";applyWarAssignmentMemberFilters();}if(pool){const p=currentWarParties.find(x=>x.raid===warAssignmentFilter&&(x.war_party_members||[]).length<6)||currentWarParties.find(x=>(x.war_party_members||[]).length<6);if(!p){alert("ไม่พบ Party ที่ว่าง");return;}const used=new Set((p.war_party_members||[]).map(x=>Number(x.position))),pos=[1,2,3,4,5,6].find(x=>!used.has(x));if(pos){openWarAssignmentModal(p.id,pos);const picked=allMembers.find(m=>m.user_id===pool.dataset.warPoolMember);const search=$("war-modal-member-search");if(picked&&search){search.value=getMemberName(picked);renderWarAssignmentModalMembers();}}}});
 $("war-assignment-toolbar")?.addEventListener("input",e=>{if(e.target.id==="war-assignment-search"){warAssignmentSearch=e.target.value;applyWarAssignmentMemberFilters();}});
 document.body.addEventListener("click",e=>{if(e.target.closest("[data-war-modal-close]")){closeWarAssignmentModal();return;}const tab=e.target.closest("[data-war-modal-tab]");if(tab){const modal=$("war-assignment-modal"),skillsPanel=$("war-modal-skills-panel"),membersPanel=$("war-modal-members-panel"),active=tab.dataset.warModalTab;if(modal)modal.dataset.activeTab=active;modal?.querySelectorAll("[data-war-modal-tab]").forEach(b=>{const selected=b===tab;b.classList.toggle("is-active",selected);b.setAttribute("aria-selected",String(selected));});if(skillsPanel)skillsPanel.hidden=active!=="skills";if(membersPanel)membersPanel.hidden=active!=="members";if(active==="members")renderWarAssignmentModalMembers();return;}const uploadToggle=e.target.closest("[data-war-skill-upload-toggle]");if(uploadToggle){const form=$("war-member-skill-create-form");if(form)form.hidden=!form.hidden;return;}const add=e.target.closest("[data-war-modal-assign]"),remove=e.target.closest("[data-war-modal-remove]"),saveSkills=e.target.closest("[data-war-save-member-skills]"),cls=e.target.closest("[data-war-modal-class]"),reserveTab=e.target.closest("[data-war-modal-reserve]");if(reserveTab){const modal=$("war-assignment-modal");if(modal){modal.dataset.reserveOnly=modal.dataset.reserveOnly==="true"?"false":"true";reserveTab.classList.toggle("is-active",modal.dataset.reserveOnly==="true");modal.querySelector("[data-war-modal-class=\"all\"]")?.classList.toggle("is-active",modal.dataset.reserveOnly!=="true");renderWarAssignmentModalMembers();}return;}if(saveSkills){saveWarMemberSkills(saveSkills.dataset.warSaveMemberSkills,saveSkills);return;}if(add){assignWarMemberToSlot(add.dataset.warModalAssign);return;}if(remove&&warAssignmentModalSlot?.assignmentId){removeWarPartyMember(warAssignmentModalSlot.assignmentId,remove);return;}if(cls){const modal=$("war-assignment-modal");if(modal)modal.dataset.classFilter=cls.dataset.warModalClass||"all";modal?.querySelectorAll("[data-war-modal-class]").forEach(b=>b.classList.toggle("is-active",b===cls));renderWarAssignmentModalMembers();}});
 document.body.addEventListener("input",e=>{if(e.target.id==="war-modal-member-search")renderWarAssignmentModalMembers();});
  $("war-events")?.addEventListener("click",event=>{
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

  // Count active guild members per class (not portfolios), so the number
  // reflects how many characters can be found when that class is selected.
  const activeMembers = (allMembers || []).filter(member => member.active !== false);
  const totalCount = activeMembers.length;
  const classCounts = new Map();
  activeMembers.forEach(member => {
    const className = getMemberClass(member).trim().toLowerCase();
    if (className) classCounts.set(className, (classCounts.get(className) || 0) + 1);
  });

  container.innerHTML = `
    <button type="button" class="class-item class-filter-all ${portfolioClassFilter === "all" ? "is-active" : ""}" data-portfolio-class-filter="all" aria-pressed="${portfolioClassFilter === "all"}"><strong>All Classes</strong><span class="class-item-count">${totalCount}</span></button>
    ${CLASS_DATA.map((item) => {
      const count = classCounts.get(item.name.toLowerCase()) || 0;
      return `
        <button type="button" class="class-item ${portfolioClassFilter === item.name ? "is-active" : ""}" data-portfolio-class-filter="${escapeHTML(item.name)}" style="--class-color:${item.color}" aria-pressed="${portfolioClassFilter === item.name}">
          <img class="class-icon-image" src="${escapeHTML(item.iconPath)}" alt="" loading="lazy">
          <strong>${escapeHTML(item.name)}</strong>
          <span class="class-item-count">${count}</span>
        </button>
      `;
    }).join("")}
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
    leaders: members.filter(m => String(m.role || "").toLowerCase() === "leader").length,
    management: members.filter(m => String(m.role || "").toLowerCase() === "management").length,
    admins: members.filter(m => String(m.role || "").toLowerCase() === "admin").length,
    members: members.filter(m => String(m.role || "member").toLowerCase() === "member").length,
    pending: members.filter(m => m.active === false).length
  };

  const set = (id, value) => {
    const element = $(id);
    if (element) element.textContent = String(value);
  };
  set("system-role-total", counts.total);
  set("system-role-leaders", counts.leaders);
  set("system-role-management", counts.management);
  set("system-role-admin", counts.admins);
  set("system-role-members", counts.members);
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
    .select("user_id,character_name,nickname,discord_name,game_uid,role,active,created_at")
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

// ==========================================
// DEVELOPER — PORTFOLIO WEBP MIGRATION
// ==========================================
let portfolioWebpMigrationBusy = false;

function setPortfolioWebpMigrationStatus(message, tone = "muted") {
  const node = $("portfolio-webp-migration-status");
  if (node) {
    node.textContent = message;
    node.dataset.tone = tone;
  }
}

function setPortfolioWebpMigrationProgress(done, total) {
  const bar = $("portfolio-webp-migration-progress");
  const track = $("portfolio-webp-migration-track");
  const label = $("portfolio-webp-migration-progress-label");
  const percent = total ? Math.round((done / total) * 100) : 0;
  if (bar) bar.style.width = percent + "%";
  if (track) track.setAttribute("aria-valuenow", String(percent));
  if (label) label.textContent = total ? done + " / " + total + " · " + percent + "%" : "ยังไม่ได้เริ่ม";
}

async function invokePortfolioWebpMigration(body) {
  const { data, error } = await supabaseClient.functions.invoke("portfolio-webp-migration", { body });
  if (error) {
    const details = data?.message || error.message || "เรียก Migration Service ไม่สำเร็จ";
    throw new Error(details);
  }
  if (!data?.success) throw new Error(data?.message || "Migration Service ตอบกลับไม่สำเร็จ");
  return data;
}

async function getPortfolioWebpPathHash(path) {
  const bytes = new TextEncoder().encode(path);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function convertPortfolioImageToWebp(blob) {
  if (typeof createImageBitmap !== "function") throw new Error("เบราว์เซอร์นี้ไม่รองรับการอ่านภาพเพื่อแปลง WebP");
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("ไม่สามารถสร้าง Canvas สำหรับแปลงภาพได้");
    context.drawImage(bitmap, 0, 0);
    const webp = await new Promise((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error("แปลงภาพเป็น WebP ไม่สำเร็จ")), "image/webp", 0.84);
    });
    if (!(webp instanceof Blob) || webp.type !== "image/webp" || !webp.size) {
      throw new Error("เบราว์เซอร์ไม่สามารถสร้างไฟล์ WebP ที่ถูกต้องได้");
    }
    return { blob: webp, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close?.();
  }
}

async function migrateOnePortfolioWebpFile(file) {
  const { data: signed, error: signedError } = await supabaseClient.storage
    .from("portfolio-images").createSignedUrl(file.path, 300);
  if (signedError || !signed?.signedUrl) throw new Error(signedError?.message || "สร้างลิงก์อ่านไฟล์ต้นฉบับไม่สำเร็จ");

  const response = await fetch(signed.signedUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("ดาวน์โหลดภาพต้นฉบับไม่สำเร็จ (HTTP " + response.status + ")");
  const sourceBlob = await response.blob();
  if (!sourceBlob.size) throw new Error("ไฟล์ต้นฉบับว่างเปล่า");

  const converted = await convertPortfolioImageToWebp(sourceBlob);
  const hash = await getPortfolioWebpPathHash(file.path);
  const newPath = currentUser.id + "/portfolio-migration/" + hash + ".webp";
  const { error: uploadError } = await supabaseClient.storage.from("portfolio-images").upload(newPath, converted.blob, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: true
  });
  if (uploadError) throw new Error("อัปโหลด WebP ไม่สำเร็จ: " + uploadError.message);

  let updatedReferences = 0;
  for (let offset = 0; offset < file.rawValues.length; offset += 30) {
    const committed = await invokePortfolioWebpMigration({
      action: "commit",
      oldValues: file.rawValues.slice(offset, offset + 30),
      newPath
    });
    updatedReferences += Number(committed.updatedReferences || 0);
  }
  return {
    updatedReferences,
    originalBytes: sourceBlob.size,
    webpBytes: converted.blob.size,
    width: converted.width,
    height: converted.height
  };
}

async function runPortfolioWebpMigration() {
  if (portfolioWebpMigrationBusy) return;
  if (!isDeveloper() || isRolePreviewActive()) {
    alert("เครื่องมือนี้อนุญาตเฉพาะ Developer ที่ไม่ได้อยู่ใน Role Preview");
    return;
  }
  if (!currentUser?.id) {
    alert("ไม่พบเซสชันผู้ใช้ กรุณาเข้าสู่ระบบใหม่");
    return;
  }
  const button = $("portfolio-webp-migration-start");
  portfolioWebpMigrationBusy = true;
  if (button) { button.disabled = true; button.textContent = "กำลังตรวจสอบ..."; }
  setPortfolioWebpMigrationProgress(0, 0);
  setPortfolioWebpMigrationStatus("กำลังอ่านรายการภาพ Portfolio ที่ยังเป็น PNG/JPEG...", "working");

  let scan;
  try {
    scan = await invokePortfolioWebpMigration({ action: "scan" });
  } catch (error) {
    setPortfolioWebpMigrationStatus("ตรวจสอบรายการไม่สำเร็จ: " + error.message, "error");
    if (button) { button.disabled = false; button.textContent = "เริ่ม Migration"; }
    portfolioWebpMigrationBusy = false;
    return;
  }

  const files = Array.isArray(scan.files) ? scan.files : [];
  if (!files.length) {
    setPortfolioWebpMigrationProgress(0, 0);
    setPortfolioWebpMigrationStatus("ไม่พบภาพ PNG/JPEG ที่ต้องแปลงแล้ว · ไม่ต้องดำเนินการเพิ่มเติม", "success");
    const summary = $("portfolio-webp-migration-summary");
    if (summary) summary.textContent = "0 ไฟล์ · 0 References";
    if (button) { button.disabled = false; button.textContent = "ตรวจสอบอีกครั้ง"; }
    portfolioWebpMigrationBusy = false;
    return;
  }

  const confirmed = confirm(
    "ตรวจพบภาพที่ต้องแปลง\n\n" +
    "ไฟล์ไม่ซ้ำกัน: " + files.length + " ไฟล์\n" +
    "References: " + Number(scan.totalReferences || 0) + " จุด\n\n" +
    "ระบบจะแปลงทีละไฟล์เป็น WebP อัปโหลดไฟล์ใหม่ และเปลี่ยน Reference หลังตรวจสอบว่าไฟล์ใหม่ถูกอัปโหลดแล้วเท่านั้น\n\n" +
    "ไฟล์ต้นฉบับจะไม่ถูกลบ"
  );
  if (!confirmed) {
    setPortfolioWebpMigrationStatus("ยกเลิกก่อนเริ่มแปลงไฟล์ · ไม่มีการเปลี่ยนแปลงข้อมูล", "muted");
    if (button) { button.disabled = false; button.textContent = "เริ่ม Migration"; }
    portfolioWebpMigrationBusy = false;
    return;
  }

  let succeeded = 0, failed = 0, updatedRefs = 0, originalBytes = 0, webpBytes = 0;
  const failures = [];
  const summary = $("portfolio-webp-migration-summary");
  if (summary) summary.textContent = files.length + " ไฟล์ · " + Number(scan.totalReferences || 0) + " References";
  if (button) button.textContent = "กำลังแปลงภาพ...";
  setPortfolioWebpMigrationProgress(0, files.length);

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    setPortfolioWebpMigrationStatus(
      "กำลังแปลง " + (index + 1) + "/" + files.length + " · " + file.path.split("/").pop(),
      "working"
    );
    try {
      const result = await migrateOnePortfolioWebpFile(file);
      succeeded++;
      updatedRefs += result.updatedReferences;
      originalBytes += result.originalBytes;
      webpBytes += result.webpBytes;
    } catch (error) {
      failed++;
      failures.push({ name: file.path.split("/").pop(), message: error.message || "Unknown error" });
      console.error("Portfolio WebP migration failed:", file.path, error);
    }
    setPortfolioWebpMigrationProgress(index + 1, files.length);
    if (summary) summary.textContent =
      "สำเร็จ " + succeeded + " · ล้มเหลว " + failed + " · อัปเดต " + updatedRefs + " References";
  }

  const savedBytes = Math.max(0, originalBytes - webpBytes);
  const savedPercent = originalBytes ? Math.round((savedBytes / originalBytes) * 100) : 0;
  const finalMessage = failed
    ? "เสร็จบางส่วน · สำเร็จ " + succeeded + " ไฟล์ · ล้มเหลว " + failed + " ไฟล์ · สามารถกดเริ่มใหม่เพื่อทำรายการที่เหลือได้"
    : "Migration เสร็จสมบูรณ์ · แปลง " + succeeded + " ไฟล์ · อัปเดต " + updatedRefs + " References";
  setPortfolioWebpMigrationStatus(finalMessage, failed ? "warning" : "success");
  const details = $("portfolio-webp-migration-details");
  if (details) {
    details.textContent = "ขนาดต้นฉบับ " + (originalBytes / 1048576).toFixed(2) + " MB · WebP " +
      (webpBytes / 1048576).toFixed(2) + " MB · ลดลง " + (originalBytes ? savedPercent + "%" : "—") +
      " · เก็บไฟล์ต้นฉบับไว้ครบ";
  }
  const failureList = $("portfolio-webp-migration-failures");
  if (failureList) {
    failureList.textContent = failures.length
      ? "รายการที่ต้องลองใหม่: " + failures.slice(0, 8).map(item => item.name + " (" + item.message + ")").join(" · ")
      : "";
  }
  if (button) { button.disabled = false; button.textContent = failed ? "ลอง Migration รายการที่เหลืออีกครั้ง" : "ตรวจสอบอีกครั้ง"; }
  portfolioWebpMigrationBusy = false;
}

function registerPortfolioWebpMigrationEvents() {
  $("portfolio-webp-migration-start")?.addEventListener("click", () => { void runPortfolioWebpMigration(); });
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
 const isOfficialWarDate=input.matches("[data-war-signup-date]")&&$("war-signup-type")?.value==="official";
 const allowedWarDates=isOfficialWarDate?getNextFourWarSaturdays():null;
 let dateValue=globalPickerDateValue(input);
 if(allowedWarDates&&!allowedWarDates.includes(dateValue))dateValue="";
 let chosenDate=dateValue||"";
 let chosenTime=globalPickerTimeValue(input)||"20:00";
 const isDateTime=input.type==="datetime-local"||input.matches("[data-activity-datetime-input]");
 const panel=document.createElement("div");
 panel.className="war-date-picker-popover global-date-time-popover";
 panel.style.position="fixed";
 panel.style.zIndex="10000";
 const positionPanel=()=>{
  const rect=input.getBoundingClientRect(),pad=12,gap=8;
  const width=Math.min(320,window.innerWidth-pad*2);
  panel.style.width=width+"px";
  const height=panel.offsetHeight||360;
  let top=rect.bottom+gap;
  if(top+height>window.innerHeight-pad&&rect.top-height-gap>=pad)top=rect.top-height-gap;
  top=Math.max(pad,Math.min(top,window.innerHeight-height-pad));
  const left=Math.max(pad,Math.min(rect.left,window.innerWidth-width-pad));
  panel.style.left=left+"px";
  panel.style.top=top+"px";
 };
 const render=()=>{
  if(allowedWarDates){
   panel.innerHTML='<div class="war-date-picker-heading"><strong>เลือกวันเสาร์ 4 ครั้งถัดไป</strong></div><div class="war-calendar-grid war-next-saturdays">'+allowedWarDates.map(iso=>'<button type="button" class="war-calendar-day'+(iso===chosenDate?' is-selected':'')+'" data-global-date="'+iso+'">'+formatDisplayDate(iso)+'</button>').join("")+'</div>';
   panel.querySelectorAll("[data-global-date]").forEach(btn=>btn.addEventListener("click",()=>{setGlobalPickerValue(input,btn.dataset.globalDate,"");closeGlobalDateTimePicker();}));
   positionPanel();
   return;
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
  positionPanel();
 };
 const initial=dateValue?new Date(dateValue+"T12:00:00"):new Date();
 let view=new Date(initial.getFullYear(),initial.getMonth(),1);
 document.body.appendChild(panel);
 render();
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
let guildActivityCommentsRealtimeChannel=null;
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
   if(!$("page-dashboard")?.classList.contains("hidden")){loadDashboardAnnouncement();loadDashboardActivities();}
  })
  .subscribe();
}
function subscribeToGuildActivityCommentsRealtime(){
 if(guildActivityCommentsRealtimeChannel){supabaseClient.removeChannel(guildActivityCommentsRealtimeChannel);guildActivityCommentsRealtimeChannel=null;}
 if(!currentUser)return;
 guildActivityCommentsRealtimeChannel=supabaseClient.channel("guild-activity-comments-live-"+currentUser.id)
  .on("postgres_changes",{event:"*",schema:"public",table:"guild_activity_comments"},()=>{
   if(!$("page-community")?.classList.contains("hidden"))loadGuildActivityComments();
  })
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
 if(!file||!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type))throw new Error("รองรับ PNG, JPG, WEBP, GIF และ SVG");
 if(file.size>8*1024*1024)throw new Error("รูปต้องมีขนาดไม่เกิน 8 MB");
 const uploadFile=/^image\/(gif|svg\+xml)$/.test(file.type)?file:await prepareStorageImageForUpload(file,{maxDimension:1920,quality:0.88,forceWebP:true});
 const ext=uploadFile.type==="image/gif"?"gif":uploadFile.type==="image/svg+xml"?"svg":"webp";
 const path=currentUser.id+"/activities/"+crypto.randomUUID()+"."+ext;
 const {error}=await supabaseClient.storage.from(GUILD_ACTIVITY_BUCKET).upload(path,uploadFile,{contentType:uploadFile.type,cacheControl:"3600",upsert:false});
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
 if(!file||!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type))throw new Error("รองรับ PNG, JPG, WEBP, GIF และ SVG");
 if(file.size>8*1024*1024)throw new Error("รูปต้องมีขนาดไม่เกิน 8 MB");
 const uploadFile=/^image\/(gif|svg\+xml)$/.test(file.type)?file:await prepareStorageImageForUpload(file,{maxDimension:1920,quality:0.88,forceWebP:true});
 const ext=uploadFile.type==="image/gif"?"gif":uploadFile.type==="image/svg+xml"?"svg":"webp";
 const path=currentUser.id+"/feedback/"+crypto.randomUUID()+"."+ext;
 const {error}=await supabaseClient.storage.from(GUILD_ACTIVITY_BUCKET).upload(path,uploadFile,{contentType:uploadFile.type,cacheControl:"3600",upsert:false});
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
  let rows = feedbackRowsCache.filter(row => !row.deleted_at);
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
  } else {
    container.innerHTML = rows.map(row => {
      const memberLine = management
        ? '<div class="feedback-member-line">ผู้แจ้ง: <strong>' + escapeHTML(getFeedbackMemberLabel(row.user_id)) + '</strong></div>' : "";
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
      const deleteControl = management
        ? '<button type="button" class="feedback-delete-button" data-feedback-delete="' + escapeHTML(row.id) + '" aria-label="ลบรายการ" title="ลบรายการ">−</button>' : "";
      return '<article class="feedback-ticket-card" data-feedback-id="' + escapeHTML(row.id) + '">' +
        deleteControl +
        '<div class="feedback-ticket-topline"><span class="feedback-type-badge type-' + escapeHTML(row.type) + '">' +
        escapeHTML(FEEDBACK_TYPE_LABELS[row.type] || row.type) + '</span>' + feedbackStatusBadge(row.status) + '</div>' +
        '<h3>' + escapeHTML(row.title) + '</h3>' + memberLine +
        '<div class="feedback-ticket-content">' + sanitizeFeedbackHTML(row.content_html) + '</div>' +
        '<div class="feedback-ticket-footer"><span>ส่งเมื่อ ' + escapeHTML(formatDate(row.created_at)) + '</span>' + updated + discordStatus + '</div>' +
        (statusControl ? '<div class="feedback-ticket-management">' + statusControl + '</div>' : "") +
        '</article>';
    }).join("");
  }
  if (management) renderDeletedGuildFeedback();
}

function renderDeletedGuildFeedback() {
  const section = $("feedback-deleted-section");
  const list = $("guild-feedback-deleted-list");
  const audit = $("guild-feedback-audit-list");
  if (!section || !list || !isManagement()) return;
  section.classList.remove("hidden");
  const deleted = feedbackRowsCache.filter(row => row.deleted_at);
  if (!deleted.length) {
    showEmpty(list, "ไม่มีรายการที่ถูกลบ", "รายการที่ลบแบบ Soft Delete จะแสดงที่นี่ และสามารถกู้คืนได้");
  } else {
    list.innerHTML = deleted.map(row =>
      '<article class="feedback-deleted-row"><div><strong>' + escapeHTML(row.title) +
      '</strong><p>ผู้แจ้ง: ' + escapeHTML(getFeedbackMemberLabel(row.user_id)) +
      ' · ลบเมื่อ ' + escapeHTML(formatDate(row.deleted_at)) + '</p></div>' +
      '<button type="button" class="btn btn-outline btn-sm" data-feedback-restore="' + escapeHTML(row.id) + '">กู้คืน</button></article>'
    ).join("");
  }
  loadGuildFeedbackAuditLogs();
}

async function loadGuildFeedbackAuditLogs() {
  const list = $("guild-feedback-audit-list");
  if (!list || !isManagement()) return;
  const { data, error } = await supabaseClient.from("guild_feedback_audit_logs")
    .select("id,feedback_id,action,actor_name,actor_role,created_at")
    .order("created_at", { ascending: false }).limit(100);
  if (error) {
    showEmpty(list, "โหลดประวัติไม่สำเร็จ", error.message || "กรุณาลองใหม่");
    return;
  }
  if (!data?.length) {
    showEmpty(list, "ยังไม่มีประวัติ", "ประวัติการลบและกู้คืนจะแสดงที่นี่");
    return;
  }
  list.innerHTML = data.map(item =>
    '<div class="feedback-audit-row"><strong>' + (item.action === "deleted" ? "ลบรายการ" : "กู้คืนรายการ") +
    '</strong><span>' + escapeHTML(item.actor_name || "ผู้ดูแล") + ' · ' +
    escapeHTML(item.actor_role || "") + ' · ' + escapeHTML(formatDate(item.created_at)) + '</span></div>'
  ).join("");
}
async function deleteGuildFeedback(feedbackId, button) {
  if (!isManagement()) {
    alert("เฉพาะ Developer, Leader และ Management เท่านั้นที่ลบรายการได้");
    return;
  }
  if (!feedbackId) return;
  const row = feedbackRowsCache.find(item => item.id === feedbackId);
  const title = row?.title || "รายการนี้";
  if (!confirm("ยืนยันลบรายการแจ้งปัญหา / Feedback นี้หรือไม่?\\n\\n" + title + "\\n\\nการลบไม่สามารถกู้คืนได้")) return;

  if (button) {
    button.disabled = true;
    button.textContent = "กำลังลบ...";
  }
  try {
    const { error } = await supabaseClient.rpc("delete_guild_feedback_secure", {
      p_feedback_id: feedbackId
    });
    if (error) throw error;
    feedbackRowsCache = feedbackRowsCache.filter(item => item.id !== feedbackId);
    renderGuildFeedback();
  } catch (error) {
    console.error("Delete guild feedback:", error);
    alert("ลบรายการไม่สำเร็จ: " + (error.message || "กรุณาลองอีกครั้ง"));
    if (button) {
      button.disabled = false;
      button.textContent = "ลบรายการ";
    }
  }
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

async function clearAllFeedbackNotifications() {
  if (!currentUser || !feedbackNotificationsCache.length) return;
  const confirmed = confirm("ต้องการล้างการแจ้งเตือนทั้งหมดใช่หรือไม่?\\nรายการแจ้งเตือนของคุณจะถูกลบและไม่สามารถกู้คืนได้");
  if (!confirmed) return;
  const button = $("feedback-notification-clear-all");
  if (button) {
    button.disabled = true;
    button.textContent = "กำลังล้าง...";
  }
  try {
    // Request the deleted IDs back: Supabase can return no error when RLS
    // silently prevents a DELETE, so never clear the UI cache optimistically.
    const { data: deletedRows, error: deleteError } = await supabaseClient
      .from("guild_notifications")
      .delete()
      .eq("recipient_user_id", currentUser.id)
      .select("id");
    if (deleteError) throw deleteError;

    // Verify against the database before showing the empty state. This also
    // catches partial deletes and missing DELETE policies.
    const { data: remainingRows, error: verifyError } = await supabaseClient
      .from("guild_notifications")
      .select("id")
      .eq("recipient_user_id", currentUser.id)
      .limit(1);
    if (verifyError) throw verifyError;
    if (remainingRows?.length) {
      await loadFeedbackNotifications();
      alert("ล้างการแจ้งเตือนไม่สำเร็จ: ฐานข้อมูลยังมีรายการคงเหลือ กรุณาตรวจสอบสิทธิ์ DELETE (RLS) ของตาราง guild_notifications");
      return;
    }
    feedbackNotificationsCache = [];
    renderFeedbackNotifications();
  } catch (error) {
    console.error("Clear guild notifications:", error);
    await loadFeedbackNotifications();
    alert("ไม่สามารถล้างการแจ้งเตือนได้: " + (error?.message || "Unknown error"));
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "ล้างทั้งหมด";
    }
  }
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
      event: "*", schema: "public", table: "guild_notifications",
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
  $("feedback-notification-clear-all")?.addEventListener("click", clearAllFeedbackNotifications);
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
    const deleteButton = event.target.closest("[data-feedback-delete]");
    if (deleteButton) {
      await deleteGuildFeedback(deleteButton.dataset.feedbackDelete, deleteButton);
      return;
    }
    const restoreButton = event.target.closest("[data-feedback-restore]");
    if (restoreButton) {
      await restoreGuildFeedback(restoreButton.dataset.feedbackRestore, restoreButton);
      return;
    }
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
  const categories = ["เควสทั่วไป","ดันเจี้ยน","สกิลต่างๆ","Class อาชีพ","แนะนำ Build PvP","แนะนำ Build PvE","สำรวจแมพ","อื่นๆ"];
  select.innerHTML = '<option value="all">ทุกหมวดหมู่</option>' + categories.map(value => '<option value="' + escapeHTML(value) + '">' + escapeHTML(value) + '</option>').join("");
  select.value = categories.includes(current) ? current : "all";
}

async function loadGuildGuides() {
  const list = $("guild-guides-list");
  if (list) list.innerHTML = '<div class="empty-state"><span>◷</span><h3>กำลังโหลดไกด์เกม</h3><p>กรุณารอสักครู่</p></div>';
  const { data, error } = await supabaseClient.from("guild_guides").select("id,user_id,title,category,content_html,created_at,updated_at").order("updated_at", { ascending: false });
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
  $("guide-category-input").value = item?.category || "อื่นๆ";
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
  $("guide-category-input").value = "อื่นๆ";
  $("guide-editor-body").innerHTML = "";
  $("guide-preview-panel").classList.add("hidden");
  $("guide-editor-message").textContent = "";
}

async function uploadGuildGuideImage(file) {
  if (!currentUser || !currentMember || currentMember.active !== true) throw new Error("ไม่มีสิทธิ์อัปโหลดรูป");
  if (!file || !/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) throw new Error("รองรับ PNG, JPG, WEBP, GIF และ SVG");
  if (file.size > 8*1024*1024) throw new Error("รูปต้องมีขนาดไม่เกิน 8 MB");
  const uploadFile=/^image\/(gif|svg\+xml)$/.test(file.type)?file:await prepareStorageImageForUpload(file,{maxDimension:1920,quality:0.88,forceWebP:true});
  const ext=uploadFile.type==="image/gif"?"gif":uploadFile.type==="image/svg+xml"?"svg":"webp";
  const path=currentUser.id+"/guides/"+crypto.randomUUID()+"."+ext;
  const { error } = await supabaseClient.storage.from(GUILD_GUIDE_BUCKET).upload(path,uploadFile,{contentType:uploadFile.type,cacheControl:"3600",upsert:false});
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
  const insertAtGuideSelection = (node, savedRange) => {
    const body = $("guide-editor-body");
    body.focus();
    const selection = window.getSelection();
    let range = savedRange;
    if (!range || !body.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(body);
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    body.dispatchEvent(new InputEvent("input", {bubbles:true, inputType:"insertText"}));
  };

  $("guide-link-button")?.addEventListener("click", () => {
    const body = $("guide-editor-body");
    const selection = window.getSelection();
    const savedRange = selection && selection.rangeCount && body.contains(selection.getRangeAt(0).commonAncestorContainer)
      ? selection.getRangeAt(0).cloneRange() : null;
    const url = window.prompt("วาง URL ของเว็บไซต์หรือแหล่งข้อมูล (https://...)");
    if (!url || !/^https?:\/\//i.test(url.trim())) return;
    const label = window.prompt("ข้อความที่ต้องการให้แสดงบนลิงก์", url.trim()) || url.trim();
    const link = document.createElement("a");
    link.href = url.trim();
    link.textContent = label.trim() || url.trim();
    insertAtGuideSelection(link, savedRange);
  });

  $("guide-video-button")?.addEventListener("click", () => {
    const body = $("guide-editor-body");
    const selection = window.getSelection();
    const savedRange = selection && selection.rangeCount && body.contains(selection.getRangeAt(0).commonAncestorContainer)
      ? selection.getRangeAt(0).cloneRange() : null;
    const url = window.prompt("วางลิงก์วิดีโอ YouTube");
    if (!url) return;
    const match = url.trim().match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,20})/i);
    if (!match) { alert("ลิงก์ YouTube ไม่ถูกต้อง"); return; }
    const paragraph = document.createElement("p");
    const frame = document.createElement("iframe");
    frame.src = "https://www.youtube-nocookie.com/embed/" + match[1];
    frame.title = "YouTube video";
    frame.setAttribute("allowfullscreen", "");
    paragraph.appendChild(frame);
    insertAtGuideSelection(paragraph, savedRange);
  });

  $("guide-table-button")?.addEventListener("click", () => {
    const body = $("guide-editor-body");
    const selection = window.getSelection();
    const savedRange = selection && selection.rangeCount && body.contains(selection.getRangeAt(0).commonAncestorContainer)
      ? selection.getRangeAt(0).cloneRange() : null;
    const table = document.createElement("table");
    table.className = "guild-rich-table";
    const tbody = document.createElement("tbody");
    [["หัวข้อ","รายละเอียด"],["ข้อมูล","รายละเอียด"]].forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      row.forEach(value => {
        const cell = document.createElement(rowIndex === 0 ? "th" : "td");
        cell.textContent = value;
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    insertAtGuideSelection(table, savedRange);
    const paragraph = document.createElement("p");
    paragraph.appendChild(document.createElement("br"));
    table.after(paragraph);
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
 if(!file||!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type))throw new Error("รองรับ PNG, JPG, WEBP, GIF และ SVG");
 if(file.size>8*1024*1024)throw new Error("รูปต้องมีขนาดไม่เกิน 8 MB");
 const uploadFile=/^image\/(gif|svg\+xml)$/.test(file.type)?file:await prepareStorageImageForUpload(file,{maxDimension:1920,quality:0.88,forceWebP:true});
 const ext=uploadFile.type==="image/gif"?"gif":uploadFile.type==="image/svg+xml"?"svg":"webp",path=currentUser.id+"/"+key+"/"+crypto.randomUUID()+"."+ext;
 const {error}=await supabaseClient.storage.from(GUILD_RULE_BUCKET).upload(path,uploadFile,{contentType:uploadFile.type,cacheControl:"86400",upsert:false});if(error)throw error;
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
 const normalizedCandidate=candidate.startsWith("./assets/")?"/"+candidate.slice(2):(candidate.startsWith("assets/")?"/"+candidate:candidate);
 const isLegacyLogo=normalizedCandidate.includes("i.postimg.cc");
 const isLocalAsset=normalizedCandidate.startsWith("/");
 const safe=(!normalizedCandidate||isLegacyLogo)?GUILD_LOGO_FALLBACK:(isLocalAsset||/^https?:\/\//i.test(normalizedCandidate)?normalizedCandidate:GUILD_LOGO_FALLBACK);
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
 $("appearance-logo-upload")?.addEventListener("change",async e=>{if(!isManagement())return;const file=e.target.files?.[0];if(!file)return;if(!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)||file.size>5242880){showMessage("appearance-brand-message","รองรับ PNG/JPG/WEBP/GIF/SVG ไม่เกิน 5 MB");e.target.value="";return}try{const uploadFile=/^image\/(svg\+xml|gif)$/.test(file.type)?file:await prepareStorageImageForUpload(file,{maxDimension:1200,quality:0.9,forceWebP:true});const path="guild-logos/"+Date.now()+"-"+uploadFile.name.replace(/[^a-zA-Z0-9._-]/g,"-");const {error}=await supabaseClient.storage.from("guild-assets").upload(path,uploadFile,{contentType:uploadFile.type,cacheControl:"31536000",upsert:false});if(error)throw error;const url=supabaseClient.storage.from("guild-assets").getPublicUrl(path).data.publicUrl;appearanceState.activeLogoUrl=url;appearanceState.logoLibrary.unshift({name:file.name,url,storage_path:path});updateGuildLogo(url);await saveGuildAppearanceSettings();renderAppearancePage();showMessage("appearance-brand-message","อัปโหลดและตั้งโลโก้สำเร็จ","success")}catch(err){showMessage("appearance-brand-message","อัปโหลดไม่สำเร็จ: "+err.message+" — ตรวจสอบ SQL Migration / Storage policy")}finally{e.target.value=""}});
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
    const ownerOnly = item.hasAttribute("data-owner-only");
    const allowed = ownerOnly ? (isDeveloper() && !isRolePreviewActive()) : developerAllowed;
    item.classList.toggle("is-role-hidden", !allowed);
    item.setAttribute("aria-hidden", String(!allowed));
  });
}


const GUILD_URL_ROUTES = Object.freeze({
  "/dashboard": { page: "dashboard" },
  "/guild-rules": { page: "rules" },
  "/members": { page: "members" },
  "/members/list": { page: "members" },
  "/members/manage": { page: "member-management" },
  "/guildwar": { page: "war-center", warTab: "overview" },
  "/guildwar/overview": { page: "war-center", warTab: "overview" },
  "/guildwar/signup": { page: "war-center", warTab: "signup" },
  "/guildwar/announcement": { page: "war-center", warTab: "roster" },
  "/guildwar/leave": { page: "war-center", warTab: "leave" },
  "/guildwar/party": { page: "war-center", warTab: "party" },
  "/guildwar/results": { page: "war-center", warTab: "match-records" },
  "/guildwar/report": { page: "war-center", warTab: "attendance-report" },
  "/game-guides": { page: "guides" },
  "/portfolio": { page: "portfolio" },
  "/portfolio/members": { page: "portfolio" },
  "/portfolio/review": { page: "portfolio-review-center" },
  "/community": { page: "guild-news" },
  "/community/news": { page: "guild-news" },
  "/community/activities": { page: "guild-activities" },
  "/community/board": { page: "community-board" },
  "/duck-race": { page: "duck-race" },
  "/feedback": { page: "feedback" },
  "/system-management": { page: "system-management" },
  "/discord-integration": { page: "discord-integration" },
  "/developer-tools": { page: "developer-tools" },
  "/appearance": { page: "appearance" },
  "/settings": { page: "settings" }
});

const GUILD_MAIN_ROUTE_PATHS = Object.freeze({
  dashboard: "/dashboard",
  rules: "/guild-rules",
  members: "/members",
  "member-management": "/members/manage",
  "war-center": "/guildwar",
  war: "/guildwar/party",
  "war-attendance": "/guildwar/announcement",
  "war-signup": "/guildwar/signup",
  "war-leave": "/guildwar/leave",
  "war-stats": "/guildwar/results",
  "war-attendance-stats": "/guildwar/report",
  guides: "/game-guides",
  portfolio: "/portfolio",
  "portfolio-review-center": "/portfolio/review",
  "guild-news": "/community",
  "guild-activities": "/community/activities",
  "community-board": "/community/board",
  "duck-race": "/duck-race",
  feedback: "/feedback",
  "system-management": "/system-management",
  "discord-integration": "/discord-integration",
  "developer-tools": "/developer-tools",
  appearance: "/appearance",
  settings: "/settings"
});

const GUILD_TAB_ROUTE_PATHS = Object.freeze({
  members: "/members/list",
  "member-management": "/members/manage",
  war: "/guildwar/party",
  "war-attendance": "/guildwar/announcement",
  "war-signup": "/guildwar/signup",
  "war-leave": "/guildwar/leave",
  "war-stats": "/guildwar/results",
  "war-attendance-stats": "/guildwar/report",
  portfolio: "/portfolio/members",
  "portfolio-review-center": "/portfolio/review",
  "guild-news": "/community/news",
  "guild-activities": "/community/activities",
  "community-board": "/community/board"
});

function normalizeGuildRoutePath(path) {
  const value = String(path || "/").split("?")[0].split("#")[0];
  const normalized = value.replace(/\/+$/, "") || "/";
  return normalized.toLowerCase();
}

function getGuildDefaultRoutePath(pageName) {
  if (pageName === "war-center") {
    const warPaths = {
      overview: "/guildwar",
      signup: "/guildwar/signup",
      roster: "/guildwar/announcement",
      leave: "/guildwar/leave",
      party: "/guildwar/party",
      "match-records": "/guildwar/results",
      "attendance-report": "/guildwar/report"
    };
    return warPaths[window.activeWarCenterTab || "overview"] || "/guildwar";
  }
  return GUILD_MAIN_ROUTE_PATHS[pageName] || null;
}

function getGuildTabRoutePath(pageName) {
  return GUILD_TAB_ROUTE_PATHS[pageName] || getGuildDefaultRoutePath(pageName);
}

function resolveGuildBrowserRoute(path) {
  return GUILD_URL_ROUTES[normalizeGuildRoutePath(path)] || null;
}

const LAST_GUILD_PAGE_KEY = "4am-guild:last-page";

function getLastGuildPage() {
  const currentPath = normalizeGuildRoutePath(window.location.pathname);
  const currentRoute = resolveGuildBrowserRoute(currentPath);

  if (currentRoute) {
    window.__guildInitialRoute = {
      path: currentPath,
      warTab: currentRoute.warTab || null
    };
    return currentRoute.page;
  }

  if (currentPath !== "/") {
    window.__guildInitialRoute = { path: "/dashboard", warTab: null };
    return "dashboard";
  }

  try {
    const savedPage = window.localStorage.getItem(LAST_GUILD_PAGE_KEY);
    return savedPage && PAGE_TITLES[savedPage] ? savedPage : "dashboard";
  } catch (error) {
    console.warn("Unable to restore last page:", error);
    return "dashboard";
  }
}

function loadWarCenterTab(tab = "overview") {
  const valid = ["overview","party","roster","signup","leave","match-records","attendance-report"];
  const active = valid.includes(tab) ? tab : "overview";
  window.activeWarCenterTab = active;
  const panels = {overview:"war-center-overview",party:"page-war",roster:"page-war-attendance",signup:"page-war-signup",leave:"page-war-leave","match-records":"page-war-stats","attendance-report":"page-war-attendance-stats"};
  Object.values(panels).forEach(id => $(id)?.classList.add("hidden"));
  $(panels[active])?.classList.remove("hidden");
  document.querySelectorAll("[data-war-center-tab]").forEach(button => {
    const selected = button.dataset.warCenterTab === active;
    button.classList.toggle("is-active", selected);
    if (button.closest(".war-center-tabs")) button.setAttribute("aria-current", selected ? "page" : "false");
  });
  if(active==="party"&&isManagement())loadWarEvents();
  if(active==="roster")loadWarAttendance();
  if(active==="signup")loadWarSignups();
  if(active==="leave")loadWarLeavePage();
  if(active==="match-records"&&isManagement())loadWarMatchRecords();
  if(active==="attendance-report"&&isManagement())loadWarAttendanceStatistics();
}

function openGuildPage(pageName, options = {}) {
  if (
    (["war","war-stats","war-attendance-stats"].includes(pageName) ||
      (pageName === "war-center" && ["party","match-records","attendance-report"].includes(options.warTab))) &&
    !isManagement()
  ) {
    pageName = "war-attendance";
  }
  if (pageName === "member-management" && !isManagement()) pageName = "members";
  if (pageName === "system-management" && !isDeveloper()) {
    pageName = "dashboard";
  }
  if (pageName === "developer-tools" && (!isDeveloper() || isRolePreviewActive() || currentMember?.active !== true)) {
    pageName = "dashboard";
  }
  if (pageName === "appearance" && (!isDeveloper() || isRolePreviewActive())) {
    pageName = "dashboard";
  }
  if (pageName === "portfolio-review-center" && !isManagement()) pageName = "portfolio";
  if (pageName === "discord-integration" && (!isDeveloper() || isRolePreviewActive())) {
    pageName = "dashboard";
  }

  const warTabs = {war:"party","war-attendance":"roster","war-signup":"signup","war-leave":"leave","war-stats":"match-records","war-attendance-stats":"attendance-report"};
  if(warTabs[pageName]){window.activeWarCenterTab=warTabs[pageName];pageName="war-center";}
  else if(pageName==="war-center"){window.activeWarCenterTab=options.warTab || "overview";}

  // Remember the current section so a hard refresh returns to the same page.
  try {
    window.localStorage.setItem(LAST_GUILD_PAGE_KEY, pageName);
  } catch (error) {
    console.warn("Unable to save current page:", error);
  }

  const pendingInitialRoute = window.__guildInitialRoute;
  const requestedPath = options.routePath || pendingInitialRoute?.path || null;
  const requestedRoute = requestedPath ? resolveGuildBrowserRoute(requestedPath) : null;
  const requestedRouteMatches = requestedRoute &&
    requestedRoute.page === pageName &&
    (!requestedRoute.warTab || requestedRoute.warTab === (window.activeWarCenterTab || "overview"));
  const nextRoutePath = requestedRouteMatches
    ? normalizeGuildRoutePath(requestedPath)
    : getGuildDefaultRoutePath(pageName);

  if (pendingInitialRoute) window.__guildInitialRoute = null;

  if (nextRoutePath && options.skipHistory !== true &&
      normalizeGuildRoutePath(window.location.pathname) !== nextRoutePath) {
    const method = options.replaceHistory || pendingInitialRoute ? "replaceState" : "pushState";
    window.history[method]({ guildRoute: true }, "", nextRoutePath);
  }

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.add("hidden");
  });

  const communityViews = ["community-board", "guild-news", "guild-activities"];
  const isCommunityView = communityViews.includes(pageName);
  const targetPage = $(isCommunityView ? "page-community" : "page-" + pageName);
  if (targetPage) targetPage.classList.remove("hidden");

  // Render the requested Guild War panel before background subscriptions.
  // A Realtime setup failure must never prevent the user from switching tabs.
  if (pageName === "war-center") {
    loadWarCenterTab(window.activeWarCenterTab || "overview");
  }
  try {
    syncAppRealtimeSubscriptions(pageName);
  } catch (error) {
    console.error("Realtime subscription sync failed; page navigation continues:", error);
  }
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

  const warPage = pageName === "war-center";
  const warParent = document.querySelector('[data-toggle-submenu="war-submenu"]');
  const warSubmenu = $("war-submenu");
  warParent?.classList.toggle("active", warPage);
  if (warPage && warSubmenu) warSubmenu.classList.add("is-open");

  const portfolioPages = ["portfolio", "portfolio-review-center"];
  document.querySelectorAll('.sidebar [data-page="portfolio"]').forEach(button => button.classList.toggle("active", portfolioPages.includes(pageName)));

  const guildCommunityPages = ["community-board", "guild-news", "guild-activities"];
  document.querySelectorAll('.sidebar [data-page="community-board"]').forEach(button => button.classList.toggle("active", guildCommunityPages.includes(pageName)));

  const memberPages = ["members", "member-management"];
  document.querySelectorAll('.sidebar [data-page="members"]').forEach(button => button.classList.toggle("active", memberPages.includes(pageName)));

  document.querySelectorAll(".section-tab-navigation [data-go-page]").forEach(button => {
    const active = button.dataset.goPage === pageName;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  document.title = `${PAGE_TITLES[pageName] || "4AM GUILD"} | 4AM GUILD`;

  closeUserMenu();
  window.scrollTo({ top: 0 });

  if (pageName === "members") loadMembers();
  if (pageName === "member-management" && isManagement()) window.memberManagementLoadPromise = loadManualMemberManagement();
  if (pageName === "system-management") loadSystemRoleMembers();
  if (pageName === "discord-integration") loadDiscordIntegrationSettings();

  if (pageName === "dashboard") {
    loadDashboardAnnouncement();
    loadDashboardGallery();
  }
  if (pageName === "settings") {
    renderAccountDetails();
    loadDiscordAccount();
  }
  if (pageName === "appearance") renderAppearancePage();

  if (pageName === "portfolio" || pageName === "portfolio-review-center") loadPortfolios();
  if (pageName === "rules") loadGuildRules();
  if (["community-board", "guild-news", "guild-activities"].includes(pageName)) {
    loadGuildActivities();
  }
  if (pageName === "feedback") loadGuildFeedback();
  if (pageName === "guides") loadGuildGuides();
}

async function copyGameUID(button) {
  const uid = String(button?.dataset.gameUid || "");
  if (!/^[0-9]{1,12}$/.test(uid)) return;

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

  if (!/^[0-9]{5,12}$/.test(uid)) {
    showMessage("game-uid-message", "UID ตัวละครต้องเป็นตัวเลข 5–12 หลัก");
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
  const nickname = String(form.querySelector("[name='nickname']")?.value || "").trim();
  const gameClass = String(form.querySelector("[name='game_class']")?.value || "").trim();
  const gameUID = String(form.querySelector("[name='game_uid']")?.value || "").trim();
  const ageRaw = String(form.querySelector("[name='age']")?.value || "").trim();
  const age = ageRaw ? Number(ageRaw) : null;
  const button = form.querySelector("button[type='submit']");
  if (!characterName) { showMessage("account-profile-status", "กรุณากรอกชื่อตัวละคร"); return; }
  if (characterName.length > 40) { showMessage("account-profile-status", "ชื่อตัวละครต้องไม่เกิน 40 ตัวอักษร"); return; }
  if (!nickname) { showMessage("account-profile-status", "กรุณากรอกชื่อเล่น"); return; }
  if (nickname.length > 40) { showMessage("account-profile-status", "ชื่อเล่นต้องไม่เกิน 40 ตัวอักษร"); return; }
  if (ageRaw && (!Number.isInteger(age) || age < 1 || age > 120)) { showMessage("account-profile-status", "กรุณากรอกอายุเป็นตัวเลข 1–120 ปี"); return; }
  if (!CLASS_DATA.some(item => item.name === gameClass)) { showMessage("account-profile-status", "กรุณาเลือกอาชีพจากรายการ"); return; }
  if (gameUID !== String(currentMember.game_uid || "") && !/^[0-9]{5,12}$/.test(gameUID)) { showMessage("account-profile-status", "UID ตัวละครใหม่ต้องเป็นตัวเลข 5–12 หลัก"); return; }
  if (button) { button.disabled = true; button.textContent = "กำลังบันทึก..."; }
  showMessage("account-profile-status", "กำลังบันทึกข้อมูลบัญชี...", "info");
  try {
    const { data, error } = await supabaseClient.from("guild_members")
      .update({ character_name: characterName, nickname, age, game_class: gameClass, game_uid: gameUID })
      .eq("user_id", currentUser.id)
      .select("user_id, character_name, nickname, age, game_class, game_uid")
      .single();
    if (error) throw error;
    Object.assign(currentMember, { character_name: data.character_name, nickname: data.nickname, age: data.age, game_class: data.game_class, game_uid: data.game_uid });
    const cachedMember = allMembers.find(member => member.user_id === currentUser.id);
    if (cachedMember) Object.assign(cachedMember, { character_name: data.character_name, nickname: data.nickname, age: data.age, game_class: data.game_class, game_uid: data.game_uid });
    const directoryCachedMember = directoryMembers.find(member => member.user_id === currentUser.id);
    if (directoryCachedMember) Object.assign(directoryCachedMember, { character_name: data.character_name, nickname: data.nickname, age: data.age, game_class: data.game_class, game_uid: data.game_uid });
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
      <div class="settings-detail"><span>ชื่อเล่น</span><strong>${escapeHTML(currentMember?.nickname || "ยังไม่ได้ตั้งชื่อเล่น")}</strong></div>
      <div class="settings-detail"><span>อายุ</span><strong>${currentMember?.age ? escapeHTML(currentMember.age) + " ปี" : "ยังไม่ได้ระบุ"}</strong></div>
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
      <label for="account-nickname">ชื่อเล่น</label>
      <input id="account-nickname" name="nickname" type="text" maxlength="40" autocomplete="nickname" placeholder="กรอกชื่อเล่น" value="${escapeHTML(currentMember?.nickname || "")}" required>
      <label for="account-age">อายุ</label>
      <input id="account-age" name="age" type="number" inputmode="numeric" min="1" max="120" step="1" placeholder="กรอกอายุ (1–120 ปี)" value="${escapeHTML(currentMember?.age ?? "")}">
      <label for="account-game-class">Class อาชีพ</label>
      <div class="account-class-select-wrap">
        <img id="account-class-preview" class="account-class-icon" src="${escapeHTML(classIcon)}" alt="" onerror="this.style.display='none'">
        <select id="account-game-class" name="game_class" required>
          ${CLASS_DATA.map(item => '<option value="' + escapeHTML(item.name) + '" ' + (item.name === currentMember?.game_class ? 'selected' : '') + '>' + escapeHTML(item.name) + '</option>').join("")}
        </select>
      </div>
      <label for="account-game-uid">UID ตัวละคร (5–12 หลัก)</label>
      <input id="account-game-uid" name="game_uid" type="text" inputmode="numeric" pattern="[0-9]{5,12}" minlength="5" maxlength="12" placeholder="กรอก UID ใหม่ 5–12 หลัก" value="${escapeHTML(currentMember?.game_uid || "")}" autocomplete="off" required>
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
  ["guild_activity_published", "ประกาศกิจกรรมกิลด์"],
  ["guild_activity_comment", "แจ้งเตือนคอมเมนท์กิจกรรมกิลด์"],
  ["feedback_submitted", "แจ้งเตือน Feedback"],
  ["duck_race_results", "ประกาศผล Duck Race"],
  ["member_joined", "แจ้งเตือนสมาชิกใหม่"],
  ["war_signup_opened", "ประกาศลงชื่อวอร์"],
  ["war_signup_closed", "ประกาศปิดรับสมัครวอร์"],
  ["war_leave_discord_submitted", "แจ้งลาวอร์ผ่าน Discord Bot"],
  ["war_roster_published", "ประกาศตี้วอร์"],
  ["war_checkin_opened", "ยืนยันความพร้อมก่อนลงวอร์"],
  ["war_attendance_finalized", "สรุปผลการเข้าร่วมวอร์"],
  ["portfolio_published", "แจ้งเตือนการทำแฟ้มผลงาน"]
];

function canManageDiscordIntegration() {
  if (isRolePreviewActive()) return false;
  const userId = String(currentUser?.id || "");
  if (userId === "378b09df-16a0-4d01-8908-2604c2c210a9") return true;
  const role = String(currentMember?.role || "").toLowerCase();
  return currentMember?.active === true
    && currentMember?.membership_status === "active"
    && ["developer", "leader", "management"].includes(role);
}

function updateDiscordRouteOverview() {
  const rows = [...document.querySelectorAll("[data-discord-route]")];
  const enabled = rows.filter(row => row.querySelector("[data-discord-route-enabled]")?.checked).length;
  const missing = rows.filter(row => !String(row.querySelector("[data-discord-route-channel]")?.value || "").trim()).length;
  const overview = $("discord-route-overview");
  if (overview) overview.innerHTML = [
    ["EVENT ทั้งหมด", rows.length, "total"],
    ["เปิดใช้งาน", enabled, "on"],
    ["ปิดใช้งาน", rows.length - enabled, "off"],
    ["ยังไม่กำหนดห้อง", missing, "missing"]
  ].map(([label,value,key]) => `<div class="discord-route-stat" data-stat="${key}"><span>${label}</span><strong>${value}</strong></div>`).join("");
}
function filterDiscordIntegrationRoutes() {
  const query = String($("discord-route-search")?.value || "").trim().toLocaleLowerCase();
  const filter = $("discord-route-filter")?.value || "all";
  document.querySelectorAll("[data-discord-route]").forEach(row => {
    const label = String(row.querySelector("[data-discord-route-label]")?.value || "").toLocaleLowerCase();
    const channel = String(row.querySelector("[data-discord-route-channel]")?.value || "");
    const enabled = row.querySelector("[data-discord-route-enabled]")?.checked === true;
    const matchesQuery = !query || label.includes(query);
    const matchesFilter = filter === "all" || (filter === "on" && enabled) || (filter === "off" && !enabled) || (filter === "missing" && !channel.trim());
    row.hidden = !(matchesQuery && matchesFilter);
  });
  document.querySelectorAll("[data-discord-route-section]").forEach(section => {
    section.hidden = !section.querySelector("[data-discord-route]:not([hidden])");
  });
}
async function loadDiscordChannelsForPicker(button, select, force = false) {
  if (!select) return;
  const picker = select.closest("[data-discord-channel-picker]");
  const status = picker?.querySelector("[data-discord-channel-status]");
  if (!force && select.dataset.channelsLoaded === "true") return;
  if (select.dataset.channelsLoading === "true") return;
  const currentId = select.dataset.channelTarget === "test"
    ? String($("discord-integration-test-channel")?.value || "")
    : String(picker?.closest("[data-discord-route]")?.querySelector("[data-discord-route-channel]")?.value || "");
  select.dataset.channelsLoading = "true";
  if (button) {
    button.disabled = true;
    button.classList.add("is-loading");
  }
  select.disabled = true;
  if (status) status.textContent = "กำลังโหลดรายชื่อห้องจาก Discord...";
  try {
    const data = await invokeEmbedStudio("list_channels", {});
    const channels = Array.isArray(data.channels) ? data.channels : [];
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = channels.length ? "เลือกห้อง Discord..." : "ไม่พบห้องใน Server";
    select.appendChild(placeholder);
    const grouped = new Map();
    channels.forEach(channel => {
      const category = channel.category_name || "ไม่มีหมวดหมู่";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(channel);
    });
    grouped.forEach((items, category) => {
      const group = document.createElement("optgroup");
      group.label = category;
      items.forEach(channel => {
        const option = document.createElement("option");
        option.value = channel.id;
        const typeLabel = channel.type_label || (Number(channel.type) === 5 ? "ประกาศ" : "ข้อความ");
        const permissionLabel = channel.can_send ? "ส่งได้" : (channel.can_view ? "ดูได้ · ส่งไม่ได้" : "Bot ไม่มีสิทธิ์ดู");
        option.textContent = "#" + channel.name + " · " + typeLabel + " · " + permissionLabel;
        option.disabled = !channel.can_send;
        group.appendChild(option);
      });
      select.appendChild(group);
    });
    if (currentId && !channels.some(channel => channel.id === currentId)) {
      const existing = document.createElement("option");
      existing.value = currentId;
      existing.textContent = "Channel ปัจจุบัน (" + currentId + ") · Bot อาจไม่มีสิทธิ์ส่ง";
      select.appendChild(existing);
    }
    select.value = currentId || "";
    select.dataset.channelsLoaded = "true";
    select.disabled = false;
    if (status) status.textContent = "พบ " + channels.length + " ห้องใน " + (data.guild?.name || "Discord") + " · เลือกได้เฉพาะห้องที่ Bot ส่งข้อความได้";
  } catch (error) {
    select.dataset.channelsLoaded = "false";
    select.innerHTML = '<option value="">โหลดรายชื่อห้องไม่สำเร็จ · ลองรีเฟรช</option>';
    select.disabled = false;
    if (status) status.textContent = error.message || "โหลดรายชื่อห้องไม่สำเร็จ";
  } finally {
    select.dataset.channelsLoading = "false";
    if (button) {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }
}

async function saveDiscordChannelSelection(select) {
  const channelId = String(select?.value || "").trim();
  if (!select || !/^\d{17,20}$/.test(channelId)) return;
  const picker = select.closest("[data-discord-channel-picker]");
  const status = picker?.querySelector("[data-discord-channel-status]");
  const button = picker?.querySelector("[data-discord-refresh-channels]");
  select.disabled = true;
  if (button) button.disabled = true;
  if (status) status.textContent = "กำลังบันทึก Channel ID...";
  try {
    if (select.dataset.channelTarget === "test") {
      const { data, error } = await supabaseClient.from("guild_discord_integration_settings")
        .update({ test_channel_id: channelId, updated_by: currentUser.id, updated_at: new Date().toISOString() })
        .eq("id", 1).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("ไม่พบแถวการตั้งค่า Discord Integration");
      $("discord-integration-test-channel").value = channelId;
    } else {
      const routeKey = String(select.dataset.routeKey || "");
      const row = select.closest("[data-discord-route]");
      const { data, error } = await supabaseClient.from("guild_discord_event_routes")
        .update({ channel_id: channelId, updated_by: currentUser.id, updated_at: new Date().toISOString() })
        .eq("event_key", routeKey).select("event_key").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("ไม่พบ Route ที่ต้องการบันทึก");
      const hiddenInput = row?.querySelector("[data-discord-route-channel]");
      if (hiddenInput) hiddenInput.value = channelId;
      updateDiscordRouteOverview();
      filterDiscordIntegrationRoutes();
    }
    if (status) status.textContent = "บันทึกห้อง Discord เรียบร้อยแล้ว · Channel ID: " + channelId;
  } catch (error) {
    if (status) status.textContent = "บันทึกไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด");
    showMessage("discord-integration-message", "บันทึก Channel ไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด"));
  } finally {
    select.disabled = false;
    if (button) button.disabled = false;
  }
}

const DEFAULT_DISCORD_ROUTE_GROUPS = [
  { id: "general", title: "แจ้งเตือนทั่วไป", keys: ["member_joined"] },
  { id: "war", title: "Guild War", keys: ["war_signup_opened", "war_signup_closed", "war_leave_discord_submitted", "war_roster_published", "war_checkin_opened", "war_attendance_finalized"] },
  { id: "portfolio", title: "แฟ้มผลงาน", keys: ["portfolio_published"] },
  { id: "guild", title: "Guild Community", keys: ["guild_activity_published", "guild_activity_comment", "duck_race_results"] },
  { id: "feedback", title: "แจ้งปัญหา / Feedback", keys: ["feedback_submitted"] }
];
let discordRouteLayout = null;
let discordRouteDraggingCard = null;

function normalizeDiscordRouteLayout(savedLayout) {
  const validKeys = new Set(DISCORD_EVENT_ROUTE_DEFINITIONS.map(([key]) => key));
  const assigned = new Set();
  const savedSections = Array.isArray(savedLayout?.sections) ? savedLayout.sections : [];
  const sections = DEFAULT_DISCORD_ROUTE_GROUPS.map(group => {
    const saved = savedSections.find(section => section?.id === group.id);
    const requested = Array.isArray(saved?.keys) ? saved.keys : group.keys;
    const keys = requested.filter(key => validKeys.has(key) && !assigned.has(key));
    keys.forEach(key => assigned.add(key));
    return { id: group.id, title: group.title, keys };
  });
  DEFAULT_DISCORD_ROUTE_GROUPS.forEach(group => {
    group.keys.forEach(key => {
      if (validKeys.has(key) && !assigned.has(key)) {
        sections.find(section => section.id === group.id).keys.push(key);
        assigned.add(key);
      }
    });
  });
  return { sections };
}

async function saveDiscordRouteLayoutFromDOM(container) {
  const layout = {
    sections: [...container.querySelectorAll("[data-discord-route-section]")].map(section => ({
      id: section.dataset.discordRouteSection,
      keys: [...section.querySelectorAll("[data-discord-route]")].map(card => card.dataset.discordRoute)
    }))
  };
  const normalized = normalizeDiscordRouteLayout(layout);
  const { error } = await supabaseClient.from("guild_discord_route_layout").upsert({
    id: 1,
    layout: normalized,
    updated_by: currentUser.id,
    updated_at: new Date().toISOString()
  }, { onConflict: "id" });
  if (error) throw error;
  discordRouteLayout = normalized;
  container.querySelectorAll("[data-discord-route-section]").forEach(section => {
    const count = section.querySelector(".discord-route-section-heading span");
    if (count) count.textContent = section.querySelectorAll("[data-discord-route]").length + " EVENTS";
  });
}

function registerDiscordRouteDragEvents(container) {
  if (container.dataset.dragEventsReady === "true") return;
  container.dataset.dragEventsReady = "true";
  container.addEventListener("dragstart", event => {
    const handle = event.target.closest?.(".discord-route-drag-handle");
    if (!handle || !canManageDiscordIntegration()) { event.preventDefault(); return; }
    discordRouteDraggingCard = handle.closest("[data-discord-route]");
    if (!discordRouteDraggingCard) { event.preventDefault(); return; }
    discordRouteDraggingCard.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", discordRouteDraggingCard.dataset.discordRoute || "");
    }
  });
  container.addEventListener("dragover", event => {
    if (!discordRouteDraggingCard) return;
    const grid = event.target.closest?.(".discord-route-section-grid");
    const targetCard = event.target.closest?.("[data-discord-route]");
    if (!grid && !targetCard) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    if (targetCard && targetCard !== discordRouteDraggingCard) {
      const rect = targetCard.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2 ||
        (Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height * 0.25 && event.clientX > rect.left + rect.width / 2);
      targetCard.parentElement.insertBefore(discordRouteDraggingCard, after ? targetCard.nextSibling : targetCard);
    } else if (grid && grid !== discordRouteDraggingCard.parentElement && !grid.contains(discordRouteDraggingCard)) {
      grid.appendChild(discordRouteDraggingCard);
    }
  });
  container.addEventListener("drop", async event => {
    if (!discordRouteDraggingCard) return;
    event.preventDefault();
    discordRouteDraggingCard.classList.remove("is-dragging");
    discordRouteDraggingCard = null;
    try {
      await saveDiscordRouteLayoutFromDOM(container);
      const status = $("discord-integration-load-status");
      if (status) status.textContent = "บันทึกตำแหน่งการ์ดเรียบร้อยแล้ว · ทุกคนเห็นการจัดเรียงเดียวกัน";
      showMessage("discord-integration-message", "บันทึกตำแหน่งการ์ดเรียบร้อยแล้ว", "success");
    } catch (error) {
      console.error("Save Discord route layout:", error);
      showMessage("discord-integration-message", "บันทึกตำแหน่งการ์ดไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด"));
      await loadDiscordIntegrationSettings();
    }
  });
  container.addEventListener("dragend", () => {
    discordRouteDraggingCard?.classList.remove("is-dragging");
    discordRouteDraggingCard = null;
  });
}

function renderDiscordIntegrationRoutes(routes = [], savedLayout = null) {
  const container = $("discord-integration-routes");
  if (!container) return;
  const routeMap = new Map((routes || []).map(route => [route.event_key, route]));
  discordRouteLayout = normalizeDiscordRouteLayout(savedLayout);
  const routeCards = new Map(DISCORD_EVENT_ROUTE_DEFINITIONS.map(([key, label]) => {
    const route = routeMap.get(key) || {};
    const displayLabel = route.event_label || label;
    return [key, `
      <div class="discord-route-row" data-discord-route="${escapeHTML(key)}">
        <div class="discord-route-card-heading">
          <button type="button" class="discord-route-drag-handle" draggable="true" aria-label="ลากเพื่อย้ายการ์ด ${escapeHTML(displayLabel)}" title="ลากเพื่อจัดเรียงหรือย้ายโซน">⠿</button>
          <h4>${escapeHTML(displayLabel)}</h4>
          <span class="discord-route-status ${route.enabled ? "is-on" : "is-off"}">${route.enabled ? "ON" : "OFF"}</span>
        </div>
        <label class="discord-route-field">
          <span>ชื่อ Event</span>
          <input class="discord-route-label-input" type="text" maxlength="80" required data-discord-route-label
            aria-label="ชื่อ Event สำหรับ ${escapeHTML(displayLabel)}" title="แก้ไขชื่อ Event"
            value="${escapeHTML(displayLabel)}">
        </label>
        <label class="discord-route-field">
          <span>ห้อง Discord สำหรับ Event นี้</span>
          <input type="hidden" data-discord-route-channel value="${escapeHTML(route.channel_id || "")}">
          <div class="discord-channel-picker" data-discord-channel-picker="route" data-route-key="${escapeHTML(key)}">
            <div class="discord-channel-select-row">
              <select data-discord-channel-select data-channel-target="route" data-route-key="${escapeHTML(key)}" aria-label="เลือกห้อง Discord สำหรับ ${escapeHTML(displayLabel)}">
                <option value="">${route.channel_id ? "ห้องที่เลือกไว้ · กำลังโหลดชื่อ..." : "เลือกห้อง Discord..."}</option>
              </select>
              <button type="button" class="discord-channel-refresh" data-discord-refresh-channels aria-label="รีเฟรชรายชื่อห้อง Discord" title="รีเฟรชรายชื่อห้อง"><i class="fa-solid fa-rotate" aria-hidden="true"></i></button>
            </div>
            <small data-discord-channel-status>เปิดรายการห้องเพื่อโหลดจาก Discord อัตโนมัติ</small>
          </div>
        </label>
        ${key === "war_leave_discord_submitted" ? '<p class="discord-route-description">การ์ดแยกสำหรับกำหนดห้องรับแจ้งเตือนเมื่อสมาชิกส่งคำแจ้งลาผ่าน Discord Bot · ต้องเชื่อมการทำงานฝั่ง Bot ก่อนเปิดใช้งานจริง</p>' : ''}
        <div class="discord-route-card-footer">
          <span class="discord-route-footer-state ${route.enabled ? "is-on" : "is-off"}">${route.enabled ? "ON" : "OFF"}</span>
          <label class="discord-route-enabled" aria-label="เปิดหรือปิดการแจ้งเตือน">
            <input type="checkbox" data-discord-route-enabled ${route.enabled ? "checked" : ""}>
            <span class="discord-route-switch-state"></span>
          </label>
          ${key === "war_leave_discord_submitted" ? "" : '<button type="button" class="discord-route-manage-embed" data-discord-embed-manage="' + escapeHTML(key) + '">จัดการ Embed</button>'}
        </div>
      </div>`];
  }));
  container.innerHTML = discordRouteLayout.sections.map(group => {
    const cards = group.keys.map(key => routeCards.get(key)).filter(Boolean).join("");
    return `
      <section class="discord-route-section" data-discord-route-section="${group.id}">
        <header class="discord-route-section-heading">
          <div><h3>${group.title}</h3></div>
          <span>${group.keys.length} EVENTS</span>
        </header>
        <div class="discord-route-section-grid" data-discord-route-section-grid="${group.id}">${cards}</div>
      </section>`;
  }).join("");
  updateDiscordRouteOverview();
  filterDiscordIntegrationRoutes();
  registerDiscordRouteDragEvents(container);
  container.querySelectorAll("[data-discord-route]").forEach(row => {
    const labelInput = row.querySelector("[data-discord-route-label]");
    const heading = row.querySelector(".discord-route-card-heading h4");
    const syncLabel = () => { if (heading) heading.textContent = labelInput?.value || ""; };
    labelInput?.addEventListener("input", syncLabel);
    const toggle = row.querySelector("[data-discord-route-enabled]");
    const syncToggle = () => {
      const enabled = toggle?.checked === true;
      const status = row.querySelector(".discord-route-status");
      const footer = row.querySelector(".discord-route-footer-state");
      if (status) { status.textContent = enabled ? "ON" : "OFF"; status.classList.toggle("is-on", enabled); status.classList.toggle("is-off", !enabled); }
      if (footer) { footer.textContent = enabled ? "ON" : "OFF"; footer.classList.toggle("is-on", enabled); footer.classList.toggle("is-off", !enabled); }
    };
    toggle?.addEventListener("change", syncToggle);
    syncToggle();
  });
}
async function loadDiscordIntegrationSettings() {
  if (!canManageDiscordIntegration()) {
    alert("Discord Integration Settings อนุญาตเฉพาะ Developer, Leader และ Management ที่ Active และไม่อยู่ใน Role Preview เท่านั้น");
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

  const { data: layoutRecord, error: layoutError } = await supabaseClient
    .from("guild_discord_route_layout")
    .select("layout")
    .eq("id", 1)
    .maybeSingle();
  if (layoutError) {
    console.error("Discord route layout load:", layoutError);
    if (status) status.textContent = "โหลดตำแหน่งการ์ดไม่สำเร็จ: " + layoutError.message;
    return;
  }

  $("discord-integration-mode").value = settings?.mode || "test";
  $("discord-integration-test-channel").value = settings?.test_channel_id || "";
  $("discord-integration-production-enabled").checked = settings?.production_enabled === true;
  $("discord-integration-current-mode").textContent =
    settings?.mode === "production" && settings?.production_enabled ? "PRODUCTION MODE" : "TEST MODE";
  $("discord-integration-current-mode").classList.toggle("is-production", settings?.mode === "production" && settings?.production_enabled);
  renderDiscordIntegrationRoutes(routes || [], layoutRecord?.layout || null);
  if (status) status.textContent = "โหลดการตั้งค่าเรียบร้อย";
  const saveButton = $("discord-integration-save"); if (saveButton) saveButton.textContent = "บันทึกการตั้งค่า";
  updateDiscordIntegrationModeHelp();
}

function updateDiscordIntegrationModeHelp() {
  const mode = $("discord-integration-mode")?.value || "test";
  const productionEnabled = $("discord-integration-production-enabled")?.checked === true;
  const help = $("discord-integration-mode-help");
  if (!help) return;
  const testChannelField = $("discord-integration-test-channel-field");
  if (testChannelField) testChannelField.hidden = mode !== "test";
  const testButton = $("discord-integration-test");
  if (testButton) testButton.disabled = mode !== "test";
  if (mode === "test") {
    help.textContent = "TEST MODE: การแจ้งเตือนทุกประเภทจะถูกส่งไปยังห้องทดสอบบอทเท่านั้น ไม่ใช้ Channel ID ของ Production";
  } else if (!productionEnabled) {
    help.textContent = "PRODUCTION ยังไม่เปิดใช้งาน ต้องเปิดสวิตช์อนุมัติ Production ก่อน ระบบจะยังไม่ส่งข้อความไปห้องจริง";
  } else {
    help.textContent = "PRODUCTION MODE: ระบบอัตโนมัติจะส่งเฉพาะ Route ที่เปิดใช้งาน ส่วนปุ่ม SEND TO DISCORD ของ Guild War ใช้ Channel ID บนการ์ดประกาศลงชื่อวอร์ได้โดยไม่ต้องเปิด Route อัตโนมัติ";
  }
}

function markDiscordIntegrationDirty() {
  const button = $("discord-integration-save");
  if (button && !button.disabled) button.textContent = "บันทึกการเปลี่ยนแปลง";
}
function setDiscordRoutesEnabled(enabled) {
  document.querySelectorAll("[data-discord-route-enabled]").forEach(input => { input.checked = enabled; });
  updateDiscordRouteOverview();
  filterDiscordIntegrationRoutes();
  markDiscordIntegrationDirty();
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
    event_label: String(row.querySelector("[data-discord-route-label]")?.value || "").trim(),
    channel_id: String(row.querySelector("[data-discord-route-channel]")?.value || "").trim() || null,
    updated_by: currentUser.id
  }));
  for (const route of routes) {
    if (!route.event_label || route.event_label.length > 80) {
      showMessage("discord-integration-message", "กรุณากรอกชื่อแสดงผลให้ครบทุก Event และไม่เกิน 80 ตัวอักษร");
      return;
    }
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
    const hasManualWarDestination = routes.some(route => route.event_key === "war_signup_opened" && Boolean(route.channel_id));
    if (!routes.some(route => route.enabled) && !hasManualWarDestination) {
      showMessage("discord-integration-message", "กรุณาเปิดใช้งานอย่างน้อยหนึ่งประเภทการแจ้งเตือน หรือกำหนด Channel ID ของประกาศลงชื่อวอร์เพื่อใช้ปุ่ม SEND TO DISCORD แบบ Manual");
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
      .upsert(routes.map(route => ({ ...route, updated_at: new Date().toISOString() })), { onConflict: "event_key" });
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
    alert("เฉพาะ Developer, Leader และ Management ที่ Active เท่านั้นที่ทดสอบบอทได้");
    return;
  }
  const channelId = String($("discord-integration-test-channel")?.value || "").trim();
  if (String($("discord-integration-mode")?.value || "test") !== "test") {
    showMessage("discord-integration-message", "การส่งข้อความทดสอบใช้ได้เฉพาะ TEST MODE เท่านั้น");
    return;
  }
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
    showMessage("discord-integration-message", data.message || ("ส่งข้อความทดสอบไปยังห้องทดสอบบอทสำเร็จ" + (data.channel_name ? " (#" + data.channel_name + ")" : "")), "success");
  } catch (error) {
    console.error("Discord integration test:", error);
    showMessage("discord-integration-message", "ทดสอบไม่สำเร็จ: " + (error.message || "ตรวจสอบ Edge Function และ Bot Token"));
  } finally {
    if (button) { button.disabled = false; button.textContent = "ส่งข้อความทดสอบ"; }
  }
}


let discordEmbedStudioState = { eventKey: "", eventLabel: "", recordId: "", messageType: "primary", channelId: "", messageId: "", linked: false, originalComponents: [], originalContent: "", currentMessage: null, baseEmbed: {}, fields: [], historySearched: false, historyComplete: false, historyHasCandidates: false, historyCursor: null, historySessionId: null };

function setEmbedStudioStatus(message, tone) {
  const node = $("embed-studio-message-status");
  if (node) { node.textContent = message || ""; node.dataset.tone = tone || "muted"; }
}
async function invokeEmbedStudio(action, extra) {
  const result = await supabaseClient.functions.invoke("discord-embed-studio", { body: Object.assign({ action: action }, extra || {}) });
  if (result.error) {
    let detail = result.error.message || "เรียก Embed Studio ไม่สำเร็จ";
    try { if (result.error.context && typeof result.error.context.json === "function") { const body = await result.error.context.json(); detail = body.message || detail; } } catch (_) {}
    throw new Error(detail);
  }
  if (result.data && result.data.success === false) throw new Error(result.data.message || "Embed Studio request failed");
  return result.data || {};
}
function embedStudioRecordConfig(eventKey) {
  const map = {
    member_joined: ["guild_members", "character_name", "user_id"],
    war_signup_opened: ["war_events", "event_name"],
    war_signup_closed: ["war_events", "event_name"],
    war_leave_submitted: ["war_leave_requests", "id"],
    war_roster_published: ["war_events", "event_name"],
    war_checkin_opened: ["war_events", "event_name"],
    war_attendance_finalized: ["war_attendance_reports", "event_id"],
    portfolio_published: ["portfolios", "title"],
    guild_activity_published: ["guild_activities", "title"],
    guild_activity_comment: ["guild_activity_comments", "content"],
    feedback_submitted: ["guild_feedback", "title"],
    duck_race_results: null
  };
  return map[eventKey] || null;
}
async function loadEmbedStudioRecords(eventKey) {
  const select = $("embed-studio-record-select");
  if (!select) return;
  select.innerHTML = '<option value="">กำลังโหลดรายการ...</option>';
  const config = embedStudioRecordConfig(eventKey);
  if (!config) { select.innerHTML = '<option value="">Event นี้ยังไม่มีแหล่งข้อมูลที่เชื่อมไว้</option>'; return; }
  let query = supabaseClient.from(config[0]).select("*").order("created_at", { ascending: false }).limit(60);
  if (eventKey === "feedback_submitted") query = query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw new Error("โหลดข้อมูลต้นทางไม่สำเร็จ: " + error.message);
  const rows = data || [];
  select.innerHTML = '<option value="">เลือกข้อมูลต้นทาง...</option>';
  rows.forEach(row => {
    const option = document.createElement("option");
    option.value = String(row[config[2] || "id"] || row.id || "");
    const label = row.event_name || row.title || row.character_name || row.content || row.id || "Record";
    option.textContent = String(label).replace(/\s+/g, " ").slice(0, 100) + " · " + String(row.id || "").slice(0, 8);
    select.appendChild(option);
  });
  if (!rows.length) select.innerHTML = '<option value="">ไม่พบข้อมูลใน Event นี้</option>';
}
function renderEmbedStudioFields() {
  const host = $("embed-studio-fields");
  if (!host) return;
  host.innerHTML = discordEmbedStudioState.fields.map((field, index) =>
    '<div class="discord-embed-studio-field" data-embed-field="' + index + '">' +
      '<input type="text" maxlength="256" data-embed-field-name placeholder="Field name" value="' + escapeHTML(field.name || "") + '">' +
      '<input type="text" maxlength="1024" data-embed-field-value placeholder="Field value" value="' + escapeHTML(field.value || "") + '">' +
      '<button type="button" data-embed-field-up="' + index + '" aria-label="เลื่อนขึ้น" ' + (index === 0 ? "disabled" : "") + '>↑</button>' +
      '<button type="button" data-embed-field-down="' + index + '" aria-label="เลื่อนลง" ' + (index === discordEmbedStudioState.fields.length - 1 ? "disabled" : "") + '>↓</button>' +
      '<button type="button" data-embed-field-remove="' + index + '" aria-label="ลบ Field">ลบ</button>' +
    '</div>'
  ).join("");
}
function getEmbedStudioPayload() {
  const colorText = String($("embed-studio-color")?.value || "#D92D45").replace("#", "");
  const fields = discordEmbedStudioState.fields.filter(field => String(field.name || "").trim() || String(field.value || "").trim())
    .map(field => ({ name: String(field.name || "").trim(), value: String(field.value || "").trim(), inline: field.inline === true }));
  const embed = Object.assign({}, discordEmbedStudioState.baseEmbed || {}, {
    title: String($("embed-studio-title")?.value || ""),
    description: String($("embed-studio-description")?.value || ""),
    color: parseInt(colorText, 16) || 0xD92D45,
    fields: fields
  });
  const authorName = String($("embed-studio-author")?.value || "").trim();
  const authorIcon = String($("embed-studio-author-icon")?.value || "").trim();
  const authorUrl = String($("embed-studio-author-url")?.value || "").trim();
  if (authorName) embed.author = Object.assign({}, embed.author || {}, { name: authorName });
  else delete embed.author;
  if (embed.author && authorIcon) embed.author.icon_url = authorIcon;
  if (embed.author && authorUrl) embed.author.url = authorUrl;
  const footer = String($("embed-studio-footer")?.value || "");
  const thumbnail = String($("embed-studio-thumbnail")?.value || "").trim();
  const image = String($("embed-studio-image")?.value || "").trim();
  if (footer) embed.footer = Object.assign({}, embed.footer || {}, { text: footer });
  else delete embed.footer;
  if (thumbnail) embed.thumbnail = Object.assign({}, embed.thumbnail || {}, { url: thumbnail });
  else delete embed.thumbnail;
  if (image) embed.image = Object.assign({}, embed.image || {}, { url: image });
  else delete embed.image;
  const timestampValue = String($("embed-studio-timestamp")?.value || "");
  if (timestampValue) embed.timestamp = new Date(timestampValue).toISOString();
  else delete embed.timestamp;
  const payload = { embeds: [embed] };
  if (discordEmbedStudioState.originalContent) payload.content = discordEmbedStudioState.originalContent;
  if (Array.isArray(discordEmbedStudioState.originalComponents) && discordEmbedStudioState.originalComponents.length) payload.components = discordEmbedStudioState.originalComponents;
  return payload;
}
function renderEmbedStudioPreview() {
  const payload = getEmbedStudioPayload();
  const embed = payload.embeds[0];
  const preview = $("embed-studio-preview");
  if (!preview) return;
  preview.style.borderLeftColor = "#" + Number(embed.color).toString(16).padStart(6, "0").slice(-6);
  let html = "";
  if (embed.author?.name) html += "<p style=\"font-size:12px;color:#b9bbc5\">" + escapeHTML(embed.author.name) + "</p>";
  if (embed.title) html += "<h4>" + escapeHTML(embed.title) + "</h4>";
  if (embed.description) html += "<p>" + escapeHTML(embed.description) + "</p>";
  (embed.fields || []).forEach(field => { html += '<div class="embed-studio-preview-field"><strong>' + escapeHTML(field.name) + '</strong><span>' + escapeHTML(field.value) + '</span></div>'; });
  const thumb = embed.thumbnail?.url || "";
  const main = embed.image?.url || "";
  if (thumb && /^https:\/\/\S+$/i.test(thumb)) html += '<img src="' + escapeHTML(thumb) + '" alt="Embed thumbnail">';
  if (main && /^https:\/\/\S+$/i.test(main)) html += '<img src="' + escapeHTML(main) + '" alt="Embed image">';
  if (embed.footer?.text) html += '<p style="color:#9da0aa;font-size:12px">' + escapeHTML(embed.footer.text) + '</p>';
  if (embed.timestamp) html += '<p style="color:#9da0aa;font-size:11px">' + escapeHTML(new Date(embed.timestamp).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })) + '</p>';
  preview.innerHTML = html || "<p>ยังไม่มีเนื้อหา Embed</p>";
  const errors = [];
  if ((embed.title || "").length > 256) errors.push("Title เกิน 256 ตัวอักษร");
  if ((embed.description || "").length > 4096) errors.push("Description เกิน 4,096 ตัวอักษร");
  if (embed.fields.length > 25) errors.push("Fields เกิน 25 รายการ");
  embed.fields.forEach((field, i) => {
    if (field.name.length > 256) errors.push("Field " + (i + 1) + " Name เกิน 256 ตัวอักษร");
    if (field.value.length > 1024) errors.push("Field " + (i + 1) + " Value เกิน 1,024 ตัวอักษร");
  });
  const total = (embed.title || "").length + (embed.description || "").length + embed.fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0) + (embed.footer?.text || "").length;
  if (total > 6000) errors.push("ข้อความรวมเกิน 6,000 ตัวอักษร");
  const validation = $("embed-studio-validation");
  if (validation) validation.textContent = errors.join("\n");
  const update = $("embed-studio-update-existing");
  if (update) update.disabled = !discordEmbedStudioState.linked || errors.length > 0;
}
function populateEmbedStudio(message) {
  const embed = message?.embeds?.[0] || {};
  discordEmbedStudioState.baseEmbed = JSON.parse(JSON.stringify(embed));
  $("embed-studio-author").value = embed.author?.name || "";
  $("embed-studio-author-icon").value = embed.author?.icon_url || "";
  $("embed-studio-author-url").value = embed.author?.url || "";
  $("embed-studio-title").value = embed.title || "";
  $("embed-studio-description").value = embed.description || "";
  $("embed-studio-color").value = "#" + Number(embed.color || 0xD92D45).toString(16).padStart(6, "0").slice(-6);
  $("embed-studio-footer").value = embed.footer?.text || "";
  $("embed-studio-thumbnail").value = embed.thumbnail?.url || "";
  $("embed-studio-image").value = embed.image?.url || "";
  $("embed-studio-timestamp").value = embed.timestamp ? new Date(embed.timestamp).toISOString().slice(0,16) : "";
  discordEmbedStudioState.fields = (embed.fields || []).map(field => ({ name: field.name || "", value: field.value || "", inline: field.inline === true }));
  discordEmbedStudioState.originalComponents = message?.components || [];
  discordEmbedStudioState.originalContent = message?.content || "";
  discordEmbedStudioState.currentMessage = message || null;
  renderEmbedStudioFields();
  renderEmbedStudioPreview();
}
async function inspectEmbedStudioRecord() {
  const recordId = String($("embed-studio-record-select")?.value || "");
  discordEmbedStudioState.recordId = recordId;
  discordEmbedStudioState.messageType = String($("embed-studio-message-type")?.value || "primary");
  discordEmbedStudioState.linked = false;
  discordEmbedStudioState.messageId = "";
  discordEmbedStudioState.historySearched = false;
  discordEmbedStudioState.historyComplete = false;
  discordEmbedStudioState.historyHasCandidates = false;
  discordEmbedStudioState.historyCursor = null;
  discordEmbedStudioState.historySessionId = null;
  const firstSend = $("embed-studio-send-new");
  if (firstSend) firstSend.disabled = true;
  const update = $("embed-studio-update-existing");
  if (update) update.disabled = true;
  $("embed-studio-history-results").innerHTML = "";
  if (!recordId) { setEmbedStudioStatus("เลือกข้อมูลต้นทางเพื่อค้นหา Embed เดิม", "muted"); return; }
  setEmbedStudioStatus("กำลังค้นหาและดึง Embed เดิมจาก Discord...", "muted");
  const data = await invokeEmbedStudio("inspect", { event_key: discordEmbedStudioState.eventKey, record_id: recordId, message_type: discordEmbedStudioState.messageType });
  discordEmbedStudioState.channelId = data.channel_id || "";
  if (data.linked && data.found && data.message) {
    discordEmbedStudioState.linked = true;
    discordEmbedStudioState.messageId = data.message_id;
    populateEmbedStudio(data.message);
    $("embed-studio-meta").textContent = "ข้อความเดิม · Channel " + data.channel_id + " · Message " + data.message_id;
    setEmbedStudioStatus("พบข้อความเดิมแล้ว — กำลังแสดง Embed ที่บอทส่งไว้จริง สามารถแก้ไขโดยอัปเดตข้อความเดิมได้", "success");
  } else if (data.linked && data.found === false) {
    populateEmbedStudio(data.message || null);
    $("embed-studio-meta").textContent = "Message ID ที่บันทึกไว้: " + (data.message_id || "");
    setEmbedStudioStatus("มี Message ID เดิม แต่ Discord ไม่พบข้อความนั้นแล้ว ระบบจะไม่สร้างข้อความทดแทน กรุณาค้นหาประวัติและเลือกข้อความที่ถูกต้อง", "warning");
  } else {
    populateEmbedStudio(null);
    $("embed-studio-meta").textContent = data.channel_id ? "Channel สำหรับค้นหา: " + data.channel_id : "ยังไม่พบ Channel ID";
    setEmbedStudioStatus("ยังไม่มี Message ID ที่ผูกไว้ สามารถค้นหาประวัติข้อความเก่าจาก Channel เพื่อเลือกผูกได้", "warning");
  }
}
async function openDiscordEmbedStudio(eventKey, eventLabel) {
  if (!canManageDiscordIntegration()) { alert("เฉพาะ Developer ที่ Active เท่านั้น"); return; }
  discordEmbedStudioState = { eventKey: eventKey, eventLabel: eventLabel || eventKey, recordId: "", messageType: "primary", channelId: "", messageId: "", linked: false, originalComponents: [], originalContent: "", currentMessage: null, baseEmbed: {}, fields: [], historySearched: false, historyComplete: false, historyHasCandidates: false, historyCursor: null, historySessionId: null };
  $("discord-embed-studio-title").textContent = "จัดการ Embed";
  $("discord-embed-studio-event-label").textContent = (eventLabel || eventKey) + " · " + eventKey;
  const typeWrap = $("embed-studio-message-type-wrap");
  if (typeWrap) typeWrap.hidden = eventKey !== "war_roster_published";
  if ($("embed-studio-message-type")) $("embed-studio-message-type").value = eventKey === "war_roster_published" ? "raid_a" : "primary";
  $("discord-embed-studio-modal").classList.remove("hidden");
  $("embed-studio-meta").textContent = "";
  $("embed-studio-history-results").innerHTML = "";
  populateEmbedStudio(null);
  setEmbedStudioStatus("กำลังโหลดข้อมูลต้นทาง...", "muted");
  try { await loadEmbedStudioRecords(eventKey); await loadDiscordEmbedStudioTemplates(); setEmbedStudioStatus("เลือกข้อมูลต้นทางเพื่อดึงข้อความ Discord เดิม", "muted"); }
  catch (error) { setEmbedStudioStatus(error.message || "โหลดข้อมูลไม่สำเร็จ", "error"); }
}
function closeDiscordEmbedStudio() {
  $("discord-embed-studio-modal")?.classList.add("hidden");
}
async function searchEmbedStudioHistory() {
  if (!discordEmbedStudioState.recordId) { setEmbedStudioStatus("กรุณาเลือกข้อมูลต้นทางก่อนค้นหาประวัติ", "warning"); return; }
  setEmbedStudioStatus(discordEmbedStudioState.historyCursor ? "กำลังค้นหาข้อความที่เก่ากว่า..." : "กำลังค้นหาข้อความเก่าใน Discord Channel...", "muted");
  const data = await invokeEmbedStudio("search_history", {
    event_key: discordEmbedStudioState.eventKey, record_id: discordEmbedStudioState.recordId,
    message_type: discordEmbedStudioState.messageType,
    query: discordEmbedStudioState.messageType === "raid_a" ? "raid a" : discordEmbedStudioState.messageType === "raid_b" ? "raid b" : undefined,
    channel_id: discordEmbedStudioState.channelId || undefined,
    before: discordEmbedStudioState.historyCursor || undefined,
    search_session_id: discordEmbedStudioState.historySessionId || undefined
  });
  discordEmbedStudioState.historySessionId = data.search_session_id || discordEmbedStudioState.historySessionId;
  discordEmbedStudioState.historySearched = true;
  discordEmbedStudioState.historyComplete = data.search_complete === true;
  discordEmbedStudioState.historyHasCandidates = discordEmbedStudioState.historyHasCandidates || Boolean(data.candidates?.length);
  discordEmbedStudioState.historyCursor = data.next_before || null;
  const searchButton = $("embed-studio-search-history");
  if (searchButton) searchButton.textContent = discordEmbedStudioState.historyComplete ? "ค้นหาประวัติอีกครั้ง" : "ค้นหาข้อความเก่ากว่า";
  const sendNewButton = $("embed-studio-send-new");
  if (sendNewButton) sendNewButton.disabled = !discordEmbedStudioState.historyComplete || discordEmbedStudioState.historyHasCandidates || discordEmbedStudioState.linked;
  const host = $("embed-studio-history-results");
  if (!data.before && !discordEmbedStudioState.historyCursor && !discordEmbedStudioState.historyHasCandidates) host.innerHTML = "";
  (data.candidates || []).forEach(candidate => {
    const button = document.createElement("button");
    const title = candidate.embeds?.[0]?.title || candidate.content || "Discord Message";
    const description = String(candidate.embeds?.[0]?.description || "").replace(/\s+/g, " ").slice(0, 150);
    button.innerHTML = "<span><strong>" + escapeHTML(title) + "</strong><small>" + escapeHTML(description) + "</small></span><small>" + escapeHTML(candidate.timestamp || "") + " · " + escapeHTML(candidate.id) + "</small>";
    button.addEventListener("click", () => void linkEmbedStudioHistoryMessage(candidate));
    host.appendChild(button);
  });
  const foundCount = host.querySelectorAll("button").length;
  if (foundCount) {
    setEmbedStudioStatus("พบ " + foundCount + " ข้อความที่อาจเกี่ยวข้อง" + (discordEmbedStudioState.historyComplete ? " · ค้นหาครบแล้ว" : " · ยังมีข้อความเก่ากว่าให้ค้นต่อ") + " โปรดตรวจสอบก่อนผูก", "success");
  } else if (discordEmbedStudioState.historyComplete) {
    setEmbedStudioStatus("ค้นหาประวัติ Channel ครบแล้ว ไม่พบ Embed ที่ตรงกับ Event สามารถพิจารณาส่งครั้งแรกได้", "warning");
  } else {
    setEmbedStudioStatus("ค้นหาแล้ว " + (data.scanned_count || 0) + " ข้อความ แต่ยังมีประวัติที่เก่ากว่า กดค้นหาข้อความเก่าอีกครั้งเพื่อให้ครบก่อนส่ง", "warning");
  }
}
async function linkEmbedStudioHistoryMessage(candidate) {
  // Display the selected history message in Live Preview immediately, before linking confirmation.
  populateEmbedStudio(candidate);
  renderEmbedStudioPreview();
  $("embed-studio-meta").textContent = "ข้อความที่เลือกจากประวัติ · Channel " + candidate.channel_id + " · Message " + candidate.id;
  setEmbedStudioStatus("กำลังแสดง Embed จากข้อความที่เลือกใน Live Preview", "success");
  if (!window.confirm("ยืนยันผูกข้อความ Discord นี้กับ Event ที่เลือกใช่หรือไม่?\\nระบบจะบันทึก Message ID เดิม และจะไม่สร้างข้อความใหม่")) return;
  const data = await invokeEmbedStudio("link_existing", {
    event_key: discordEmbedStudioState.eventKey, record_id: discordEmbedStudioState.recordId, message_type: discordEmbedStudioState.messageType,
    channel_id: candidate.channel_id, message_id: candidate.id
  });
  discordEmbedStudioState.channelId = candidate.channel_id;
  discordEmbedStudioState.messageId = candidate.id;
  discordEmbedStudioState.linked = true;
  populateEmbedStudio(data.message || candidate);
  renderEmbedStudioPreview();
  $("embed-studio-meta").textContent = "ผูกข้อความเดิมแล้ว · Channel " + candidate.channel_id + " · Message " + candidate.id;
  $("embed-studio-history-results").innerHTML = "";
  setEmbedStudioStatus("ผูก Embed เก่าเข้ากับ Event สำเร็จแล้ว และแสดงใน Live Preview แล้ว", "success");
}
async function updateDiscordEmbedStudioExisting() {
  if (!discordEmbedStudioState.linked || !discordEmbedStudioState.recordId) throw new Error("ยังไม่มีข้อความเดิมที่ยืนยันแล้ว จึงไม่สามารถอัปเดตได้");
  if (!window.confirm("ยืนยันอัปเดตข้อความ Discord เดิมใช่หรือไม่?\nระบบจะใช้ PATCH กับ Message ID เดิมเท่านั้น และจะไม่สร้างข้อความใหม่")) return;
  setEmbedStudioStatus("กำลังอัปเดต Embed เดิม...", "muted");
  const data = await invokeEmbedStudio("update_existing", {
    event_key: discordEmbedStudioState.eventKey, record_id: discordEmbedStudioState.recordId, message_type: discordEmbedStudioState.messageType,
    channel_id: discordEmbedStudioState.channelId, message_id: discordEmbedStudioState.messageId,
    payload: getEmbedStudioPayload()
  });
  populateEmbedStudio(data.message);
  setEmbedStudioStatus("อัปเดตข้อความเดิมสำเร็จแล้ว", "success");
}
async function sendDiscordEmbedStudioTest() {
  const payload = getEmbedStudioPayload();
  if (!payload.embeds?.[0]?.title && !payload.embeds?.[0]?.description) throw new Error("กรุณากรอก Title หรือ Description ก่อนส่งทดสอบ");
  if (!window.confirm("ส่ง Test Message ไปยัง Test Channel ที่ตั้งค่าไว้ใช่หรือไม่?")) return;
  const data = await invokeEmbedStudio("send_test", { payload: payload });
  setEmbedStudioStatus("ส่ง Test Message สำเร็จ · Message ID " + data.message.id, "success");
}

async function sendNewDiscordEmbedStudioMessage() {
  if (!discordEmbedStudioState.recordId || !discordEmbedStudioState.historySearched || !discordEmbedStudioState.historyComplete || discordEmbedStudioState.historyHasCandidates || discordEmbedStudioState.linked) {
    throw new Error("ต้องค้นหาประวัติ Channel จนครบและไม่พบข้อความเดิมก่อน จึงจะส่งข้อความครั้งแรกได้");
  }
  if (!window.confirm("ยืนยันส่ง Embed ใหม่สำหรับ Record นี้ใช่หรือไม่?\nระบบค้นหาประวัติ Channel ครบแล้วและไม่พบข้อความที่ตรงกัน")) return;
  setEmbedStudioStatus("กำลังส่งข้อความครั้งแรก...", "muted");
  const data = await invokeEmbedStudio("send_new", {
    event_key: discordEmbedStudioState.eventKey, record_id: discordEmbedStudioState.recordId, message_type: discordEmbedStudioState.messageType,
    search_session_id: discordEmbedStudioState.historySessionId,
    payload: getEmbedStudioPayload()
  });
  discordEmbedStudioState.linked = true;
  discordEmbedStudioState.messageId = data.message.id;
  discordEmbedStudioState.channelId = data.channel_id;
  discordEmbedStudioState.originalComponents = data.message.components || [];
  const update = $("embed-studio-update-existing");
  if (update) update.disabled = false;
  const sendNewButton = $("embed-studio-send-new");
  if (sendNewButton) sendNewButton.disabled = true;
  $("embed-studio-meta").textContent = "สร้างข้อความครั้งแรกแล้ว · Channel " + data.channel_id + " · Message " + data.message.id;
  setEmbedStudioStatus("ส่งข้อความครั้งแรกและบันทึก Message ID แล้ว", "success");
}


async function loadDiscordEmbedStudioTemplates() {
  const select = $("embed-studio-template-select");
  if (!select) return;
  const data = await invokeEmbedStudio("list_templates", { event_key: discordEmbedStudioState.eventKey });
  select.innerHTML = "";
  (data.templates || []).forEach(template => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.template_name + " · v" + template.version + (template.is_active ? " · Active" : "");
    option.dataset.payload = JSON.stringify(template.payload || {});
    select.appendChild(option);
  });
  if (!select.options.length) select.innerHTML = '<option value="">ยังไม่มี Template</option>';
}
async function loadSelectedDiscordEmbedTemplate() {
  const select = $("embed-studio-template-select");
  const option = select?.selectedOptions?.[0];
  if (!option?.dataset.payload) { setEmbedStudioStatus("ยังไม่มี Template ให้โหลด", "warning"); return; }
  const payload = JSON.parse(option.dataset.payload);
  populateEmbedStudio({ embeds: payload.embeds || [], content: payload.content || "", components: payload.components || [] });
  renderEmbedStudioPreview();
  setEmbedStudioStatus("โหลด Template เข้าสู่ Editor แล้ว", "success");
}
async function showDiscordEmbedStudioHistory() {
  const data = await invokeEmbedStudio("list_history", { event_key: discordEmbedStudioState.eventKey, record_id: discordEmbedStudioState.recordId || undefined });
  const host = $("embed-studio-audit-history");
  host.innerHTML = "";
  (data.history || []).forEach(item => {
    const row = document.createElement("div");
    row.className = "discord-embed-studio-status";
    row.textContent = (item.action || "change") + " · " + new Date(item.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) + " · " + (item.message_id || "ไม่มี Message ID");
    host.appendChild(row);
  });
  if (!data.history?.length) host.textContent = "ยังไม่มีประวัติการแก้ไข";
}

async function saveDiscordEmbedStudioTemplate() {
  const payload = getEmbedStudioPayload();
  const templateName = window.prompt("ตั้งชื่อ Template", "Default");
  if (templateName === null) return;
  const cleanName = templateName.trim();
  if (!cleanName || cleanName.length > 80) throw new Error("ชื่อ Template ต้องมี 1–80 ตัวอักษร");
  const data = await invokeEmbedStudio("save_template", { event_key: discordEmbedStudioState.eventKey, payload, template_name: cleanName });
  await loadDiscordEmbedStudioTemplates();
  setEmbedStudioStatus("บันทึก Template “" + cleanName + "” เวอร์ชัน " + data.template.version + " สำเร็จ", "success");
}
async function renameSelectedDiscordEmbedTemplate() {
  const select = $("embed-studio-template-select");
  const templateId = select?.value;
  const option = select?.selectedOptions?.[0];
  if (!templateId || !option) throw new Error("กรุณาเลือก Template ที่ต้องการเปลี่ยนชื่อ");
  const currentName = option.textContent.replace(/\\s· v\\d+.*$/, "");
  const templateName = window.prompt("แก้ไขชื่อ Template", currentName);
  if (templateName === null) return;
  const cleanName = templateName.trim();
  if (!cleanName || cleanName.length > 80) throw new Error("ชื่อ Template ต้องมี 1–80 ตัวอักษร");
  await invokeEmbedStudio("rename_template", { event_key: discordEmbedStudioState.eventKey, template_id: templateId, template_name: cleanName });
  await loadDiscordEmbedStudioTemplates();
  select.value = templateId;
  setEmbedStudioStatus("เปลี่ยนชื่อ Template สำเร็จ", "success");
}
async function deleteSelectedDiscordEmbedTemplate() {
  const select = $("embed-studio-template-select");
  const templateId = select?.value;
  const option = select?.selectedOptions?.[0];
  if (!templateId || !option) throw new Error("กรุณาเลือก Template ที่ต้องการลบ");
  const templateName = option.textContent.replace(/\\s· v\\d+.*$/, "");
  if (!window.confirm("ยืนยันลบ Template “" + templateName + "” ใช่หรือไม่?\\nการลบนี้จะลบเฉพาะ Template ที่บันทึกไว้ ไม่ลบข้อความที่ส่งไป Discord")) return;
  await invokeEmbedStudio("delete_template", { event_key: discordEmbedStudioState.eventKey, template_id: templateId });
  await loadDiscordEmbedStudioTemplates();
  setEmbedStudioStatus("ลบ Template สำเร็จ", "success");
}
function registerDiscordEmbedStudioEvents() {
  $("discord-integration-routes")?.addEventListener("click", event => {
    const button = event.target.closest("[data-discord-embed-manage]");
    if (!button) return;
    const row = button.closest("[data-discord-route]");
    const label = row?.querySelector("[data-discord-route-label]")?.value || button.dataset.discordEmbedManage;
    void openDiscordEmbedStudio(button.dataset.discordEmbedManage, label);
  });
  $("discord-embed-studio-modal")?.addEventListener("click", event => {
    if (event.target.closest("[data-embed-studio-close]")) closeDiscordEmbedStudio();
  });
  $("embed-studio-record-select")?.addEventListener("change", () => void inspectEmbedStudioRecord().catch(error => setEmbedStudioStatus(error.message, "error")));
  $("embed-studio-message-type")?.addEventListener("change", () => void inspectEmbedStudioRecord().catch(error => setEmbedStudioStatus(error.message, "error")));
  $("embed-studio-search-history")?.addEventListener("click", () => void searchEmbedStudioHistory().catch(error => setEmbedStudioStatus(error.message, "error")));
  $("embed-studio-add-field")?.addEventListener("click", () => {
    if (discordEmbedStudioState.fields.length >= 25) { setEmbedStudioStatus("Discord อนุญาตไม่เกิน 25 Fields", "warning"); return; }
    discordEmbedStudioState.fields.push({ name: "", value: "", inline: false }); renderEmbedStudioFields(); renderEmbedStudioPreview();
  });
  $("embed-studio-fields")?.addEventListener("input", event => {
    const row = event.target.closest("[data-embed-field]");
    if (!row) return;
    const index = Number(row.dataset.embedField);
    if (event.target.matches("[data-embed-field-name]")) discordEmbedStudioState.fields[index].name = event.target.value;
    if (event.target.matches("[data-embed-field-value]")) discordEmbedStudioState.fields[index].value = event.target.value;
    renderEmbedStudioPreview();
  });
  $("embed-studio-fields")?.addEventListener("click", event => {
    const remove = event.target.closest("[data-embed-field-remove]");
    const moveUp = event.target.closest("[data-embed-field-up]");
    const moveDown = event.target.closest("[data-embed-field-down]");
    if (remove) { discordEmbedStudioState.fields.splice(Number(remove.dataset.embedFieldRemove), 1); renderEmbedStudioFields(); renderEmbedStudioPreview(); return; }
    if (moveUp) {
      const index = Number(moveUp.dataset.embedFieldUp);
      if (index > 0) [discordEmbedStudioState.fields[index - 1], discordEmbedStudioState.fields[index]] = [discordEmbedStudioState.fields[index], discordEmbedStudioState.fields[index - 1]];
      renderEmbedStudioFields(); renderEmbedStudioPreview(); return;
    }
    if (moveDown) {
      const index = Number(moveDown.dataset.embedFieldDown);
      if (index < discordEmbedStudioState.fields.length - 1) [discordEmbedStudioState.fields[index + 1], discordEmbedStudioState.fields[index]] = [discordEmbedStudioState.fields[index], discordEmbedStudioState.fields[index + 1]];
      renderEmbedStudioFields(); renderEmbedStudioPreview();
    }
  });
  ["author","author-icon","author-url","title","description","color","footer","thumbnail","image","timestamp"].forEach(key => $("embed-studio-" + key)?.addEventListener("input", renderEmbedStudioPreview));
  $("embed-studio-update-existing")?.addEventListener("click", () => void updateDiscordEmbedStudioExisting().catch(error => setEmbedStudioStatus(error.message, "error")));
  $("embed-studio-send-test")?.addEventListener("click", () => void sendDiscordEmbedStudioTest().catch(error => setEmbedStudioStatus(error.message, "error")));
  $("embed-studio-send-new")?.addEventListener("click", () => void sendNewDiscordEmbedStudioMessage().catch(error => setEmbedStudioStatus(error.message, "error")));
  $("embed-studio-save-template")?.addEventListener("click", () => void saveDiscordEmbedStudioTemplate().catch(error => setEmbedStudioStatus(error.message, "error")));
  $("embed-studio-load-template")?.addEventListener("click", () => void loadSelectedDiscordEmbedTemplate().catch(error => setEmbedStudioStatus(error.message, "error")));
  $("embed-studio-rename-template")?.addEventListener("click", () => void renameSelectedDiscordEmbedTemplate().catch(error => setEmbedStudioStatus(error.message, "error")));
  $("embed-studio-delete-template")?.addEventListener("click", () => void deleteSelectedDiscordEmbedTemplate().catch(error => setEmbedStudioStatus(error.message, "error")));
  $("embed-studio-show-history")?.addEventListener("click", () => void showDiscordEmbedStudioHistory().catch(error => setEmbedStudioStatus(error.message, "error")));
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("discord-embed-studio-modal")?.classList.contains("hidden")) closeDiscordEmbedStudio(); });
}

function registerDiscordIntegrationEvents() {
  registerDiscordEmbedStudioEvents();
  $("discord-integration-form")?.addEventListener("submit", event => {
    event.preventDefault();
    void saveDiscordIntegrationSettings();
  });
  $("discord-integration-form")?.addEventListener("input", event => {
    if (event.target.matches("#discord-integration-mode, #discord-integration-test-channel, #discord-integration-production-enabled")) markDiscordIntegrationDirty();
  });
  $("discord-integration-form")?.addEventListener("change", event => {
    if (event.target.matches("#discord-integration-mode, #discord-integration-test-channel, #discord-integration-production-enabled")) markDiscordIntegrationDirty();
  });
  $("discord-integration-mode")?.addEventListener("change", updateDiscordIntegrationModeHelp);
  $("discord-integration-production-enabled")?.addEventListener("change", updateDiscordIntegrationModeHelp);
  $("discord-integration-test")?.addEventListener("click", () => void sendDiscordIntegrationTest());
  $("discord-integration-form")?.addEventListener("click", event => {
    const button = event.target.closest("[data-discord-refresh-channels]");
    if (!button) return;
    const select = button.closest("[data-discord-channel-picker]")?.querySelector("[data-discord-channel-select]");
    void loadDiscordChannelsForPicker(button, select, true);
  });
  $("discord-integration-form")?.addEventListener("focusin", event => {
    const select = event.target.closest("[data-discord-channel-select]");
    if (select && select.dataset.channelsLoaded !== "true") {
      void loadDiscordChannelsForPicker(select.closest("[data-discord-channel-picker]")?.querySelector("[data-discord-refresh-channels]"), select);
    }
  });
  $("discord-integration-form")?.addEventListener("change", event => {
    const select = event.target.closest("[data-discord-channel-select]");
    if (select && select.value) void saveDiscordChannelSelection(select);
  });
  $("discord-route-search")?.addEventListener("input", filterDiscordIntegrationRoutes);
  $("discord-route-filter")?.addEventListener("change", filterDiscordIntegrationRoutes);
  $("discord-integration-routes")?.addEventListener("input", event => {
    if (event.target.matches("[data-discord-route-label], [data-discord-route-channel]")) updateDiscordRouteOverview();
    markDiscordIntegrationDirty();
  });
  $("discord-integration-routes")?.addEventListener("change", event => {
    if (event.target.matches("[data-discord-channel-select]")) return;
    if (event.target.matches("[data-discord-route-enabled]")) { updateDiscordRouteOverview(); filterDiscordIntegrationRoutes(); }
    markDiscordIntegrationDirty();
  });
  $("discord-route-enable-all")?.addEventListener("click", () => setDiscordRoutesEnabled(true));
  $("discord-route-disable-all")?.addEventListener("click", () => setDiscordRoutesEnabled(false));
}

// ==========================================
// EVENT LISTENERS
// ==========================================

function registerAppEventListeners() {
  // Capture Guild War tab clicks at the window phase. This ensures tab
  // navigation is handled before document-level capture handlers can cancel
  // the click, while leaving all non-tab clicks untouched.
  const warTabRoutePaths = {
    overview: "/guildwar/overview",
    signup: "/guildwar/signup",
    roster: "/guildwar/announcement",
    leave: "/guildwar/leave",
    party: "/guildwar/party",
    "match-records": "/guildwar/results",
    "attendance-report": "/guildwar/report"
  };
  if (!window.__guildWarTabCaptureBound) {
    window.__guildWarTabCaptureBound = true;
    window.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const button = target?.closest("[data-war-center-tab]");
      if (!button) return;
      const tab = button.dataset.warCenterTab;
      if (!Object.prototype.hasOwnProperty.call(warTabRoutePaths, tab)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openGuildPage("war-center", {
        warTab: tab,
        routePath: warTabRoutePaths[tab]
      });
    }, true);
  }

  if (!window.__guildRoutingPopstateBound) {
    window.__guildRoutingPopstateBound = true;
    window.addEventListener("popstate", () => {
      const path = normalizeGuildRoutePath(window.location.pathname);
      const route = resolveGuildBrowserRoute(path);
      if (!route) {
        window.history.replaceState({ guildRoute: true }, "", "/dashboard");
        openGuildPage("dashboard", { skipHistory: true });
        return;
      }
      openGuildPage(route.page, {
        routePath: path,
        warTab: route.warTab || undefined,
        skipHistory: true
      });
    });
  }

  $("logout-btn")?.addEventListener("click", logout);

  $("member-search")?.addEventListener("input", filterMembers);
  $("member-type-filter")?.addEventListener("change", event => { memberDirectoryTypeFilter = event.target.value || "all"; filterMembers(); });
  $("member-directory-stats")?.addEventListener("click", event => {
    const button = event.target.closest("[data-member-type-filter]");
    if (!button) return;
    memberDirectoryTypeFilter = button.dataset.memberTypeFilter || "all";
    filterMembers();
  });
  $("members-list")?.addEventListener("click", event => {
    const button = event.target.closest("[data-member-card-edit]");
    if (!button) return;
    event.preventDefault();
    if (isRolePreviewActive()) { alert("Role Preview เป็นโหมดอ่านอย่างเดียว"); return; }
    const userId = button.dataset.memberCardEdit;
    if (!currentUser?.id || String(currentUser.id) !== String(userId)) {
      alert("ปุ่มแก้ไขในรายชื่อสมาชิกใช้แก้ไขได้เฉพาะตัวละครของคุณเท่านั้น");
      return;
    }
    const member = directoryMembers.find(row => !row.is_manual_record && String(row.user_id) === String(userId));
    if (!member) return;
    openMemberCardEditor(member);
  });
  $("member-card-edit-modal")?.addEventListener("click", event => {
    if (event.target.closest("[data-member-card-edit-close]")) closeMemberCardEditor();
  });
  $("member-card-edit-form")?.addEventListener("submit", event => { event.preventDefault(); void saveMemberCardEditor(event.currentTarget); });
  $("member-card-edit-form")?.addEventListener("change", event => {
    if (event.target.name !== "game_class") return;
    const cls = getClassInfo(event.target.value), preview = $("member-card-edit-class-icon");
    if (preview) { preview.src = cls?.iconPath || ""; preview.style.display = cls ? "" : "none"; }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !$("member-card-edit-modal")?.classList.contains("hidden")) closeMemberCardEditor();
  });
  $("members-class-summary")?.addEventListener("click", event => {
    const button = event.target.closest("[data-member-class-filter]");
    if (!button) return;
    memberDirectoryClassFilter = button.dataset.memberClassFilter || "all";
    filterMembers();
  });
  $("manual-member-class-summary")?.addEventListener("click", event => {
    const button = event.target.closest("[data-manual-member-class]");
    if (!button) return;
    manualMemberClassFilter = button.dataset.manualMemberClass || "all";
    renderManualMemberManagement();
  });
  $("manual-member-add-trigger")?.addEventListener("click", () => {
    resetManualMemberForm();
    openManualMemberModal();
  });
  $("manual-member-discord-select")?.addEventListener("click", () => void openDiscordMemberPicker());
  $("manual-member-discord-clear")?.addEventListener("click", () => setManualDiscordMember(null));
  $("discord-member-picker-refresh")?.addEventListener("click", () => void loadDiscordGuildMembers(true));
  $("discord-member-picker-search")?.addEventListener("input", renderDiscordMemberPicker);
  $("discord-member-picker")?.addEventListener("click", event => {
    if (event.target.closest("[data-discord-picker-close]")) closeDiscordMemberPicker();
    const option = event.target.closest("[data-discord-member-id]");
    if (option) {
      const selected = discordGuildMembersCache.find(member => member.id === option.dataset.discordMemberId);
      if (selected) { setManualDiscordMember(selected); closeDiscordMemberPicker(); }
    }
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
  $("manual-member-search")?.addEventListener("input", renderManualMemberManagement);
  $("manual-member-record-filter")?.addEventListener("change",e=>{manualMemberRecordFilter=e.target.value||"all";renderManualMemberManagement()});
  $("manual-member-activity-filter")?.addEventListener("change",e=>{manualMemberActivityFilter=e.target.value||"all";renderManualMemberManagement()});
  $("manual-member-discord-filter")?.addEventListener("change",e=>{manualMemberDiscordFilter=e.target.value||"all";renderManualMemberManagement()});
  $("manual-member-position-filter")?.addEventListener("change",e=>{manualMemberPositionFilter=e.target.value||"all";renderManualMemberManagement()});
  $("manual-member-saved-filters")?.addEventListener("change",e=>{const item=getMemberAdminSavedFilters()[Number(e.target.value)];if(item)setMemberAdminFilterState(item.filters)});
  $("manual-member-save-filter")?.addEventListener("click",()=>{const name=window.prompt("ตั้งชื่อชุดตัวกรองนี้");if(!name||!name.trim())return;const items=getMemberAdminSavedFilters();items.push({name:name.trim().slice(0,40),filters:getMemberAdminFilterState()});try{localStorage.setItem(MEMBER_ADMIN_FILTERS_KEY,JSON.stringify(items.slice(-20)));renderMemberAdminSavedFilters();alert("บันทึกตัวกรองเรียบร้อยแล้ว")}catch(error){alert("บันทึกตัวกรองไม่สำเร็จ: "+(error.message||"พื้นที่จัดเก็บไม่พร้อมใช้งาน"))}});
  $("manual-member-reset-filters")?.addEventListener("click",()=>setMemberAdminFilterState({}));
  $("manual-member-quality-strip")?.addEventListener("click",event=>{const b=event.target.closest("[data-quality-filter]");if(!b)return;const key=b.dataset.qualityFilter;manualMemberIncompleteOnly=key==="incomplete";if(["verified","pending","unknown","missing"].includes(key))manualMemberDiscordFilter=key;else manualMemberDiscordFilter="all";if(key==="all"){manualMemberRecordFilter="all";manualMemberActivityFilter="all";manualMemberPositionFilter="all";manualMemberClassFilter="all";if($("manual-member-search"))$("manual-member-search").value=""}[["manual-member-record-filter",manualMemberRecordFilter],["manual-member-activity-filter",manualMemberActivityFilter],["manual-member-discord-filter",manualMemberDiscordFilter],["manual-member-position-filter",manualMemberPositionFilter]].forEach(([id,v])=>{if($(id))$(id).value=v});renderManualMemberManagement()});
  $("member-admin-profile-drawer")?.addEventListener("click",event=>{if(event.target.closest("[data-member-admin-drawer-close]")){closeMemberAdminProfile();return}const a=event.target.closest("[data-drawer-edit-account]"),m=event.target.closest("[data-drawer-edit-manual]");if(a){closeMemberAdminProfile();editLinkedGuildMember(a.dataset.drawerEditAccount)}if(m){closeMemberAdminProfile();editManualGuildMember(m.dataset.drawerEditManual)}});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closeMemberAdminProfile()});
  $("manual-member-list")?.addEventListener("click", event => {
    const view=event.target.closest("[data-member-admin-view]");
    if(view){const isAccount=view.dataset.memberAdminType==="account";const member=isAccount?allMembers.find(row=>String(row.user_id)===String(view.dataset.memberAdminView)):manualGuildMembers.find(row=>String(row.id)===String(view.dataset.memberAdminView));if(member){const linked=isAccount?manualGuildMembers.find(row=>String(row.linked_user_id)===String(member.user_id)):null;openMemberAdminProfile({...((linked)||{}),...member,_recordType:isAccount?"account":"manual"})}return}

    const edit = event.target.closest("[data-manual-edit]");
    const toggle = event.target.closest("[data-manual-toggle]");
    const accountEdit = event.target.closest("[data-account-edit]");
    const accountToggle = event.target.closest("[data-account-toggle]");
    const removeManual = event.target.closest("[data-member-remove-manual]");
    const removeAccount = event.target.closest("[data-member-remove-account]");
    if (removeManual) void removeGuildMemberRecord("manual", removeManual.dataset.memberRemoveManual);
    else if (removeAccount) void removeGuildMemberRecord("account", removeAccount.dataset.memberRemoveAccount);
    else if (accountEdit) void editLinkedGuildMember(accountEdit.dataset.accountEdit);
    else if (accountToggle) updateLinkedGuildMemberStatus(accountToggle.dataset.accountToggle);
    else if (edit) editManualGuildMember(edit.dataset.manualEdit);
    else if (toggle) updateManualGuildMemberStatus(toggle.dataset.manualToggle);
  });
  $("refresh-members")?.addEventListener("click", () => loadMembers(true));
  $("connect-discord")?.addEventListener("click", connectDiscord);
  registerAppearanceEvents();
  registerDiscordIntegrationEvents();

  document.querySelectorAll(".nav-item[data-page], .nav-subitem").forEach((button) => {
    button.addEventListener("click", () => {
      const sidebarPage = button.dataset.page;
      const pageName = sidebarPage === "community-board" ? "guild-news" : sidebarPage;
      const routePath = sidebarPage === "community-board"
        ? "/community"
        : getGuildDefaultRoutePath(pageName);
      openGuildPage(pageName, { routePath });
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
      const targetPage = button.dataset.goPage;
      openGuildPage(targetPage, { routePath: getGuildTabRoutePath(targetPage) });
      const scrollTarget = button.dataset.scrollTarget;
      if (scrollTarget) {
        window.requestAnimationFrame(() => {
          $(scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    });
  });

  $("dashboard-announcement")?.addEventListener("click", (event) => {
    const previous=event.target.closest("[data-announcement-prev]");
    const next=event.target.closest("[data-announcement-next]");
    const dot=event.target.closest("[data-announcement-index]");
    if(previous||next||dot){
      event.stopPropagation();
      if(dot)dashboardAnnouncementIndex=Number(dot.dataset.announcementIndex);
      else dashboardAnnouncementIndex=(dashboardAnnouncementIndex+(next?1:-1)+dashboardAnnouncements.length)%dashboardAnnouncements.length;
      renderDashboardAnnouncementCarousel();
      return;
    }
    openGuildPage("guild-news");
  });
  $("dashboard-announcement")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if(event.target.closest("button"))return;
    event.preventDefault();
    openGuildPage("guild-news");
  });

  $("developer-tools-optimize-gallery-trigger")?.addEventListener("click",()=>{void optimizeLegacyDashboardGalleryImages();});
  $("dashboard-gallery-upload-trigger")?.addEventListener("click",()=> {
    if(canManageDashboardGallery())$("dashboard-gallery-upload-input")?.click();
  });
  $("dashboard-gallery-upload-input")?.addEventListener("change",event=>{
    void uploadDashboardGalleryFiles(event.target.files||[]);
  });
  const galleryTrack=$("dashboard-gallery-track");
  const galleryRoot=$("dashboard-gallery");
  const goToGallerySlide=(index,behavior="smooth")=>{
    if(!dashboardGalleryImages.length)return;
    dashboardGalleryActiveIndex=(index+dashboardGalleryImages.length)%dashboardGalleryImages.length;
    updateDashboardGalleryActiveState();
    centerDashboardGallerySlide(dashboardGalleryActiveIndex,behavior);
    startDashboardGalleryAutoplay();
  };
  galleryRoot?.addEventListener("mouseenter",pauseDashboardGalleryAutoplay);
  galleryRoot?.addEventListener("mouseleave",startDashboardGalleryAutoplay);
  document.addEventListener("visibilitychange",()=>document.hidden?pauseDashboardGalleryAutoplay():startDashboardGalleryAutoplay());
  galleryTrack?.addEventListener("scroll",()=>{
    if(dashboardGalleryScrollFrame)cancelAnimationFrame(dashboardGalleryScrollFrame);
    dashboardGalleryScrollFrame=requestAnimationFrame(()=>{
      const slides=[...galleryTrack.querySelectorAll(".gallery-slide")];
      if(!slides.length)return;
      const center=galleryTrack.getBoundingClientRect().left+galleryTrack.clientWidth/2;
      let nearest=0,distance=Infinity;
      slides.forEach((slide,index)=>{const rect=slide.getBoundingClientRect();const d=Math.abs(rect.left+rect.width/2-center);if(d<distance){distance=d;nearest=index;}});
      if(nearest!==dashboardGalleryActiveIndex){dashboardGalleryActiveIndex=nearest;updateDashboardGalleryActiveState();}
    });
  },{passive:true});
  galleryTrack?.addEventListener("pointerdown",event=>{
    if(event.pointerType!=="mouse"||event.button!==0)return;
    const target=event.target instanceof Element?event.target:null;
    if(!target||target.closest(".gallery-slide-actions,.gallery-nav"))return;
    // Capture on the original image/button, never on the scrolling track.
    // This preserves the correct click target so a simple click can open Lightbox.
    dashboardGalleryPointerStart={
      x:event.clientX,
      scrollLeft:galleryTrack.scrollLeft,
      pointerId:event.pointerId
    };
    dashboardGalleryDragMoved=false;
    galleryTrack.classList.add("is-dragging");
    if(typeof target.setPointerCapture==="function"){
      try{target.setPointerCapture(event.pointerId);}catch(error){console.debug("Gallery pointer capture unavailable:",error);}
    }
    pauseDashboardGalleryAutoplay();
  });
  galleryTrack?.addEventListener("pointermove",event=>{
    if(!dashboardGalleryPointerStart||event.pointerId!==dashboardGalleryPointerStart.pointerId)return;
    const delta=event.clientX-dashboardGalleryPointerStart.x;
    if(Math.abs(delta)>5)dashboardGalleryDragMoved=true;
    if(dashboardGalleryDragMoved){
      galleryTrack.scrollLeft=dashboardGalleryPointerStart.scrollLeft-delta;
      event.preventDefault();
    }
  });
  const finishGalleryPointer=event=>{
    if(!dashboardGalleryPointerStart)return;
    if(event?.pointerId!=null&&event.pointerId!==dashboardGalleryPointerStart.pointerId)return;
    const wasDragged=dashboardGalleryDragMoved;
    dashboardGalleryPointerStart=null;
    galleryTrack?.classList.remove("is-dragging");
    if(wasDragged){
      dashboardGallerySuppressClick=true;
      requestAnimationFrame(()=>{dashboardGallerySuppressClick=false;});
    }
    startDashboardGalleryAutoplay();
  };
  galleryTrack?.addEventListener("pointerup",finishGalleryPointer);
  galleryTrack?.addEventListener("pointercancel",finishGalleryPointer);
  galleryTrack?.addEventListener("lostpointercapture",finishGalleryPointer);
  // Handle gallery clicks in the capture phase so child/ancestor handlers
  // cannot swallow the image click before the Lightbox receives it.
  galleryTrack?.addEventListener("click",event=>{
    if(dashboardGallerySuppressClick){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const move=target.closest("[data-gallery-move]");
    const remove=target.closest("[data-gallery-delete]");
    const focus=target.closest("[data-gallery-focus]");
    if(move){
      event.preventDefault();
      event.stopPropagation();
      void moveDashboardGalleryImage(move.dataset.galleryId,Number(move.dataset.galleryMove));
      return;
    }
    if(remove){
      event.preventDefault();
      event.stopPropagation();
      void deleteDashboardGalleryImage(remove.dataset.galleryDelete);
      return;
    }
    if(focus){
      event.preventDefault();
      event.stopPropagation();
      openDashboardGalleryLightbox(Number(focus.dataset.galleryFocus));
    }
  },true);
  $("dashboard-gallery-prev")?.addEventListener("click",()=>goToGallerySlide(dashboardGalleryActiveIndex-1));
  $("dashboard-gallery-next")?.addEventListener("click",()=>goToGallerySlide(dashboardGalleryActiveIndex+1));
  $("dashboard-gallery-delete-active")?.addEventListener("click",event=>{
    const button=event.currentTarget;
    const imageId=button?.dataset?.galleryDelete;
    if(imageId)void deleteDashboardGalleryImage(imageId);
  });
  $("dashboard-gallery-move-left")?.addEventListener("click",event=>{
    const button=event.currentTarget;
    if(button?.dataset?.galleryId)void moveDashboardGalleryImage(button.dataset.galleryId,-1);
  });
  $("dashboard-gallery-move-right")?.addEventListener("click",event=>{
    const button=event.currentTarget;
    if(button?.dataset?.galleryId)void moveDashboardGalleryImage(button.dataset.galleryId,1);
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

  document.addEventListener("keydown", event => {
    if ($("dashboard-gallery-lightbox")?.classList.contains("hidden")) return;
    if (event.key === "Escape") closeDashboardGalleryLightbox();
    else if (event.key === "ArrowLeft") stepDashboardGalleryLightbox(-1);
    else if (event.key === "ArrowRight") stepDashboardGalleryLightbox(1);
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
    const avatarTrigger = event.target.closest(".profile-avatar-trigger");
    if (avatarTrigger && !avatarTrigger.disabled) {
      $("profile-avatar-input")?.click();
      return;
    }

    const button = event.target.closest(".copy-own-game-uid");
    if (button) await copyGameUID(button);
  });

  $("dashboard-profile")?.addEventListener("change", (event) => {
    if (event.target.id !== "profile-avatar-input") return;
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (!file.type.startsWith("image/")) throw new Error("กรุณาเลือกไฟล์รูปภาพ");
      if (file.size > 5 * 1024 * 1024) throw new Error("รูปภาพต้องมีขนาดไม่เกิน 5 MB");
      openAvatarCropEditor(file);
    } catch (error) {
      alert(error.message || "ไม่สามารถเปิดรูปภาพได้");
    } finally {
      input.value = "";
    }
  });

  registerRolePreviewEvents();

  // Stable delegated handlers for destructive War Event actions.
  // These remain active even when the event cards are re-rendered.
  document.body.addEventListener("click", event => {
    const signupDelete = event.target.closest("[data-war-signup-delete]");
    if (signupDelete) {
      event.preventDefault();
      void deleteWarSignupEvent(signupDelete.dataset.warSignupDelete, signupDelete);
    }
  });

  registerPortfolioEvents();
  registerSystemRoleEvents();
  registerPortfolioWebpMigrationEvents();
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

  $("account-details")?.addEventListener("input", (event) => {
    if (event.target.id !== "account-game-uid") return;
    const input = event.target;
    const cleaned = String(input.value || "").replace(/[^0-9]/g, "").slice(0, 12);
    if (input.value !== cleaned) input.value = cleaned;
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

let authAppBootPromise = null;

async function bootAuthenticatedApplication() {
  if (!currentUser) return;

  if (authAppBootPromise) {
    return authAppBootPromise;
  }

  authAppBootPromise = loadApplication();

  try {
    await authAppBootPromise;
  } finally {
    authAppBootPromise = null;
  }
}

async function initializeAuth() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      currentUser = data.session.user;
      await bootAuthenticatedApplication();
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

    // OAuth may finish after initializeAuth() has already checked for a session.
    // Defer Supabase work outside the auth callback to avoid holding its internal lock.
    window.setTimeout(() => {
      const appLayout = $("app-layout");
      const appIsVisible = appLayout && !appLayout.classList.contains("hidden");

      if (currentUser?.id !== session.user.id || (appIsVisible && currentMember)) {
        return;
      }

      bootAuthenticatedApplication().catch(error => {
        console.error("Post-login application startup failed:", error);
        setConnectionStatus(
          "ไม่สามารถตรวจสอบบัญชี Discord ได้: " + (error?.message || "Unknown error"),
          false
        );
      });
    }, 0);
  }

  if (event === "SIGNED_OUT") {
    removeAppRealtimeChannels();
    if (window.__warSignupRefreshTimer) window.clearInterval(window.__warSignupRefreshTimer);
    window.__warSignupRefreshTimer = null;
    currentUser = null;
    currentMember = null;
    allMembers = [];
    directoryMembers = [];
    manualGuildMembers = [];
    memberDirectoryCacheExpiresAt = 0;
    discordAccount = null;
    allPortfolios = [];
    portfolioDataCacheExpiresAt = 0;
    rolePreviewRole = null;
    applyRolePreviewState();
  }
});

// Sync deployment revision for the member cover crop and war-record lightbox UI updates.

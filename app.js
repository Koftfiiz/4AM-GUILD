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
let allWarEvents = [];
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
  "war-attendance": "เช็คชื่อวอร์",
  "war-stats": "สถิติการวอร์",
  rules: "กฎกิลด์",
  portfolio: "แฟ้มผลงาน",
  activities: "กิจกรรมกิลด์",
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

// ตรวจสอบสิทธิ์ Management
function isManagement() {
  const role = String(currentMember?.role || "").toLowerCase();

  return [
    "developer",
    "leader",
    "admin",
    "management"
  ].includes(role);
}

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

function getAvatarUrl(member) {
  if (!member?.avatar_url) return DEFAULT_AVATAR;
  if (/^https?:\/\//i.test(member.avatar_url)) return member.avatar_url;
  return DEFAULT_AVATAR;
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

  return new Date(value).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatTime(value) {
  if (!value) return "-";
  return String(value).slice(0, 5);
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

    // Re-render after member records are available so each portfolio shows its owner.
    await renderPortfolios();
    renderClassLegend();
    renderWarLayout();
    openGuildPage("dashboard");

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
      "Game UID ต้องเป็นตัวเลข 10 หลักเท่านั้น"
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
            <span class="member-role ${String(member.role || "").toLowerCase() === "developer" ? "is-developer" : ""}">${escapeHTML(role)}</span>
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
      portfolio_images ( id, image_url, image_type, caption, created_at, sort_order )
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
  (window.portfolioDraftFiles || []).forEach((item) => URL.revokeObjectURL(item.preview));
  window.portfolioDraftFiles = [];
  renderPortfolioClassChoices();
  renderPortfolioSelectedFiles();
  const status = $("portfolio-form-status");
  if (status) status.textContent = "";
}

async function renderPortfolios() {
  const container = $("portfolio-grid");
  if (!container) return;
  if (!allPortfolios.length) {
    showEmpty(container, "No Portfolio Yet", "ยังไม่มีผลงานในระบบ · กด Add Portfolio เพื่อสร้างแฟ้มแรกของคุณ");
    return;
  }

  const cards = await Promise.all(allPortfolios.map(async (portfolio) => {
    const images = portfolio.portfolio_images || [];
    const firstImage = images[0];
    const imageUrl = firstImage ? await getPortfolioImageUrl(firstImage.image_url) : "";
    const owner = allMembers.find((member) => member.user_id === portfolio.member_id);
    const ownerName = owner ? getMemberName(owner) : "Guild Member";
    const classes = getPortfolioClasses(portfolio.game_class);
    const firstClass = getClassInfo(classes[0]);
    const color = firstClass?.color || "";
    const isOwner = currentUser?.id === portfolio.member_id;
    const classTags = classes.map((className) => {
      const info = getClassInfo(className);
      return `<span class="portfolio-card-tag" ${info ? `style="--class-color:${info.color}"` : ""}>${escapeHTML(className)}</span>`;
    }).join("");

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
        </div>
      </article>
    `;
  }));
  container.innerHTML = cards.join("");
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
      image_type: "image",
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
  const form = event.currentTarget;
  const title = $("portfolio-title")?.value.trim();
  const description = $("portfolio-description")?.value.trim() || "";
  const files = window.portfolioDraftFiles || [];
  const selectedClasses = [...document.querySelectorAll(".portfolio-class-tag.is-selected")]
    .map((button) => button.dataset.class);
  const status = $("portfolio-form-status");
  const submit = $("portfolio-create-submit");

  if (!title) {
    if (status) status.textContent = "กรุณากรอกชื่อผลงาน";
    $("portfolio-title")?.focus();
    return;
  }
  if (!files.length) {
    if (status) status.textContent = "กรุณาเลือกรูปภาพอย่างน้อย 1 รูป";
    return;
  }
  if (!selectedClasses.length) {
    if (status) status.textContent = "กรุณาเลือก Class Tags อย่างน้อย 1 คลาส";
    return;
  }
  if (files.some((item) => item.file.size > 12 * 1024 * 1024)) {
    if (status) status.textContent = "รูปภาพแต่ละไฟล์ต้องมีขนาดไม่เกิน 12 MB";
    return;
  }

  submit.disabled = true;
  submit.textContent = "กำลังบันทึกผลงาน...";
  if (status) status.textContent = "กำลังสร้างแฟ้มผลงานและอัปโหลดรูปภาพ...";
  let createdPortfolio = null;
  try {
    createdPortfolio = await createPortfolio({ title, description, gameClasses: selectedClasses });
    for (let index = 0; index < files.length; index++) {
      await uploadPortfolioImage(files[index].file, createdPortfolio.id, "", index);
      if (status) status.textContent = `กำลังอัปโหลดรูปภาพ ${index + 1}/${files.length}...`;
    }
    if (status) status.textContent = "บันทึกผลงานสำเร็จ";
    await loadPortfolios();
    resetPortfolioForm();
  } catch (error) {
    console.error("Portfolio create error:", error);
    if (createdPortfolio) {
      if (status) status.textContent = "สร้างแฟ้มแล้ว แต่มีรูปบางส่วนอัปโหลดไม่สำเร็จ: " + (error.message || "Unknown error");
    } else if (status) {
      status.textContent = error.message || "ไม่สามารถบันทึกผลงานได้";
    }
  } finally {
    submit.disabled = false;
    submit.textContent = "บันทึก Portfolio";
  }
}

function registerPortfolioEvents() {
  window.portfolioDraftFiles = [];
  renderPortfolioClassChoices();
  renderPortfolioSelectedFiles();

  $("portfolio-add-button")?.addEventListener("click", () => {
    $("portfolio-create-panel")?.classList.toggle("hidden");
    $("portfolio-add-button").setAttribute("aria-expanded", String(!$("portfolio-create-panel")?.classList.contains("hidden")));
  });

  $("portfolio-create-form")?.addEventListener("submit", handlePortfolioCreate);
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
  renderWarLayout();
}

function renderWarEvents() {
  const container = $("war-events");
  if (!container) return;

  if (!allWarEvents.length) {
    showEmpty(container, "No War Events", "ยังไม่มีกิจกรรม Guild War");
    return;
  }

  container.innerHTML = allWarEvents.map((event) => `
    <article class="war-event-card">
      <div>
        <h3>${escapeHTML(event.event_name)}</h3>
        <p>${formatDate(event.event_date)} · ${formatTime(event.start_time)}</p>
        <small>${escapeHTML(event.description || "")}</small>
      </div>
      <span>${escapeHTML(event.status || "scheduled")}</span>
    </article>
  `).join("");
}

// ==========================================
// GUILD WAR - PARTY DISPLAY
// ==========================================

function renderWarLayout() {
  if (!allWarEvents.length) {
    renderRaid("raid-a", "A", []);
    renderRaid("raid-b", "B", []);
    return;
  }

  loadSelectedWarEvent(allWarEvents[0].id);
}

async function loadSelectedWarEvent(eventId) {
  const { data: parties, error } = await supabaseClient
    .from("war_parties")
    .select(`
      id,
      event_id,
      raid,
      party_number,
      party_name,
      war_party_members (
        id,
        member_id,
        position
      )
    `)
    .eq("event_id", eventId)
    .order("party_number", { ascending: true });

  if (error) {
    console.error("War party loading error:", error);
    renderRaid("raid-a", "A", []);
    renderRaid("raid-b", "B", []);
    return;
  }

  const allParties = parties || [];

  renderRaid(
    "raid-a",
    "A",
    allParties.filter((party) => party.raid === "A")
  );

  renderRaid(
    "raid-b",
    "B",
    allParties.filter((party) => party.raid === "B")
  );
}

function renderRaid(containerId, raidName, parties = []) {
  const container = $(containerId);
  if (!container) return;

  container.innerHTML = Array.from({ length: 5 }, (_, index) => {
    const partyNumber = index + 1;
    const party = parties.find((item) => Number(item.party_number) === partyNumber);
    const members = party?.war_party_members || [];

    return `
      <article class="party-card">
        <div class="party-header">
          <div>
            <span class="party-kicker">RAID ${raidName}</span>
            <h3>${escapeHTML(party?.party_name || `Party ${partyNumber}`)}</h3>
          </div>
          <span class="party-count">${members.length} / 6</span>
        </div>

        <div class="party-slots">
          ${Array.from({ length: 6 }, (_, slotIndex) => {
            const slot = members.find(
              (item) => Number(item.position) === slotIndex + 1
            );

            const member = allMembers.find(
              (item) => item.user_id === slot?.member_id
            );

            return `
              <div class="party-slot">
                <span class="slot-number">${slotIndex + 1}</span>
                <span class="slot-empty">
                  ${escapeHTML(member ? getMemberName(member) : "Empty Slot")}
                </span>
              </div>
            `;
          }).join("")}
        </div>
      </article>
    `;
  }).join("");
}

// ==========================================
// GUILD WAR - SIGNUP
// ==========================================

async function signupForWar(eventId, raid, note = "") {
  if (!currentMember) {
    throw new Error("ไม่พบข้อมูลสมาชิก");
  }

  const { data, error } = await supabaseClient
    .from("war_signups")
    .upsert({
      event_id: eventId,
      member_id: currentMember.user_id,
      raid,
      status: "registered",
      note
    }, {
      onConflict: "event_id,member_id"
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

// ==========================================
// CLASS LEGEND
// ==========================================

function renderClassLegend() {
  const container = $("class-legend");
  if (!container) return;

  container.innerHTML = CLASS_DATA.map((item) => `
    <div class="class-item" style="--class-color:${item.color}">
      <img class="class-icon-image" src="${escapeHTML(item.iconPath)}" alt="" loading="lazy">
      <strong>${escapeHTML(item.name)}</strong>
    </div>
  `).join("");
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
    const createdAt = member.created_at
      ? new Date(member.created_at).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
      : "ไม่ระบุวันที่";

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

  const confirmed = window.confirm(
    `ยืนยันเปลี่ยน System Role ของ "${getMemberName(member)}" จาก ${systemRoleLabel(previousRole)} เป็น ${systemRoleLabel(newRole)} หรือไม่?\n\nการเปลี่ยนนี้มีผลกับสิทธิ์ใช้งานในระบบ`
  );
  if (!confirmed) {
    selectElement.value = previousRole;
    return;
  }

  selectElement.disabled = true;
  if (status) status.textContent = "กำลังบันทึก Role...";

  try {
    const { data, error } = await supabaseClient.rpc("set_member_system_role", {
      target_user_id: userId,
      new_role: newRole
    });
    if (error) throw error;
    if (data && data.success === false) throw new Error(data.message || "ไม่สามารถเปลี่ยน Role ได้");

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
  $("system-role-list")?.addEventListener("change", event => {
    const select = event.target.closest('select[data-action="change-system-role"]');
    if (select) saveSystemRole(select);
  });
}

// ==========================================
// PAGE NAVIGATION
// ==========================================

function syncManagementMenuVisibility() {
  const statsMenuItem = document.querySelector("[data-management-only]");
  if (statsMenuItem) {
    const allowed = isManagement();
    statsMenuItem.classList.toggle("is-role-hidden", !allowed);
    statsMenuItem.setAttribute("aria-hidden", String(!allowed));
  }

  const devMenuItems = document.querySelectorAll("[data-developer-only]");
  const developerAllowed = isDeveloper();
  devMenuItems.forEach((item) => {
    item.classList.toggle("is-role-hidden", !developerAllowed);
    item.setAttribute("aria-hidden", String(!developerAllowed));
  });
}

function openGuildPage(pageName) {
  if (pageName === "war-stats" && !isManagement()) {
    pageName = "war";
  }
  if (pageName === "system-management" && !isDeveloper()) {
    pageName = "dashboard";
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

  const warPage = ["war", "war-attendance", "war-stats"].includes(pageName);
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
    console.error("Copy Game UID failed:", error);
    alert("ไม่สามารถคัดลอก Game UID ได้");
  }
}

async function saveOwnGameUID(form) {
  if (!currentUser || !currentMember || !form) return;

  const input = form.querySelector("[name='game_uid']");
  const button = form.querySelector("button[type='submit']");
  const uid = String(input?.value || "").trim();

  if (!/^[0-9]{10}$/.test(uid)) {
    showMessage("game-uid-message", "Game UID ต้องเป็นตัวเลข 10 หลักเท่านั้น");
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "กำลังบันทึก...";
  }

  showMessage("game-uid-message", "กำลังบันทึก Game UID...", "info");

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
    showMessage("game-uid-message", "บันทึก Game UID สำเร็จ", "success");
    renderDashboardProfile();
    renderMembers(allMembers);
  } catch (error) {
    console.error("Game UID update error:", error);
    showMessage(
      "game-uid-message",
      "บันทึกไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด")
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "บันทึก Game UID";
    }
  }
}

// ==========================================
// ACCOUNT SETTINGS
// ==========================================

function renderAccountDetails() {
  const container = $("account-details");
  if (!container) return;

  const name = currentMember
    ? getMemberName(currentMember)
    : "Guild Member";

  const displayPosition = getAccountDisplayPosition();
  const permission = getAccountPermissionLabel();

  container.innerHTML = `
    <div class="settings-detail">
      <span>Display Name</span>
      <strong>${escapeHTML(name)}</strong>
    </div>

    <div class="settings-detail">
      <span>Email Address</span>
      <strong>${escapeHTML(currentUser?.email || "-")}</strong>
    </div>

    <div class="settings-detail">
      <span>Game UID</span>
      <strong>${escapeHTML(currentMember?.game_uid || "ยังไม่ได้กรอก UID")}</strong>
    </div>

    <form id="game-uid-form" class="game-uid-settings-form">
      <label for="account-game-uid">แก้ไข Game UID (ตัวเลข 10 หลัก)</label>
      <input
        id="account-game-uid"
        name="game_uid"
        type="text"
        inputmode="numeric"
        pattern="[0-9]{10}"
        minlength="10"
        maxlength="10"
        placeholder="กรอก Game UID 10 หลัก"
        value="${escapeHTML(currentMember?.game_uid || "")}"
        required
      >
      <button type="submit" class="btn btn-primary">บันทึก Game UID</button>
      <p id="game-uid-message" class="message" aria-live="polite"></p>
    </form>

    <div class="settings-detail">
      <span>Display Position</span>
      <strong>${escapeHTML(displayPosition)}</strong>
    </div>

    <div class="settings-detail">
      <span>System Permission</span>
      <strong>${escapeHTML(permission)}</strong>
    </div>

    <div class="settings-detail">
      <span>Guild</span>
      <strong>4AM GUILD</strong>
    </div>

    <div class="settings-detail">
      <span>Server</span>
      <strong>Tideborn Dreams</strong>
    </div>
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

  $("account-details")?.addEventListener("submit", async (event) => {
    if (event.target.id !== "game-uid-form") return;
    event.preventDefault();
    await saveOwnGameUID(event.target);
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

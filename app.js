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
  { name: "Numina", color: "#e7a3bd", iconPath: "assets/class-icon/Numina.png" },
  { name: "Sylph", color: "#dfa6ce", iconPath: "assets/class-icon/Sylph.png" },
  { name: "Nightwaker", color: "#9ce8ea", iconPath: "assets/class-icon/Nightwaker.png" },
  { name: "Dragonsvelte", color: "#42c98e", iconPath: "assets/class-icon/Dragonsvelte.png" },
  { name: "Mystech", color: "#9b83df", iconPath: "assets/class-icon/Mystech.png" }
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
  war: "Guild War",
  portfolio: "แฟ้มผลงาน",
  activities: "กิจกรรมกิลด์",
  settings: "ตั้งค่าบัญชี"
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
      submitButton.textContent = "ENTER THE GUILD";
    }
  }
}

async function logout() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;

    currentUser = null;
    currentMember = null;
    allMembers = [];
    discordAccount = null;
    allPortfolios = [];
    allWarEvents = [];

    $("app-layout")?.classList.add("hidden");
    $("login-screen")?.classList.remove("hidden");

    closeUserMenu();
    updateUserChip();
    updateDiscordPill();
    setConnectionStatus("ยังไม่ได้เชื่อมต่อ", false);

    $("login-form")?.reset();
    showMessage("login-message", "");
  } catch (error) {
    console.error("Logout error:", error);
    alert("Unable to sign out: " + error.message);
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
      <div class="login-logo">
        <img
          src="${DEFAULT_AVATAR}"
          alt="Default Avatar"
          onerror="this.style.display='none'"
          style="
            width: 90px;
            height: 90px;
            object-fit: cover;
            border-radius: 50%;
          "
        >
      </div>

      <h2>CHARACTER REGISTRATION</h2>

      <p class="login-description">
        Register your character to join 4AM GUILD.
      </p>

      <form id="registration-form">

        <label for="registration-character">
          Character Name *
        </label>

        <input
          id="registration-character"
          name="character_name"
          type="text"
          maxlength="40"
          placeholder="Enter your character name"
          required
        >

        <label for="registration-class">
          Class *
        </label>

        <input
          id="registration-class"
          name="game_class"
          type="text"
          list="guild-class-options"
          placeholder="Select your class"
          required
          autocomplete="off"
        >

        <datalist id="guild-class-options">
          ${CLASS_DATA.map(item => `
            <option value="${escapeHTML(item.name)}"></option>
          `).join("")}
        </datalist>

        <label for="registration-nickname">
          Nickname (Optional)
        </label>

        <input
          id="registration-nickname"
          name="nickname"
          type="text"
          maxlength="40"
          placeholder="Enter your nickname"
        >

        <label for="registration-age">
          Age (Optional)
        </label>

        <input
          id="registration-age"
          name="age"
          type="number"
          min="1"
          max="120"
          placeholder="Enter your age"
        >

        <div class="registration-discord-info">
          <p>
            <strong>Discord Account</strong>
          </p>
          <p>${escapeHTML(currentUser?.email || "Discord Connected")}</p>
        </div>

        <p id="registration-message" class="message">
          ${escapeHTML(errorMessage)}
        </p>

        <button
          type="submit"
          class="btn btn-primary login-submit"
          id="registration-submit"
        >
          REGISTER CHARACTER
        </button>

      </form>

      <button
        type="button"
        id="registration-logout"
        class="btn btn-outline"
      >
        LOG OUT
      </button>
    `;

    loginScreen.appendChild(screen);

    $("registration-form")?.addEventListener(
      "submit",
      registerGuildMember
    );

    $("registration-logout")?.addEventListener(
      "click",
      logout
    );
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

  if (!CLASS_DATA.some(item => item.name === gameClass)) {
    showMessage(
      "registration-message",
      "กรุณาเลือก Class จากรายการที่กำหนด"
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
      <div class="profile-avatar-ring">
        <img src="${escapeHTML(avatar)}" alt=""
          onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'">
      </div>

      <div class="profile-meta">
        <div class="profile-name">
          <strong>${escapeHTML(name)}</strong>
          <svg class="icon icon-fill is-stroke"><use href="#i-crown"/></svg>
        </div>

        <span class="role-badge">
          <svg class="icon icon-fill is-stroke"><use href="#i-crown"/></svg>
          ${escapeHTML(role)}
        </span>

        <dl class="profile-list">
          <div>
            <dt>ชื่อตัวละคร :</dt>
            <dd>${escapeHTML(characterName)}</dd>
          </div>
          <div>
            <dt>Class :</dt>
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

    const positionOptions = GUILD_POSITIONS.map((position) => `
      <option value="${escapeHTML(position)}"
        ${guildPosition === position ? "selected" : ""}>
        ${escapeHTML(position)}
      </option>
    `).join("");

    return `
      <article class="member-card">
        <div class="member-avatar">
          ${escapeHTML(name.charAt(0).toUpperCase())}
        </div>

        <div class="member-details">
          <h4>${escapeHTML(name)}</h4>
          <span>${escapeHTML(role)}</span>
          <small class="member-guild-position">
            ตำแหน่งกิลด์: ${escapeHTML(guildPosition || "ยังไม่ได้กำหนดตำแหน่ง")}
          </small>
        </div>

        <div class="member-class" style="--class-color:${classColor}">
          ${escapeHTML(className)}
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

        <button
          class="btn btn-outline copy-member-id"
          data-user-id="${escapeHTML(userId)}"
          type="button"
          ${userId ? "" : "disabled"}
        >
          Copy ID
        </button>
      </article>
    `;
  }).join("");
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
      member.user_id
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

async function uploadMemberAvatar(file) {
  if (!currentUser || !currentMember) {
    throw new Error("ไม่พบข้อมูลสมาชิกของบัญชีนี้");
  }

  if (!file || !file.type.startsWith("image/")) {
    throw new Error("กรุณาเลือกไฟล์รูปภาพ");
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
      id,
      member_id,
      title,
      description,
      game_class,
      created_at,
      updated_at,
      portfolio_images (
        id,
        image_url,
        image_type,
        caption,
        created_at
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Portfolio loading error:", error);
    allPortfolios = [];
    return;
  }

  allPortfolios = data || [];
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

async function renderPortfolios() {
  const container =
    $("portfolio-list") ||
    $("portfolios-list") ||
    $("portfolio-grid");

  if (!container) return;

  if (!allPortfolios.length) {
    showEmpty(container, "No Portfolio Yet", "ยังไม่มีผลงานในระบบ");
    return;
  }

  const cards = await Promise.all(allPortfolios.map(async (portfolio) => {
    const images = portfolio.portfolio_images || [];
    const firstImage = images[0];
    const imageUrl = firstImage
      ? await getPortfolioImageUrl(firstImage.image_url)
      : "";

    return `
      <article class="portfolio-card">
        ${imageUrl ? `
          <img src="${escapeHTML(imageUrl)}" alt=""
            onerror="this.style.display='none'">
        ` : ""}
        <div class="portfolio-card-content">
          <span>${escapeHTML(portfolio.game_class || "Unassigned")}</span>
          <h3>${escapeHTML(portfolio.title || "Untitled")}</h3>
          <p>${escapeHTML(portfolio.description || "")}</p>
          <small>${formatDate(portfolio.created_at)}</small>
        </div>
      </article>
    `;
  }));

  container.innerHTML = cards.join("");
}

// ==========================================
// PORTFOLIO IMAGE UPLOAD
// ==========================================

async function uploadPortfolioImage(file, portfolioId, caption = "") {
  if (!currentUser) throw new Error("กรุณาเข้าสู่ระบบก่อน");

  if (!file || !file.type.startsWith("image/")) {
    throw new Error("กรุณาเลือกไฟล์รูปภาพ");
  }

  const extension = file.name.split(".").pop().toLowerCase();
  const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
  const path = `${currentUser.id}/${portfolioId}/${Date.now()}.${safeExtension}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(PORTFOLIO_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (uploadError) throw uploadError;

  const { error: insertError } = await supabaseClient
    .from("portfolio_images")
    .insert({
      portfolio_id: portfolioId,
      image_url: path,
      image_type: "image",
      caption
    });

  if (insertError) throw insertError;

  await loadPortfolios();
  return path;
}

// ==========================================
// CREATE PORTFOLIO
// ==========================================

async function createPortfolio({ title, description = "", gameClass = "" }) {
  if (!currentUser || !currentMember) {
    throw new Error("ไม่พบข้อมูลสมาชิก");
  }

  const { data, error } = await supabaseClient
    .from("portfolios")
    .insert({
      member_id: currentMember.user_id,
      title,
      description,
      game_class: gameClass || getMemberClass(currentMember)
    })
    .select()
    .single();

  if (error) throw error;

  await loadPortfolios();
  return data;
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
// PAGE NAVIGATION
// ==========================================

function openGuildPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.add("hidden");
  });

  const targetPage = $("page-" + pageName);
  if (targetPage) {
    targetPage.classList.remove("hidden");
  }

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageName
    );
  });

  document.title = `${PAGE_TITLES[pageName] || "4AM GUILD"} | 4AM GUILD`;

  closeUserMenu();
  window.scrollTo({ top: 0 });

  if (pageName === "members") loadMembers();

  if (pageName === "settings") {
    renderAccountDetails();
    loadDiscordAccount();
  }

  if (pageName === "portfolio") loadPortfolios();
  if (pageName === "war") loadWarEvents();
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

document.addEventListener("DOMContentLoaded", () => {
  $("login-form")?.addEventListener("submit", login);
  $("logout-btn")?.addEventListener("click", logout);

  $("member-search")?.addEventListener("input", filterMembers);
  $("refresh-members")?.addEventListener("click", loadMembers);
  $("connect-discord")?.addEventListener("click", connectDiscord);

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      openGuildPage(button.dataset.page);
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

  $("members-list")?.addEventListener("change", async (event) => {
    const select = event.target.closest(
      "select[data-action='assign-guild-position']"
    );

    if (!select) return;
    await assignGuildPosition(select);
  });

  initializeAuth();
});

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

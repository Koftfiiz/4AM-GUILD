import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const encoder = new TextEncoder();

function hexToBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new Error("Invalid hexadecimal value");
  }
  return new Uint8Array(value.match(/.{2}/g)!.map((part) => parseInt(part, 16)));
}

async function verifyDiscordRequest(request: Request, rawBody: string): Promise<boolean> {
  const publicKey = Deno.env.get("DISCORD_APPLICATION_PUBLIC_KEY") || "";
  const signature = request.headers.get("x-signature-ed25519") || "";
  const timestamp = request.headers.get("x-signature-timestamp") || "";
  if (!publicKey || !signature || !timestamp) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signature),
      encoder.encode(timestamp + rawBody),
    );
  } catch (error) {
    console.error("[REWARD DEBUG] Signature verification exception:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function discordMessage(content: string, eventId: string, count: number) {
  return {
    content,
    components: [{
      type: 1,
      components: [
        { type: 2, style: 3, label: "ลงชื่อเข้าร่วม", custom_id: "reward_join:" + eventId },
        { type: 2, style: 2, label: "ยกเลิกการลงชื่อ", custom_id: "reward_leave:" + eventId },
        { type: 2, style: 2, label: "ผู้ลงชื่อ " + count + " คน", custom_id: "reward_count:" + eventId, disabled: true },
      ],
    }],
  };
}

function getOption(options: Array<Record<string, unknown>>, name: string): string {
  const option = options.find((item) => item.name === name);
  return typeof option?.value === "string" ? option.value : "";
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const rawBody = await request.text();

  // TEMPORARY DIAGNOSTICS: never log the signature, public key, body, or any secret value.
  console.log("[REWARD DEBUG] Request received");
  console.log("[REWARD DEBUG] Method:", request.method);
  console.log("[REWARD DEBUG] Has signature:", !!request.headers.get("x-signature-ed25519"));
  console.log("[REWARD DEBUG] Has timestamp:", !!request.headers.get("x-signature-timestamp"));
  console.log("[REWARD DEBUG] Public key configured:", !!Deno.env.get("DISCORD_APPLICATION_PUBLIC_KEY"));
  console.log("[REWARD DEBUG] Public key format valid:", /^[0-9a-f]{64}$/i.test(Deno.env.get("DISCORD_APPLICATION_PUBLIC_KEY") || ""));

  const signatureValid = await verifyDiscordRequest(request, rawBody);
  console.log("[REWARD DEBUG] Signature verification:", signatureValid ? "VALID" : "INVALID");

  if (!signatureValid) {
    console.error("[REWARD DEBUG] Request rejected: invalid Discord request signature");
    return jsonResponse({ error: "Invalid Discord request signature" }, 401);
  }

  let interaction: Record<string, any>;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Acknowledge Discord component interactions immediately, then finish the
  // database work in the Edge Runtime background and update the original message.
  const respond = (body: unknown, status = 200): Response => {
    const result = body as Record<string, any>;
    if (
      interaction.type === 3 &&
      (result?.type === 4 || result?.type === 7) &&
      interaction.application_id &&
      interaction.token
    ) {
      const webhookUrl = "https://discord.com/api/v10/webhooks/" +
        encodeURIComponent(String(interaction.application_id)) + "/" +
        encodeURIComponent(String(interaction.token));
      const isUpdate = result.type === 7;
      const payload = isUpdate
        ? result.data
        : { ...(result.data || {}), flags: 64 };
      const task = (async () => {
        const response = await fetch(
          isUpdate ? webhookUrl + "/messages/@original" : webhookUrl,
          {
            method: isUpdate ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok) {
          const detail = (await response.text()).slice(0, 500);
          throw new Error("Discord follow-up failed (" + response.status + "): " + detail);
        }
      })().catch((error) => {
        console.error("[DISCORD INTERACTION] Deferred response failed:", error instanceof Error ? error.message : String(error));
      });
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
        edgeRuntime.waitUntil(task);
        return jsonResponse({ type: 6 });
      }
      console.error("[DISCORD INTERACTION] EdgeRuntime.waitUntil unavailable; using synchronous response.");
    }
    return jsonResponse(body, status);
  };

  // Discord PING handshake.
  if (interaction.type === 1) return respond({ type: 1 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return respond({ type: 4, data: { content: "ระบบยังตั้งค่า Supabase Secret ไม่ครบ", flags: 64 } });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const expectedGuildId = Deno.env.get("DISCORD_GUILD_ID") || "";
  if (expectedGuildId && interaction.guild_id !== expectedGuildId) {
    return respond({ type: 4, data: { content: "คำสั่งนี้ใช้ได้เฉพาะ Discord Server ของ 4AM เท่านั้น", flags: 64 } });
  }

  const discordUserId = String(interaction.member?.user?.id || interaction.user?.id || "");
  if (!discordUserId) {
    return respond({ type: 4, data: { content: "ไม่พบ Discord User ID", flags: 64 } });
  }

  async function linkedMember() {
    const link = await supabase.from("discord_accounts").select("user_id,verified,guild_member_verified").eq("discord_user_id", discordUserId).maybeSingle();
    if (link.error || !link.data || link.data.verified !== true || link.data.guild_member_verified !== true) return null;
    const member = await supabase.from("guild_members").select("user_id,character_name,nickname,role,active").eq("user_id", link.data.user_id).eq("active", true).maybeSingle();
    return member.error ? null : member.data;
  }
  async function getRoster(eventId: string) {
    const [eventQ, partiesQ] = await Promise.all([
      supabase.from("war_events").select("id,event_name,event_date,is_published,status,description").eq("id", eventId).maybeSingle(),
      supabase.from("war_parties").select("id,raid,party_number,war_party_members(member_id)").eq("event_id", eventId).order("raid").order("party_number")
    ]);
    if (eventQ.error || !eventQ.data || !eventQ.data.is_published || eventQ.data.status === "cancelled" || partiesQ.error) throw new Error("ไม่พบกิจกรรมวอร์ที่เผยแพร่ หรือกิจกรรมถูกยกเลิกแล้ว");
    const configMatch = String(eventQ.data.description || "").match(/\[\[WAR_CONFIG:(\{.*?\})\]\]/);
    let roundTimes = ["20:00", "20:30"];
    if (configMatch) {
      try {
        const config = JSON.parse(configMatch[1]);
        if (Array.isArray(config.rounds) && config.rounds.length >= 1 && config.rounds.length <= 2) {
          roundTimes = config.rounds.map((value: unknown) => String(value).slice(0, 5));
        }
      } catch {
        // Keep the legacy two-round default for older published events.
      }
    }
    const event = { ...eventQ.data, round_times: roundTimes, round_numbers: roundTimes.map((_: string, index: number) => index + 1) };
    const rows = (partiesQ.data || []).flatMap((party: any) => (party.war_party_members || []).map((slot: any) => ({ member_id: slot.member_id, raid: party.raid, party_number: party.party_number })));
    const ids = [...new Set(rows.map((x: any) => x.member_id))];
    if (!ids.length) throw new Error("กิจกรรมนี้ยังไม่มีรายชื่อสมาชิกที่จัดลงตี้");
    const [membersQ, reservesQ, checkinsQ] = await Promise.all([
      supabase.from("guild_members").select("user_id,character_name,nickname,active").in("user_id", ids).eq("active", true),
      supabase.from("war_signups").select("member_id,queue_position,status,available_rounds").eq("event_id", eventId).eq("status", "standby").order("queue_position"),
      supabase.from("war_round_checkins").select("member_id,round_number,checked_in_at").eq("event_id", eventId)
    ]);
    if (membersQ.error || reservesQ.error || checkinsQ.error) throw new Error("โหลดข้อมูลสมาชิก ตัวสำรอง หรือเช็กชื่อไม่สำเร็จ กรุณาตรวจสอบ SQL WAR_ATTENDANCE_CENTER_V2");
    const reserveIds = (reservesQ.data || []).map((x: any) => x.member_id);
    const reserveMembersQ = reserveIds.length ? await supabase.from("guild_members").select("user_id,character_name,nickname,active").in("user_id", reserveIds).eq("active", true) : { data: [], error: null };
    if (reserveMembersQ.error) throw reserveMembersQ.error;
    const members = new Map((membersQ.data || []).map((m: any) => [m.user_id, m]));
    const reserveMembers = new Map((reserveMembersQ.data || []).map((m: any) => [m.user_id, m]));
    const roster = rows.filter((x: any) => members.has(x.member_id)).map((x: any) => ({ ...x, member: members.get(x.member_id) }));
    const reserves = (reservesQ.data || []).filter((x: any) => reserveMembers.has(x.member_id)).map((x: any) => ({ ...x, available_rounds: Array.isArray(x.available_rounds) ? x.available_rounds.map(Number) : [1, 2], member: reserveMembers.get(x.member_id) }));
    return { event, roster, reserves, checkins: checkinsQ.data || [] };
  }
  function buildMessage(data: any) {
    const { event, roster, reserves, checkins } = data;
    const checkMap = new Map(checkins.map((x: any) => [x.round_number + ":" + x.member_id, x]));
    const fields: any[] = [];
    const displayName = (x: any) => String(x.member.character_name || x.member.nickname || "สมาชิก");
    const list = (items: any[], reserve = false) => items.map((x: any) => {
      const place = reserve ? "สำรอง" : (x.raid + x.party_number);
      return displayName(x) + " (" + place + ")";
    }).join("\n").slice(0, 1020) || "—";
    const rounds = Array.isArray(event.round_numbers) ? event.round_numbers : [1, 2];
    for (const round of rounds) {
      const mainDone = roster.filter((x: any) => checkMap.has(round + ":" + x.member_id));
      const mainPending = roster.filter((x: any) => !checkMap.has(round + ":" + x.member_id));
      const roundReserves = reserves.filter((x: any) => x.available_rounds.includes(round));
      const reserveDone = roundReserves.filter((x: any) => checkMap.has(round + ":" + x.member_id));
      const reservePending = roundReserves.filter((x: any) => !checkMap.has(round + ":" + x.member_id));
      const roundTime = event.round_times?.[round - 1] || "-";
      fields.push({ name: "ROUND 0" + round + " · " + roundTime + " · ตัวจริงยืนยันแล้ว " + mainDone.length + "/" + roster.length, value: list(mainDone), inline: false });
      fields.push({ name: "ROUND 0" + round + " · ตัวจริงยังไม่ยืนยัน " + mainPending.length, value: list(mainPending), inline: false });
      fields.push({ name: "ROUND 0" + round + " · ตัวสำรองยืนยันแล้ว " + reserveDone.length + "/" + roundReserves.length, value: list(reserveDone, true), inline: false });
      fields.push({ name: "ROUND 0" + round + " · ตัวสำรองยังไม่ยืนยัน " + reservePending.length, value: list(reservePending, true), inline: false });
    }
    return {
      content: "📋 **4AM GUILD — WAR CHECK-IN**\nกิจกรรม: **" + event.event_name + "** · " + event.event_date + "\nสมาชิกกดยืนยันแยกตามรอบ กรุณาตรวจสอบว่ากดยืนยันครบตามความพร้อมจริง",
      embeds: [{ color: 0xD92D45, title: "WAR READINESS", description: "รายชื่ออ้างอิงจาก Planned Roster และรายชื่อสำรองที่ลงชื่อไว้บนเว็บไซต์ · การกดยืนยันไม่ใช่การยืนยันว่าเข้าตี้ในเกมแล้ว", fields, footer: { text: "4AM GUILD · Discord Check-in" } }],
      components: [{ type: 1, components: (event.round_numbers || [1, 2]).map((round: number) => ({
        type: 2, style: 3, label: "✓ ยืนยัน Round 0" + round, custom_id: "war_checkin:" + event.id + ":" + round
      })) }]
    };
  }


  async function buildWarSignupMessage(eventId: string) {
    const { data: event, error: eventError } = await supabase
      .from("war_events")
      .select("id,event_name,event_date,start_time,registration_type,signup_opens_at,signup_closes_at,status")
      .eq("id", eventId).maybeSingle();
    if (eventError || !event) throw new Error("ไม่พบกิจกรรม Guild War นี้");

    const [signupsQ, membersQ] = await Promise.all([
      supabase.from("war_signups").select("member_id,queue_position,status").eq("event_id", eventId).neq("status", "cancelled").order("queue_position", { ascending: true }),
      supabase.from("guild_members").select("user_id,character_name,nickname,game_class,active").eq("active", true)
    ]);
    if (signupsQ.error || membersQ.error) throw new Error("โหลดรายชื่อผู้สมัคร Guild War ไม่สำเร็จ");
    const members = new Map((membersQ.data || []).map((m: any) => [m.user_id, m]));
    const rows = (signupsQ.data || []).map((row: any) => ({ ...row, member: members.get(row.member_id) })).filter((row: any) => row.member);

    const roleForClass = (value: unknown) => {
      const gameClass = String(value || "").trim().toLowerCase();
      if (gameClass === "ironclad") return "Tank";
      if (gameClass === "sylph") return "Healer";
      if (gameClass === "bloodstrom") return "Bloodstrom";
      if (gameClass === "mystech") return "DPS";
      return "DPS";
    };
    const roleOrder = ["Tank", "DPS", "Bloodstrom", "Healer"];
    const roleGroups = new Map<string, any[]>(roleOrder.map(role => [role, []]));
    for (const row of rows) roleGroups.get(roleForClass(row.member.game_class))!.push(row);

    const formatThaiDate = (value: string | null) => {
      if (!value) return "-";
      const parts = String(value).slice(0, 10).split("-");
      return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : "-";
    };
    const formatDateTime = (value: string | null) => {
      if (!value) return "-";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "-";
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      }).format(date).replace(",", "");
    };
    const officialDeadline = event.registration_type === "official" && event.event_date
      ? new Date(String(event.event_date).slice(0, 10) + "T14:00:00+07:00").getTime()
      : new Date(event.signup_closes_at || "").getTime();
    const closed = event.status === "cancelled" || !Number.isFinite(officialDeadline) || Date.now() >= officialDeadline;
    const mainCount = rows.filter((x: any) => Number(x.queue_position) <= 60).length;
    const reserveCount = rows.filter((x: any) => Number(x.queue_position) > 60).length;
    const fields: any[] = [
      {
        name: "\u200b",
        value: "👥 ผู้สมัคร " + rows.length + "/80  ·  🟢 ตัวจริง " + mainCount + "/60  ·  🔵 สำรอง " + reserveCount + "/20",
        inline: false
      }
    ];
    const roleIcons: Record<string, string> = { Tank: "🛡️", DPS: "⚔️", Bloodstrom: "🩸", Healer: "💚" };
    const roleSummary = roleOrder.map((role) => {
      const roleRows = roleGroups.get(role) || [];
      return roleIcons[role] + " **" + role + " · " + roleRows.length + " คน**";
    });
    const rosterLines = rows.filter((x: any) => Number(x.queue_position) <= 60)
      .map((x: any) => String(x.queue_position) + ". " + String(x.member.character_name || x.member.nickname || "สมาชิก"));
    const reserveLines = rows.filter((x: any) => Number(x.queue_position) > 60)
      .map((x: any) => String(x.queue_position) + ". " + String(x.member.character_name || x.member.nickname || "สมาชิก"));
    const addRosterFields = (heading: string, lines: string[], prefix = "") => {
      const chunks: string[] = [];
      let chunk = prefix;
      for (const line of lines) {
        const next = chunk ? chunk + (chunk.endsWith("\n") ? "" : "\n") + line : line;
        if (next.length > 980 && chunk) {
          chunks.push(chunk);
          chunk = line;
        } else {
          chunk = next;
        }
      }
      if (chunk) chunks.push(chunk);
      if (!chunks.length) chunks.push(prefix ? prefix + "—" : "—");
      chunks.forEach((value, index) => fields.push({
        name: index === 0 && prefix ? "\u200b" : heading,
        value,
        inline: false
      }));
    };
    addRosterFields("\u200b", rosterLines, roleSummary[0] + "　　" + roleSummary[1] + "\n" + roleSummary[2] + "　　" + roleSummary[3] + "\n\n**เข้าร่วม (" + rosterLines.length + " คน)**");
    addRosterFields("**รายชื่อสำรอง (" + reserveLines.length + " คน)**", reserveLines);

    const kindLabel = event.registration_type === "practice" ? "SCRIM" : "GUILD WAR";
    const eventLabel = event.registration_type === "practice" ? "ซ้อมวอร์" : String(event.event_name || "GUILD WAR");
    const startDateTime = "📅 **" + formatThaiDate(event.event_date) + "**　🕒 **" + String(event.start_time || "-").slice(0, 5) + " น.**";
    const closeLabel = formatDateTime(event.registration_type === "official" && event.event_date
      ? String(event.event_date).slice(0, 10) + "T14:00:00+07:00"
      : event.signup_closes_at);
    const description = "**◥◣④AM◥◣ " + kindLabel + "**" +
      "\n\n**" + eventLabel + "**" +
      "\n\n" + startDateTime +
      "\n\n⏳ **ปิดรับสมัคร:** " + closeLabel + " น." +
      "\n\nหากไม่สะดวกเข้าร่วมแล้ว กรุณากดปุ่ม [ถอนชื่อออก] ด้านล่าง" +
      "\n\n[เปิดดูรายละเอียดบนเว็บไซต์ 4AM GUILD](https://4am-guild.vercel.app/guildwar/signup)";
    return {
      embeds: [{
        color: 0xD92D45,
        title: "4AM SIGN-UP",
        description,
        fields,
        image: { url: "https://raw.githubusercontent.com/Koftfiiz/4AM-GUILD/main/assets/animated-4am-logo.gif" },
        footer: { text: "4AM GUILD · รายชื่อซิงก์กับเว็บไซต์" },
        timestamp: new Date().toISOString()
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: "เข้าร่วม", custom_id: "war_signup_join:" + eventId, disabled: closed },
          { type: 2, style: 4, label: "ถอนชื่อออก", custom_id: "war_signup_leave:" + eventId, disabled: closed }
        ]
      }],
      allowed_mentions: { parse: [] }
    };
  }

  // Slash command: /reward-open title:<name> signup_closes_at:<ISO timestamp> (uses the latest published Guild War)
  if (interaction.type === 2 && interaction.data?.name === "reward-open") {
    const options = Array.isArray(interaction.data.options) ? interaction.data.options : [];
    const title = getOption(options, "title").trim();
    const closesAt = getOption(options, "signup_closes_at").trim();

    const closeDate = new Date(closesAt);
    if (!title || title.length > 120 || !closesAt || Number.isNaN(closeDate.getTime()) || closeDate.getTime() <= Date.now()) {
      return respond({ type: 4, data: { content: "กรุณาระบุชื่อกิจกรรมและเวลาปิดรับสมัครในอนาคตให้ถูกต้อง", flags: 64 } });
    }

    const { data, error } = await supabase.rpc("create_reward_event_from_discord", {
      p_discord_user_id: discordUserId,
      p_war_event_id: null,
      p_title: title,
      p_description: "",
      p_signup_closes_at: closeDate.toISOString(),
    });
    if (error || !data?.success) {
      return respond({ type: 4, data: { content: error?.message || data?.message || "เปิดกิจกรรมไม่สำเร็จ หรือไม่มีสิทธิ์ฝ่ายบริหาร", flags: 64 } });
    }

    const eventId = String(data.event_id);
    const warName = String(data.war_event_name || "Guild War");
    const closeLabel = closeDate.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });
    const content = "🎁 **4AM GUILD — " + title + "**\nอ้างอิงรายชื่อจาก: **" + warName + "**\nปิดรับลงชื่อ: **" + closeLabel + " น.**\n\nผู้มีสิทธิ์: สมาชิกที่อยู่ในรายชื่อ Guild War ทั้งตัวจริงและตัวสำรองเท่านั้น\nกดปุ่มด้านล่างเพื่อลงชื่อหรือยกเลิกได้ก่อนปิดรับสมัคร.";
    return respond({ type: 4, data: discordMessage(content, eventId, 0) });
  }

  // Buttons: join, cancel, or refresh the participant count.
  if (interaction.type === 3 && String(interaction.data?.custom_id || "").startsWith("reward_")) {
    const customId = String(interaction.data?.custom_id || "");
    const [action, eventId] = customId.split(":");
    if (!eventId || !["reward_join", "reward_leave", "reward_count"].includes(action)) {
      return respond({ type: 4, data: { content: "ปุ่มกิจกรรมไม่ถูกต้อง", flags: 64 } });
    }

    let result: any = { success: true, message: "จำนวนผู้ลงทะเบียนปัจจุบัน" };
    if (action === "reward_join") {
      const { data, error } = await supabase.rpc("register_reward_event_from_discord", {
        p_event_id: eventId,
        p_discord_user_id: discordUserId,
      });
      if (error) result = { success: false, message: error.message };
      else result = data || result;
    } else if (action === "reward_leave") {
      const { data, error } = await supabase.rpc("cancel_reward_event_from_discord", {
        p_event_id: eventId,
        p_discord_user_id: discordUserId,
      });
      if (error) result = { success: false, message: error.message };
      else result = data || result;
    }

    const { count, error: countError } = await supabase
      .from("reward_event_signups")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "registered");
    const participantCount = countError ? 0 : (count || 0);
    const { data: eventRow } = await supabase
      .from("reward_events")
      .select("title,signup_closes_at,status")
      .eq("id", eventId)
      .maybeSingle();

    if (!eventRow) {
      return respond({ type: 4, data: { content: "ไม่พบกิจกรรมนี้", flags: 64 } });
    }
    const closed = eventRow.status !== "open" || !eventRow.signup_closes_at || new Date(eventRow.signup_closes_at).getTime() <= Date.now();
    const content = (result.success === false ? "⚠️ " : "✅ ") +
      String(result.message || (action === "reward_join" ? "ลงชื่อเข้าร่วมสำเร็จ" : action === "reward_leave" ? "ยกเลิกการลงชื่อแล้ว" : "จำนวนผู้ลงทะเบียน")) +
      "\n🎁 **" + String(eventRow.title || "กิจกรรมแจกของรางวัล") + "**" +
      "\nสถานะ: **" + (closed ? "ปิดรับสมัคร" : "เปิดรับสมัคร") + "**";
    const message = discordMessage(content, eventId, participantCount);
    if (closed) {
      message.components[0].components[0].disabled = true;
      message.components[0].components[1].disabled = true;
    }
    return respond({ type: 7, data: message });
  }


  if (interaction.type === 3 && String(interaction.data?.custom_id || "").startsWith("war_signup_join:")) {
    const eventId = String(interaction.data.custom_id).slice("war_signup_join:".length);
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
      return respond({ type: 4, data: { content: "ปุ่มเข้าร่วมวอร์ไม่ถูกต้อง", flags: 64 } });
    }
    const actor = await linkedMember();
    if (!actor) {
      return respond({ type: 4, data: { content: "กรุณาเชื่อมบัญชี Discord กับสมาชิก 4AM GUILD และยืนยันการเชื่อมต่อก่อนลงชื่อวอร์", flags: 64 } });
    }
    const { data: eventRow, error: eventError } = await supabase
      .from("war_events")
      .select("event_name,signup_opens_at,signup_closes_at,status")
      .eq("id", eventId).maybeSingle();
    if (eventError || !eventRow) return respond({ type: 4, data: { content: "ไม่พบกิจกรรม Guild War นี้", flags: 64 } });
    if (eventRow.status === "cancelled") return respond({ type: 4, data: { content: "กิจกรรม Guild War นี้ถูกยกเลิกแล้ว", flags: 64 } });
    const now = Date.now();
    const opens = new Date(eventRow.signup_opens_at || 0).getTime();
    const closes = new Date(eventRow.signup_closes_at || 0).getTime();
    if (!Number.isFinite(opens) || now < opens) {
      const label = eventRow.signup_opens_at ? new Date(eventRow.signup_opens_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ยังไม่กำหนด";
      return respond({ type: 4, data: { content: "ยังไม่ถึงเวลาเปิดรับสมัคร Guild War · เปิดรับสมัคร " + label + " น.", flags: 64 } });
    }
    if (!Number.isFinite(closes) || now >= closes) {
      try {
        const closedMessage = await buildWarSignupMessage(eventId);
        return respond({ type: 7, data: closedMessage });
      } catch (e) {
        return respond({ type: 4, data: { content: e instanceof Error ? e.message : "ปิดรับสมัครแล้ว", flags: 64 } });
      }
    }
    const { data: joined, error: joinError } = await supabase.rpc("join_war_signup_from_discord", {
      p_event_id: eventId,
      p_discord_user_id: discordUserId
    });
    if (joinError || !joined?.success) {
      return respond({ type: 4, data: { content: joinError?.message || joined?.message || "ลงชื่อเข้าร่วมวอร์ไม่สำเร็จ", flags: 64 } });
    }
    try {
      const updatedMessage = await buildWarSignupMessage(eventId);
      return respond({ type: 7, data: updatedMessage });
    } catch (e) {
      return respond({ type: 4, data: { content: "ลงชื่อสำเร็จ แต่รีเฟรชรายชื่อใน Discord ไม่สำเร็จ: " + (e instanceof Error ? e.message : "unknown error"), flags: 64 } });
    }
  }

  if (interaction.type === 3 && String(interaction.data?.custom_id || "").startsWith("war_signup_leave:")) {
    const eventId = String(interaction.data.custom_id).slice("war_signup_leave:".length);
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
      return respond({ type: 4, data: { content: "ปุ่มถอนชื่อออกไม่ถูกต้อง", flags: 64 } });
    }
    const actor = await linkedMember();
    if (!actor) {
      return respond({ type: 4, data: { content: "กรุณาเชื่อมบัญชี Discord กับสมาชิก 4AM GUILD และยืนยันการเชื่อมต่อก่อนถอนชื่อ", flags: 64 } });
    }
    const { data: cancelled, error: cancelError } = await supabase.rpc("cancel_war_signup_from_discord", {
      p_event_id: eventId,
      p_discord_user_id: discordUserId
    });
    if (cancelError || !cancelled?.success) {
      return respond({ type: 4, data: { content: cancelError?.message || cancelled?.message || "ถอนชื่อออกไม่สำเร็จ", flags: 64 } });
    }
    try {
      const updatedMessage = await buildWarSignupMessage(eventId);
      return respond({ type: 7, data: updatedMessage });
    } catch (e) {
      return respond({ type: 4, data: { content: "ถอนชื่อสำเร็จ แต่รีเฟรชรายชื่อใน Discord ไม่สำเร็จ: " + (e instanceof Error ? e.message : "unknown error"), flags: 64 } });
    }
  }

  if (interaction.type === 2 && interaction.data?.name === "war-checkin") {
    const actor = await linkedMember();
    if (!actor || !["developer", "leader", "management"].includes(String(actor.role).toLowerCase())) {
      return respond({ type: 4, data: { content: "คำสั่งนี้สงวนสิทธิ์สำหรับ Management ขึ้นไป และต้องเชื่อม Discord กับบัญชี 4AM GUILD แล้ว", flags: 64 } });
    }
    const eventId = getOption(interaction.data.options || [], "event_id");
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) return respond({ type: 4, data: { content: "กรุณาระบุ Event ID ที่ถูกต้อง", flags: 64 } });
    try {
      const data = await getRoster(eventId);
      return respond({ type: 4, data: buildMessage(data) });
    } catch (e) {
      return respond({ type: 4, data: { content: e instanceof Error ? e.message : "เปิดระบบเช็กชื่อไม่สำเร็จ", flags: 64 } });
    }
  }

  if (interaction.type === 3) {
    const customId = String(interaction.data?.custom_id || "");
    const match = customId.match(/^war_checkin:([0-9a-f-]{36}):(1|2)$/i);
    if (!match) return respond({ type: 4, data: { content: "ปุ่มเช็กชื่อไม่ถูกต้อง", flags: 64 } });
    const [, eventId, roundText] = match;
    const round = Number(roundText);
    const actor = await linkedMember();
    if (!actor) return respond({ type: 4, data: { content: "กรุณาเชื่อมบัญชี Discord กับสมาชิก 4AM GUILD และยืนยันการเชื่อมต่อก่อน", flags: 64 } });
    try {
      const data = await getRoster(eventId);
      if (!data.event.round_numbers.includes(round)) {
        return respond({ type: 4, data: { content: "กิจกรรมนี้ไม่มี Round 0" + round, flags: 64 } });
      }
      const rosterMember = data.roster.find((x: any) => x.member_id === actor.user_id);
      const reserveMember = data.reserves.find((x: any) => x.member_id === actor.user_id && x.available_rounds.includes(round));
      if (!rosterMember && !reserveMember) return respond({ type: 4, data: { content: "คุณไม่มีรายชื่อเป็นตัวจริงหรือตัวสำรองที่พร้อมสำหรับ Round 0" + round + " จึงไม่สามารถกดยืนยันรอบนี้ได้", flags: 64 } });
      const saved = await supabase.from("war_round_checkins").upsert({
        event_id: eventId, round_number: round, member_id: actor.user_id,
        discord_user_id: discordUserId, checked_in_at: new Date().toISOString()
      }, { onConflict: "event_id,round_number,member_id" });
      if (saved.error) throw saved.error;
      const refreshed = await getRoster(eventId);
      return respond({ type: 7, data: buildMessage(refreshed) });
    } catch (e) {
      return respond({ type: 4, data: { content: e instanceof Error ? e.message : "บันทึกการยืนยันไม่สำเร็จ", flags: 64 } });
    }
  }

  return respond({ type: 4, data: { content: "ไม่รองรับคำสั่งนี้", flags: 64 } });
});
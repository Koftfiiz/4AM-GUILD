// Supabase Edge Function: discord-guild-activity-notify
// Uses the Developer-managed guild_discord_integration_settings and event routes. TEST MODE is the safe default.
// Verify JWT (legacy) must be OFF; this function validates the access token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" }
});
const plainText = (value: string) => String(value || "")
  .replace(/\[\[WAR_CONFIG:[\s\S]*?\]\]/g, "")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(p|div|li)>/gi, "\n")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 850);
const warRoundLabel = (description: string, startTime: string | null) => {
  const match = String(description || "").match(/\[\[WAR_CONFIG:(\{.*?\})\]\]/);
  if (match) {
    try {
      const config = JSON.parse(match[1]);
      if (Array.isArray(config.rounds) && config.rounds.length) {
        return config.rounds.map((value: unknown) => String(value).slice(0, 5)).join(" / ") + " น.";
      }
    } catch {
      // Fall back to the event's stored start time for legacy events.
    }
  }
  return String(startTime || "-").slice(0, 5) + " น.";
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ success: false, message: "Missing access token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !botToken) {
      return json({ success: false, message: "Missing Supabase or Discord function secrets" }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, message: "Invalid session" }, 401);

    const body = await request.json().catch(() => ({}));
    const kind = String(body.kind || "");
    const recordId = String(kind === "activity" ? body.activity_id || "" : kind === "comment" ? body.comment_id || "" : body.event_id || "");
    if (!["activity", "comment", "war_signup"].includes(kind) || !/^[0-9a-f-]{36}$/i.test(recordId)) {
      return json({ success: false, message: "Invalid notification request" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: requester, error: requesterError } = await admin.from("guild_members")
      .select("user_id,character_name,nickname,discord_name,role,active")
      .eq("user_id", authData.user.id).maybeSingle();
    if (requesterError || !requester || requester.active !== true) {
      return json({ success: false, message: "Active guild member required" }, 403);
    }
    const role = String(requester.role || "").toLowerCase();
    const eventKey = kind === "activity" ? "guild_activity_published" : kind === "comment" ? "guild_activity_comment" : "war_signup_submitted";
    const { data: integrationSettings, error: integrationError } = await admin.from("guild_discord_integration_settings")
      .select("mode,test_channel_id,production_enabled").eq("id", 1).maybeSingle();
    if (integrationError || !integrationSettings) return json({ success: false, message: "Discord integration settings are not configured" }, 503);
    let channelId = "";
    if (integrationSettings.mode === "test") {
      channelId = String(integrationSettings.test_channel_id || "");
    } else if (integrationSettings.mode === "production" && integrationSettings.production_enabled === true) {
      const { data: route } = await admin.from("guild_discord_event_routes")
        .select("enabled,channel_id").eq("event_key", eventKey).maybeSingle();
      if (route?.enabled === true) channelId = String(route.channel_id || "");
    }
    if (!channelId) return json({ success: false, message: "No destination configured for this Discord event; notification was not sent" }, 503);
    const isManager = ["developer", "leader", "management"].includes(role);
    const requesterName = requester.character_name || requester.nickname || requester.discord_name || "สมาชิก 4AM";

    let record: any;
    let activity: any = null;
    let author: any = null;
    let table = "";
    if (kind === "war_signup") {
      table = "war_events";
      const { data, error } = await admin.from(table)
        .select("id,event_name,event_date,start_time,registration_type,signup_opens_at,signup_closes_at,description,status,discord_message_id,discord_sent_at")
        .eq("id", recordId).maybeSingle();
      if (error || !data) return json({ success: false, message: "War Signup Event not found" }, 404);
      record = data;
      if (!isManager) {
        if (!record.discord_message_id) {
          return json({ success: true, skipped: true, message: "No Discord signup announcement has been published yet" });
        }
        const { data: ownSignup, error: ownSignupError } = await admin.from("war_signups")
          .select("id").eq("event_id", recordId).eq("member_id", authData.user.id).maybeSingle();
        if (ownSignupError || !ownSignup) {
          return json({ success: false, message: "Only a member who has joined this event can refresh its Discord signup message" }, 403);
        }
      }
      if (record.status === "cancelled") return json({ success: false, message: "This Guild War event has been cancelled" }, 409);
    } else if (kind === "activity") {
      table = "guild_activities";
      const { data, error } = await admin.from(table)
        .select("id,title,content_html,starts_at,ends_at,created_by,created_at,discord_notified_at")
        .eq("id", recordId).maybeSingle();
      if (error || !data) return json({ success: false, message: "Activity not found" }, 404);
      record = data;
      if (!isManager) return json({ success: false, message: "Management permission required" }, 403);
      if (record.discord_notified_at) return json({ success: true, already_notified: true });
      const { data: member } = await admin.from("guild_members")
        .select("character_name,nickname,discord_name").eq("user_id", record.created_by).maybeSingle();
      author = member || requester;
    } else {
      table = "guild_activity_comments";
      const { data, error } = await admin.from(table)
        .select("id,activity_id,user_id,content,created_at,discord_notified_at")
        .eq("id", recordId).maybeSingle();
      if (error || !data) return json({ success: false, message: "Comment not found" }, 404);
      record = data;
      if (record.user_id !== authData.user.id && !isManager) return json({ success: false, message: "Not allowed" }, 403);
      if (record.discord_notified_at) return json({ success: true, already_notified: true });
      const { data: activityData, error: activityError } = await admin.from("guild_activities")
        .select("id,title").eq("id", record.activity_id).maybeSingle();
      if (activityError || !activityData) return json({ success: false, message: "Related activity not found" }, 404);
      activity = activityData;
      const { data: member } = await admin.from("guild_members")
        .select("character_name,nickname,discord_name").eq("user_id", record.user_id).maybeSingle();
      author = member || requester;
    }

    const authorName = author?.character_name || author?.nickname || author?.discord_name || requesterName;
    let warSignupRows: any[] = [];
    let warSignupMembers: any[] = [];
    if (kind === "war_signup") {
      const [signupResult, memberResult] = await Promise.all([
        admin.from("war_signups").select("member_id,queue_position,status").eq("event_id", recordId).neq("status", "cancelled").order("queue_position", { ascending: true }),
        admin.from("guild_members").select("user_id,character_name,nickname,game_class,active").eq("active", true)
      ]);
      if (signupResult.error || memberResult.error) return json({ success: false, message: "Unable to load Guild War registration roster" }, 500);
      warSignupRows = signupResult.data || [];
      const memberMap = new Map((memberResult.data || []).map((m: any) => [m.user_id, m]));
      warSignupMembers = warSignupRows.map(row => ({ ...row, member: memberMap.get(row.member_id) })).filter(row => row.member);
    }
    const now = Date.now();
    const deadlineMs = record?.registration_type === "official" && record?.event_date
      ? new Date(String(record.event_date).slice(0, 10) + "T14:00:00+07:00").getTime()
      : (record?.signup_closes_at ? new Date(record.signup_closes_at).getTime() : NaN);
    const isSignupClosed = record?.status === "cancelled" || !Number.isFinite(deadlineMs) || now >= deadlineMs;
    const isSignupOpen = Boolean(record?.signup_opens_at) && now >= new Date(record.signup_opens_at).getTime() && !isSignupClosed && record.status !== "cancelled";
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
    for (const row of warSignupMembers) roleGroups.get(roleForClass(row.member.game_class))!.push(row);
    const formatDate = (value: string | null) => {
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
    const signupFields: any[] = [
      { name: "**ผู้ลงชื่อทั้งหมด**", value: String(warSignupRows.length) + " / 80 คน", inline: true },
      { name: "**ตัวจริง**", value: String(warSignupRows.filter(x => Number(x.queue_position) <= 60).length) + " / 60 คน", inline: true },
      { name: "**ตัวสำรอง**", value: String(warSignupRows.filter(x => Number(x.queue_position) > 60).length) + " / 20 คน", inline: true }
    ];
    const roleIcons: Record<string, string> = { Tank: "🛡️", DPS: "⚔️", Bloodstrom: "🩸", Healer: "💚" };
    const addSpacingField = (blankLines: number) => signupFields.push({
      name: "\u200b",
      value: "\u200b" + "\n".repeat(blankLines),
      inline: false
    });
    addSpacingField(2);
    for (const role of ["Tank", "DPS"]) {
      const roleRows = roleGroups.get(role) || [];
      signupFields.push({
        name: roleIcons[role] + " **" + role + " · " + roleRows.length + " คน**",
        value: "\u200b",
        inline: true
      });
    }
    addSpacingField(1);
    for (const role of ["Bloodstrom", "Healer"]) {
      const roleRows = roleGroups.get(role) || [];
      signupFields.push({
        name: roleIcons[role] + " **" + role + " · " + roleRows.length + " คน**",
        value: "\u200b",
        inline: true
      });
    }
    addSpacingField(2);
    const rosterLines = warSignupMembers.filter(x => Number(x.queue_position) <= 60)
      .map(x => String(x.queue_position) + ". " + String(x.member.character_name || x.member.nickname || "สมาชิก"));
    const reserveLines = warSignupMembers.filter(x => Number(x.queue_position) > 60)
      .map(x => String(x.queue_position) + ". " + String(x.member.character_name || x.member.nickname || "สมาชิก"));
    const addRosterFields = (heading: string, lines: string[]) => {
      const chunks: string[] = [];
      let chunk = "";
      for (const line of lines) {
        if (line.length > 1000) {
          throw new Error("A member display name is too long to fit in a single Discord signup announcement.");
        }
        const next = chunk ? chunk + "\n" + line : line;
        if (next.length > 1000 && chunk) { chunks.push(chunk); chunk = line; }
        else chunk = next;
      }
      if (chunk) chunks.push(chunk);
      if (!chunks.length) chunks.push("—");
      chunks.forEach((value, index) => signupFields.push({
        name: index === 0 ? heading : "\u200b",
        value,
        inline: false
      }));
    };
    addRosterFields("**เข้าร่วม (" + rosterLines.length + " คน)**", rosterLines);
    addRosterFields("**รายชื่อสำรอง (" + reserveLines.length + " คน)**", reserveLines);
    const kindLabel = record.registration_type === "practice" ? "SCRIM" : "GUILD WAR";
    const closeLabel = record.registration_type === "official" && record.event_date
      ? formatDateTime(String(record.event_date).slice(0, 10) + "T14:00:00+07:00")
      : formatDateTime(record.signup_closes_at);
    const startTimeLabel = String(record.start_time || "-").slice(0, 5);
    const embed = kind === "war_signup" ? {
      title: "4AM SIGN-UP",
      description: "**◥◣④AM◥◣ " + kindLabel + "**" +
        "\n\n**" + String(record.event_name || "4AM SIGN-UP") + "**" +
        "\n\n<:Date:593930359985405983> **" + formatDate(record.event_date) + "**　<:Time:593930235658108939> **" + startTimeLabel + " น.**" +
        "\n\n<:Countdown:858794526176444467> **ปิดรับสมัคร:** " + closeLabel +
        "\n\n[เปิดดูรายละเอียดบนเว็บไซต์ 4AM GUILD](https://4am-guild.vercel.app())",
      color: 0xD92D45,
      fields: signupFields,
      image: { url: "https://raw.githubusercontent.com/Koftfiiz/4AM-GUILD/main/assets/animated-4am-logo.gif" },
      footer: { text: "4AM GUILD · รายชื่อซิงก์กับเว็บไซต์" },
      timestamp: new Date().toISOString()
    } : kind === "activity" ? {
      title: "มีกิจกรรมใหม่จาก 4AM GUILD",
      color: 0xC52B3B,
      fields: [
        { name: "หัวข้อ", value: String(record.title || "-").slice(0, 250), inline: false },
        { name: "รายละเอียด", value: plainText(record.content_html) || "ไม่มีรายละเอียด", inline: false },
        { name: "ผู้ประกาศ", value: String(authorName).slice(0, 200), inline: true },
        { name: "เริ่ม", value: record.starts_at ? new Date(record.starts_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ไม่ระบุ", inline: true },
        { name: "สิ้นสุด", value: record.ends_at ? new Date(record.ends_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ไม่ระบุ", inline: true }
      ],
      footer: { text: "4AM GUILD · Community Board" },
      timestamp: record.created_at
    } : {
      title: "มีความคิดเห็นใหม่ในกิจกรรม 4AM GUILD",
      color: 0xC49A54,
      fields: [
        { name: "กิจกรรม", value: String(activity?.title || "กิจกรรมกิลด์").slice(0, 250), inline: false },
        { name: "ผู้แสดงความคิดเห็น", value: String(authorName).slice(0, 200), inline: true },
        { name: "ความคิดเห็น", value: String(record.content || "ไม่มีข้อความ").slice(0, 1000), inline: false }
      ],
      footer: { text: "4AM GUILD · Activity Comments" },
      timestamp: record.created_at
    };

    if (kind === "war_signup") {
      const fields = Array.isArray(embed.fields) ? embed.fields : [];
      const embedCharacterCount = String(embed.title || "").length
        + String(embed.description || "").length
        + fields.reduce((total: number, field: any) => total + String(field.name || "").length + String(field.value || "").length, 0)
        + String(embed.footer?.text || "").length;
      const invalidField = fields.some((field: any) =>
        String(field.name || "").length > 256 || String(field.value || "").length > 1024
      );
      if (fields.length > 25 || String(embed.title || "").length > 256
        || String(embed.description || "").length > 4096 || embedCharacterCount > 6000 || invalidField) {
        return json({
          success: false,
          message: "Guild War signup roster exceeds Discord's single-message limits. No Part 2 message was sent; shorten display names or reduce announcement text."
        }, 413);
      }
    }

    const messagePayload: any = { embeds: [embed], allowed_mentions: { parse: [] } };
    if (kind === "war_signup") {
      messagePayload.components = [{
        type: 1,
        components: [
          { type: 2, style: 3, label: "เข้าร่วม", custom_id: "war_signup_join:" + recordId, disabled: isSignupClosed || record.status === "cancelled" },
          { type: 2, style: 4, label: "ถอนชื่อออก", custom_id: "war_signup_leave:" + recordId, disabled: isSignupClosed || record.status === "cancelled" }
        ]
      }];
      if (isSignupClosed || record.status === "cancelled") {
        embed.description += "\n\n**This event is closed**";
      }
    }
    const discordMessagesUrl = "https://discord.com/api/v10/channels/" + channelId + "/messages";
    const hasPreviousWarMessage = kind === "war_signup" && Boolean(record.discord_message_id);
    let discordResponse = await fetch(
      discordMessagesUrl + (hasPreviousWarMessage ? "/" + record.discord_message_id : ""),
      {
        method: hasPreviousWarMessage ? "PATCH" : "POST",
        headers: { "Authorization": "Bot " + botToken, "Content-Type": "application/json" },
        body: JSON.stringify(messagePayload)
      }
    );
    let recreatedDeletedWarMessage = false;

    // If a manager manually deleted the bot's old Discord announcement,
    // Discord returns 404 / code 10008 (Unknown Message). Re-create it instead
    // of leaving the database pointing at a message that no longer exists.
    if (!discordResponse.ok && hasPreviousWarMessage && discordResponse.status === 404) {
      const previousDetails = await discordResponse.text();
      let discordErrorCode = 0;
      try {
        discordErrorCode = Number(JSON.parse(previousDetails).code || 0);
      } catch {
        // Keep the original response as the failure detail below.
      }

      if (discordErrorCode === 10008) {
        discordResponse = await fetch(discordMessagesUrl, {
          method: "POST",
          headers: { "Authorization": "Bot " + botToken, "Content-Type": "application/json" },
          body: JSON.stringify(messagePayload)
        });
        recreatedDeletedWarMessage = true;
      } else {
        await admin.from(table).update({ discord_send_error: previousDetails.slice(0, 1000) }).eq("id", recordId);
        return json({ success: false, message: "Discord API rejected the message", details: previousDetails.slice(0, 500) }, 502);
      }
    }

    if (!discordResponse.ok) {
      const details = await discordResponse.text();
      await admin.from(table).update(kind === "war_signup" ? { discord_send_error: details.slice(0, 1000) } : { discord_notification_error: details.slice(0, 1000) }).eq("id", recordId);
      return json({ success: false, message: "Discord API rejected the message", details: details.slice(0, 500) }, 502);
    }

    const discordMessage = await discordResponse.json();
    const updatePayload = kind === "war_signup"
      ? { discord_message_id: String(discordMessage.id), discord_sent_at: new Date().toISOString(), discord_send_error: null }
      : { discord_notified_at: new Date().toISOString(), discord_notification_error: null };
    const { error: updateError } = await admin.from(table).update(updatePayload).eq("id", recordId);
    if (updateError) return json({ success: false, message: "Discord sent, but notification state could not be saved" }, 500);
    return json({
      success: true,
      updated: hasPreviousWarMessage && !recreatedDeletedWarMessage,
      recreated: recreatedDeletedWarMessage
    });
  } catch (error) {
    console.error("discord-guild-activity-notify:", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
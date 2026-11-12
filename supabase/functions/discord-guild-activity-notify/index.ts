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
        .select("id,event_name,event_date,start_time,registration_type,signup_opens_at,signup_closes_at,description,discord_message_id,discord_sent_at")
        .eq("id", recordId).maybeSingle();
      if (error || !data) return json({ success: false, message: "War Signup Event not found" }, 404);
      record = data;
      if (!isManager) return json({ success: false, message: "Management permission required" }, 403);
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
    const embed = kind === "war_signup" ? {
      title: "⚔️ 4AM GUILD · เปิดลงชื่อ Guild War",
      description: "มีการสร้างกิจกรรมลงชื่อวอร์ใหม่ สมาชิกสามารถตรวจสอบกำหนดการและติดตามรายชื่อได้จากเว็บไซต์กิลด์",
      color: 0xC52B3B,
      fields: [
        { name: "กิจกรรม", value: String(record.event_name || "-").slice(0, 250), inline: false },
        { name: "ประเภท", value: record.registration_type === "practice" ? "ซ้อมวอร์" : "วอร์จริง", inline: true },
        { name: "วันที่วอร์", value: record.event_date ? new Date(record.event_date + "T00:00:00+07:00").toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "long" }) : "-", inline: true },
        { name: "เวลาเริ่มวอร์", value: String(record.start_time || "-").slice(0, 5) + " น.", inline: true },
        { name: "เปิดรับสมัคร", value: record.signup_opens_at ? new Date(record.signup_opens_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "-", inline: true },
        { name: "ปิดรับสมัคร", value: record.signup_closes_at ? new Date(record.signup_closes_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "-", inline: true },
        { name: "จำนวนที่รับ", value: "สูงสุด 80 คน · ตัวจริง 60 คน · สำรอง 20 คน", inline: false },
        { name: "รายละเอียด", value: plainText(String(record.description || "").replace(/\\?\[\[WAR_CONFIG:[\\s\\S]*?\\]\]/g, "")) || "ไม่มีรายละเอียดเพิ่มเติม", inline: false }
      ],
      footer: { text: "4AM GUILD · War Registration" },
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

    const isWarUpdate = kind === "war_signup" && Boolean(record.discord_message_id);
    const discordMessageUrl = "https://discord.com/api/v10/channels/" + channelId + "/messages";
    const discordResponse = await fetch(isWarUpdate ? discordMessageUrl + "/" + record.discord_message_id : discordMessageUrl, {
      method: isWarUpdate ? "PATCH" : "POST",
      headers: { "Authorization": "Bot " + botToken, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } })
    });
    if (!discordResponse.ok) {
      const details = await discordResponse.text();
      await admin.from(table).update(kind === "war_signup" ? { discord_send_error: details.slice(0, 1000) } : { discord_notification_error: details.slice(0, 1000) }).eq("id", recordId);
      return json({ success: false, message: isWarUpdate ? "Discord could not update the existing message" : "Discord API rejected the message", details: details.slice(0, 500) }, 502);
    }

    const discordMessage = await discordResponse.json();
    const updatePayload = kind === "war_signup"
      ? { discord_message_id: String(discordMessage.id), discord_sent_at: new Date().toISOString(), discord_send_error: null }
      : { discord_notified_at: new Date().toISOString(), discord_notification_error: null };
    const { error: updateError } = await admin.from(table).update(updatePayload).eq("id", recordId);
    if (updateError) return json({ success: false, message: isWarUpdate ? "Discord updated, but notification state could not be saved" : "Discord sent, but notification state could not be saved", updated: isWarUpdate }, 500);
    return json({ success: true, updated: isWarUpdate });
  } catch (error) {
    console.error("discord-guild-activity-notify:", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
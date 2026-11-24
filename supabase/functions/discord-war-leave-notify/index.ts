import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);
  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "").trim();
    if (!token) return json({ success: false, message: "กรุณาเข้าสู่ระบบก่อนส่งแจ้งเตือน" }, 401);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
    if (!url || !anonKey || !serviceKey || !botToken) return json({ success: false, message: "Discord function secrets are incomplete" }, 500);

    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, message: "Session ไม่ถูกต้อง" }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const body = await request.json().catch(() => ({}));
    const requestId = String(body?.request_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json({ success: false, message: "Request ID ไม่ถูกต้อง" }, 400);

    const { data: actor, error: actorError } = await admin.from("guild_members")
      .select("user_id,role,active,membership_status").eq("user_id", authData.user.id).maybeSingle();
    const actorRole = String(actor?.role || "").toLowerCase();
    const isOwner = authData.user.id === "378b09df-16a0-4d01-8908-2604c2c210a9";
    const isManager = isOwner || (
      actor?.active === true && actor?.membership_status === "active" &&
      ["developer", "leader", "management"].includes(actorRole)
    );
    if (actorError || !actor || actor.active !== true) return json({ success: false, message: "Active guild member required" }, 403);

    const { data: leave, error: leaveError } = await admin.from("war_leave_requests")
      .select("id,event_id,member_id,reason,status,created_at,discord_notified_at")
      .eq("id", requestId).maybeSingle();
    if (leaveError || !leave) return json({ success: false, message: "ไม่พบรายการแจ้งลาวอร์" }, 404);
    if (leave.member_id !== authData.user.id && !isManager) return json({ success: false, message: "Not allowed" }, 403);
    const { data: existingDiscordMessage } = await admin.from("discord_embed_messages").select("channel_id,message_id")
      .eq("event_key", "war_leave_submitted").eq("record_id", requestId).eq("message_type", "primary").maybeSingle();
    if (leave.discord_notified_at && !existingDiscordMessage) return json({ success: true, already_notified: true, needs_legacy_link: true });
    if (leave.discord_notified_at && existingDiscordMessage) return json({ success: true, already_notified: true });

    const [{ data: settings, error: settingsError }, { data: route, error: routeError }] = await Promise.all([
      admin.from("guild_discord_integration_settings").select("mode,test_channel_id,production_enabled").eq("id", 1).maybeSingle(),
      admin.from("guild_discord_event_routes").select("enabled,channel_id").eq("event_key", "war_leave_submitted").maybeSingle(),
    ]);
    if (settingsError || !settings || routeError) return json({ success: false, message: "อ่านการตั้งค่า Discord ไม่สำเร็จ" }, 503);
    if (route?.enabled !== true) {
      return json({ success: true, skipped: true, message: "ปิดการแจ้งเตือนการถอนตัวจากวอร์ไว้ใน Discord Integration Settings" });
    }
    let channelId = "";
    if (existingDiscordMessage?.channel_id) channelId = String(existingDiscordMessage.channel_id);
    else if (settings.mode === "test") channelId = String(settings.test_channel_id || "");
    else if (settings.mode === "production" && settings.production_enabled === true && route?.enabled === true) {
      channelId = String(route.channel_id || "");
    }
    if (!/^\\d{17,20}$/.test(channelId)) {
      const message = "No valid Discord destination configured for war_leave_submitted";
      await admin.from("war_leave_requests").update({ discord_notification_error: message }).eq("id", requestId);
      return json({ success: false, message }, 503);
    }

    const [{ data: event }, { data: member }] = await Promise.all([
      admin.from("war_events").select("event_name,event_date,start_time").eq("id", leave.event_id).maybeSingle(),
      admin.from("guild_members").select("character_name,nickname,discord_name").eq("user_id", leave.member_id).maybeSingle(),
    ]);
    const memberName = member?.character_name || member?.nickname || member?.discord_name || "สมาชิก 4AM";
    const date = event?.event_date ? String(event.event_date).split("-").reverse().join("/") : "-";
    const time = String(event?.start_time || "").slice(0, 5);
    const messagePayload = {
        embeds: [{
          title: "4AM GUILD · แจ้งลาวอร์",
          description: "**" + String(event?.event_name || "Guild War").slice(0, 180) + "**",
          color: 0xD92D45,
          fields: [
            { name: "สมาชิก", value: String(memberName).slice(0, 200), inline: true },
            { name: "วันที่ / เวลา", value: date + (time ? " · " + time : ""), inline: true },
            { name: "สถานะ", value: leave.status === "approved" ? "รับทราบแล้ว" : String(leave.status), inline: true },
            { name: "เหตุผล", value: String(leave.reason || "ไม่ได้ระบุ").slice(0, 1000), inline: false },
          ],
          footer: { text: "4AM GUILD · War Leave" },
          timestamp: leave.created_at,
        }],
        allowed_mentions: { parse: [] },
      };
    const existingUrl = existingDiscordMessage?.message_id
      ? "https://discord.com/api/v10/channels/" + channelId + "/messages/" + existingDiscordMessage.message_id
      : "https://discord.com/api/v10/channels/" + channelId + "/messages";
    if (existingDiscordMessage?.message_id) {
      const existingCheck = await fetch(existingUrl, { headers: { Authorization: "Bot " + botToken } });
      if (!existingCheck.ok) return json({ success: false, message: "ข้อความ Discord เดิมไม่พบ ระบบจะไม่สร้างข้อความทดแทน กรุณาตรวจสอบใน Embed Studio" }, 409);
    }
    const response = await fetch(existingUrl, {
      method: existingDiscordMessage?.message_id ? "PATCH" : "POST",
      headers: { Authorization: "Bot " + botToken, "Content-Type": "application/json" },
      body: JSON.stringify(messagePayload),
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 800);
      await admin.from("war_leave_requests").update({ discord_notification_error: details }).eq("id", requestId);
      return json({ success: false, message: "Discord API rejected the notification", details }, 502);
    }
    const message = await response.json();
    const { error: registryError } = await admin.from("discord_embed_messages").upsert({
      event_key: "war_leave_submitted", record_id: requestId, message_type: "primary", channel_id: channelId,
      message_id: String(message.id), source: "automation", last_payload: message,
      linked_by: authData.user.id, linked_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }, { onConflict: "event_key,record_id,message_type" });
    if (registryError) {
      await admin.from("war_leave_requests").update({
        discord_notified_at: new Date().toISOString(),
        discord_notification_error: "Message sent; registry insert failed. Do not resend. Message ID: " + String(message.id)
      }).eq("id", requestId);
      return json({ success: false, message: "ส่ง Discord แล้ว แต่บันทึก Message ID ไม่สำเร็จ ห้ามส่งซ้ำ", message_id: String(message.id) }, 500);
    }
    const { error: updateError } = await admin.from("war_leave_requests")
      .update({ discord_notified_at: new Date().toISOString(), discord_notification_error: null })
      .eq("id", requestId);
    if (updateError) return json({ success: false, message: "ส่ง Discord แล้ว แต่บันทึกสถานะไม่สำเร็จ", message_id: String(message.id) }, 500);
    return json({ success: true, message_id: String(message.id), message: "ส่งแจ้งลาวอร์ไปยัง Discord แล้ว" });
  } catch (error) {
    console.error("discord-war-leave-notify:", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

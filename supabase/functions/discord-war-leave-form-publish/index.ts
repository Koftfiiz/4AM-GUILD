import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const OWNER_ID = "378b09df-16a0-4d01-8908-2604c2c210a9";
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);
  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ success: false, message: "กรุณาเข้าสู่ระบบก่อน" }, 401);
    const url = Deno.env.get("SUPABASE_URL") || "", anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
    const guildId = Deno.env.get("DISCORD_GUILD_ID") || "";
    if (!url || !anonKey || !serviceKey || !botToken || !guildId) return json({ success: false, message: "Discord function secrets are incomplete" }, 500);
    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, message: "Session ไม่ถูกต้อง" }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: actor, error: actorError } = await admin.from("guild_members").select("user_id,role,active,membership_status").eq("user_id", authData.user.id).maybeSingle();
    const role = String(actor?.role || "").toLowerCase(), isOwner = authData.user.id === OWNER_ID;
    const isManager = isOwner || (actor?.active === true && actor?.membership_status === "active" && ["developer","leader","management"].includes(role));
    if (actorError || !actor || actor.active !== true || !isManager) return json({ success: false, message: "เฉพาะ Developer / Management ที่เป็นสมาชิก Active เท่านั้น" }, 403);
    const body = await request.json().catch(() => ({})), eventId = String(body?.event_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) return json({ success: false, message: "Event ID ไม่ถูกต้อง" }, 400);
    const { data: event, error: eventError } = await admin.from("war_events").select("id,event_name,event_date,start_time,signup_closes_at,description,registration_type,is_published,status").eq("id", eventId).maybeSingle();
    if (eventError || !event) return json({ success: false, message: "ไม่พบ Event นี้" }, 404);
    if (event.is_published !== true || event.status === "cancelled") return json({ success: false, message: "ฟอร์มแจ้งลาจะโพสต์ได้หลัง Publish Event เท่านั้น และ Event ต้องไม่ถูกยกเลิก" }, 409);
    const [{ data: settings, error: settingsError }, { data: route, error: routeError }, { data: existing, error: existingError }] = await Promise.all([
      admin.from("guild_discord_integration_settings").select("mode,test_channel_id,production_enabled").eq("id", 1).maybeSingle(),
      admin.from("guild_discord_event_routes").select("enabled,channel_id").eq("event_key", "war_leave_discord_submitted").maybeSingle(),
      admin.from("discord_embed_messages").select("channel_id,message_id").eq("event_key", "war_leave_form_published").eq("record_id", eventId).eq("message_type", "primary").maybeSingle()
    ]);
    if (settingsError || !settings || routeError || existingError) return json({ success: false, message: "อ่านการตั้งค่า Discord ไม่สำเร็จ" }, 503);
    if (route?.enabled !== true) return json({ success: true, skipped: true, message: "ปิด Route แจ้งลาผ่าน Discord Bot อยู่" });
    let channelId = "";
    if (existing?.channel_id) channelId = String(existing.channel_id);
    else if (settings.mode === "test") channelId = String(settings.test_channel_id || "");
    else if (settings.mode === "production" && settings.production_enabled === true) channelId = String(route.channel_id || "");
    if (!/^\d{17,20}$/.test(channelId)) return json({ success: false, message: "ไม่พบ Channel ID ที่ถูกต้องสำหรับโพสต์แบบฟอร์มแจ้งลา" }, 503);
    // Exact Discord Role IDs supplied by the guild owner (24 Nov 2026).
    // Keep role mentions restricted to these two IDs only.
    const roleIds = ["1482073441501970513", "1571418707664568393"];
    if (roleIds.some((id) => !/^\d{17,20}$/.test(id))) return json({ success: false, message: "Discord Role ID configuration is invalid" }, 500);
    const dateLabel = event.event_date ? String(event.event_date).split("-").reverse().join("/") : "-";
    let timeLabel = String(event.start_time || "").slice(0,5);
    if (event.registration_type === "official") {
      const match = String(event.description || "").match(/\[\[WAR_CONFIG:(\{.*?\})\]\]/);
      if (match) try { const config = JSON.parse(match[1]); if (Array.isArray(config.rounds) && config.rounds.length) timeLabel = config.rounds.map((v: unknown) => String(v).slice(0,5)).join(" / "); } catch { /* use start_time */ }
    }
    const isPractice = event.registration_type === "practice";
    const title = isPractice ? "🔵 แจ้งลาซ้อมวอร์" : "🔴 แจ้งลากิลด์วอร์";
    const deadlineText = isPractice
      ? "🚨 สมาชิกสามารถแจ้งลา **ซ้อมวอร์** ได้จนถึงวัน/เวลาปิดรับสมัครที่กำหนดไว้"
      : "🚨 สมาชิกสามารถแจ้งลา **วอร์จริง** ได้ถึงวันเสาร์ 14:00 น. ของสัปดาห์นั้นๆ";
    const payload = {
      content: "<@&" + roleIds[0] + "> <@&" + roleIds[1] + ">",
      embeds: [{
        title,
        description: "**" + String(event.event_name || "กิจกรรมวอร์").slice(0,180) + "**",
        color: isPractice ? 0x3498DB : 0xD92D45,
        fields: [
          {
            name: "📅 วันและเวลา",
            value: "**" + dateLabel + "**" + (timeLabel ? "\\n🕒 " + timeLabel + " น." : ""),
            inline: false
          },
          {
            name: "📝 วิธีแจ้งลา",
            value: "หากไม่สามารถเข้าร่วมกิจกรรมนี้ได้ สามารถกดปุ่มด้านล่างเพื่อแจ้งลาได้\\n\\n⚠️ ต้องใช้ Discord บัญชีเดียวกับที่เชื่อมต่อกับเว็บไซต์ 4AM GUILD ระบบจะดึงบัญชี Discord และชื่อตัวละครให้อัตโนมัติ",
            inline: false
          },
          {
            name: "🚨 กำหนดเวลาการแจ้งลา",
            value: deadlineText,
            inline: false
          }
        ],
        footer: { text: "4AM GUILD · War Leave Form" }
      }],
      components: [{ type: 1, components: [{ type: 2, style: isPractice ? 1 : 4, label: isPractice ? "แจ้งลาซ้อมวอร์" : "แจ้งลาวอร์", custom_id: "war_leave_form:" + eventId }] }],
      allowed_mentions: { parse: [], roles: roleIds }
    };
    const messageUrl = existing?.message_id
      ? "https://discord.com/api/v10/channels/" + encodeURIComponent(channelId) + "/messages/" + encodeURIComponent(String(existing.message_id))
      : "https://discord.com/api/v10/channels/" + encodeURIComponent(channelId) + "/messages";
    if (existing?.message_id) {
      const check = await fetch(messageUrl, { headers: { Authorization: "Bot " + botToken } });
      if (!check.ok) return json({ success: false, message: "ข้อความฟอร์มเดิมไม่พบ ระบบจะไม่สร้างข้อความใหม่เพื่อป้องกันการโพสต์ซ้ำ กรุณาตรวจสอบ Message ID ใน Discord Embed Studio" }, 409);
    }
    const response = await fetch(messageUrl, { method: existing?.message_id ? "PATCH" : "POST", headers: { Authorization: "Bot " + botToken, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) return json({ success: false, message: "Discord API ไม่อนุญาตให้โพสต์หรือแก้ไขข้อความ", details: (await response.text()).slice(0,600) }, 502);
    const message = await response.json();
    const { error: registryError } = await admin.from("discord_embed_messages").upsert({
      event_key: "war_leave_form_published", record_id: eventId, message_type: "primary", channel_id: channelId,
      message_id: String(message.id), source: "automation", last_payload: message,
      linked_by: authData.user.id, linked_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }, { onConflict: "event_key,record_id,message_type" });
    if (registryError) return json({ success: false, message: "โพสต์ Discord แล้ว แต่บันทึก Message ID ไม่สำเร็จ ห้ามกด Publish ซ้ำจนกว่าจะตรวจสอบ", message_id: String(message.id) }, 500);
    return json({ success: true, updated: Boolean(existing?.message_id), message_id: String(message.id) });
  } catch (error) {
    console.error("discord-war-leave-form-publish:", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

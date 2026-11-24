// Discord Embed Studio — read/relink existing messages and update by exact Message ID.
// This function never creates a replacement for an existing message.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const isId = (value: unknown) => /^\d{17,20}$/.test(String(value || ""));
const eventTitleHints: Record<string, string[]> = {
  member_joined: ["สมาชิกใหม่"],
  war_signup_opened: ["4AM SIGN-UP"],
  war_signup_submitted: ["4AM SIGN-UP"],
  war_signup_closed: ["ปิดรับสมัคร Guild War", "ปิดรับสมัคร"],
  war_roster_published: ["4AM GUILD", "RAID A", "RAID B", "ตี้วอร์"],
  war_checkin_opened: ["CHECK-IN", "ยืนยันความพร้อม"],
  war_attendance_finalized: ["สรุปผลการเข้าร่วม", "ATTENDANCE"],
  guild_activity_published: ["กิจกรรมกิลด์", "กิจกรรมใหม่"],
  guild_activity_comment: ["คอมเมนท์กิจกรรม"],
  feedback_submitted: ["FEEDBACK", "แจ้งปัญหา"],
  duck_race_results: ["DUCK RACE"],
  war_leave_submitted: ["แจ้งลาวอร์", "ถอนตัวจากวอร์"],
  portfolio_published: ["PORTFOLIO", "แฟ้มผลงาน"],
};

function validatePayload(payload: any) {
  const errors: string[] = [];
  const embeds = Array.isArray(payload?.embeds) ? payload.embeds : [];
  if (!embeds.length && !String(payload?.content || "")) errors.push("ต้องมี Embed หรือ Message Content อย่างน้อยหนึ่งอย่าง");
  if (embeds.length > 10) errors.push("ข้อความหนึ่งรายการมี Embed ได้ไม่เกิน 10 รายการ");
  let total = 0;
  for (const [i, embed] of embeds.entries()) {
    const prefix = embeds.length > 1 ? `Embed ${i + 1}: ` : "";
    const title = String(embed?.title || "");
    const description = String(embed?.description || "");
    const author = String(embed?.author?.name || "");
    const footer = String(embed?.footer?.text || "");
    const fields = Array.isArray(embed?.fields) ? embed.fields : [];
    if (title.length > 256) errors.push(prefix + "Title เกิน 256 ตัวอักษร");
    if (description.length > 4096) errors.push(prefix + "Description เกิน 4,096 ตัวอักษร");
    if (author.length > 256) errors.push(prefix + "Author เกิน 256 ตัวอักษร");
    if (footer.length > 2048) errors.push(prefix + "Footer เกิน 2,048 ตัวอักษร");
    if (fields.length > 25) errors.push(prefix + "Fields เกิน 25 รายการ");
    for (const [j, field] of fields.entries()) {
      if (String(field?.name || "").length > 256) errors.push(prefix + `Field ${j + 1} Name เกิน 256 ตัวอักษร`);
      if (String(field?.value || "").length > 1024) errors.push(prefix + `Field ${j + 1} Value เกิน 1,024 ตัวอักษร`);
      total += String(field?.name || "").length + String(field?.value || "").length;
    }
    total += title.length + description.length + author.length + footer.length;
  }
  if (total > 6000) errors.push("ข้อความรวมเกิน 6,000 ตัวอักษร");
  if (String(payload?.content || "").length > 2000) errors.push("Message Content เกิน 2,000 ตัวอักษร");
  return errors;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);
  try {
    const accessToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ success: false, message: "กรุณาเข้าสู่ระบบก่อนใช้งาน Embed Studio" }, 401);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
    if (!url || !anonKey || !serviceKey || !botToken) return json({ success: false, message: "การตั้งค่า Server ยังไม่ครบ" }, 500);

    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user) return json({ success: false, message: "Session ไม่ถูกต้องหรือหมดอายุ" }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: member } = await admin.from("guild_members").select("role,active").eq("user_id", authData.user.id).maybeSingle();
    if (!member?.active || !["developer", "leader", "management"].includes(member.role)) {
      return json({ success: false, message: "ต้องเป็น Developer, Leader หรือ Management ที่ Active เท่านั้น" }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const eventKey = String(body.event_key || "");
    const recordId = String(body.record_id || "");
    const messageType = String(body.message_type || "primary");
    const discordHeaders = { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" };
    const discord = async (path: string, init: RequestInit = {}) => {
      const response = await fetch("https://discord.com/api/v10" + path, { ...init, headers: { ...discordHeaders, ...(init.headers || {}) } });
      const data = await response.json().catch(() => ({}));
      return { response, data };
    };
    const resolveDestination = async () => {
      const { data: settings } = await admin.from("guild_discord_integration_settings")
        .select("mode,test_channel_id,production_enabled").eq("id", 1).maybeSingle();
      const { data: route } = await admin.from("guild_discord_event_routes")
        .select("enabled,channel_id").eq("event_key", eventKey).maybeSingle();
      const channelId = settings?.mode === "test"
        ? String(settings?.test_channel_id || "")
        : (settings?.production_enabled && route?.enabled ? String(route?.channel_id || "") : "");
      return { settings, route, channelId };
    };
    const requireKeys = () => {
      if (!eventKey || !/^[a-z0-9_]{2,80}$/.test(eventKey)) throw new Error("Event Key ไม่ถูกต้อง");
      if (!recordId || recordId.length > 100) throw new Error("Record ID ไม่ถูกต้อง");
    };

    if (action === "list_channels") {
      // Discord Integration Settings is developer-only. This read-only action never sends a message.
      if (!member?.active || String(member.role || "").toLowerCase() !== "developer") {
        return json({ success: false, message: "เฉพาะ Developer ที่ Active เท่านั้นที่โหลดรายชื่อห้อง Discord ได้" }, 403);
      }

      const [{ data: settings }, { data: warRoute }, { data: recentWarEvents }] = await Promise.all([
        admin.from("guild_discord_integration_settings").select("test_channel_id").eq("id", 1).maybeSingle(),
        admin.from("guild_discord_event_routes").select("channel_id").eq("event_key", "war_signup_opened").maybeSingle(),
        admin.from("war_events").select("discord_channel_id").not("discord_channel_id", "is", null).order("created_at", { ascending: false }).limit(5)
      ]);
      const seedIds = [...new Set([
        String(warRoute?.channel_id || ""),
        String(settings?.test_channel_id || ""),
        ...(recentWarEvents || []).map((row: any) => String(row.discord_channel_id || ""))
      ].filter(isId))];
      if (!seedIds.length) return json({ success: false, message: "ยังไม่มี Channel ID ที่ตั้งค่าไว้ให้ใช้ค้นหา Discord Server" }, 400);

      let seedChannel: any = null;
      let seedError: any = null;
      for (const seedId of seedIds) {
        const result = await discord("/channels/" + seedId);
        if (result.response.ok && result.data?.guild_id) { seedChannel = result.data; break; }
        seedError = result.data;
      }
      if (!seedChannel?.guild_id) {
        return json({ success: false, message: "บอทไม่สามารถอ่านห้อง Discord ที่ตั้งค่าไว้เพื่อระบุ Server ได้", details: seedError }, 502);
      }

      const guildId = String(seedChannel.guild_id);
      const [guildResult, botUserResult, channelsResult, rolesResult] = await Promise.all([
        discord("/guilds/" + guildId),
        discord("/users/@me"),
        discord("/guilds/" + guildId + "/channels"),
        discord("/guilds/" + guildId + "/roles")
      ]);
      if (!guildResult.response.ok || !botUserResult.response.ok || !channelsResult.response.ok || !rolesResult.response.ok) {
        const failed = [guildResult, botUserResult, channelsResult, rolesResult].find((result: any) => !result.response.ok);
        return json({ success: false, message: "ดึงรายชื่อห้องจาก Discord ไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ Bot ใน Server", discord_status: failed?.response.status, details: failed?.data }, 502);
      }

      const botMemberResult = await discord("/guilds/" + guildId + "/members/" + String(botUserResult.data.id));
      if (!botMemberResult.response.ok) {
        return json({ success: false, message: "ไม่สามารถตรวจสอบ Role และสิทธิ์ของ Bot ใน Server นี้ได้", discord_status: botMemberResult.response.status, details: botMemberResult.data }, 502);
      }

      const botRoleIds = new Set([guildId, ...(botMemberResult.data.roles || []).map((id: string) => String(id))]);
      const rolePermissions = new Map((rolesResult.data || []).map((role: any) => [String(role.id), BigInt(String(role.permissions || "0"))]));
      let basePermissions = 0n;
      for (const roleId of botRoleIds) basePermissions |= rolePermissions.get(roleId) || 0n;
      const ADMINISTRATOR = 8n;
      const VIEW_CHANNEL = 1024n;
      const SEND_MESSAGES = 2048n;
      const hasAdministrator = (basePermissions & ADMINISTRATOR) === ADMINISTRATOR;

      const canSendInChannel = (channel: any) => {
        if (hasAdministrator) return true;
        let permissions = basePermissions;
        const overwrites = Array.isArray(channel.permission_overwrites) ? channel.permission_overwrites : [];
        const everyoneOverwrite = overwrites.find((item: any) => item.type === 0 && String(item.id) === guildId);
        if (everyoneOverwrite) {
          permissions &= ~BigInt(String(everyoneOverwrite.deny || "0"));
          permissions |= BigInt(String(everyoneOverwrite.allow || "0"));
        }
        let roleAllow = 0n, roleDeny = 0n;
        for (const overwrite of overwrites) {
          if (overwrite.type !== 0 || String(overwrite.id) === guildId || !botRoleIds.has(String(overwrite.id))) continue;
          roleAllow |= BigInt(String(overwrite.allow || "0"));
          roleDeny |= BigInt(String(overwrite.deny || "0"));
        }
        permissions &= ~roleDeny;
        permissions |= roleAllow;
        const memberOverwrite = overwrites.find((item: any) => item.type === 1 && String(item.id) === String(botUserResult.data.id));
        if (memberOverwrite) {
          permissions &= ~BigInt(String(memberOverwrite.deny || "0"));
          permissions |= BigInt(String(memberOverwrite.allow || "0"));
        }
        return (permissions & VIEW_CHANNEL) === VIEW_CHANNEL && (permissions & SEND_MESSAGES) === SEND_MESSAGES;
      };

      const rawChannels = Array.isArray(channelsResult.data) ? channelsResult.data : [];
      const categories = new Map(rawChannels.filter((channel: any) => channel.type === 4).map((channel: any) => [String(channel.id), String(channel.name || "หมวดหมู่")]));
      const channels = rawChannels
        .filter((channel: any) => [0, 5].includes(Number(channel.type)) && canSendInChannel(channel))
        .map((channel: any) => ({
          id: String(channel.id),
          name: String(channel.name || "unnamed"),
          parent_id: channel.parent_id ? String(channel.parent_id) : null,
          category_name: channel.parent_id ? (categories.get(String(channel.parent_id)) || "ไม่มีหมวดหมู่") : "ไม่มีหมวดหมู่",
          type: Number(channel.type),
          position: Number(channel.position || 0)
        }))
        .sort((a: any, b: any) => a.category_name.localeCompare(b.category_name, "th") || a.position - b.position || a.name.localeCompare(b.name, "th"));

      return json({
        success: true,
        guild: { id: guildId, name: String(guildResult.data.name || "Discord Server") },
        channels
      });
    }

    if (action === "inspect") {
      requireKeys();
      const { data: registry } = await admin.from("discord_embed_messages").select("*")
        .eq("event_key", eventKey).eq("record_id", recordId).eq("message_type", messageType).maybeSingle();
      let channelId = registry?.channel_id || "";
      let messageId = registry?.message_id || "";
      if (eventKey === "war_signup_opened" && !messageId) {
        const { data: warEvent } = await admin.from("war_events").select("discord_message_id,discord_channel_id")
          .eq("id", recordId).maybeSingle();
        messageId = String(warEvent?.discord_message_id || "");
        channelId = String(warEvent?.discord_channel_id || "");
      }
      if (!messageId || !channelId) {
        const destination = await resolveDestination();
        return json({ success: true, linked: false, channel_id: channelId || destination.channelId || null, message: null, registry: registry || null });
      }
      const result = await discord(`/channels/${channelId}/messages/${messageId}`);
      if (!result.response.ok) {
        return json({ success: true, linked: true, found: false, channel_id: channelId, message_id: messageId, discord_status: result.response.status, message: null, registry: registry || null });
      }
      if (!registry) {
        await admin.from("discord_embed_messages").upsert({
          event_key: eventKey, record_id: recordId, message_type: messageType,
          channel_id: channelId, message_id: messageId, source: "war_events_legacy",
          last_payload: result.data, linked_by: authData.user.id, linked_at: new Date().toISOString()
        }, { onConflict: "event_key,record_id,message_type" });
      }
      return json({ success: true, linked: true, found: true, channel_id: channelId, message_id: messageId, message: result.data, registry: registry || null });
    }

    if (action === "search_history") {
      if (!eventKey) return json({ success: false, message: "กรุณาระบุ Event Key" }, 400);
      const requestedChannel = String(body.channel_id || "");
      const destination = await resolveDestination();
      const channelId = requestedChannel || destination.channelId;
      if (!isId(channelId)) return json({ success: false, message: "ไม่พบ Channel ID ที่ถูกต้องสำหรับค้นหาประวัติ" }, 400);
      const query = String(body.query || "").trim().toLocaleLowerCase();
      const searchSessionId = /^[0-9a-f-]{36}$/i.test(String(body.search_session_id || "")) ? String(body.search_session_id) : crypto.randomUUID();
      const hints = eventTitleHints[eventKey] || [];
      const candidates: any[] = [];
      let before = isId(body.before) ? String(body.before) : "";
      let scannedCount = 0;
      let searchComplete = false;
      for (let page = 0; page < 5; page++) {
        const path = `/channels/${channelId}/messages?limit=100${before ? "&before=" + before : ""}`;
        const result = await discord(path);
        if (!result.response.ok) return json({ success: false, message: "อ่านประวัติ Channel ไม่สำเร็จ", discord_status: result.response.status }, 502);
        const messages = Array.isArray(result.data) ? result.data : [];
        if (!messages.length) { searchComplete = true; break; }
        scannedCount += messages.length;
        searchComplete = messages.length < 100;
        for (const message of messages) {
          const embeds = Array.isArray(message.embeds) ? message.embeds : [];
          const textBlob = embeds.map((e: any) => [e.title,e.description,e.footer?.text,e.author?.name].filter(Boolean).join(" ")).join(" ").toLocaleLowerCase();
          const hintMatch = hints.length ? hints.some(h => textBlob.includes(h.toLocaleLowerCase())) : true;
          const queryMatch = !query || textBlob.includes(query);
          if (hintMatch && queryMatch && embeds.length) {
            candidates.push({ id: message.id, channel_id: message.channel_id, timestamp: message.timestamp, author: message.author?.username || "", embeds, components: message.components || [], content: message.content || "" });
          }
        }
        before = messages[messages.length - 1]?.id || "";
        if (messages.length < 100 || candidates.length >= 50) break;
      }
      await admin.from("discord_embed_history").insert({ event_key: eventKey, record_id: recordId || null, action: "history_scan", actor_id: authData.user.id, details: { channel_id: channelId, search_session_id: searchSessionId, scanned_count: scannedCount, candidate_count: candidates.length, search_complete: searchComplete } });
      return json({ success: true, channel_id: channelId, search_session_id: searchSessionId, candidates: candidates.slice(0, 50), scanned_count: scannedCount, search_complete: searchComplete, next_before: searchComplete ? null : before });
    }

    if (action === "link_existing") {
      requireKeys();
      const channelId = String(body.channel_id || "");
      const messageId = String(body.message_id || "");
      if (!isId(channelId) || !isId(messageId)) return json({ success: false, message: "Channel ID หรือ Message ID ไม่ถูกต้อง" }, 400);
      const { data: current } = await admin.from("discord_embed_messages").select("message_id,channel_id,source")
        .eq("event_key", eventKey).eq("record_id", recordId).eq("message_type", messageType).maybeSingle();
      if (current && current.source !== "manual_send_pending" && (current.message_id !== messageId || current.channel_id !== channelId)) {
        return json({ success: false, conflict: true, message: "รายการนี้ผูกกับข้อความ Discord อื่นอยู่แล้ว ต้องตรวจสอบก่อนเปลี่ยน" }, 409);
      }
      if (eventKey === "war_signup_opened") {
        const { data: warEvent } = await admin.from("war_events").select("discord_message_id,discord_channel_id").eq("id", recordId).maybeSingle();
        if (warEvent?.discord_message_id && (warEvent.discord_message_id !== messageId || warEvent.discord_channel_id !== channelId)) {
          return json({ success: false, conflict: true, message: "War Event นี้มี Message ID เดิมอยู่แล้ว ระบบจะไม่เขียนทับโดยอัตโนมัติ" }, 409);
        }
      }
      const fetched = await discord(`/channels/${channelId}/messages/${messageId}`);
      if (!fetched.response.ok) return json({ success: false, message: "ไม่พบข้อความนี้ใน Channel ที่ระบุ", discord_status: fetched.response.status }, 404);
      const { data: saved, error: saveError } = await admin.from("discord_embed_messages").upsert({
        event_key: eventKey, record_id: recordId, message_type: messageType, channel_id: channelId,
        message_id: messageId, source: "legacy_history_link", last_payload: fetched.data,
        linked_by: authData.user.id, linked_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }, { onConflict: "event_key,record_id,message_type" }).select("*").single();
      if (saveError) return json({ success: false, message: "บันทึกการผูกข้อความไม่สำเร็จ", details: saveError.message }, 500);
      const linkedAt = new Date().toISOString();
      if (eventKey === "war_signup_opened") {
        await admin.from("war_events").update({ discord_message_id: messageId, discord_channel_id: channelId }).eq("id", recordId);
      } else if (eventKey === "war_signup_closed") {
        await admin.from("war_events").update({ discord_signup_closed_notified_at: linkedAt, discord_signup_closed_error: null }).eq("id", recordId);
      } else if (eventKey === "guild_activity_published") {
        await admin.from("guild_activities").update({ discord_notified_at: linkedAt, discord_notification_error: null }).eq("id", recordId);
      } else if (eventKey === "guild_activity_comment") {
        await admin.from("guild_activity_comments").update({ discord_notified_at: linkedAt, discord_notification_error: null }).eq("id", recordId);
      } else if (eventKey === "feedback_submitted") {
        await admin.from("guild_feedback").update({ discord_notified_at: linkedAt, discord_notification_error: null }).eq("id", recordId);
      } else if (eventKey === "war_leave_submitted") {
        await admin.from("war_leave_requests").update({ discord_notified_at: linkedAt, discord_notification_error: null }).eq("id", recordId);
      }
      await admin.from("discord_embed_history").insert({
        event_key: eventKey, record_id: recordId, message_type: messageType, channel_id: channelId,
        message_id: messageId, action: "legacy_link", after_payload: fetched.data,
        actor_id: authData.user.id, details: { source: "discord_channel_history" }
      });
      return json({ success: true, registry: saved, message: fetched.data });
    }

    if (action === "update_existing") {
      requireKeys();
      const { data: registry } = await admin.from("discord_embed_messages").select("*")
        .eq("event_key", eventKey).eq("record_id", recordId).eq("message_type", messageType).maybeSingle();
      let channelId = registry?.channel_id || String(body.channel_id || "");
      let messageId = registry?.message_id || String(body.message_id || "");
      if (eventKey === "war_signup_opened" && !messageId) {
        const { data: warEvent } = await admin.from("war_events").select("discord_message_id,discord_channel_id").eq("id", recordId).maybeSingle();
        messageId = String(warEvent?.discord_message_id || "");
        channelId = String(warEvent?.discord_channel_id || channelId);
      }
      if (!isId(channelId) || !isId(messageId)) return json({ success: false, message: "ไม่มี Message ID เดิมที่ยืนยันแล้ว ระบบจะไม่สร้างข้อความใหม่" }, 409);
      const payload = body.payload || {};
      const errors = validatePayload(payload);
      if (errors.length) return json({ success: false, message: "Embed ไม่ผ่านการตรวจสอบ", errors }, 422);
      const previous = await discord(`/channels/${channelId}/messages/${messageId}`);
      if (!previous.response.ok) return json({ success: false, message: "ดึงข้อความเดิมไม่สำเร็จ ระบบไม่สร้างข้อความทดแทน", discord_status: previous.response.status }, 409);
      const patched = await discord(`/channels/${channelId}/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }) });
      if (!patched.response.ok) return json({ success: false, message: "อัปเดตข้อความเดิมไม่สำเร็จ", discord_status: patched.response.status, details: patched.data }, 502);
      await admin.from("discord_embed_messages").upsert({
        event_key: eventKey, record_id: recordId, message_type: messageType, channel_id: channelId,
        message_id: messageId, source: registry?.source || "existing_message", last_payload: patched.data,
        linked_by: authData.user.id, updated_at: new Date().toISOString()
      }, { onConflict: "event_key,record_id,message_type" });
      await admin.from("discord_embed_history").insert({
        event_key: eventKey, record_id: recordId, message_type: messageType, channel_id: channelId,
        message_id: messageId, action: "update_existing", before_payload: previous.data, after_payload: patched.data,
        actor_id: authData.user.id
      });
      return json({ success: true, message: patched.data, message_id: messageId, channel_id: channelId });
    }

    if (action === "send_test") {
      const payload = body.payload || {};
      const errors = validatePayload(payload);
      if (errors.length) return json({ success: false, message: "Embed ไม่ผ่านการตรวจสอบ", errors }, 422);
      const { data: settings } = await admin.from("guild_discord_integration_settings").select("test_channel_id").eq("id", 1).maybeSingle();
      const channelId = String(settings?.test_channel_id || "");
      if (!isId(channelId)) return json({ success: false, message: "ยังไม่ได้กำหนด Test Channel ID" }, 400);
      const testPayload = { content: payload.content || undefined, embeds: payload.embeds || [], allowed_mentions: { parse: [] } };
      const sent = await discord("/channels/" + channelId + "/messages", { method: "POST", body: JSON.stringify(testPayload) });
      if (!sent.response.ok) return json({ success: false, message: "ส่ง Test Message ไม่สำเร็จ", discord_status: sent.response.status, details: sent.data }, 502);
      await admin.from("discord_embed_history").insert({
        event_key: eventKey || "embed_studio_test", record_id: recordId || null, message_type: messageType,
        channel_id: channelId, message_id: String(sent.data.id), action: "test_send",
        after_payload: sent.data, actor_id: authData.user.id
      });
      return json({ success: true, channel_id: channelId, message: sent.data });
    }

    if (action === "send_new") {
      requireKeys();
      const { data: existing } = await admin.from("discord_embed_messages").select("message_id,channel_id")
        .eq("event_key", eventKey).eq("record_id", recordId).eq("message_type", messageType).maybeSingle();
      if (existing?.message_id) return json({ success: false, conflict: true, message: "รายการนี้มีข้อความ Discord ผูกอยู่แล้ว ห้ามสร้างข้อความซ้ำ" }, 409);
      if (eventKey === "war_signup_opened") {
        const { data: warEvent } = await admin.from("war_events").select("discord_message_id").eq("id", recordId).maybeSingle();
        if (warEvent?.discord_message_id) return json({ success: false, conflict: true, message: "War Event นี้มี Message ID เดิมอยู่แล้ว ต้องใช้ PATCH กับข้อความเดิมเท่านั้น" }, 409);
      }
      const payload = body.payload || {};
      const errors = validatePayload(payload);
      if (errors.length) return json({ success: false, message: "Embed ไม่ผ่านการตรวจสอบ", errors }, 422);
      const destination = await resolveDestination();
      const channelId = destination.channelId;
      if (!isId(channelId)) return json({ success: false, message: "ยังไม่ได้กำหนด Channel ปลายทางของ Event นี้" }, 400);
      const searchSessionId = String(body.search_session_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(searchSessionId)) return json({ success: false, message: "กรุณาค้นหาประวัติ Channel ใหม่ก่อนส่งครั้งแรก" }, 409);
      const { data: scans } = await admin.from("discord_embed_history").select("details,created_at")
        .eq("event_key", eventKey).eq("record_id", recordId).eq("actor_id", authData.user.id).eq("action", "history_scan")
        .order("created_at", { ascending: false }).limit(100);
      const sessionScans = (scans || []).filter((scan: any) =>
        scan.details?.search_session_id === searchSessionId && scan.details?.channel_id === channelId
      );
      const lastScan = sessionScans[0];
      const oldestScan = sessionScans[sessionScans.length - 1];
      const scanIsFresh = lastScan?.created_at && oldestScan?.created_at &&
        Date.now() - new Date(lastScan.created_at).getTime() <= 5 * 60 * 1000 &&
        Date.now() - new Date(oldestScan.created_at).getTime() <= 5 * 60 * 1000;
      const totalCandidates = sessionScans.reduce((sum: number, scan: any) => sum + Number(scan.details?.candidate_count || 0), 0);
      if (lastScan?.details?.search_complete !== true || totalCandidates > 0 ||
          lastScan?.details?.channel_id !== channelId || !scanIsFresh) {
        return json({ success: false, message: "ต้องค้นหาประวัติ Channel ปลายทางปัจจุบันจนครบและไม่พบข้อความที่ตรงกันภายใน 5 นาทีก่อน จึงจะส่งครั้งแรกได้" }, 409);
      }
      const pendingId = "pending:" + crypto.randomUUID();
      const { data: pendingRow, error: pendingError } = await admin.from("discord_embed_messages").insert({
        event_key: eventKey, record_id: recordId, message_type: messageType, channel_id: channelId,
        message_id: pendingId, source: "manual_send_pending", last_payload: payload,
        linked_by: authData.user.id, linked_at: new Date().toISOString()
      }).select("id").single();
      if (pendingError) return json({ success: false, message: "ไม่สามารถล็อก Record เพื่อป้องกันการส่งซ้ำได้", details: pendingError.message }, 409);
      const sent = await discord("/channels/" + channelId + "/messages", { method: "POST", body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }) });
      if (!sent.response.ok) {
        await admin.from("discord_embed_messages").delete().eq("id", pendingRow.id);
        return json({ success: false, message: "ส่งข้อความใหม่ไม่สำเร็จ", discord_status: sent.response.status, details: sent.data }, 502);
      }
      const { error: registryError } = await admin.from("discord_embed_messages").update({
        message_id: sent.data.id, source: "manual_send", last_payload: sent.data, updated_at: new Date().toISOString()
      }).eq("id", pendingRow.id);
      if (registryError) {
        return json({ success: false, message: "ส่ง Discord สำเร็จแล้ว แต่การยืนยัน Message ID ในทะเบียนยังไม่สำเร็จ ห้ามส่งซ้ำ", message_id: sent.data.id, channel_id: channelId, details: registryError.message }, 500);
      }
      const notifiedAt = new Date().toISOString();
      if (eventKey === "war_signup_opened") {
        await admin.from("war_events").update({ discord_message_id: sent.data.id, discord_channel_id: channelId, discord_sent_at: notifiedAt, discord_send_error: null }).eq("id", recordId);
      } else if (eventKey === "war_signup_closed") {
        await admin.from("war_events").update({ discord_signup_closed_notified_at: notifiedAt, discord_signup_closed_error: null }).eq("id", recordId);
      } else if (eventKey === "guild_activity_published") {
        await admin.from("guild_activities").update({ discord_notified_at: notifiedAt, discord_notification_error: null }).eq("id", recordId);
      } else if (eventKey === "guild_activity_comment") {
        await admin.from("guild_activity_comments").update({ discord_notified_at: notifiedAt, discord_notification_error: null }).eq("id", recordId);
      } else if (eventKey === "feedback_submitted") {
        await admin.from("guild_feedback").update({ discord_notified_at: notifiedAt, discord_notification_error: null }).eq("id", recordId);
      } else if (eventKey === "war_leave_submitted") {
        await admin.from("war_leave_requests").update({ discord_notified_at: notifiedAt, discord_notification_error: null }).eq("id", recordId);
      }
      await admin.from("discord_embed_history").insert({
        event_key: eventKey, record_id: recordId, message_type: messageType, channel_id: channelId,
        message_id: sent.data.id, action: "manual_send", after_payload: sent.data, actor_id: authData.user.id
      });
      return json({ success: true, message: sent.data, channel_id: channelId });
    }

    if (action === "save_template") {
      if (!eventKey) return json({ success: false, message: "กรุณาระบุ Event Key" }, 400);
      const payload = body.payload || {};
      const errors = validatePayload(payload);
      if (errors.length) return json({ success: false, message: "Template ไม่ผ่านการตรวจสอบ", errors }, 422);
      const { data: latest } = await admin.from("discord_embed_templates").select("version").eq("event_key", eventKey).order("version", { ascending: false }).limit(1).maybeSingle();
      const version = Number(latest?.version || 0) + 1;
      await admin.from("discord_embed_templates").update({ is_active: false, updated_at: new Date().toISOString() }).eq("event_key", eventKey).eq("is_active", true);
      const { data: saved, error } = await admin.from("discord_embed_templates").insert({
        event_key: eventKey, template_name: String(body.template_name || "Default").slice(0, 80),
        payload, version, is_active: true, created_by: authData.user.id, updated_by: authData.user.id
      }).select("*").single();
      if (error) return json({ success: false, message: "บันทึก Template ไม่สำเร็จ", details: error.message }, 500);
      return json({ success: true, template: saved });
    }

    if (action === "rename_template") {
      const templateId = String(body.template_id || "");
      const templateName = String(body.template_name || "").trim();
      if (!templateId || !eventKey || !templateName || templateName.length > 80) {
        return json({ success: false, message: "กรุณาระบุ Template และชื่อใหม่ไม่เกิน 80 ตัวอักษร" }, 400);
      }
      const { data: updated, error } = await admin.from("discord_embed_templates")
        .update({ template_name: templateName, updated_by: authData.user.id, updated_at: new Date().toISOString() })
        .eq("id", templateId).eq("event_key", eventKey).select("*").maybeSingle();
      if (error) return json({ success: false, message: "เปลี่ยนชื่อ Template ไม่สำเร็จ", details: error.message }, 500);
      if (!updated) return json({ success: false, message: "ไม่พบ Template ที่ต้องการแก้ไข" }, 404);
      return json({ success: true, template: updated });
    }

    if (action === "delete_template") {
      const templateId = String(body.template_id || "");
      if (!templateId || !eventKey) return json({ success: false, message: "กรุณาระบุ Template ที่ต้องการลบ" }, 400);
      const { data: removed, error } = await admin.from("discord_embed_templates")
        .delete().eq("id", templateId).eq("event_key", eventKey).select("id").maybeSingle();
      if (error) return json({ success: false, message: "ลบ Template ไม่สำเร็จ", details: error.message }, 500);
      if (!removed) return json({ success: false, message: "ไม่พบ Template ที่ต้องการลบ" }, 404);
      return json({ success: true, deleted_id: removed.id });
    }

    if (action === "list_templates") {
      if (!eventKey) return json({ success: false, message: "กรุณาระบุ Event Key" }, 400);
      const { data, error } = await admin.from("discord_embed_templates").select("*").eq("event_key", eventKey).order("version", { ascending: false }).limit(30);
      if (error) return json({ success: false, message: error.message }, 500);
      return json({ success: true, templates: data || [] });
    }

    if (action === "list_history") {
      if (!eventKey) return json({ success: false, message: "กรุณาระบุ Event Key" }, 400);
      let query = admin.from("discord_embed_history").select("*").eq("event_key", eventKey).order("created_at", { ascending: false }).limit(50);
      if (recordId) query = query.eq("record_id", recordId);
      const { data, error } = await query;
      if (error) return json({ success: false, message: error.message }, 500);
      return json({ success: true, history: data || [] });
    }

    return json({ success: false, message: "ไม่รู้จัก action นี้" }, 400);
  } catch (error) {
    return json({ success: false, message: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

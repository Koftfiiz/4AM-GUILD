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
  war_signup_opened: ["4AM SIGN-UP"],
  war_roster_published: ["4AM GUILD", "RAID A", "RAID B", "ตี้วอร์"],
  guild_activity_published: ["กิจกรรมกิลด์"],
  guild_activity_comment: ["คอมเมนท์กิจกรรม"],
  feedback_submitted: ["FEEDBACK", "แจ้งปัญหา"],
  duck_race_results: ["DUCK RACE"],
  war_leave_submitted: ["ถอนตัวจากวอร์"],
  portfolio_published: ["PORTFOLIO", "แฟ้มผลงาน"],
};

function validatePayload(payload: any) {
  const errors: string[] = [];
  const embeds = Array.isArray(payload?.embeds) ? payload.embeds : [];
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
      const hints = eventTitleHints[eventKey] || [];
      const candidates: any[] = [];
      let before = "";
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
      return json({ success: true, channel_id: channelId, candidates: candidates.slice(0, 50), scanned_count: scannedCount, search_complete: searchComplete });
    }

    if (action === "link_existing") {
      requireKeys();
      const channelId = String(body.channel_id || "");
      const messageId = String(body.message_id || "");
      if (!isId(channelId) || !isId(messageId)) return json({ success: false, message: "Channel ID หรือ Message ID ไม่ถูกต้อง" }, 400);
      const { data: current } = await admin.from("discord_embed_messages").select("message_id,channel_id")
        .eq("event_key", eventKey).eq("record_id", recordId).eq("message_type", messageType).maybeSingle();
      if (current && (current.message_id !== messageId || current.channel_id !== channelId)) {
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
      if (eventKey === "war_signup_opened") {
        await admin.from("war_events").update({ discord_message_id: messageId, discord_channel_id: channelId }).eq("id", recordId);
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
      const sent = await discord("/channels/" + channelId + "/messages", { method: "POST", body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }) });
      if (!sent.response.ok) return json({ success: false, message: "ส่งข้อความใหม่ไม่สำเร็จ", discord_status: sent.response.status, details: sent.data }, 502);
      const { error: registryError } = await admin.from("discord_embed_messages").insert({
        event_key: eventKey, record_id: recordId, message_type: messageType, channel_id: channelId,
        message_id: sent.data.id, source: "manual_send", last_payload: sent.data,
        linked_by: authData.user.id, linked_at: new Date().toISOString()
      });
      if (registryError) {
        return json({ success: false, message: "ส่ง Discord สำเร็จแล้ว แต่บันทึก Message ID ลงทะเบียนไม่สำเร็จ ห้ามกดส่งซ้ำ", message_id: sent.data.id, channel_id: channelId, details: registryError.message }, 500);
      }
      if (eventKey === "war_signup_opened") {
        await admin.from("war_events").update({ discord_message_id: sent.data.id, discord_channel_id: channelId, discord_sent_at: new Date().toISOString() }).eq("id", recordId);
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

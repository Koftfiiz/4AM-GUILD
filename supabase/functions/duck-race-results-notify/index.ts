// Supabase Edge Function: duck-race-results-notify
// Sends Duck Race results to the configured Discord destination.
// TEST MODE always targets guild_discord_integration_settings.test_channel_id.
// PRODUCTION requires production_enabled and an enabled duck_race_results route.
// Verify JWT (legacy) must be OFF; this function validates the access token itself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" }
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ success: false, message: "กรุณาเข้าสู่ระบบก่อนส่งผลการแข่งขัน" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !botToken) {
      return json({ success: false, message: "ยังตั้งค่า Supabase หรือ Discord Bot Secrets ไม่ครบ" }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, message: "Session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: requester, error: requesterError } = await admin.from("guild_members")
      .select("user_id,character_name,nickname,discord_name,role,active")
      .eq("user_id", authData.user.id).maybeSingle();
    if (requesterError || !requester || requester.active !== true) {
      return json({ success: false, message: "ต้องเป็นสมาชิกกิลด์ที่ยัง active เท่านั้น" }, 403);
    }
    const role = String(requester.role || "").toLowerCase();
    if (!["developer", "leader", "management"].includes(role)) {
      return json({ success: false, message: "เฉพาะ Developer หรือ Management เท่านั้นที่ส่งผลการแข่งขันได้" }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "num" ? "num" : body.mode === "name" ? "name" : "";
    if (!mode || !Array.isArray(body.results) || body.results.length < 2 || body.results.length > 120) {
      return json({ success: false, message: "ข้อมูลผลการแข่งขันไม่ถูกต้อง (รองรับ 2–120 อันดับ)" }, 400);
    }
    const results = body.results.map((item: any, index: number) => ({
      rank: index + 1,
      label: String(item?.label ?? "").replace(/[\r\n\t]/g, " ").trim().slice(0, 32) || "Duck"
    }));

    const { data: settings, error: settingsError } = await admin.from("guild_discord_integration_settings")
      .select("mode,test_channel_id,production_enabled").eq("id", 1).maybeSingle();
    if (settingsError || !settings) return json({ success: false, message: "ยังไม่ได้ตั้งค่า Discord Integration" }, 503);

    let channelId = "";
    const deliveryMode = String(settings.mode || "");
    if (deliveryMode !== "test") {
      return json({ success: false, message: "Duck Race ยังล็อกการส่งไว้ที่ TEST MODE จนกว่าจะทดสอบผ่านและได้รับอนุมัติให้เปิด Production" }, 403);
    }
    channelId = String(settings.test_channel_id || "");
    if (!channelId) {
      return json({ success: false, message: "ยังไม่ได้กำหนดห้อง #ทดสอบบอท ใน TEST MODE" }, 503);
    }

    const heading = mode === "num" ? "ผลการแข่งขัน Duck Race · โหมดหมายเลข" : "ผลการแข่งขัน Duck Race · โหมดรายชื่อ";
    const chunks: string[] = [];
    for (let i = 0; i < results.length; i += 60) {
      chunks.push(results.slice(i, i + 60).map((item: { rank: number; label: string }) =>
        item.rank + ". " + (mode === "num" ? "เบอร์ " : "") + item.label
      ).join("\n"));
    }
    const embeds = chunks.map((description, index) => ({
      title: chunks.length > 1 ? heading + " (" + (index + 1) + "/" + chunks.length + ")" : heading,
      description: description.slice(0, 4000),
      color: 0xC52B3B,
      footer: { text: "4AM GUILD · Duck Race Results" },
      timestamp: new Date().toISOString()
    }));

    const discordResponse = await fetch("https://discord.com/api/v10/channels/" + channelId + "/messages", {
      method: "POST",
      headers: { "Authorization": "Bot " + botToken, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds, allowed_mentions: { parse: [] } })
    });
    if (!discordResponse.ok) {
      const details = await discordResponse.text();
      console.error("Duck Race Discord API error:", details);
      return json({ success: false, message: "Discord ปฏิเสธการส่งผลการแข่งขัน", details: details.slice(0, 500) }, 502);
    }
    const message = await discordResponse.json();
    return json({ success: true, mode: deliveryMode, message_id: String(message.id), result_count: results.length });
  } catch (error) {
    console.error("duck-race-results-notify:", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

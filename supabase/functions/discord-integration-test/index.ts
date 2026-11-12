// Supabase Edge Function: discord-integration-test
// Required secret: DISCORD_BOT_TOKEN. Supabase supplies URL/keys.
// Verify JWT (legacy) may be OFF because this function validates the user token itself.
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
    if (!token) return json({ success: false, message: "Missing access token" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !botToken) {
      return json({ success: false, message: "Missing Supabase or DISCORD_BOT_TOKEN secret" }, 500);
    }
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, message: "Invalid session" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: member, error: memberError } = await admin.from("guild_members")
      .select("user_id,role,active").eq("user_id", authData.user.id).maybeSingle();
    if (memberError || !member || member.active !== true || String(member.role || "").toLowerCase() !== "developer") {
      return json({ success: false, message: "Active Developer permission required" }, 403);
    }

    const { data: settings, error: settingsError } = await admin.from("guild_discord_integration_settings")
      .select("test_channel_id").eq("id", 1).maybeSingle();
    if (settingsError || !settings?.test_channel_id) {
      return json({ success: false, message: "กรุณาบันทึก Test Channel ID ก่อนทดสอบ" }, 400);
    }
    const channelId = String(settings.test_channel_id);
    if (!/^\d{17,20}$/.test(channelId)) return json({ success: false, message: "Invalid Discord test channel ID" }, 400);

    const discordResponse = await fetch("https://discord.com/api/v10/channels/" + channelId + "/messages", {
      method: "POST",
      headers: { "Authorization": "Bot " + botToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "4AM GUILD · Bot Connection Test",
          description: "การเชื่อมต่อเว็บไซต์กับ Discord Bot ทำงานได้แล้ว ข้อความนี้เป็นข้อความทดสอบเท่านั้น",
          color: 0xC49A54,
          fields: [
            { name: "Environment", value: "TEST MODE", inline: true },
            { name: "Result", value: "Connection successful", inline: true }
          ],
          footer: { text: "4AM GUILD · Developer Test" },
          timestamp: new Date().toISOString()
        }],
        allowed_mentions: { parse: [] }
      })
    });
    if (!discordResponse.ok) {
      const details = await discordResponse.text();
      return json({ success: false, message: "Discord API rejected the test message", details: details.slice(0, 500) }, 502);
    }
    return json({ success: true, message: "Test message sent" });
  } catch (error) {
    console.error("discord-integration-test:", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

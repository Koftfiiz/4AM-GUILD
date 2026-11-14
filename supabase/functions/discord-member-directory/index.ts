// Supabase Edge Function: discord-member-directory
// Required secrets: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID
// This function validates the Supabase access token because legacy JWT verification is disabled.
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
    const accessToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ success: false, message: "Missing access token" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
    const guildId = Deno.env.get("DISCORD_GUILD_ID") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !botToken || !guildId) {
      return json({ success: false, message: "Missing configuration: Supabase keys, DISCORD_BOT_TOKEN or DISCORD_GUILD_ID." }, 500);
    }
    if (!/^\d{17,20}$/.test(guildId)) return json({ success: false, message: "Invalid DISCORD_GUILD_ID." }, 500);

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user) return json({ success: false, message: "Invalid session." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: member, error: memberError } = await admin.from("guild_members")
      .select("role,active").eq("user_id", authData.user.id).maybeSingle();
    const allowedRoles = ["developer", "leader", "management"];
    if (memberError || !member || member.active !== true ||
        !allowedRoles.includes(String(member.role || "").toLowerCase())) {
      return json({ success: false, message: "Active Management, Leader or Developer permission required." }, 403);
    }

    const members: Array<Record<string, string | null>> = [];
    let after = "0";
    for (let page = 0; page < 10; page++) {
      const endpoint = "https://discord.com/api/v10/guilds/" + guildId + "/members?limit=1000&after=" + encodeURIComponent(after);
      const response = await fetch(endpoint, { headers: { "Authorization": "Bot " + botToken } });
      if (!response.ok) {
        const details = await response.text();
        return json({
          success: false,
          message: response.status === 403
            ? "Discord denied member-list access. Enable Server Members Intent and check bot access."
            : "Discord API request failed.",
          discord_status: response.status,
          details: details.slice(0, 400)
        }, 502);
      }
      const batch = await response.json();
      if (!Array.isArray(batch)) return json({ success: false, message: "Unexpected Discord member response." }, 502);
      for (const item of batch) {
        const user = item?.user;
        if (!user?.id || user.bot === true) continue;
        members.push({
          id: String(user.id),
          username: String(user.username || ""),
          global_name: user.global_name ? String(user.global_name) : null,
          nick: item.nick ? String(item.nick) : null,
          avatar_url: user.avatar ? "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + ".png?size=96" : null
        });
      }
      if (batch.length < 1000) break;
      after = String(batch[batch.length - 1]?.user?.id || "");
      if (!after) break;
    }
    members.sort((a,b) => String(a.nick || a.global_name || a.username).localeCompare(String(b.nick || b.global_name || b.username), "th"));
    return json({ success: true, count: members.length, members });
  } catch (error) {
    console.error("discord-member-directory:", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

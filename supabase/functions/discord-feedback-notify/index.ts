// Supabase Edge Function: discord-feedback-notify
// Uses Developer-managed Discord integration settings; TEST MODE is the safe default.
// Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
// Set Verify JWT (legacy) to OFF; this function validates the user's access token itself.

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
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
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
    const feedbackId = String(body.feedback_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(feedbackId)) return json({ success: false, message: "Invalid feedback ID" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: feedback, error: feedbackError } = await admin.from("guild_feedback")
      .select("id,user_id,type,title,content_html,status,created_at,discord_notified_at")
      .eq("id", feedbackId).maybeSingle();
    if (feedbackError || !feedback) return json({ success: false, message: "Feedback not found" }, 404);

    const { data: requester, error: requesterError } = await admin.from("guild_members")
      .select("user_id,character_name,nickname,discord_name,role,active")
      .eq("user_id", authData.user.id).maybeSingle();
    if (requesterError || !requester || requester.active !== true) return json({ success: false, message: "Active guild member required" }, 403);

    const isManager = ["developer", "leader", "management"].includes(String(requester.role || "").toLowerCase());
    const { data: integrationSettings, error: integrationError } = await admin.from("guild_discord_integration_settings")
      .select("mode,test_channel_id,production_enabled").eq("id", 1).maybeSingle();
    if (integrationError || !integrationSettings) return json({ success: false, message: "Discord integration settings are not configured" }, 503);
    let channelId = "";
    if (integrationSettings.mode === "test") {
      channelId = String(integrationSettings.test_channel_id || "");
    } else if (integrationSettings.mode === "production" && integrationSettings.production_enabled === true) {
      const { data: route } = await admin.from("guild_discord_event_routes")
        .select("enabled,channel_id").eq("event_key", "feedback_submitted").maybeSingle();
      if (route?.enabled === true) channelId = String(route.channel_id || "");
    }
    if (!channelId) return json({ success: false, message: "No destination configured for this Discord event; notification was not sent" }, 503);
    if (feedback.user_id !== authData.user.id && !isManager) return json({ success: false, message: "Not allowed" }, 403);
    if (feedback.discord_notified_at) return json({ success: true, already_notified: true });

    const { data: author } = await admin.from("guild_members")
      .select("character_name,nickname,discord_name")
      .eq("user_id", feedback.user_id).maybeSingle();
    const memberName = author?.character_name || author?.nickname || author?.discord_name || "สมาชิก 4AM";
    const plainText = String(feedback.content_html || "")
      .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n")
      .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().slice(0, 850);

    const embed = {
      title: feedback.type === "problem" ? "มีการแจ้งปัญหาใหม่" : "มี Feedback ใหม่",
      color: feedback.type === "problem" ? 0xC52B3B : 0xC49A54,
      fields: [
        { name: "ประเภท", value: feedback.type === "problem" ? "แจ้งปัญหา" : "Feedback", inline: true },
        { name: "ผู้แจ้ง", value: memberName.slice(0, 200), inline: true },
        { name: "หัวข้อ", value: String(feedback.title || "-").slice(0, 250), inline: false },
        { name: "รายละเอียด", value: plainText || "ไม่มีรายละเอียด", inline: false },
        { name: "สถานะ", value: "รับเรื่องแล้ว", inline: true }
      ],
      footer: { text: "4AM GUILD · Support Center" },
      timestamp: feedback.created_at
    };

    const discordResponse = await fetch("https://discord.com/api/v10/channels/" + channelId + "/messages", {
      method: "POST",
      headers: { "Authorization": "Bot " + botToken, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } })
    });
    if (!discordResponse.ok) {
      const details = await discordResponse.text();
      await admin.from("guild_feedback").update({ discord_notification_error: details.slice(0, 1000) }).eq("id", feedbackId);
      return json({ success: false, message: "Discord API rejected the message", details: details.slice(0, 500) }, 502);
    }

    const { error: updateError } = await admin.from("guild_feedback")
      .update({ discord_notified_at: new Date().toISOString(), discord_notification_error: null }).eq("id", feedbackId);
    if (updateError) return json({ success: false, message: "Discord sent, but notification state could not be saved" }, 500);
    return json({ success: true });
  } catch (error) {
    console.error("discord-feedback-notify:", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization") || "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ success: false, message: "กรุณาเข้าสู่ระบบก่อนทดสอบบอท" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !botToken) {
      return json({ success: false, message: "ยังตั้งค่า Supabase หรือ DISCORD_BOT_TOKEN Secret ไม่ครบ" }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user) return json({ success: false, message: "Session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: member, error: memberError } = await admin
      .from("guild_members")
      .select("user_id,role,active,membership_status")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    const requesterRole = String(member?.role || "").toLowerCase();
    const isProjectOwner = authData.user.id === "378b09df-16a0-4d01-8908-2604c2c210a9";
    const isAllowedManager = isProjectOwner || (
      member?.active === true &&
      member?.membership_status === "active" &&
      ["developer", "leader", "management"].includes(requesterRole)
    );
    if (memberError || !member || !isAllowedManager) {
      return json({ success: false, message: "เฉพาะ Developer, Leader และ Management ที่เป็นสมาชิก Active เท่านั้นที่ทดสอบบอทได้" }, 403);
    }

    const { data: settings, error: settingsError } = await admin
      .from("guild_discord_integration_settings")
      .select("mode,test_channel_id")
      .eq("id", 1)
      .maybeSingle();

    if (settingsError || !settings) return json({ success: false, message: "ยังไม่ได้ตั้งค่า Discord Integration" }, 503);
    // Diagnostic messages always target the explicitly configured test
    // channel, regardless of the active delivery mode. This endpoint never
    // resolves or sends to a Production event route.
    const channelId = String(settings.test_channel_id || "");
    if (!/^\d{17,20}$/.test(channelId)) return json({ success: false, message: "กรุณากำหนด Test Channel ID ให้ถูกต้องก่อนทดสอบ" }, 400);

    const channelResponse = await fetch("https://discord.com/api/v10/channels/" + channelId, {
      headers: { Authorization: "Bot " + botToken },
    });
    if (!channelResponse.ok) {
      const details = await channelResponse.text();
      console.error("Discord channel access check failed:", channelResponse.status, details.slice(0, 400));
      return json({
        success: false,
        message: channelResponse.status === 403
          ? "บอทไม่มีสิทธิ์เข้าถึงห้องทดสอบ กรุณาตรวจสอบ View Channel"
          : channelResponse.status === 404
          ? "ไม่พบห้องทดสอบนี้ หรือบอทยังไม่ได้อยู่ใน Server ที่มีห้องดังกล่าว"
          : "ตรวจสอบห้อง Discord ไม่สำเร็จ (HTTP " + channelResponse.status + ")",
      }, 502);
    }
    const channel = await channelResponse.json();
    if (channel.type !== 0 && channel.type !== 5 && channel.type !==  announcementType()) {
      // The test requires a guild text/announcement channel, not a DM or thread.
      if (channel.guild_id == null) return json({ success: false, message: "Channel ID นี้ไม่ใช่ห้องข้อความใน Server" }, 400);
    }

    const sentAt = new Date().toISOString();
    const messageResponse = await fetch("https://discord.com/api/v10/channels/" + channelId + "/messages", {
      method: "POST",
      headers: {
        Authorization: "Bot " + botToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [{
          title: "4AM GUILD BOT · CONNECTION TEST",
          description: "การทดสอบส่งข้อความจาก Discord Integration Settings สำเร็จแล้ว\n\nบอทสามารถเข้าถึงห้องนี้และส่งข้อความได้",
          color: 0xD92D45,
          fields: [
            { name: "สถานะ", value: "ผ่าน · ส่งข้อความสำเร็จ", inline: true },
            { name: "โหมด", value: "TEST MODE", inline: true },
            { name: "ห้อง", value: String(channel.name || "Discord Channel"), inline: true },
          ],
          footer: { text: "4AM GUILD · Bot Diagnostics" },
          timestamp: sentAt,
        }],
        allowed_mentions: { parse: [] },
      }),
    });

    if (!messageResponse.ok) {
      const details = await messageResponse.text();
      console.error("Discord test message failed:", messageResponse.status, details.slice(0, 500));
      return json({
        success: false,
        message: messageResponse.status === 403
          ? "บอทเข้าถึงห้องได้ แต่ไม่มีสิทธิ์ส่งข้อความหรือ Embed Links"
          : "Discord ปฏิเสธการส่งข้อความทดสอบ (HTTP " + messageResponse.status + ")",
      }, 502);
    }

    const sentMessage = await messageResponse.json();
    return json({
      success: true,
      mode: "test",
      channel_id: channelId,
      channel_name: channel.name || null,
      message_id: String(sentMessage.id),
      message: "ส่งข้อความทดสอบไปยังห้อง #" + String(channel.name || channelId) + " สำเร็จ",
    });
  } catch (error) {
    console.error("discord-integration-test:", error);
    return json({
      success: false,
      message: error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
    }, 500);
  }
});

// Discord channel types: GuildText=0, GuildAnnouncement=5.
// Kept as a function to avoid accepting private channels as test destinations.
function announcementType() { return 5; }

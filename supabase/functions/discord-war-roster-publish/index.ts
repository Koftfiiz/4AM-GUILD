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

const isDiscordChannelId = (value: string) => /^\\d{17,20}$/.test(value);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "").trim();
    if (!token) return json({ success: false, message: "กรุณาเข้าสู่ระบบก่อนประกาศตี้" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !botToken) {
      return json({ success: false, message: "ยังตั้งค่า Supabase หรือ Discord Bot Secret ไม่ครบ" }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, message: "Session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: actor, error: actorError } = await admin
      .from("guild_members")
      .select("user_id,role,active,membership_status")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    const role = String(actor?.role || "").toLowerCase();
    const isOwner = authData.user.id === "378b09df-16a0-4d01-8908-2604c2c210a9";
    const canPublish = isOwner || (
      actor?.active === true &&
      actor?.membership_status === "active" &&
      ["developer", "leader", "management"].includes(role)
    );
    if (actorError || !actor || !canPublish) {
      return json({ success: false, message: "ต้องเป็น Developer, Leader หรือ Management ที่เป็นสมาชิก Active เท่านั้น" }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const eventId = String(body?.event_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
      return json({ success: false, message: "Event ID ไม่ถูกต้อง" }, 400);
    }

    const { data: event, error: eventError } = await admin
      .from("war_events")
      .select("id,event_name,event_date,start_time,registration_type,is_draft_confirmed,status")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError || !event) return json({ success: false, message: "ไม่พบ War Event นี้" }, 404);
    if (event.is_draft_confirmed !== true || event.status === "cancelled") {
      return json({ success: false, message: "ต้องยืนยันการจัดตี้ก่อน และ Event ต้องไม่ถูกยกเลิก" }, 409);
    }

    const [{ data: settings, error: settingsError }, { data: route, error: routeError }] = await Promise.all([
      admin.from("guild_discord_integration_settings")
        .select("mode,test_channel_id,production_enabled")
        .eq("id", 1)
        .maybeSingle(),
      admin.from("guild_discord_event_routes")
        .select("enabled,channel_id")
        .eq("event_key", "war_roster_published")
        .maybeSingle(),
    ]);
    if (settingsError || !settings || routeError) {
      return json({ success: false, message: "อ่านการตั้งค่า Discord ไม่สำเร็จ" }, 503);
    }

    const mode = String(settings.mode || "");
    let channelId = "";
    if (mode === "test") {
      channelId = String(settings.test_channel_id || "");
    } else if (mode === "production" && settings.production_enabled === true && route?.enabled === true) {
      channelId = String(route.channel_id || "");
    }
    if (!isDiscordChannelId(channelId)) {
      return json({
        success: false,
        message: "ยังไม่มีปลายทาง Discord ที่ถูกต้องสำหรับการประกาศจัดตี้ในโหมดปัจจุบัน ระบบไม่ได้ส่งไปห้องทดสอบแทน",
      }, 503);
    }

    const { data: parties, error: partiesError } = await admin
      .from("war_parties")
      .select("id,raid,party_number,party_name")
      .eq("event_id", eventId)
      .order("raid", { ascending: true })
      .order("party_number", { ascending: true });
    if (partiesError) return json({ success: false, message: "โหลดรายการ Party ไม่สำเร็จ: " + partiesError.message }, 500);
    if (!parties?.length) return json({ success: false, message: "Event นี้ยังไม่มี Party ให้ประกาศ" }, 409);

    const partyIds = parties.map((party) => party.id);
    const { data: slots, error: slotsError } = await admin
      .from("war_party_members")
      .select("party_id,member_id,position")
      .in("party_id", partyIds)
      .order("position", { ascending: true });
    if (slotsError) return json({ success: false, message: "โหลดสมาชิกใน Party ไม่สำเร็จ: " + slotsError.message }, 500);

    const memberIds = [...new Set((slots || []).map((slot) => slot.member_id))];
    const memberMap = new Map<string, any>();
    if (memberIds.length) {
      const { data: members, error: membersError } = await admin
        .from("guild_members")
        .select("user_id,character_name,nickname,game_class")
        .in("user_id", memberIds);
      if (membersError) return json({ success: false, message: "โหลดข้อมูลสมาชิกไม่สำเร็จ: " + membersError.message }, 500);
      for (const member of members || []) memberMap.set(String(member.user_id), member);
    }

    const slotsByParty = new Map<string, any[]>();
    for (const slot of slots || []) {
      const list = slotsByParty.get(String(slot.party_id)) || [];
      list.push(slot);
      slotsByParty.set(String(slot.party_id), list);
    }

    const eventDate = String(event.event_date || "-").split("-").reverse().join("/");
    const eventTime = String(event.start_time || "").slice(0, 5);
    const kind = String(event.registration_type || "") === "practice" ? "PRACTICE" : "GUILD WAR";
    const groupedRaids = new Map<string, any[]>();
    for (const party of parties) {
      const raid = String(party.raid || "A");
      const list = groupedRaids.get(raid) || [];
      list.push(party);
      groupedRaids.set(raid, list);
    }

    const sentMessages: string[] = [];
    for (const [raid, raidParties] of groupedRaids) {
      const fields = raidParties.slice(0, 25).map((party) => {
        const assigned = slotsByParty.get(String(party.id)) || [];
        const value = assigned.length
          ? assigned.map((slot) => {
              const member = memberMap.get(String(slot.member_id));
              const name = String(member?.character_name || member?.nickname || "Unknown").slice(0, 32);
              const gameClass = String(member?.game_class || "ไม่ระบุ").slice(0, 16);
              return String(slot.position || "-") + ". " + name + " · " + gameClass;
            }).join("\\n").slice(0, 1000)
          : "ยังไม่มีสมาชิก";
        return {
          name: "Party " + String(party.party_number) + (party.party_name ? " · " + String(party.party_name).slice(0, 60) : ""),
          value,
          inline: true,
        };
      });

      const response = await fetch("https://discord.com/api/v10/channels/" + channelId + "/messages", {
        method: "POST",
        headers: {
          Authorization: "Bot " + botToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          embeds: [{
            title: "4AM GUILD · " + kind + " PARTY ROSTER",
            description: "**" + String(event.event_name).slice(0, 180) + "**\\n" + eventDate + (eventTime ? " · " + eventTime : "") + "\\n**Raid " + raid + "**",
            color: 0xD92D45,
            fields,
            footer: { text: "4AM GUILD · ประกาศโดย Management" },
            timestamp: new Date().toISOString(),
          }],
          allowed_mentions: { parse: [] },
        }),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        return json({
          success: false,
          partial: sentMessages.length > 0,
          sent_count: sentMessages.length,
          message: "ส่งประกาศ Raid " + raid + " ไม่สำเร็จ (HTTP " + response.status + "): " + detail,
        }, 502);
      }
      const message = await response.json();
      sentMessages.push(String(message.id));
    }

    return json({
      success: true,
      mode,
      channel_id: channelId,
      sent_count: sentMessages.length,
      message_ids: sentMessages,
      message: "ประกาศรายชื่อและการจัด Party ไปยัง Discord สำเร็จ " + sentMessages.length + " ข้อความ",
    });
  } catch (error) {
    console.error("discord-war-roster-publish:", error);
    return json({
      success: false,
      message: error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
    }, 500);
  }
});

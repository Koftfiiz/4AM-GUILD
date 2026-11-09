import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const encoder = new TextEncoder();

function hexToBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new Error("Invalid hexadecimal value");
  }
  return new Uint8Array(value.match(/.{2}/g)!.map((part) => parseInt(part, 16)));
}

async function verifyDiscordRequest(request: Request, rawBody: string): Promise<boolean> {
  const publicKey = Deno.env.get("DISCORD_APPLICATION_PUBLIC_KEY") || "";
  const signature = request.headers.get("x-signature-ed25519") || "";
  const timestamp = request.headers.get("x-signature-timestamp") || "";
  if (!publicKey || !signature || !timestamp) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signature),
      encoder.encode(timestamp + rawBody),
    );
  } catch {
    return false;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function discordMessage(content: string, eventId: string, count: number) {
  return {
    content,
    components: [{
      type: 1,
      components: [
        { type: 2, style: 3, label: "ลงชื่อเข้าร่วม", custom_id: "reward_join:" + eventId },
        { type: 2, style: 2, label: "ยกเลิกการลงชื่อ", custom_id: "reward_leave:" + eventId },
        { type: 2, style: 2, label: "ผู้ลงชื่อ " + count + " คน", custom_id: "reward_count:" + eventId, disabled: true },
      ],
    }],
  };
}

function getOption(options: Array<Record<string, unknown>>, name: string): string {
  const option = options.find((item) => item.name === name);
  return typeof option?.value === "string" ? option.value : "";
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const rawBody = await request.text();
  if (!(await verifyDiscordRequest(request, rawBody))) {
    return jsonResponse({ error: "Invalid Discord request signature" }, 401);
  }

  let interaction: Record<string, any>;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Discord PING handshake.
  if (interaction.type === 1) return jsonResponse({ type: 1 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ type: 4, data: { content: "ระบบยังตั้งค่า Supabase Secret ไม่ครบ", flags: 64 } });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const expectedGuildId = Deno.env.get("DISCORD_GUILD_ID") || "";
  if (expectedGuildId && interaction.guild_id !== expectedGuildId) {
    return jsonResponse({ type: 4, data: { content: "คำสั่งนี้ใช้ได้เฉพาะ Discord Server ของ 4AM เท่านั้น", flags: 64 } });
  }

  const discordUserId = String(interaction.member?.user?.id || interaction.user?.id || "");
  if (!discordUserId) {
    return jsonResponse({ type: 4, data: { content: "ไม่พบ Discord User ID", flags: 64 } });
  }

  // Slash command: /reward-open war_event_id:<UUID> title:<name> signup_closes_at:<ISO timestamp>
  if (interaction.type === 2 && interaction.data?.name === "reward-open") {
    const options = Array.isArray(interaction.data.options) ? interaction.data.options : [];
    const warEventId = getOption(options, "war_event_id");
    const title = getOption(options, "title").trim();
    const closesAt = getOption(options, "signup_closes_at").trim();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(warEventId)) {
      return jsonResponse({ type: 4, data: { content: "กรุณาระบุ War Event ID ที่ถูกต้อง", flags: 64 } });
    }
    const closeDate = new Date(closesAt);
    if (!title || title.length > 120 || !closesAt || Number.isNaN(closeDate.getTime()) || closeDate.getTime() <= Date.now()) {
      return jsonResponse({ type: 4, data: { content: "กรุณาระบุชื่อกิจกรรมและเวลาปิดรับสมัครในอนาคตให้ถูกต้อง", flags: 64 } });
    }

    const { data, error } = await supabase.rpc("create_reward_event_from_discord", {
      p_discord_user_id: discordUserId,
      p_war_event_id: warEventId,
      p_title: title,
      p_description: "",
      p_signup_closes_at: closeDate.toISOString(),
    });
    if (error || !data?.success) {
      return jsonResponse({ type: 4, data: { content: error?.message || data?.message || "เปิดกิจกรรมไม่สำเร็จ หรือไม่มีสิทธิ์ฝ่ายบริหาร", flags: 64 } });
    }

    const eventId = String(data.event_id);
    const warName = String(data.war_event_name || "Guild War");
    const closeLabel = closeDate.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });
    const content = "🎁 **4AM GUILD — " + title + "**\nอ้างอิงรายชื่อจาก: **" + warName + "**\nปิดรับลงชื่อ: **" + closeLabel + " น.**\n\nผู้มีสิทธิ์: สมาชิกที่อยู่ในรายชื่อ Guild War ทั้งตัวจริงและตัวสำรองเท่านั้น\nกดปุ่มด้านล่างเพื่อลงชื่อหรือยกเลิกได้ก่อนปิดรับสมัคร.";
    return jsonResponse({ type: 4, data: discordMessage(content, eventId, 0) });
  }

  // Buttons: join, cancel, or refresh the participant count.
  if (interaction.type === 3) {
    const customId = String(interaction.data?.custom_id || "");
    const [action, eventId] = customId.split(":");
    if (!eventId || !["reward_join", "reward_leave", "reward_count"].includes(action)) {
      return jsonResponse({ type: 4, data: { content: "ปุ่มกิจกรรมไม่ถูกต้อง", flags: 64 } });
    }

    let result: any = { success: true, message: "จำนวนผู้ลงทะเบียนปัจจุบัน" };
    if (action === "reward_join") {
      const { data, error } = await supabase.rpc("register_reward_event_from_discord", {
        p_event_id: eventId,
        p_discord_user_id: discordUserId,
      });
      if (error) result = { success: false, message: error.message };
      else result = data || result;
    } else if (action === "reward_leave") {
      const { data, error } = await supabase.rpc("cancel_reward_event_from_discord", {
        p_event_id: eventId,
        p_discord_user_id: discordUserId,
      });
      if (error) result = { success: false, message: error.message };
      else result = data || result;
    }

    const { count, error: countError } = await supabase
      .from("reward_event_signups")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "registered");
    const participantCount = countError ? 0 : (count || 0);
    const { data: eventRow } = await supabase
      .from("reward_events")
      .select("title,signup_closes_at,status")
      .eq("id", eventId)
      .maybeSingle();

    if (!eventRow) {
      return jsonResponse({ type: 4, data: { content: "ไม่พบกิจกรรมนี้", flags: 64 } });
    }
    const closed = eventRow.status !== "open" || !eventRow.signup_closes_at || new Date(eventRow.signup_closes_at).getTime() <= Date.now();
    const content = (result.success === false ? "⚠️ " : "✅ ") +
      String(result.message || (action === "reward_join" ? "ลงชื่อเข้าร่วมสำเร็จ" : action === "reward_leave" ? "ยกเลิกการลงชื่อแล้ว" : "จำนวนผู้ลงทะเบียน")) +
      "\n🎁 **" + String(eventRow.title || "กิจกรรมแจกของรางวัล") + "**" +
      "\nสถานะ: **" + (closed ? "ปิดรับสมัคร" : "เปิดรับสมัคร") + "**";
    const message = discordMessage(content, eventId, participantCount);
    if (closed) {
      message.components[0].components[0].disabled = true;
      message.components[0].components[1].disabled = true;
    }
    return jsonResponse({ type: 7, data: message });
  }

  return jsonResponse({ type: 4, data: { content: "ไม่รองรับคำสั่งนี้", flags: 64 } });
});

import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function bytes(hex: string) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error("Invalid hex");
  return new Uint8Array(hex.match(/.{2}/g)!.map(x => parseInt(x, 16)));
}
async function verify(req: Request, body: string) {
  const key = Deno.env.get("DISCORD_APPLICATION_PUBLIC_KEY") || "";
  const sig = req.headers.get("x-signature-ed25519") || "";
  const stamp = req.headers.get("x-signature-timestamp") || "";
  if (!key || !sig || !stamp) return false;
  try {
    const publicKey = await crypto.subtle.importKey("raw", bytes(key), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, publicKey, bytes(sig), encoder.encode(stamp + body));
  } catch { return false; }
}
function response(type: number, data: Record<string, unknown>) { return json({ type, data }); }
function option(options: any[], name: string) { return String(options.find(x => x.name === name)?.value || ""); }

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await req.text();
  if (!await verify(req, raw)) return json({ error: "Invalid Discord request signature" }, 401);
  let interaction: any;
  try { interaction = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (interaction.type === 1) return json({ type: 1 });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return response(4, { content: "ระบบเช็กชื่อยังตั้งค่าไม่ครบ", flags: 64 });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const expectedGuild = Deno.env.get("DISCORD_GUILD_ID") || "";
  if (expectedGuild && interaction.guild_id !== expectedGuild) return response(4, { content: "คำสั่งนี้ใช้ได้เฉพาะเซิร์ฟเวอร์ 4AM GUILD", flags: 64 });
  const discordId = String(interaction.member?.user?.id || interaction.user?.id || "");
  if (!discordId) return response(4, { content: "ไม่พบ Discord User ID", flags: 64 });

  async function linkedMember() {
    const link = await db.from("discord_accounts").select("user_id,verified,guild_member_verified").eq("discord_user_id", discordId).maybeSingle();
    if (link.error || !link.data || link.data.verified !== true || link.data.guild_member_verified !== true) return null;
    const member = await db.from("guild_members").select("user_id,character_name,nickname,role,active").eq("user_id", link.data.user_id).eq("active", true).maybeSingle();
    return member.error ? null : member.data;
  }
  async function getRoster(eventId: string) {
    const [eventQ, partiesQ] = await Promise.all([
      db.from("war_events").select("id,event_name,event_date,is_published").eq("id", eventId).maybeSingle(),
      db.from("war_parties").select("id,raid,party_number,war_party_members(member_id)").eq("event_id", eventId).order("raid").order("party_number")
    ]);
    if (eventQ.error || !eventQ.data || !eventQ.data.is_published || partiesQ.error) throw new Error("ไม่พบกิจกรรมวอร์ที่เผยแพร่หรือโหลดรายชื่อจัดตี้ไม่สำเร็จ");
    const rows = (partiesQ.data || []).flatMap((party: any) => (party.war_party_members || []).map((slot: any) => ({ member_id: slot.member_id, raid: party.raid, party_number: party.party_number })));
    const ids = [...new Set(rows.map((x: any) => x.member_id))];
    if (!ids.length) throw new Error("กิจกรรมนี้ยังไม่มีรายชื่อสมาชิกที่จัดลงตี้");
    const [membersQ, reservesQ, checkinsQ] = await Promise.all([
      db.from("guild_members").select("user_id,character_name,nickname,active").in("user_id", ids).eq("active", true),
      db.from("war_signups").select("member_id,queue_position,status").eq("event_id", eventId).eq("status", "standby").order("queue_position"),
      db.from("war_round_checkins").select("member_id,round_number,checked_in_at").eq("event_id", eventId)
    ]);
    if (membersQ.error || reservesQ.error || checkinsQ.error) throw new Error("โหลดข้อมูลสมาชิก ตัวสำรอง หรือเช็กชื่อไม่สำเร็จ กรุณาตรวจสอบ SQL WAR_ATTENDANCE_CENTER_V2");
    const reserveIds = (reservesQ.data || []).map((x: any) => x.member_id);
    const reserveMembersQ = reserveIds.length ? await db.from("guild_members").select("user_id,character_name,nickname,active").in("user_id", reserveIds).eq("active", true) : { data: [], error: null };
    if (reserveMembersQ.error) throw reserveMembersQ.error;
    const members = new Map((membersQ.data || []).map((m: any) => [m.user_id, m]));
    const reserveMembers = new Map((reserveMembersQ.data || []).map((m: any) => [m.user_id, m]));
    const roster = rows.filter((x: any) => members.has(x.member_id)).map((x: any) => ({ ...x, member: members.get(x.member_id) }));
    const reserves = (reservesQ.data || []).filter((x: any) => reserveMembers.has(x.member_id)).map((x: any) => ({ ...x, member: reserveMembers.get(x.member_id) }));
    return { event: eventQ.data, roster, reserves, checkins: checkinsQ.data || [] };
  }
  function buildMessage(data: any) {
    const { event, roster, reserves, checkins } = data;
    const checkMap = new Map(checkins.map((x: any) => [x.round_number + ":" + x.member_id, x]));
    const fields: any[] = [];
    const displayName = (x: any) => String(x.member.character_name || x.member.nickname || "สมาชิก");
    const list = (items: any[], reserve = false) => items.map((x: any) => {
      const place = reserve ? "สำรอง" : (x.raid + x.party_number);
      return displayName(x) + " (" + place + ")";
    }).join("\n").slice(0, 1020) || "—";
    for (const round of [1, 2]) {
      const mainDone = roster.filter((x: any) => checkMap.has(round + ":" + x.member_id));
      const mainPending = roster.filter((x: any) => !checkMap.has(round + ":" + x.member_id));
      const reserveDone = reserves.filter((x: any) => checkMap.has(round + ":" + x.member_id));
      const reservePending = reserves.filter((x: any) => !checkMap.has(round + ":" + x.member_id));
      fields.push({ name: "ROUND 0" + round + " · ตัวจริงยืนยันแล้ว " + mainDone.length + "/" + roster.length, value: list(mainDone), inline: false });
      fields.push({ name: "ROUND 0" + round + " · ตัวจริงยังไม่ยืนยัน " + mainPending.length, value: list(mainPending), inline: false });
      fields.push({ name: "ROUND 0" + round + " · ตัวสำรองยืนยันแล้ว " + reserveDone.length + "/" + reserves.length, value: list(reserveDone, true), inline: false });
      fields.push({ name: "ROUND 0" + round + " · ตัวสำรองยังไม่ยืนยัน " + reservePending.length, value: list(reservePending, true), inline: false });
    }
    return {
      content: "📋 **4AM GUILD — WAR CHECK-IN**\nกิจกรรม: **" + event.event_name + "** · " + event.event_date + "\nสมาชิกกดยืนยันแยกตามรอบ กรุณาตรวจสอบว่ากดยืนยันครบตามความพร้อมจริง",
      embeds: [{ color: 0xD92D45, title: "WAR READINESS", description: "รายชื่ออ้างอิงจาก Planned Roster และรายชื่อสำรองที่ลงชื่อไว้บนเว็บไซต์ · การกดยืนยันไม่ใช่การยืนยันว่าเข้าตี้ในเกมแล้ว", fields, footer: { text: "4AM GUILD · Discord Check-in" } }],
      components: [{ type: 1, components: [
        { type: 2, style: 3, label: "✓ ยืนยัน Round 01", custom_id: "war_checkin:" + event.id + ":1" },
        { type: 2, style: 3, label: "✓ ยืนยัน Round 02", custom_id: "war_checkin:" + event.id + ":2" }
      ] }]
    };
  }

  if (interaction.type === 2 && interaction.data?.name === "war-checkin") {
    const actor = await linkedMember();
    if (!actor || !["developer", "leader", "management"].includes(String(actor.role).toLowerCase())) {
      return response(4, { content: "คำสั่งนี้สงวนสิทธิ์สำหรับ Management ขึ้นไป และต้องเชื่อม Discord กับบัญชี 4AM GUILD แล้ว", flags: 64 });
    }
    const eventId = option(interaction.data.options || [], "event_id");
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) return response(4, { content: "กรุณาระบุ Event ID ที่ถูกต้อง", flags: 64 });
    try {
      const data = await getRoster(eventId);
      const [{ data: settings, error: settingsError }, { data: route, error: routeError }] = await Promise.all([
        db.from("guild_discord_integration_settings").select("mode,test_channel_id,production_enabled").eq("id", 1).maybeSingle(),
        db.from("guild_discord_event_routes").select("enabled,channel_id").eq("event_key", "war_checkin_opened").maybeSingle(),
      ]);
      if (settingsError || !settings || routeError) {
        return response(4, { content: "อ่านการตั้งค่า Discord Integration ไม่สำเร็จ", flags: 64 });
      }
      if (route?.enabled !== true) {
        return response(4, { content: "ปิดการแจ้งเตือนยืนยันความพร้อมก่อนลงวอร์ไว้ใน Discord Integration Settings", flags: 64 });
      }
      let channelId = "";
      if (settings.mode === "test") {
        channelId = String(settings.test_channel_id || "");
      } else if (settings.mode === "production" && settings.production_enabled === true && route?.enabled === true) {
        channelId = String(route.channel_id || "");
      }
      if (route?.enabled === true) {
        const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
        if (!botToken || !/^\\d{17,20}$/.test(channelId)) {
          return response(4, { content: "ยังไม่ได้กำหนดห้อง Discord สำหรับเปิดเช็กชื่อในโหมดปัจจุบัน", flags: 64 });
        }
        const posted = await fetch("https://discord.com/api/v10/channels/" + channelId + "/messages", {
          method: "POST",
          headers: { Authorization: "Bot " + botToken, "Content-Type": "application/json" },
          body: JSON.stringify({ ...buildMessage(data), allowed_mentions: { parse: [] } }),
        });
        if (!posted.ok) {
          const detail = (await posted.text()).slice(0, 400);
          return response(4, { content: "ส่งประกาศเปิดเช็กชื่อไปยัง Discord ไม่สำเร็จ: " + detail, flags: 64 });
        }
        return response(4, { content: "เปิดระบบเช็กชื่อและประกาศไปยังห้อง Discord ที่ตั้งค่าไว้เรียบร้อยแล้ว", flags: 64 });
      }
      return response(4, buildMessage(data));
    } catch (e) {
      return response(4, { content: e instanceof Error ? e.message : "เปิดระบบเช็กชื่อไม่สำเร็จ", flags: 64 });
    }
  }

  if (interaction.type === 3) {
    const customId = String(interaction.data?.custom_id || "");
    const match = customId.match(/^war_checkin:([0-9a-f-]{36}):(1|2)$/i);
    if (!match) return response(4, { content: "ปุ่มเช็กชื่อไม่ถูกต้อง", flags: 64 });
    const [, eventId, roundText] = match;
    const round = Number(roundText);
    const actor = await linkedMember();
    if (!actor) return response(4, { content: "กรุณาเชื่อมบัญชี Discord กับสมาชิก 4AM GUILD และยืนยันการเชื่อมต่อก่อน", flags: 64 });
    try {
      const data = await getRoster(eventId);
      const rosterMember = data.roster.find((x: any) => x.member_id === actor.user_id);
      const reserveMember = data.reserves.find((x: any) => x.member_id === actor.user_id);
      if (!rosterMember && !reserveMember) return response(4, { content: "คุณไม่มีรายชื่อเป็นตัวจริงหรือตัวสำรองของกิจกรรมนี้ จึงไม่สามารถกดยืนยันรอบนี้ได้", flags: 64 });
      const saved = await db.from("war_round_checkins").upsert({
        event_id: eventId, round_number: round, member_id: actor.user_id,
        discord_user_id: discordId, checked_in_at: new Date().toISOString()
      }, { onConflict: "event_id,round_number,member_id" });
      if (saved.error) throw saved.error;
      const refreshed = await getRoster(eventId);
      return response(7, buildMessage(refreshed));
    } catch (e) {
      return response(4, { content: e instanceof Error ? e.message : "บันทึกการยืนยันไม่สำเร็จ", flags: 64 });
    }
  }
  return response(4, { content: "ไม่รองรับคำสั่งนี้", flags: 64 });
});
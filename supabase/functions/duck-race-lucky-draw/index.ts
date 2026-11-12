// Supabase Edge Function: duck-race-lucky-draw
// Saves completed Duck Race snapshots and creates auditable Lucky Draw results.
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
const isUuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function secureShuffle<T>(items: T[]): T[] {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i--) {
    const max = 0x100000000;
    const limit = max - (max % (i + 1));
    let value = 0;
    do {
      const word = new Uint32Array(1);
      crypto.getRandomValues(word);
      value = word[0];
    } while (value >= limit);
    const j = value % (i + 1);
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ success: false, message: "กรุณาเข้าสู่ระบบก่อนใช้งาน Lucky Draw" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ success: false, message: "ยังตั้งค่า Supabase Function Secrets ไม่ครบ" }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, message: "Session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: requester, error: requesterError } = await admin.from("guild_members")
      .select("user_id,role,active").eq("user_id", authData.user.id).maybeSingle();
    if (requesterError || !requester || requester.active !== true) {
      return json({ success: false, message: "ต้องเป็นสมาชิกกิลด์ที่ยัง active เท่านั้น" }, 403);
    }
    const role = String(requester.role || "").toLowerCase();
    if (!["developer", "leader", "management"].includes(role)) {
      return json({ success: false, message: "เฉพาะ Developer หรือ Management เท่านั้นที่จัดการ Lucky Draw ได้" }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "save_race_results") {
      const sessionId = body.session_id;
      const mode = body.mode === "num" ? "num" : body.mode === "name" ? "name" : "";
      const duration = Number(body.duration_seconds);
      if (!isUuid(sessionId) || !mode || !Number.isInteger(duration) || duration < 1 ||
          !Array.isArray(body.results) || body.results.length < 2 || body.results.length > 120) {
        return json({ success: false, message: "ข้อมูลผลการแข่งขันไม่ถูกต้อง" }, 400);
      }
      const results = body.results.map((item: any, index: number) => ({
        rank: index + 1,
        label: String(item?.label ?? "").replace(/[\r\n\t]/g, " ").trim().slice(0, 48) || "Duck"
      }));
      const { data: existing, error: existingError } = await admin.from("duck_race_sessions")
        .select("id,created_by,participant_count").eq("id", sessionId).maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        if (existing.created_by !== authData.user.id) return json({ success: false, message: "ไม่สามารถเข้าถึงผลการแข่งขันรอบนี้ได้" }, 403);
        return json({ success: true, session_id: sessionId, already_saved: true, participant_count: existing.participant_count });
      }
      const { error: insertError } = await admin.from("duck_race_sessions").insert({
        id: sessionId,
        created_by: authData.user.id,
        game_mode: mode,
        duration_seconds: duration,
        participant_count: results.length,
        results,
        finished_at: new Date().toISOString()
      });
      if (insertError) throw insertError;
      return json({ success: true, session_id: sessionId, participant_count: results.length });
    }

    if (action === "create_lucky_draw") {
      const sessionId = body.session_id;
      const prizeCount = Number(body.prize_count);
      const revealMode = body.reveal_mode === "sequential" ? "sequential" : body.reveal_mode === "all" ? "all" : "";
      if (!isUuid(sessionId) || !Number.isInteger(prizeCount) || prizeCount < 1 || prizeCount > 120 || !revealMode) {
        return json({ success: false, message: "ตั้งค่าการจับรางวัลไม่ถูกต้อง" }, 400);
      }
      const { data: race, error: raceError } = await admin.from("duck_race_sessions")
        .select("id,created_by,participant_count,results,finished_at").eq("id", sessionId).maybeSingle();
      if (raceError || !race) return json({ success: false, message: "ไม่พบผลการแข่งขันที่บันทึกไว้ กรุณาจบการแข่งขันและบันทึกผลก่อน" }, 404);
      if (race.created_by !== authData.user.id && !["developer", "leader"].includes(role)) {
        return json({ success: false, message: "ไม่มีสิทธิ์จับรางวัลจากผลการแข่งขันรอบนี้" }, 403);
      }
      const entries = Array.isArray(race.results) ? race.results : [];
      if (entries.length !== race.participant_count || entries.length < 2) {
        return json({ success: false, message: "ผลการแข่งขันไม่สมบูรณ์ จึงยังจับรางวัลไม่ได้" }, 409);
      }
      if (prizeCount > entries.length) {
        return json({ success: false, message: "จำนวนรางวัลต้องไม่เกินจำนวนผู้เข้าแข่งขัน" }, 400);
      }
      const shuffled = secureShuffle(entries);
      const selected = shuffled.slice(0, prizeCount);
      const { data: draw, error: drawError } = await admin.from("duck_race_lucky_draws").insert({
        race_session_id: sessionId,
        created_by: authData.user.id,
        prize_count: prizeCount,
        reveal_mode: revealMode,
        eligible_count: entries.length
      }).select("id,race_session_id,prize_count,reveal_mode,eligible_count,created_at").single();
      if (drawError || !draw) throw drawError || new Error("Could not create Lucky Draw session");
      const winners = selected.map((item: any, index: number) => ({
        lucky_draw_id: draw.id,
        prize_number: index + 1,
        race_rank: Number(item.rank),
        duck_label: String(item.label)
      }));
      const { error: winnersError } = await admin.from("duck_race_lucky_draw_winners").insert(winners);
      if (winnersError) {
        await admin.from("duck_race_lucky_draws").delete().eq("id", draw.id);
        throw winnersError;
      }
      return json({ success: true, draw, winners: winners.map((item: any) => ({
        prize_number: item.prize_number, race_rank: item.race_rank, duck_label: item.duck_label
      })) });
    }

    if (action === "send_lucky_draw_to_discord") {
      const drawId = body.draw_id;
      if (!isUuid(drawId)) return json({ success: false, message: "รหัส Lucky Draw ไม่ถูกต้อง" }, 400);
      const { data: draw, error: drawError } = await admin.from("duck_race_lucky_draws")
        .select("id,race_session_id,prize_count,reveal_mode,eligible_count,created_by,created_at")
        .eq("id", drawId).maybeSingle();
      if (drawError || !draw) return json({ success: false, message: "ไม่พบผล Lucky Draw นี้" }, 404);
      if (draw.created_by !== authData.user.id && !["developer", "leader"].includes(role)) {
        return json({ success: false, message: "ไม่มีสิทธิ์ส่งผล Lucky Draw รอบนี้" }, 403);
      }
      const { data: integration, error: integrationError } = await admin.from("guild_discord_integration_settings")
        .select("mode,test_channel_id").eq("id", 1).maybeSingle();
      if (integrationError || !integration) return json({ success: false, message: "ยังไม่ได้ตั้งค่า Discord Integration" }, 503);
      if (integration.mode !== "test") {
        return json({ success: false, message: "Lucky Draw ยังล็อกการส่งไว้ที่ TEST MODE จนกว่าจะได้รับอนุมัติ Production" }, 403);
      }
      const channelId = String(integration.test_channel_id || "");
      const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
      if (!channelId || !botToken) return json({ success: false, message: "ไม่พบห้องทดสอบหรือ DISCORD_BOT_TOKEN" }, 503);
      const { data: winners, error: winnersError } = await admin.from("duck_race_lucky_draw_winners")
        .select("prize_number,race_rank,duck_label").eq("lucky_draw_id", drawId).order("prize_number");
      if (winnersError || !winners || winners.length !== draw.prize_count) {
        return json({ success: false, message: "ข้อมูลผู้ชนะไม่ครบถ้วน จึงยังส่ง Discord ไม่ได้" }, 409);
      }
      const lines = winners.map((winner: any) =>
        "**Prize #" + winner.prize_number + "** — " + String(winner.duck_label).slice(0, 80) +
        " (อันดับการแข่งขัน: " + winner.race_rank + ")"
      );
      const chunks: string[] = [];
      for (let i = 0; i < lines.length; i += 35) chunks.push(lines.slice(i, i + 35).join("\n"));
      const embeds = chunks.map((description, index) => ({
        title: chunks.length > 1 ? "✦ 4AM GUILD · LUCKY DRAW (" + (index + 1) + "/" + chunks.length + ")" : "✦ 4AM GUILD · LUCKY DRAW",
        description: description.slice(0, 4000),
        color: 0xD6A64D,
        fields: index === 0 ? [
          { name: "ผู้มีสิทธิ์", value: String(draw.eligible_count) + " คน", inline: true },
          { name: "จำนวนรางวัล", value: String(draw.prize_count) + " รางวัล", inline: true },
          { name: "รูปแบบ", value: draw.reveal_mode === "all" ? "สุ่มทีเดียวทั้งหมด" : "สุ่มทีละคน", inline: true }
        ] : [],
        footer: { text: "4AM GUILD · LUCKY DRAW" },
        timestamp: new Date(draw.created_at).toISOString()
      }));
      const sentIds: string[] = [];
      for (const embed of embeds) {
        const response = await fetch("https://discord.com/api/v10/channels/" + channelId + "/messages", {
          method: "POST",
          headers: { "Authorization": "Bot " + botToken, "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } })
        });
        if (!response.ok) {
          const details = await response.text();
          console.error("Lucky Draw Discord API error:", details);
          return json({ success: false, message: "Discord ปฏิเสธการส่งผล Lucky Draw", details: details.slice(0, 400) }, 502);
        }
        const message = await response.json();
        sentIds.push(String(message.id));
      }
      await admin.from("duck_race_lucky_draws").update({
        discord_message_ids: sentIds,
        discord_sent_at: new Date().toISOString()
      }).eq("id", drawId);
      return json({ success: true, mode: "test", message_count: sentIds.length });
    }

    if (action === "delete_lucky_draw") {
      const drawId = body.draw_id;
      if (!isUuid(drawId)) return json({ success: false, message: "รหัสประวัติการจับรางวัลไม่ถูกต้อง" }, 400);
      const { data: draw, error: drawError } = await admin.from("duck_race_lucky_draws")
        .select("id,race_session_id,created_by").eq("id", drawId).maybeSingle();
      if (drawError) throw drawError;
      if (!draw) return json({ success: false, message: "ไม่พบประวัติการจับรางวัลนี้ หรืออาจถูกลบไปแล้ว" }, 404);
      if (draw.created_by !== authData.user.id && !["developer", "leader"].includes(role)) {
        return json({ success: false, message: "ไม่มีสิทธิ์ลบประวัติการจับรางวัลนี้" }, 403);
      }
      const { error: deleteError } = await admin.from("duck_race_lucky_draws").delete().eq("id", drawId);
      if (deleteError) throw deleteError;
      return json({ success: true, deleted_id: drawId });
    }

    if (action === "get_draw_history") {
      const sessionId = body.session_id;
      if (!isUuid(sessionId)) return json({ success: false, message: "รหัสการแข่งขันไม่ถูกต้อง" }, 400);
      const { data: race } = await admin.from("duck_race_sessions").select("id,created_by").eq("id", sessionId).maybeSingle();
      if (!race) return json({ success: false, message: "ไม่พบการแข่งขันนี้" }, 404);
      if (race.created_by !== authData.user.id && !["developer", "leader"].includes(role)) {
        return json({ success: false, message: "ไม่มีสิทธิ์ดูประวัติรอบนี้" }, 403);
      }
      const { data, error } = await admin.from("duck_race_lucky_draws")
        .select("id,prize_count,reveal_mode,eligible_count,created_at,duck_race_lucky_draw_winners(prize_number,race_rank,duck_label)")
        .eq("race_session_id", sessionId).order("created_at", { ascending: false });
      if (error) throw error;
      return json({ success: true, history: data || [] });
    }

    return json({ success: false, message: "Unknown action" }, 400);
  } catch (error) {
    console.error("duck-race-lucky-draw:", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

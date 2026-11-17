import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function identityValue(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { success: false, message: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
    const guildId = Deno.env.get("DISCORD_GUILD_ID");

    if (!supabaseUrl || !anonKey || !serviceKey || !botToken || !guildId) {
      return jsonResponse(500, { success: false, message: "Server configuration is incomplete" });
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(401, { success: false, message: "กรุณาเข้าสู่ระบบ Discord ก่อนดำเนินการ" });
    }

    const accessToken = authorization.slice(7);
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
    const user = authData?.user;
    if (authError || !user) return jsonResponse(401, { success: false, message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" });

    const discordIdentity = user.identities?.find((identity) => identity.provider === "discord");
    if (!discordIdentity) return jsonResponse(403, { success: false, message: "ไม่พบ Discord OAuth identity ในบัญชีนี้" });

    const identityData = (discordIdentity.identity_data || {}) as Record<string, unknown>;
    const body = await req.json();
    const action = String(body.action || "register");
    const discordUserId = identityValue(identityData, ["provider_id", "sub", "id"]) || String(discordIdentity.identity_id || "");
    const discordUsername = identityValue(identityData, ["username", "user_name", "preferred_username", "name"]);
    const discordGlobalName = identityValue(identityData, ["global_name", "full_name", "name"]);
    if (!/^[0-9]{17,20}$/.test(discordUserId)) {
      return jsonResponse(403, { success: false, message: "ไม่สามารถอ่าน Discord User ID ที่ถูกต้องจาก OAuth ได้" });
    }

    // PHASE 3 ROLE GATE PAUSED:
    // Website access is controlled by Management-approved guild_members records.
    // Keep Discord OAuth identity verification and actual server-membership
    // verification, but do not require any Discord role name or role ID here.
    const memberResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (memberResponse.status !== 200 && memberResponse.status !== 404) {
      const details = await memberResponse.text();
      console.error("Discord member lookup failed", memberResponse.status, details);
      return jsonResponse(502, { success: false, message: "Discord ไม่สามารถยืนยันสมาชิก Server ได้ในขณะนี้" });
    }
    if (memberResponse.status === 404 && action !== "sync_membership") {
      return jsonResponse(403, { success: false, message: "กรุณาเข้าร่วม Discord Server ของ 4AM GUILD ก่อนสมัครสมาชิก" });
    }
    const discordMember = memberResponse.status === 200 ? await memberResponse.json() as { roles?: string[] } : { roles: [] as string[] };
    const memberRoleIds = Array.isArray(discordMember.roles) ? discordMember.roles : [];
    // Role checks are intentionally disabled while Phase 3 is paused.
    // These flags represent Discord server membership only, not a role grant.
    const hasExcludedRole = false;
    const hasRequiredRole = memberResponse.status === 200;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (action === "sync_membership") {
      const { data: memberRow, error: memberReadError } = await admin
        .from("guild_members")
        .select("membership_status,active,character_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (memberReadError) {
        console.error("Membership sync read failed", memberReadError);
        return jsonResponse(200, { success: true, sync_status: "unavailable", message: "ไม่สามารถอ่านสถานะ Discord ได้ในขณะนี้ แต่ไม่กระทบสิทธิ์เข้าเว็บไซต์" });
      }
      if (!memberRow) return jsonResponse(404, { success: false, message: "ไม่พบโปรไฟล์สมาชิก" });

      const { data: linkedDiscordAccount, error: linkedAccountError } = await admin
        .from("discord_accounts")
        .select("discord_user_id,verified,discord_connection_status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (linkedAccountError) {
        console.error("Linked Discord account lookup failed", linkedAccountError);
        return jsonResponse(200, { success: true, sync_status: "unavailable", message: "อ่านข้อมูล Discord ไม่สำเร็จ แต่ไม่กระทบสิทธิ์เข้าเว็บไซต์" });
      }

      const now = new Date().toISOString();
      const identityMatchesLinkedAccount =
        linkedDiscordAccount?.discord_user_id === discordUserId &&
        linkedDiscordAccount?.verified === true;

      // Discord identity/roles are connection diagnostics only. They must never
      // change guild membership_status or active; Management owns those fields.
      if (!identityMatchesLinkedAccount) {
        console.warn("Discord OAuth identity does not match linked account; membership access unchanged", user.id);
        const previousStatus = linkedDiscordAccount?.discord_connection_status || "unknown";
        await admin.from("discord_accounts")
          .update({ discord_connection_status: "identity_mismatch", guild_member_verified: false, last_checked_at: now, updated_at: now })
          .eq("user_id", user.id);
        if (previousStatus !== "identity_mismatch") {
          const { data: admins } = await admin.from("guild_members")
            .select("user_id")
            .eq("active", true)
            .eq("membership_status", "active")
            .in("role", ["admin", "leader", "developer", "management"]);
          if (admins?.length) {
            await admin.from("guild_notifications").insert(admins.map((adminMember) => ({
              recipient_user_id: adminMember.user_id,
              notification_type: "discord_membership_alert",
              title: "ตรวจพบ Discord Account ไม่ตรงกัน",
              body: "สมาชิก " + user.id + " เข้าสู่ระบบด้วย Discord ID ที่ไม่ตรงกับบัญชีที่ผูกไว้ กรุณาตรวจสอบในหน้าจัดการสมาชิก",
            })));
          }
        }
        return jsonResponse(200, {
          success: true,
          sync_status: "identity_mismatch",
          guild_member_verified: false,
          membership_status: memberRow.membership_status,
          access_unchanged: true,
          message: "บัญชี Discord ที่เข้าสู่ระบบไม่ตรงกับบัญชีที่ผูกไว้ จึงไม่ได้เปลี่ยนสิทธิ์สมาชิกเว็บไซต์",
        });
      }

      const discordServerConnected = memberResponse.status === 200;
      const roleVerified = discordServerConnected && hasRequiredRole && !hasExcludedRole;

      const { error: memberUpdateError } = await admin.from("guild_members")
        .update({
          discord_role_ids: memberRoleIds,
          last_discord_sync_at: now,
          updated_at: now,
        })
        .eq("user_id", user.id);
      if (memberUpdateError) {
        console.error("Guild member Discord metadata sync failed", memberUpdateError);
        return jsonResponse(200, { success: true, sync_status: "unavailable", message: "บันทึกข้อมูล Discord ไม่สำเร็จ แต่ไม่กระทบสิทธิ์เข้าเว็บไซต์" });
      }

      const syncStatus = !discordServerConnected
        ? "disconnected"
        : hasExcludedRole
          ? "guest_role"
          : roleVerified
            ? "connected_member"
            : "role_missing";
      const previousStatus = linkedDiscordAccount.discord_connection_status || "unknown";

      const { error: discordUpdateError } = await admin.from("discord_accounts")
        .update({
          guild_member_verified: roleVerified,
          discord_connection_status: syncStatus,
          last_checked_at: now,
          updated_at: now,
        })
        .eq("user_id", user.id);
      if (discordUpdateError) {
        console.error("Discord status update failed", discordUpdateError);
        return jsonResponse(200, { success: true, sync_status: "unavailable", message: "บันทึกสถานะ Discord ไม่สำเร็จ แต่ไม่กระทบสิทธิ์เข้าเว็บไซต์" });
      }

      if (syncStatus !== previousStatus && syncStatus !== "connected_member") {
        const { data: admins, error: adminLookupError } = await admin.from("guild_members")
          .select("user_id")
          .eq("active", true)
          .eq("membership_status", "active")
          .in("role", ["admin", "leader", "developer", "management"]);
        if (adminLookupError) {
          console.warn("Could not resolve Management recipients for Discord alert", adminLookupError);
        } else if (admins?.length) {
          const statusLabels: Record<string, string> = {
            disconnected: "ออกจาก Discord Server",
            guest_role: "ถูกกำหนด Discord Role เป็น 4AM Guest",
            role_missing: "ไม่พบ Discord Role 4AM Guild Member",
          };
          const notificationRows = admins.map((adminMember) => ({
            recipient_user_id: adminMember.user_id,
            notification_type: "discord_membership_alert",
            title: "สถานะ Discord ของสมาชิกต้องตรวจสอบ",
            body: "สมาชิก " + (memberRow.character_name || user.id) + " — " + (statusLabels[syncStatus] || syncStatus) + " กรุณาตรวจสอบในหน้าจัดการสมาชิก ทั้งนี้ระบบไม่ได้ระงับสิทธิ์เข้าเว็บไซต์",
          }));
          const { error: notificationError } = await admin.from("guild_notifications").insert(notificationRows);
          if (notificationError) console.warn("Discord status notification insert failed", notificationError);
        }
      }

      return jsonResponse(200, {
        success: true,
        sync_status: syncStatus,
        discord_server_connected: discordServerConnected,
        guild_member_verified: roleVerified,
        membership_status: memberRow.membership_status,
        access_unchanged: true,
        message: syncStatus === "connected_member"
          ? "Discord connection checked; website membership access remains Management-controlled"
          : "Discord connection/role needs Management attention; notifications sent when status changed; website access was not changed",
      });
    }

    if (action === "link_manual") {
      const manualMemberId = String(body.manual_member_id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(manualMemberId)) {
        return jsonResponse(400, { success: false, message: "ไม่พบรายชื่อ Manual ที่ต้องการเชื่อมบัญชี" });
      }
      const { error } = await admin.rpc("link_manual_guild_member_pending", {
        p_user_id: user.id,
        p_manual_member_id: manualMemberId,
        p_discord_user_id: discordUserId,
        p_discord_username: discordUsername,
        p_discord_global_name: discordGlobalName,
        p_discord_role_ids: memberRoleIds,
      });
      if (error) {
        console.error("Manual pending link failed", error);
        return jsonResponse(409, { success: false, message: error.message || "ไม่สามารถส่งคำขอเชื่อมบัญชีได้" });
      }
      const { error: statusError } = await admin.from("discord_accounts")
        .update({ discord_connection_status: "connected_member", guild_member_verified: true, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (statusError) console.warn("Could not store initial Discord connection status", statusError);
      return jsonResponse(200, { success: true, status: "pending_review", message: "เชื่อมบัญชีและส่งคำขอให้ฝ่ายจัดการตรวจสอบแล้ว" });
    }

    if (action !== "register") return jsonResponse(400, { success: false, message: "Invalid registration action" });

    const characterName = String(body.character_name || "").trim();
    const gameClass = String(body.game_class || "").trim();
    const gameUID = String(body.game_uid || "").trim();
    const nickname = String(body.nickname || "").trim();
    const ageValue = body.age;
    const allowedClasses = ["Ironclad", "Bloodstrom", "Celestune", "Numina", "Sylph", "Nightwaker", "Dragonsvelte", "Mystech"];
    if (!characterName || characterName.length > 40) return jsonResponse(400, { success: false, message: "กรุณากรอกชื่อตัวละครไม่เกิน 40 ตัวอักษร" });
    if (!/^[0-9]{10,12}$/.test(gameUID)) return jsonResponse(400, { success: false, message: "Game UID ต้องเป็นตัวเลข 10–12 หลักเท่านั้น" });
    if (!allowedClasses.includes(gameClass)) return jsonResponse(400, { success: false, message: "ไม่พบ Class ที่ถูกต้อง" });
    if (!nickname || nickname.length > 40) return jsonResponse(400, { success: false, message: "กรุณากรอกชื่อเล่นไม่เกิน 40 ตัวอักษร" });
    let age: number | null = null;
    if (ageValue !== null && ageValue !== undefined && String(ageValue).trim() !== "") {
      age = Number(ageValue);
      if (!Number.isInteger(age) || age < 1 || age > 120) return jsonResponse(400, { success: false, message: "อายุต้องอยู่ระหว่าง 1 ถึง 120 ปี" });
    }

    const { error } = await admin.rpc("register_guild_member_pending", {
      p_user_id: user.id,
      p_character_name: characterName,
      p_game_class: gameClass,
      p_nickname: nickname,
      p_discord_name: discordGlobalName || discordUsername || discordUserId,
      p_age: age,
      p_discord_user_id: discordUserId,
      p_discord_username: discordUsername || null,
      p_discord_global_name: discordGlobalName || null,
      p_game_uid: gameUID,
      p_discord_role_ids: memberRoleIds,
    });
    if (error) {
      console.error("Pending registration RPC failed", error);
      return jsonResponse(409, { success: false, message: error.message || "ไม่สามารถส่งคำขอสมัครสมาชิกได้" });
    }
    const { error: statusError } = await admin.from("discord_accounts")
      .update({ discord_connection_status: "connected_member", guild_member_verified: true, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (statusError) console.warn("Could not store initial Discord connection status", statusError);

    return jsonResponse(200, {
      success: true,
      status: "pending_review",
      message: "ส่งคำขอสมัครสมาชิกสำเร็จ กรุณารอฝ่ายจัดการตรวจสอบและอนุมัติ",
    });
  } catch (error) {
    console.error("Guild member onboarding failed", error);
    return jsonResponse(500, { success: false, message: "เกิดข้อผิดพลาดระหว่างตรวจสอบและสมัครสมาชิก กรุณาลองใหม่" });
  }
});
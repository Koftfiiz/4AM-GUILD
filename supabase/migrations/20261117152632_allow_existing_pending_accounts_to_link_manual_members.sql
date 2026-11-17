CREATE OR REPLACE FUNCTION public.link_manual_guild_member_pending(
  p_user_id uuid,
  p_manual_member_id uuid,
  p_discord_user_id text,
  p_discord_username text,
  p_discord_global_name text,
  p_discord_role_ids text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_manual public.guild_manual_members%rowtype;
  v_existing_member public.guild_members%rowtype;
  v_existing_discord_user_id text;
  v_discord_name text;
  v_has_member boolean := false;
  v_has_discord_account boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_discord_user_id !~ '^[0-9]{17,20}$' THEN
    RAISE EXCEPTION 'Invalid user or Discord identity';
  END IF;

  SELECT * INTO v_manual
  FROM public.guild_manual_members
  WHERE id = p_manual_member_id
    AND btrim(coalesce(discord_user_id, '')) = p_discord_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manual record does not match this Discord account';
  END IF;
  IF v_manual.active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Manual member record is inactive';
  END IF;
  IF v_manual.linked_user_id IS NOT NULL AND v_manual.linked_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Manual record is already linked to another account';
  END IF;

  SELECT * INTO v_existing_member
  FROM public.guild_members
  WHERE user_id = p_user_id
  FOR UPDATE;
  v_has_member := FOUND;

  IF v_has_member AND NOT (
    v_existing_member.membership_status = 'pending_review'
    AND v_existing_member.registration_source = 'discord_auto'
  ) THEN
    RAISE EXCEPTION 'Guild profile already exists and cannot be replaced by Manual linking';
  END IF;

  SELECT discord_user_id INTO v_existing_discord_user_id
  FROM public.discord_accounts
  WHERE user_id = p_user_id
  FOR UPDATE;
  v_has_discord_account := FOUND;

  IF v_has_discord_account AND v_existing_discord_user_id <> p_discord_user_id THEN
    RAISE EXCEPTION 'This user already has a different linked Discord account';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.discord_accounts
    WHERE discord_user_id = p_discord_user_id
      AND user_id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Discord account is linked to another user';
  END IF;

  v_discord_name := coalesce(
    nullif(btrim(v_manual.discord_server_nickname), ''),
    nullif(btrim(v_manual.discord_global_name), ''),
    nullif(btrim(v_manual.discord_username), ''),
    nullif(btrim(v_manual.discord_name), ''),
    p_discord_username
  );

  IF v_has_member THEN
    UPDATE public.guild_members
    SET character_name = v_manual.character_name,
        game_class = v_manual.game_class,
        nickname = v_manual.nickname,
        discord_name = v_discord_name,
        age = v_manual.age,
        role = 'member',
        active = true,
        guild_position = v_manual.guild_position,
        membership_status = 'active',
        registration_source = 'manual_link',
        discord_role_ids = coalesce(p_discord_role_ids, '{}'::text[]),
        last_discord_sync_at = now(),
        updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    INSERT INTO public.guild_members(
      user_id, character_name, game_class, nickname, discord_name, age, role,
      active, guild_position, membership_status, registration_source,
      discord_role_ids, last_discord_sync_at
    ) VALUES (
      p_user_id, v_manual.character_name, v_manual.game_class, v_manual.nickname,
      v_discord_name, v_manual.age, 'member',
      true, v_manual.guild_position, 'active', 'manual_link',
      coalesce(p_discord_role_ids, '{}'::text[]), now()
    );
  END IF;

  IF v_has_discord_account THEN
    UPDATE public.discord_accounts
    SET discord_username = p_discord_username,
        discord_global_name = p_discord_global_name,
        verified = true,
        guild_member_verified = true,
        verified_at = coalesce(verified_at, now()),
        last_checked_at = now(),
        updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    INSERT INTO public.discord_accounts(
      user_id, discord_user_id, discord_username, discord_global_name, verified,
      guild_member_verified, verified_at, last_checked_at, updated_at
    ) VALUES (
      p_user_id, p_discord_user_id, p_discord_username, p_discord_global_name,
      true, true, now(), now(), now()
    );
  END IF;

  UPDATE public.guild_manual_members
  SET linked_user_id = p_user_id,
      linked_at = coalesce(linked_at, now()),
      updated_at = now()
  WHERE id = v_manual.id
    AND (linked_user_id IS NULL OR linked_user_id = p_user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not save Manual account link';
  END IF;
END;
$function$;

create or replace function public.update_portfolio_version(
  target_version_id uuid,
  new_version_name text,
  version_description text,
  version_game_class text,
  version_portfolio_type text,
  image_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  owner_id uuid;
  parent_portfolio_id uuid;
  target_number integer;
  image_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_guild_member() then
    raise exception 'Active guild membership required';
  end if;
  if target_version_id is null
     or nullif(btrim(new_version_name), '') is null
     or char_length(btrim(new_version_name)) > 80
     or nullif(btrim(version_game_class), '') is null
     or version_portfolio_type not in ('pvp','pve','cultivation_skills')
     or jsonb_typeof(coalesce(image_payload, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(image_payload, '[]'::jsonb)) < 1 then
    raise exception 'Invalid portfolio version update payload';
  end if;

  select p.member_id, p.id, pv.version_number
    into owner_id, parent_portfolio_id, target_number
  from public.portfolio_versions pv
  join public.portfolios p on p.id = pv.portfolio_id
  where pv.id = target_version_id;

  if not found or owner_id <> (select auth.uid()) then
    raise exception 'Portfolio version not found or not owned by current member';
  end if;

  if exists (
    select 1 from public.portfolio_patch_submissions s
    where s.version_id = target_version_id
  ) then
    raise exception 'This version has PATCH submission history and is locked from editing';
  end if;

  update public.portfolio_versions
  set version_name = btrim(new_version_name),
      description = version_description,
      game_class = btrim(version_game_class),
      portfolio_type = version_portfolio_type
  where id = target_version_id;

  delete from public.portfolio_version_images
  where version_id = target_version_id;

  insert into public.portfolio_version_images
    (version_id, image_url, cover_image_url, crop_settings, image_type,
     section_key, caption, sort_order)
  select
    target_version_id,
    item.image_url,
    item.cover_image_url,
    item.crop_settings,
    coalesce(nullif(item.image_type, ''), 'other'),
    coalesce(nullif(item.section_key, ''), 'stats'),
    item.caption,
    coalesce(item.sort_order, 0)
  from jsonb_to_recordset(coalesce(image_payload, '[]'::jsonb)) as item(
    image_url text,
    cover_image_url text,
    crop_settings jsonb,
    image_type text,
    section_key text,
    caption text,
    sort_order integer
  );

  get diagnostics image_count = row_count;
  if image_count < 1 then
    raise exception 'At least one version image is required';
  end if;

  update public.portfolio_version_reviews
  set status = 'pending',
      reason = null,
      reviewer_user_id = null,
      reviewed_at = null,
      updated_at = now()
  where version_id = target_version_id;

  if target_number = (
    select max(pv.version_number)
    from public.portfolio_versions pv
    where pv.portfolio_id = parent_portfolio_id
  ) then
    update public.portfolios
    set description = version_description,
        game_class = btrim(version_game_class),
        portfolio_type = version_portfolio_type,
        updated_at = now()
    where id = parent_portfolio_id
      and member_id = (select auth.uid());
  end if;

  return jsonb_build_object(
    'success', true,
    'portfolio_id', parent_portfolio_id,
    'version_id', target_version_id,
    'version_number', target_number,
    'review_status_reset', true
  );
end;
$function$;

revoke all on function public.update_portfolio_version(uuid,text,text,text,text,jsonb) from public;
revoke all on function public.update_portfolio_version(uuid,text,text,text,text,jsonb) from anon;
revoke all on function public.update_portfolio_version(uuid,text,text,text,text,jsonb) from authenticated;
grant execute on function public.update_portfolio_version(uuid,text,text,text,text,jsonb) to authenticated;
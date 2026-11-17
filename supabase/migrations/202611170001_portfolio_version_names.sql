-- Portfolio Version display names; preserve immutable snapshot data.
alter table public.portfolio_versions
  add column if not exists version_name text;

update public.portfolio_versions
set version_name = 'Version ' || version_number::text
where version_name is null or btrim(version_name) = '';

alter table public.portfolio_versions
  alter column version_name set default 'Version',
  alter column version_name set not null;

-- Keep legacy clients creating readable names while the frontend rolls out.
create or replace function public.assign_portfolio_version_display_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if nullif(btrim(new.version_name), '') is null or new.version_name = 'Version' then
    new.version_name := 'Version ' || new.version_number::text;
  else
    new.version_name := btrim(new.version_name);
  end if;
  return new;
end;
$function$;

drop trigger if exists portfolio_versions_assign_display_name on public.portfolio_versions;
create trigger portfolio_versions_assign_display_name
before insert on public.portfolio_versions
for each row execute function public.assign_portfolio_version_display_name();

revoke all on function public.assign_portfolio_version_display_name() from public, anon, authenticated;

-- Owners may update only the version_name column. Snapshot content remains immutable.
drop policy if exists "Owners can rename portfolio versions" on public.portfolio_versions;
create policy "Owners can rename portfolio versions"
on public.portfolio_versions for update to authenticated
using (
  public.is_guild_member()
  and exists (
    select 1 from public.portfolios p
    where p.id = portfolio_id and p.member_id = (select auth.uid())
  )
)
with check (
  public.is_guild_member()
  and exists (
    select 1 from public.portfolios p
    where p.id = portfolio_id and p.member_id = (select auth.uid())
  )
);

grant update (version_name) on public.portfolio_versions to authenticated;

create or replace function public.rename_portfolio_version(
  target_version_id uuid,
  new_version_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  affected integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_guild_member() then
    raise exception 'Active guild membership required';
  end if;
  if target_version_id is null
     or nullif(btrim(new_version_name), '') is null
     or char_length(btrim(new_version_name)) > 80 then
    raise exception 'Version name must contain 1 to 80 characters';
  end if;

  update public.portfolio_versions pv
  set version_name = btrim(new_version_name)
  where pv.id = target_version_id
    and exists (
      select 1
      from public.portfolios p
      where p.id = pv.portfolio_id
        and p.member_id = (select auth.uid())
    );

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'Portfolio version not found or not owned by current member';
  end if;

  return jsonb_build_object(
    'success', true,
    'version_id', target_version_id,
    'version_name', btrim(new_version_name)
  );
end;
$function$;

revoke all on function public.rename_portfolio_version(uuid,text) from public, anon;
grant execute on function public.rename_portfolio_version(uuid,text) to authenticated;

-- New signature accepts an explicit name for every new snapshot.
create or replace function public.save_portfolio_version(
  target_portfolio_id uuid,
  create_new_folder boolean,
  folder_title text,
  folder_description text,
  folder_game_class text,
  folder_portfolio_type text,
  folder_version_name text,
  image_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  saved_portfolio_id uuid;
  saved_version_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_guild_member() then
    raise exception 'Active guild membership required';
  end if;
  if target_portfolio_id is null
     or nullif(btrim(folder_title), '') is null
     or nullif(btrim(folder_game_class), '') is null
     or folder_portfolio_type not in ('pvp','pve','cultivation_skills')
     or nullif(btrim(folder_version_name), '') is null
     or char_length(btrim(folder_version_name)) > 80
     or jsonb_typeof(coalesce(image_payload, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(image_payload, '[]'::jsonb)) < 1 then
    raise exception 'Invalid portfolio version payload';
  end if;

  if create_new_folder then
    insert into public.portfolios
      (id, member_id, title, description, game_class, portfolio_type)
    values
      (target_portfolio_id, (select auth.uid()), btrim(folder_title),
       folder_description, btrim(folder_game_class), folder_portfolio_type)
    returning id into saved_portfolio_id;
  else
    update public.portfolios
    set title = btrim(folder_title),
        description = folder_description,
        game_class = btrim(folder_game_class),
        portfolio_type = folder_portfolio_type
    where id = target_portfolio_id
      and member_id = (select auth.uid())
    returning id into saved_portfolio_id;

    if not found then
      raise exception 'Portfolio folder not found or not owned by current member';
    end if;
  end if;

  insert into public.portfolio_versions
    (portfolio_id, title, game_class, portfolio_type, version_name)
  values
    (saved_portfolio_id, btrim(folder_title), btrim(folder_game_class),
     folder_portfolio_type, btrim(folder_version_name))
  returning id into saved_version_id;

  insert into public.portfolio_version_images
    (version_id, image_url, cover_image_url, crop_settings, image_type,
     section_key, caption, sort_order)
  select
    saved_version_id,
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

  if not found then
    raise exception 'At least one version image is required';
  end if;

  return jsonb_build_object(
    'success', true,
    'portfolio_id', saved_portfolio_id,
    'version_id', saved_version_id,
    'version_name', btrim(folder_version_name)
  );
end;
$function$;

revoke all on function public.save_portfolio_version(uuid,boolean,text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.save_portfolio_version(uuid,boolean,text,text,text,text,text,jsonb) to authenticated;

-- Staging-only baseline for Guild Affiliation prototype.
-- Contains synthetic fixtures only; never run against Production.
create table public.guilds (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('4AM','4PM')),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('10000000-0000-4000-8000-000000000001','authenticated','authenticated','staging-developer@example.test','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"staging_fixture":true}'::jsonb,now(),now()),
('10000000-0000-4000-8000-000000000002','authenticated','authenticated','staging-member-2@example.test','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"staging_fixture":true}'::jsonb,now(),now()),
('10000000-0000-4000-8000-000000000003','authenticated','authenticated','staging-member-3@example.test','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"staging_fixture":true}'::jsonb,now(),now()),
('10000000-0000-4000-8000-000000000004','authenticated','authenticated','staging-leader@example.test','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"staging_fixture":true}'::jsonb,now(),now()),
('10000000-0000-4000-8000-000000000005','authenticated','authenticated','staging-management@example.test','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"staging_fixture":true}'::jsonb,now(),now()),
('10000000-0000-4000-8000-000000000006','authenticated','authenticated','staging-manual-link@example.test','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"staging_fixture":true}'::jsonb,now(),now())
on conflict(id) do nothing;

create table public.guild_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  character_name text not null,
  game_class text not null,
  nickname text,
  discord_name text,
  role text not null default 'member',
  active boolean not null default true,
  membership_status text not null default 'active',
  created_at timestamptz not null default now()
);
create table public.discord_accounts (
  user_id uuid primary key references public.guild_members(user_id) on delete cascade,
  discord_user_id text unique,
  discord_username text,
  discord_global_name text,
  verified boolean not null default false,
  guild_member_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.guild_manual_members (
  id uuid primary key default gen_random_uuid(),
  character_name text not null,
  game_class text not null,
  nickname text,
  discord_name text,
  active boolean not null default true,
  linked_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.guild_member_affiliations (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete restrict,
  user_id uuid references public.guild_members(user_id) on delete restrict,
  manual_member_id uuid references public.guild_manual_members(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  change_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint guild_member_affiliations_one_identity check (
    (user_id is not null and manual_member_id is null) or
    (user_id is null and manual_member_id is not null)
  ),
  constraint guild_member_affiliations_valid_period check (ended_at is null or ended_at > started_at)
);
create unique index guild_member_affiliations_one_current_user on public.guild_member_affiliations(user_id) where user_id is not null and ended_at is null;
create unique index guild_member_affiliations_one_current_manual on public.guild_member_affiliations(manual_member_id) where manual_member_id is not null and ended_at is null;
create index guild_member_affiliations_guild_current_idx on public.guild_member_affiliations(guild_id,started_at desc) where ended_at is null;
insert into public.guilds(code,name) values ('4AM','4AM GUILD'),('4PM','4PM GUILD');
create or replace function public.is_guild_member()
returns boolean language sql stable security definer set search_path = ''
as 'select
  (select auth.uid()) = ''378b09df-16a0-4d01-8908-2604c2c210a9''::uuid
  or exists (
    select 1 from public.guild_members gm
    where gm.user_id = (select auth.uid())
      and gm.active = true
      and gm.membership_status = ''active''
  )';
revoke all on function public.is_guild_member() from public, anon;
grant execute on function public.is_guild_member() to authenticated;

create or replace function public.is_guild_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.guild_members gm
    where gm.user_id = (select auth.uid()) and gm.active = true
      and gm.membership_status = 'active'
      and gm.role in ('admin','leader','developer','management')
  );
$$;
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_manual_members enable row level security;
alter table public.discord_accounts enable row level security;
alter table public.guild_member_affiliations enable row level security;
create policy guilds_read_active on public.guilds for select to authenticated using (is_active = true);
create policy guild_members_read_directory on public.guild_members for select to authenticated using (active = true);
create policy guild_manual_members_read_directory on public.guild_manual_members for select to authenticated using (active = true);
create policy discord_accounts_read_owner_or_management on public.discord_accounts for select to authenticated using (user_id=(select auth.uid()) or public.is_guild_admin());
create policy "Members can view own guild affiliation" on public.guild_member_affiliations for select to authenticated using (
  public.is_guild_admin() or user_id = (select auth.uid()) or exists (
    select 1 from public.guild_manual_members mm
    where mm.id = guild_member_affiliations.manual_member_id and mm.linked_user_id = (select auth.uid())
  )
);
create policy "Leaders, Management, and Developers can manage member affiliations" on public.guild_member_affiliations for all to authenticated using (public.is_guild_admin()) with check (public.is_guild_admin());
grant select on public.guilds, public.guild_members, public.guild_manual_members, public.guild_member_affiliations, public.discord_accounts to authenticated;
grant insert, update, delete on public.guild_member_affiliations to authenticated;
create or replace function public.set_guild_member_affiliation(
  p_guild_code text, p_user_id uuid default null, p_manual_member_id uuid default null, p_reason text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_guild_id uuid; v_new_id uuid; v_started_at timestamptz := clock_timestamp(); v_manual_linked_user uuid;
begin
  if (p_user_id is null) = (p_manual_member_id is null) then raise exception 'Provide exactly one member identity'; end if;
  if (select auth.uid()) is null or not public.is_guild_admin() then raise exception 'Not authorized to change guild affiliation'; end if;
  select id into v_guild_id from public.guilds where code = p_guild_code and is_active = true;
  if v_guild_id is null then raise exception 'Unknown or inactive guild'; end if;
  if p_user_id is not null then
    if not exists(select 1 from public.guild_members where user_id = p_user_id) then raise exception 'Registered member not found'; end if;
    update public.guild_member_affiliations set ended_at = v_started_at where user_id = p_user_id and ended_at is null;
    insert into public.guild_member_affiliations(guild_id,user_id,started_at,change_reason,created_by)
    values(v_guild_id,p_user_id,v_started_at,nullif(trim(p_reason),''),(select auth.uid())) returning id into v_new_id;
  else
    select linked_user_id into v_manual_linked_user from public.guild_manual_members where id = p_manual_member_id and active = true;
    if not found then raise exception 'Manual member not found or inactive'; end if;
    if v_manual_linked_user is not null then raise exception 'This manual record is linked to a registered account; assign affiliation using the canonical user_id'; end if;
    update public.guild_member_affiliations set ended_at = v_started_at where manual_member_id = p_manual_member_id and ended_at is null;
    insert into public.guild_member_affiliations(guild_id,manual_member_id,started_at,change_reason,created_by)
    values(v_guild_id,p_manual_member_id,v_started_at,nullif(trim(p_reason),''),(select auth.uid())) returning id into v_new_id;
  end if;
  return v_new_id;
end; $$;
revoke all on function public.set_guild_member_affiliation(text,uuid,uuid,text) from public;
grant execute on function public.set_guild_member_affiliation(text,uuid,uuid,text) to authenticated;
-- Synthetic fixture data only.
insert into public.guild_members(user_id,character_name,game_class,nickname,discord_name,role) values
('10000000-0000-4000-8000-000000000001','AstraKnight','Ironclad','Astra','astra#0412','developer'),
('10000000-0000-4000-8000-000000000002','CrimsonVow','Bloodstrom','Vow','crimsonvow','member'),
('10000000-0000-4000-8000-000000000003','MoonCeleste','Celestune','Moon','moon.celeste','member'),
('10000000-0000-4000-8000-000000000004','PinkOracle','Numina','Oracle','pinkoracle','member'),
('10000000-0000-4000-8000-000000000005','DragonHeart','Dragonsvelte','Dragon','dragonheart','member'),
('10000000-0000-4000-8000-000000000006','SilverShield','Ironclad','Silver','silvershield','member');
insert into public.discord_accounts(user_id,discord_user_id,discord_username,discord_global_name,verified,guild_member_verified) values
('10000000-0000-4000-8000-000000000001','900000000000000001','astra#0412','AstraKnight',true,true),
('10000000-0000-4000-8000-000000000002','900000000000000002','crimsonvow','CrimsonVow',true,true),
('10000000-0000-4000-8000-000000000003','900000000000000003','moon.celeste','MoonCeleste',false,false),
('10000000-0000-4000-8000-000000000004','900000000000000004','pinkoracle','PinkOracle',true,true),
('10000000-0000-4000-8000-000000000005','900000000000000005','dragonheart','DragonHeart',false,false),
('10000000-0000-4000-8000-000000000006','900000000000000006','silvershield','SilverShield',true,true);
insert into public.guild_manual_members(id,character_name,game_class,nickname,discord_name,linked_user_id) values
('20000000-0000-4000-8000-000000000001','WindPetal','Sylph','Petal',null,null),
('20000000-0000-4000-8000-000000000002','NightRider','Nightwaker','NR',null,null),
('20000000-0000-4000-8000-000000000003','TechNova','Mystech','Nova',null,null),
('20000000-0000-4000-8000-000000000004','LinkedManual','Ironclad','Linked','linkedmanual','10000000-0000-4000-8000-000000000006');
insert into public.guild_member_affiliations(guild_id,user_id,change_reason)
select g.id,v.user_id,'Synthetic staging fixture' from public.guilds g
join (values ('4AM','10000000-0000-4000-8000-000000000001'::uuid),('4PM','10000000-0000-4000-8000-000000000002'::uuid),('4AM','10000000-0000-4000-8000-000000000004'::uuid)) v(code,user_id) on v.code=g.code;
insert into public.guild_member_affiliations(guild_id,manual_member_id,change_reason)
select g.id,v.manual_id,'Synthetic staging fixture' from public.guilds g
join (values ('4PM','20000000-0000-4000-8000-000000000001'::uuid),('4AM','20000000-0000-4000-8000-000000000003'::uuid)) v(code,manual_id) on v.code=g.code;

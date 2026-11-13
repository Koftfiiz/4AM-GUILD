-- 4AM GUILD Portfolio Categories + Bond Profile
-- Run once in Supabase SQL Editor. Existing portfolio rows and images are preserved.
begin;

alter table public.portfolios
  add column if not exists portfolio_type text not null default 'pvp';

alter table public.portfolios
  drop constraint if exists portfolios_portfolio_type_check;

alter table public.portfolios
  add constraint portfolios_portfolio_type_check
  check (portfolio_type in ('pvp','pve','cultivation_skills'));

-- Existing Build portfolios are retained and assigned to PvP by default.
-- You can change individual portfolios to PvE from their edit form.
update public.portfolios
set portfolio_type = 'pvp'
where portfolio_type is null or portfolio_type not in ('pvp','pve','cultivation_skills');

alter table public.guild_members
  add column if not exists bond_names text[] not null default '{}';

comment on column public.guild_members.bond_names is
  'Names of guild friends whose bond/familiarity with this character reached 3000.';

alter table public.portfolio_images
  add column if not exists section_key text not null default 'stats';

commit;

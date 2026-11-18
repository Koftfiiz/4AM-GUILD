-- Staging-only: align the directory/Command Center with existing Production roles.
create or replace function public.is_portfolio_management()
returns boolean language sql stable security definer set search_path=''
as $$
 select
  (select auth.uid()) = '378b09df-16a0-4d01-8908-2604c2c210a9'::uuid
  or exists(select 1 from public.guild_members gm where gm.user_id=(select auth.uid())
   and gm.active=true and gm.membership_status='active'
   and lower(coalesce(gm.role,'')) in ('developer','leader','management'));
$$;
revoke all on function public.is_portfolio_management() from public,anon;
grant execute on function public.is_portfolio_management() to authenticated;

create or replace function public.is_portfolio_reviewer()
returns boolean language sql stable security definer set search_path=''
as $$
 select
  (select auth.uid()) = '378b09df-16a0-4d01-8908-2604c2c210a9'::uuid
  or exists(select 1 from public.guild_members gm where gm.user_id=(select auth.uid())
   and gm.active=true and gm.membership_status='active'
   and gm.role in ('developer','leader','management'));
$$;
revoke all on function public.is_portfolio_reviewer() from public,anon;
grant execute on function public.is_portfolio_reviewer() to authenticated;

create or replace function public.is_guild_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select public.is_portfolio_management(); $$;
revoke all on function public.is_guild_admin() from public,anon;
grant execute on function public.is_guild_admin() to authenticated;

create or replace function public.can_manage_guild_affiliations()
returns boolean language sql stable security definer set search_path=''
as $ select public.is_portfolio_management(); $;
revoke all on function public.can_manage_guild_affiliations() from public,anon;
grant execute on function public.can_manage_guild_affiliations() to authenticated;

drop policy if exists "Members can view own guild affiliation" on public.guild_member_affiliations;
create policy "Members can view own guild affiliation" on public.guild_member_affiliations
for select to authenticated using (
 user_id=(select auth.uid())
 or exists(select 1 from public.guild_manual_members mm
  where mm.id=guild_member_affiliations.manual_member_id and mm.linked_user_id=(select auth.uid()))
 or public.can_manage_guild_affiliations()
);
drop policy if exists "Leaders, Management, and Developers can manage member affiliations" on public.guild_member_affiliations;
create policy "Leaders, Management, and Developers can manage member affiliations"
on public.guild_member_affiliations for all to authenticated
using (public.can_manage_guild_affiliations())
with check (public.can_manage_guild_affiliations());

-- Replace the RPC role check so assignment matches the UI's Developer/Leader/Management rule.
create or replace function public.set_guild_member_affiliation(
 p_guild_code text,p_user_id uuid default null,p_manual_member_id uuid default null,p_reason text default null
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_guild_id uuid; v_current_guild_id uuid; v_new_id uuid;
v_started_at timestamptz:=clock_timestamp(); v_manual_linked_user uuid;
begin
 if (p_user_id is null)=(p_manual_member_id is null) then raise exception 'Provide exactly one member identity'; end if;
 if (select auth.uid()) is null or not public.can_manage_guild_affiliations() then raise exception 'Not authorized to change guild affiliation'; end if;
 select id into v_guild_id from public.guilds where code=p_guild_code and is_active=true;
 if v_guild_id is null then raise exception 'Unknown or inactive guild'; end if;
 perform public.snapshot_due_patch_rosters();
 if p_user_id is not null then
  if not exists(select 1 from public.guild_members where user_id=p_user_id and active=true and membership_status='active') then raise exception 'Registered member not found or inactive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,4104));
  select guild_id into v_current_guild_id from public.guild_member_affiliations where user_id=p_user_id and ended_at is null for update;
  if v_current_guild_id=v_guild_id then select id into v_new_id from public.guild_member_affiliations where user_id=p_user_id and ended_at is null; return v_new_id; end if;
  update public.guild_member_affiliations set ended_at=v_started_at where user_id=p_user_id and ended_at is null;
  insert into public.guild_member_affiliations(guild_id,user_id,started_at,change_reason,created_by)
  values(v_guild_id,p_user_id,v_started_at,nullif(trim(p_reason),''),(select auth.uid())) returning id into v_new_id;
 else
  perform pg_advisory_xact_lock(hashtextextended(p_manual_member_id::text,4104));
  select linked_user_id into v_manual_linked_user from public.guild_manual_members where id=p_manual_member_id and active=true for update;
  if not found then raise exception 'Manual member not found or inactive'; end if;
  if v_manual_linked_user is not null then raise exception 'This manual record is linked to a registered account; use canonical user_id'; end if;
  select guild_id into v_current_guild_id from public.guild_member_affiliations where manual_member_id=p_manual_member_id and ended_at is null for update;
  if v_current_guild_id=v_guild_id then select id into v_new_id from public.guild_member_affiliations where manual_member_id=p_manual_member_id and ended_at is null; return v_new_id; end if;
  update public.guild_member_affiliations set ended_at=v_started_at where manual_member_id=p_manual_member_id and ended_at is null;
  insert into public.guild_member_affiliations(guild_id,manual_member_id,started_at,change_reason,created_by)
  values(v_guild_id,p_manual_member_id,v_started_at,nullif(trim(p_reason),''),(select auth.uid())) returning id into v_new_id;
 end if;
 return v_new_id;
end; $$;
revoke all on function public.set_guild_member_affiliation(text,uuid,uuid,text) from public,anon;
grant execute on function public.set_guild_member_affiliation(text,uuid,uuid,text) to authenticated;

create or replace function public.set_patch_submission_review(p_submission_id uuid,p_status text,p_review_note text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_review_id uuid;
begin
 if (select auth.uid()) is null or not public.is_portfolio_reviewer() then raise exception 'Not authorized to review Patch submissions'; end if;
 if p_status not in ('pending','reviewing','approved','revision_required') then raise exception 'Invalid review status'; end if;
 if p_status='revision_required' and nullif(trim(p_review_note),'') is null then raise exception 'A revision note is required'; end if;
 update public.portfolio_patch_submission_reviews
 set status=p_status,review_note=case when p_status='revision_required' then trim(p_review_note) else null end,
  reviewer_user_id=(select auth.uid()),reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
 where submission_id=p_submission_id returning id into v_review_id;
 if not found then raise exception 'Patch submission review record not found'; end if;
 return v_review_id;
end; $$;
revoke all on function public.set_patch_submission_review(uuid,text,text) from public,anon;
grant execute on function public.set_patch_submission_review(uuid,text,text) to authenticated;

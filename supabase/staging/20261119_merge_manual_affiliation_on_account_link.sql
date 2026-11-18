-- Staging-only identity merge: when a Manual row is linked to a website account,
-- transfer its affiliation history to the canonical user_id and prevent duplicate identity rows.
create or replace function public.merge_manual_affiliation_into_account()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_now timestamptz:=clock_timestamp(); v_user_has_current boolean;
begin
 if new.linked_user_id is null or old.linked_user_id is not null or new.linked_user_id is not distinct from old.linked_user_id then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.linked_user_id::text,4104));
 perform pg_advisory_xact_lock(hashtextextended(new.id::text,4104));
 select exists(select 1 from public.guild_member_affiliations where user_id=new.linked_user_id and ended_at is null) into v_user_has_current;
 if v_user_has_current then
  -- The registered account's current affiliation is canonical if both identities already have one.
  update public.guild_member_affiliations set ended_at=v_now where manual_member_id=new.id and ended_at is null;
 end if;
 update public.guild_member_affiliations set user_id=new.linked_user_id,manual_member_id=null where manual_member_id=new.id;
 return new;
end; $$;
revoke all on function public.merge_manual_affiliation_into_account() from public,anon,authenticated;
drop trigger if exists guild_manual_member_merge_affiliation on public.guild_manual_members;
create trigger guild_manual_member_merge_affiliation after update of linked_user_id on public.guild_manual_members
for each row when (old.linked_user_id is null and new.linked_user_id is not null)
execute function public.merge_manual_affiliation_into_account();

-- Staging-only: protected Patch lifecycle writes. API clients retain SELECT only on round tables.
create or replace function public.create_portfolio_patch_round(p_round_name text,p_starts_at timestamptz,p_closes_at timestamptz)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null or not public.can_manage_guild_affiliations() then raise exception 'Management access required'; end if;
 if nullif(trim(p_round_name),'') is null or length(trim(p_round_name))>120 then raise exception 'Patch name must be 1–120 characters'; end if;
 if p_starts_at is null or p_closes_at is null or p_closes_at<=p_starts_at then raise exception 'Invalid Patch date range'; end if;
 insert into public.portfolio_update_rounds(round_name,starts_at,closes_at,status,created_by)
 values(trim(p_round_name),p_starts_at,p_closes_at,'open',(select auth.uid())) returning id into v_id;
 if p_starts_at <= clock_timestamp() then perform public.snapshot_due_patch_rosters(); end if;
 return v_id;
end; $$;
revoke all on function public.create_portfolio_patch_round(text,timestamptz,timestamptz) from public,anon;
grant execute on function public.create_portfolio_patch_round(text,timestamptz,timestamptz) to authenticated;

create or replace function public.update_portfolio_patch_round(p_round_id uuid,p_action text)
returns uuid language plpgsql security definer set search_path=''
as $$
begin
 if (select auth.uid()) is null or not public.can_manage_guild_affiliations() then raise exception 'Management access required'; end if;
 if p_action not in ('open','close','archive','restore') then raise exception 'Invalid Patch action'; end if;
 perform public.snapshot_due_patch_rosters();
 update public.portfolio_update_rounds
 set status=case when p_action='open' then 'open' when p_action='close' then 'closed' else status end,
  archived_at=case when p_action='archive' then clock_timestamp() when p_action='restore' then null else archived_at end,
  archived_by=case when p_action='archive' then (select auth.uid()) when p_action='restore' then null else archived_by end,
  updated_at=clock_timestamp()
 where id=p_round_id returning id into p_round_id;
 if not found then raise exception 'Patch round not found'; end if;
 return p_round_id;
end; $$;
revoke all on function public.update_portfolio_patch_round(uuid,text) from public,anon;
grant execute on function public.update_portfolio_patch_round(uuid,text) to authenticated;

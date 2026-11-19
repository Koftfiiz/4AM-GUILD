-- Staging follow-up: reject NULL Patch review statuses before UPDATE.
create or replace function public.set_patch_submission_review(p_submission_id uuid,p_status text,p_review_note text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_review_id uuid;
begin
 if (select auth.uid()) is null or not public.can_manage_guild_affiliations() then raise exception 'Not authorized to review Patch submissions'; end if;
 if p_status is null or p_status not in ('pending','reviewing','approved','revision_required') then raise exception 'Invalid review status'; end if;
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

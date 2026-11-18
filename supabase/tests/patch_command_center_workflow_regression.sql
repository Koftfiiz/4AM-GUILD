-- Staging-only transactional regression suite.
-- Requires the synthetic fixtures from supabase/staging/ and canonical migrations.
-- Every scenario is rolled back; do not run against Production.

-- 1) Directory canonical identity, filtering, pagination bounds, and null validation.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare d jsonb; blocked boolean:=false;
begin
 d:=public.get_guild_member_directory(null,'all','all','all',1000,0);
 if jsonb_array_length(d->'items')<>8 then
  raise exception 'Expected 8 canonical directory rows, got %',jsonb_array_length(d->'items');
 end if;
 if (d->'counts'->>'account')::int<>7 or (d->'counts'->>'manual')::int<>1 then
  raise exception 'Linked Manual rows were duplicated or directory counts are incorrect';
 end if;
 if (d->>'limit')::int<>100 then raise exception 'Directory page size was not clamped to 100'; end if;
 d:=public.get_guild_member_directory(null,'4AM','all','account',50,0);
 if (d->'counts'->>'4AM')::int<>3 then raise exception 'Expected 3 current 4AM accounts'; end if;
 begin
  perform public.get_guild_member_directory(null,null,'all','all',50,0);
 exception when others then
  if sqlerrm like '%Invalid guild filter%' then blocked:=true; else raise; end if;
 end;
 if not blocked then raise exception 'Null guild filter was accepted'; end if;
end $$;
rollback;

-- 2) Empty Patch state, stable bounded queue pagination, and immutable opening roster.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare rid uuid; d jsonb; p1 jsonb; p2 jsonb; n int;
begin
 rid:=public.create_portfolio_patch_round('QA empty-state round',now()+interval '1 day',now()+interval '3 days');
 d:=public.get_patch_command_center(rid,null,'all',50,0);
 if jsonb_array_length(d->'members')<>0 or jsonb_array_length(d->'review_queue')<>0 then
  raise exception 'Empty Patch should return empty member and review arrays';
 end if;
 if (d->'summary'->>'roster_count')::int<>0 then raise exception 'Empty Patch summary should be zero'; end if;
 p1:=public.get_patch_command_center('b58f481c-44b5-451d-b55e-6d270429ebbe',null,'all',1,0);
 p2:=public.get_patch_command_center('b58f481c-44b5-451d-b55e-6d270429ebbe',null,'all',1,1);
 if jsonb_array_length(p1->'review_queue')<>1 or jsonb_array_length(p2->'review_queue')<>1 then
  raise exception 'Review queue page size is not bounded as expected';
 end if;
 if p1->'review_queue'->0->>'submission_id'=p2->'review_queue'->0->>'submission_id' then
  raise exception 'Review queue pages overlap';
 end if;
 if not exists(select 1 from public.portfolio_patch_roster
   where round_id='b58f481c-44b5-451d-b55e-6d270429ebbe'
    and member_id='10000000-0000-4000-8000-000000000001') then
  raise exception 'Opening roster fixture is missing';
 end if;
 perform public.set_guild_member_affiliation('4PM','10000000-0000-4000-8000-000000000001',null,'QA immutable roster');
 select count(*) into n from public.portfolio_patch_roster
  where round_id='b58f481c-44b5-451d-b55e-6d270429ebbe'
   and member_id='10000000-0000-4000-8000-000000000001';
 if n<>1 then raise exception 'Leaving 4AM removed the immutable opening roster row'; end if;
end $$;
rollback;

-- 3) A member with their own Portfolio but no 4AM snapshot cannot submit.
begin;
insert into public.portfolios(id,member_id,title,game_class,portfolio_type)
values('f2222222-2222-4222-8222-222222222223','10000000-0000-4000-8000-000000000003','QA out of roster','Ironclad','pvp')
on conflict(id) do nothing;
insert into public.portfolio_versions(id,portfolio_id,version_number,version_name,title,game_class,portfolio_type)
values('f3333333-3333-4333-8333-333333333334','f2222222-2222-4222-8222-222222222223',1,'QA Version','QA','Ironclad','pvp')
on conflict(id) do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$
declare blocked boolean:=false;
begin
 begin
  perform public.submit_portfolio_patch('b58f481c-44b5-451d-b55e-6d270429ebbe',
   'f2222222-2222-4222-8222-222222222223','f3333333-3333-4333-8333-333333333334');
 exception when others then
  if sqlerrm like '%not included in this 4AM Patch roster%' then blocked:=true; else raise; end if;
 end;
 if not blocked then raise exception 'Out-of-roster owner was not blocked'; end if;
end $$;
rollback;

-- 4) Cross-owner submissions are rejected even when the caller is roster-eligible.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare blocked boolean:=false;
begin
 begin
  perform public.submit_portfolio_patch('b58f481c-44b5-451d-b55e-6d270429ebbe',
   '44576645-a322-4495-b50e-bddea7725246','16b20cb6-e5ca-4d1d-b6b0-59ccd5b6540c');
 exception when others then
  if sqlerrm like '%only your own Portfolio folder%' then blocked:=true; else raise; end if;
 end;
 if not blocked then raise exception 'Cross-owner Portfolio submission was not blocked'; end if;
end $$;
rollback;

-- 5) Resubmitting a different Version creates an immutable event and resets review to pending.
begin;
insert into public.portfolio_versions(id,portfolio_id,version_number,version_name,title,game_class,portfolio_type)
values('f1111111-1111-4111-8111-111111111111','843eb21a-49d2-4a6c-bd18-8532dab1ef53',2,
 'Version 2 QA','Astra PvP Build','Ironclad','pvp')
on conflict(id) do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare result jsonb; n int;
begin
 result:=public.submit_portfolio_patch('b58f481c-44b5-451d-b55e-6d270429ebbe',
  '843eb21a-49d2-4a6c-bd18-8532dab1ef53','f1111111-1111-4111-8111-111111111111');
 select count(*) into n from public.portfolio_patch_submission_events
 where submission_id=(result->>'submission_id')::uuid and event_type='resubmitted'
  and previous_version_id='3d6c7a6c-79a7-42b4-ab74-16508091ad47'
  and new_version_id='f1111111-1111-4111-8111-111111111111';
 if n<>1 then raise exception 'Resubmission Version audit event is missing'; end if;
 if not exists(select 1 from public.portfolio_patch_submission_reviews
  where submission_id=(result->>'submission_id')::uuid and status='pending') then
  raise exception 'Resubmission did not reset review status to pending';
 end if;
end $$;
rollback;

-- 6) Reviewer transitions require a note for revision and are not available to members.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
do $$
declare sid uuid:='3b2cd85f-e3f2-4469-90d1-20a9b39aaee9'; v_status text; n int; blocked boolean:=false;
begin
 begin
  perform public.set_patch_submission_review(sid,'revision_required',null);
 exception when others then
  if sqlerrm like '%revision note is required%' then blocked:=true; else raise; end if;
 end;
 if not blocked then raise exception 'Revision without a note was accepted'; end if;
 perform public.set_patch_submission_review(sid,'revision_required','QA: update the equipment image');
 perform public.set_patch_submission_review(sid,'approved',null);
 select count(*) into n from public.portfolio_patch_review_events
  where submission_id=sid and new_status in ('revision_required','approved');
 if n<2 then raise exception 'Review audit transitions were not recorded'; end if;
 select status into v_status from public.portfolio_patch_submission_reviews where submission_id=sid;
 if v_status<>'approved' then raise exception 'Review did not reach approved'; end if;
 blocked:=false;
 begin
  perform public.set_patch_submission_review(sid,null,null);
 exception when others then
  if sqlerrm like '%Invalid review status%' then blocked:=true; else raise; end if;
 end;
 if not blocked then raise exception 'Null review status was accepted'; end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$
declare blocked boolean:=false;
begin
 begin
  perform public.set_patch_submission_review('3b2cd85f-e3f2-4469-90d1-20a9b39aaee9','approved',null);
 exception when others then
  if sqlerrm like '%Not authorized to review Patch submissions%' then blocked:=true; else raise; end if;
 end;
 if not blocked then raise exception 'Normal member was able to review a Patch submission'; end if;
end $$;
rollback;

-- 7) Management can link a Manual 4AM member after snapshot; canonical identity is added once.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
perform public.set_guild_member_affiliation('4AM',null,'20000000-0000-4000-8000-000000000002','QA manual-to-account transfer');
update public.guild_manual_members set linked_user_id='10000000-0000-4000-8000-000000000006'
 where id='20000000-0000-4000-8000-000000000002';
do $$
declare n int; m int;
begin
 select count(*) into n from public.guild_member_affiliations
 where user_id='10000000-0000-4000-8000-000000000006' and manual_member_id is null and ended_at is null;
 if n<>1 then raise exception 'Manual affiliation did not merge to canonical account'; end if;
 select count(*) into m from public.portfolio_patch_roster
 where round_id='b58f481c-44b5-451d-b55e-6d270429ebbe'
  and member_id='10000000-0000-4000-8000-000000000006' and roster_source='manual_link';
 if m<>1 then raise exception 'Linked Manual 4AM account was not added to the active Patch roster'; end if;
end $$;
rollback;

-- 8) Management may edit Manual directory records, but only Developer may write Discord accounts.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
do $$
declare n int;
begin
 update public.guild_manual_members set active=active where id='20000000-0000-4000-8000-000000000002';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Management cannot update Manual directory'; end if;
 update public.discord_accounts set verified=verified where user_id='10000000-0000-4000-8000-000000000001';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Management modified Developer-only Discord data'; end if;
end $$;
rollback;

-- 9) Member can update own profile but cannot edit another member or read their history.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
perform public.set_guild_member_affiliation('4PM','10000000-0000-4000-8000-000000000001',null,'QA history privacy');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$
declare n int;
begin
 update public.guild_members set nickname=nickname where user_id='10000000-0000-4000-8000-000000000002';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Member cannot update own profile'; end if;
 update public.guild_members set nickname=nickname where user_id='10000000-0000-4000-8000-000000000001';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Member modified another profile'; end if;
 select count(*) into n from public.guild_member_affiliations
  where user_id='10000000-0000-4000-8000-000000000001' and ended_at is not null;
 if n<>0 then raise exception 'Member can read another member affiliation history'; end if;
end $$;
rollback;

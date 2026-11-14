-- Query name: 4AM_21_Fix_Game_UID_12_Digits
-- Purpose: Allow numeric character UIDs from 1 to 12 digits in guild_members.
-- Safe for existing NULL and numeric UID values; does not alter existing UID data.

begin;

alter table public.guild_members
  drop constraint if exists guild_members_game_uid_format;

alter table public.guild_members
  add constraint guild_members_game_uid_format
  check (
    game_uid is null
    or game_uid ~ '^[0-9]{1,12}$'
  );

commit;

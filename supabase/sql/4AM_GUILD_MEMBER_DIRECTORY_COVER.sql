-- 4AM GUILD: Member directory cover image
-- Independent from Portfolio build images.
alter table public.guild_members
  add column if not exists member_cover_url text,
  add column if not exists member_cover_crop_settings jsonb;

comment on column public.guild_members.member_cover_url is
  'Storage path for the member-owned 16:9 cover shown on the Portfolio member directory card.';
comment on column public.guild_members.member_cover_crop_settings is
  'Cropper.js crop metadata for the member directory cover image.';

-- 4AM GUILD Portfolio Cover Editor
-- Run once in Supabase SQL Editor before saving new/updated portfolios.
alter table public.portfolio_images
  add column if not exists cover_image_url text,
  add column if not exists crop_settings jsonb;
comment on column public.portfolio_images.image_url is 'Original uploaded image path; never overwritten by cover cropping.';
comment on column public.portfolio_images.cover_image_url is 'Separate optimized 16:9 WebP cover image path in portfolio-images bucket.';
comment on column public.portfolio_images.crop_settings is 'Cropper.js crop coordinates used to reproduce or adjust the cover crop.';
-- Existing rows remain readable: the app falls back to image_url when cover_image_url is null.

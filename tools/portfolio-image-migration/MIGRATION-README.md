# Portfolio image WebP migration

This migration is intentionally scoped to the 47 objects approved by the read-only Dry Run workflow run `44321402557`.

## Safety scope

- Bucket: `portfolio-images`.
- Only the 47 exact source paths in `approved-manifest.json` are eligible.
- Each source must still be referenced by `portfolio_images` or `portfolio_version_images`.
- Each source must still match its Dry Run byte size.
- Each destination `.webp` object must not already exist.
- Each output must be at least 5% smaller than its source.
- New objects are uploaded with `upsert: false` and `contentType: image/webp`.
- Database URLs are changed only after all 47 WebP uploads have succeeded.
- Updates use the previous URL as a compare-and-set guard. If a database update fails, already changed URL fields are rolled back where possible.
- Original files are never overwritten or deleted.
- The missing source object identified by Dry Run is not in the manifest and is not changed.

## Run

1. Open GitHub Actions in the `Koftfiiz/4AM-GUILD` repository.
2. Select **Portfolio image WebP — Migration** and choose **Run workflow**.
3. Enter `MIGRATE-47` in the confirmation field and keep target count at `47`.
4. Confirm the run. The workflow uses the existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` repository secrets.
5. Inspect the `portfolio-webp-migration-report` artifact and confirm the job concludes successfully.

The workflow is manual-only; it is not triggered by pushes. The migration downloads approximately 178.42 MiB of original images from Supabase Storage. It does not download the WebP outputs again for verification; it checks Storage listing metadata after each successful upload.

## Recovery notes

If upload fails before database updates begin, database URLs remain unchanged; some newly uploaded WebP files may remain unused. If a database update fails, the script attempts to restore URL fields changed by that run. In either case, original files remain intact. Do not rerun blindly if any destination WebP objects already exist; inspect the report and Storage first.

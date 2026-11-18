# Portfolio WebP migration — Dry Run only

This tool is intentionally read-only with respect to Supabase.

- Reads image references from `portfolio_images` and `portfolio_version_images`.
- Lists objects in the `portfolio-images` bucket.
- Downloads referenced images >= 3 MiB into the GitHub runner's memory.
- Measures WebP output using Sharp.
- Writes a JSON report as a GitHub Actions artifact.

It does **not** call Storage upload, update, remove, or any database write operation.
It does not change application code or image URLs.

## Required GitHub Actions secrets

Add these repository secrets under Settings → Secrets and variables → Actions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Never place the service-role key in repository files, workflow YAML, issues, or chat.

## Run

Open Actions → Portfolio image WebP — Dry Run → Run workflow.

The workflow is manual-only. Review the generated `portfolio-webp-dry-run-report` artifact.

The report estimates conversion size, not guaranteed future egress savings. Downloading source images for this test itself consumes Storage egress. No upload or production URL change is part of this workflow.

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const REQUIRED_CONFIRMATION = "MIGRATE-47";
const TARGET_COUNT = 47;
const BUCKET = "portfolio-images";
const PAGE_SIZE = 100;
const report = { mode: "MIGRATION", startedAt: new Date().toISOString(), bucket: BUCKET, uploaded: [], updatedRows: [], errors: [], rollbackErrors: [] };

function assert(condition, message) { if (!condition) throw new Error(message); }

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && key, "Missing Supabase secrets.");
assert(process.env.CONFIRM_MIGRATION === REQUIRED_CONFIRMATION, "Safety stop: confirmation input must equal MIGRATE-47.");
assert(Number(process.env.TARGET_COUNT) === TARGET_COUNT, "Safety stop: TARGET_COUNT must equal 47.");

const manifest = JSON.parse(await readFile(new URL("./approved-manifest.json", import.meta.url), "utf8"));
assert(manifest.bucket === BUCKET && manifest.files.length === TARGET_COUNT, "Manifest does not match the approved 47-file scope.");
const unique = new Set(manifest.files.map((f) => f.path));
assert(unique.size === TARGET_COUNT, "Manifest contains duplicate paths.");
for (const f of manifest.files) {
  assert(f.path.endsWith(".png") && Number.isInteger(f.originalBytes) && f.originalBytes > 0, "Invalid manifest entry: " + f.path);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function pathFromUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const marker = "/storage/v1/object/";
  const markerIndex = raw.indexOf(marker);
  let encodedPath;
  if (markerIndex >= 0) {
    const after = raw.slice(markerIndex + marker.length);
    const bucketMarker = BUCKET + "/";
    const bucketIndex = after.indexOf(bucketMarker);
    if (bucketIndex < 0) return null;
    encodedPath = after.slice(bucketIndex + bucketMarker.length).split("?")[0];
  } else {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return null;
    encodedPath = raw.split("?")[0].replace(/^\/+/, "");
    if (encodedPath.startsWith(BUCKET + "/")) encodedPath = encodedPath.slice(BUCKET.length + 1);
  }
  if (!encodedPath || encodedPath.endsWith("/")) return null;
  try {
    const decoded = encodedPath.split("/").map((part) => decodeURIComponent(part)).join("/");
    return decoded && !decoded.split("/").some((part) => part === "." || part === "..") ? decoded : null;
  } catch { return null; }
}

function replacePathInValue(value, oldPath, newPath) {
  if (typeof value !== "string" || !pathFromUrl(value)) return value;
  if (!value.includes(oldPath)) throw new Error("Could not safely replace source path in URL: " + value);
  return value.replace(oldPath, newPath);
}

async function readRows(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select("id,image_url,cover_image_url").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("Database read failed for " + table + ": " + error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function storageObjectExists(path) {
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : "";
  const filename = slash >= 0 ? path.slice(slash + 1) : path;
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 100, search: filename });
  if (error) throw new Error("Storage list failed for " + path + ": " + error.message);
  return (data ?? []).some((item) => item.name === filename && item.id !== null);
}

const tableNames = ["portfolio_images", "portfolio_version_images"];
const rowsByTable = new Map();
for (const table of tableNames) rowsByTable.set(table, await readRows(table));

const referenced = new Set();
for (const rows of rowsByTable.values()) {
  for (const row of rows) {
    for (const field of ["image_url", "cover_image_url"]) {
      const p = pathFromUrl(row[field]);
      if (p) referenced.add(p);
    }
  }
}
for (const f of manifest.files) assert(referenced.has(f.path), "Safety stop: source is no longer referenced: " + f.path);

console.log("Preflight passed: exactly 47 approved sources are still referenced.");
console.log("Expected source download: approximately 178.42 MiB. No other files will be downloaded.");

const prepared = [];
for (let index = 0; index < manifest.files.length; index++) {
  const item = manifest.files[index];
  const destination = item.path.replace(/\.png$/i, ".webp");
  assert(!(await storageObjectExists(destination)), "Safety stop: destination already exists: " + destination);

  const { data: blob, error } = await supabase.storage.from(BUCKET).download(item.path);
  if (error || !blob) throw new Error("Source download failed for " + item.path + ": " + (error?.message ?? "empty response"));
  const input = Buffer.from(await blob.arrayBuffer());
  assert(input.length === item.originalBytes, "Source size changed since Dry Run: " + item.path + " expected " + item.originalBytes + " got " + input.length);

  const image = sharp(input, { limitInputPixels: 100_000_000 });
  const metadata = await image.metadata();
  assert(metadata.format === "png", "Unexpected source format for " + item.path + ": " + metadata.format);

  const output = await sharp(input, { limitInputPixels: 100_000_000 })
    .rotate()
    .webp({ quality: manifest.quality, effort: manifest.effort })
    .toBuffer();
  assert(output.length < input.length * (1 - manifest.minimumSavingPercent / 100), "WebP did not meet the minimum 5% saving guard: " + item.path);

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(destination, output, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false
  });
  if (uploadError) throw new Error("WebP upload failed for " + destination + ": " + uploadError.message);

  const exists = await storageObjectExists(destination);
  assert(exists, "Uploaded WebP could not be confirmed in Storage: " + destination);

  prepared.push({ sourcePath: item.path, destinationPath: destination, sourceBytes: input.length, webpBytes: output.length });
  report.uploaded.push(prepared[prepared.length - 1]);
  console.log("Uploaded " + (index + 1) + "/" + TARGET_COUNT + ": " + destination + " (" + output.length + " bytes)");
}

const changes = [];
for (const table of tableNames) {
  for (const row of rowsByTable.get(table)) {
    for (const field of ["image_url", "cover_image_url"]) {
      const oldValue = row[field];
      const sourcePath = pathFromUrl(oldValue);
      if (!sourcePath) continue;
      const match = prepared.find((item) => item.sourcePath === sourcePath);
      if (!match) continue;
      changes.push({ table, id: row.id, field, oldValue, newValue: replacePathInValue(oldValue, match.sourcePath, match.destinationPath) });
    }
  }
}

const applied = [];
try {
  for (const change of changes) {
    const { data, error } = await supabase.from(change.table)
      .update({ [change.field]: change.newValue })
      .eq("id", change.id)
      .eq(change.field, change.oldValue)
      .select("id");
    if (error) throw new Error("DB update failed (" + change.table + "/" + change.id + "/" + change.field + "): " + error.message);
    if (!data || data.length !== 1) throw new Error("Concurrent change detected; expected exactly one row updated (" + change.table + "/" + change.id + "/" + change.field + ").");
    applied.push(change);
    report.updatedRows.push({ table: change.table, id: change.id, field: change.field, newValue: change.newValue });
  }
} catch (error) {
  report.errors.push(String(error?.message ?? error));
  console.error("Database update failed; rolling back only URL fields changed by this run.");
  for (const change of applied.reverse()) {
    const { data, error: rollbackError } = await supabase.from(change.table)
      .update({ [change.field]: change.oldValue })
      .eq("id", change.id)
      .eq(change.field, change.newValue)
      .select("id");
    if (rollbackError || !data || data.length !== 1) {
      report.rollbackErrors.push({ table: change.table, id: change.id, field: change.field, error: rollbackError?.message ?? "Rollback did not affect exactly one row" });
    }
  }
  report.finishedAt = new Date().toISOString();
  report.status = "FAILED_DB_UPDATE_ROLLBACK_ATTEMPTED";
  await writeFile("portfolio-webp-migration-report.json", JSON.stringify(report, null, 2));
  throw error;
}

for (const table of tableNames) {
  const verifiedRows = await readRows(table);
  for (const row of verifiedRows) {
    for (const field of ["image_url", "cover_image_url"]) {
      const p = pathFromUrl(row[field]);
      assert(!prepared.some((item) => item.sourcePath === p), "Verification failed: old source URL still referenced in " + table + "/" + row.id);
    }
  }
}

report.finishedAt = new Date().toISOString();
report.status = "SUCCESS";
report.counts = {
  sourceFiles: prepared.length,
  uploadedWebpFiles: report.uploaded.length,
  updatedDatabaseFields: report.updatedRows.length,
  originalFilesDeleted: 0
};
report.totals = {
  originalBytes: prepared.reduce((sum, item) => sum + item.sourceBytes, 0),
  webpBytes: prepared.reduce((sum, item) => sum + item.webpBytes, 0),
  savedBytes: prepared.reduce((sum, item) => sum + item.sourceBytes - item.webpBytes, 0)
};
await writeFile("portfolio-webp-migration-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.counts, null, 2));
console.log(JSON.stringify(report.totals, null, 2));
console.log("MIGRATION SUCCESS. Original Storage objects were preserved.");

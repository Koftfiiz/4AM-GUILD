import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "portfolio-images";
const MIN_BYTES = 3 * 1024 * 1024;
const PAGE_SIZE = 100;
const MAX_FILES = 100;
const MAX_DRY_RUN_DOWNLOAD_BYTES = 200 * 1024 * 1024;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY GitHub secret.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function pathFromUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  const rawValue = value.trim();
  const marker = "/storage/v1/object/";
  const markerIndex = rawValue.indexOf(marker);
  let encodedPath;

  if (markerIndex >= 0) {
    // Support public, signed, and authenticated Supabase Storage object URLs.
    const afterMarker = rawValue.slice(markerIndex + marker.length);
    const bucketMarker = BUCKET + "/";
    const bucketIndex = afterMarker.indexOf(bucketMarker);
    if (bucketIndex < 0) return null;
    encodedPath = afterMarker.slice(bucketIndex + bucketMarker.length).split("?")[0];
  } else {
    // Database rows may store the object path directly rather than a full URL.
    // Do not interpret unrelated absolute URLs as Storage paths.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rawValue)) return null;
    encodedPath = rawValue.split("?")[0].replace(/^\/+/, "");
    const bucketPrefix = BUCKET + "/";
    if (encodedPath.startsWith(bucketPrefix)) {
      encodedPath = encodedPath.slice(bucketPrefix.length);
    }
  }

  if (!encodedPath || encodedPath.endsWith("/")) return null;
  try {
    const decodedPath = encodedPath
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
    return decodedPath && !decodedPath.split("/").some((part) => part === "." || part === "..")
      ? decodedPath
      : null;
  } catch {
    return null;
  }
}

async function readReferencedPaths(table) {
  const paths = new Set();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select("image_url,cover_image_url")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("Database read failed for " + table + ": " + error.message);
    for (const row of data ?? []) {
      for (const value of [row.image_url, row.cover_image_url]) {
        const path = pathFromUrl(value);
        if (path) paths.add(path);
      }
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return paths;
}

async function listAllObjects(prefix = "") {
  const found = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error('Storage listing failed at "' + prefix + '": ' + error.message);
    const items = data ?? [];
    for (const item of items) {
      const path = prefix ? prefix + "/" + item.name : item.name;
      if (item.id === null || item.metadata === null) {
        found.push(...await listAllObjects(path));
      } else {
        found.push({
          path,
          size: Number(item.metadata?.size ?? 0),
          contentType: item.metadata?.mimetype ?? null,
        });
      }
    }
    if (items.length < PAGE_SIZE) break;
  }
  return found;
}

const currentRefs = await readReferencedPaths("portfolio_images");
const versionRefs = await readReferencedPaths("portfolio_version_images");
const allRefs = new Set([...currentRefs, ...versionRefs]);

console.log("Current Portfolio paths: " + currentRefs.size);
console.log("Version-history paths: " + versionRefs.size);
console.log("Unique referenced paths: " + allRefs.size);

const objects = await listAllObjects();
const byPath = new Map(objects.map((item) => [item.path, item]));
const missing = [...allRefs].filter((path) => !byPath.has(path));
const candidates = [...allRefs]
  .map((path) => byPath.get(path))
  .filter((item) => item && item.size >= MIN_BYTES)
  .sort((a, b) => b.size - a.size);

if (candidates.length > MAX_FILES) {
  throw new Error("Safety stop: " + candidates.length + " candidates exceeds MAX_FILES=" + MAX_FILES + ". No files were changed.");
}
const plannedDownloadBytes = candidates.reduce((sum, item) => sum + item.size, 0);
if (plannedDownloadBytes > MAX_DRY_RUN_DOWNLOAD_BYTES) {
  throw new Error("Safety stop: dry-run downloads would exceed 200 MiB (" + plannedDownloadBytes + " bytes). No images were downloaded and no files were changed.");
}
console.log("Planned one-time source download for analysis: " + (plannedDownloadBytes / 1024 / 1024).toFixed(2) + " MiB (hard limit 200 MiB).");

const results = [];
for (const item of candidates) {
  const result = {
    path: item.path,
    originalBytes: item.size,
    contentType: item.contentType,
    status: "pending",
  };

  if (!/^image\/(jpeg|png|webp)$/i.test(item.contentType ?? "")) {
    result.status = "skipped-unsupported-type";
    results.push(result);
    continue;
  }

  const { data: blob, error } = await supabase.storage.from(BUCKET).download(item.path);
  if (error || !blob) {
    result.status = "download-error";
    result.error = error?.message ?? "No file returned";
    results.push(result);
    continue;
  }

  try {
    const input = Buffer.from(await blob.arrayBuffer());
    const metadata = await sharp(input, { limitInputPixels: 100_000_000 }).metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
      result.status = "skipped-unsupported-format";
    } else {
      const output = await sharp(input, { limitInputPixels: 100_000_000 })
        .rotate()
        .webp({ quality: 88, effort: 5 })
        .toBuffer();
      result.proposedBytes = output.length;
      result.savingBytes = item.size - output.length;
      result.savingPercent = Number(((1 - output.length / item.size) * 100).toFixed(2));
      result.width = metadata.width ?? null;
      result.height = metadata.height ?? null;
      result.outputFormat = "webp";
      result.status = output.length <= item.size * 0.95 ? "would-convert" : "skip-not-smaller-enough";
    }
  } catch (err) {
    result.status = "conversion-error";
    result.error = String(err?.message ?? err);
  }
  results.push(result);
  console.log(result.status + ": " + item.path);
}

const totalOriginal = results.reduce((sum, item) => sum + (item.originalBytes ?? 0), 0);
const convertible = results.filter((item) => item.status === "would-convert");
const totalProposed = convertible.reduce((sum, item) => sum + (item.proposedBytes ?? 0), 0);
const totalSavings = convertible.reduce((sum, item) => sum + (item.savingBytes ?? 0), 0);

const report = {
  mode: "DRY_RUN_ONLY",
  generatedAt: new Date().toISOString(),
  bucket: BUCKET,
  thresholdBytes: MIN_BYTES,
  plannedDownloadBytes,
  maxDryRunDownloadBytes: MAX_DRY_RUN_DOWNLOAD_BYTES,
  note: "No Storage upload, overwrite, delete, or database update is performed by this script.",
  counts: {
    referencedPaths: allRefs.size,
    missingReferencedObjects: missing.length,
    candidatesAtLeast3MB: candidates.length,
    wouldConvert: convertible.length,
    skipped: results.filter((item) => item.status.startsWith("skip") || item.status.startsWith("skipped")).length,
    errors: results.filter((item) => item.status.endsWith("error")).length,
  },
  totals: {
    candidateOriginalBytes: totalOriginal,
    proposedWebpBytes: totalProposed,
    estimatedSavingsBytes: totalSavings,
    estimatedSavingsPercent: totalOriginal ? Number((totalSavings / totalOriginal * 100).toFixed(2)) : 0,
  },
  missingPaths: missing,
  files: results,
};

await writeFile("portfolio-webp-dry-run-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.counts, null, 2));
console.log(JSON.stringify(report.totals, null, 2));
console.log("DRY RUN COMPLETE. No Storage or database writes were made.");

// Backfill WebP thumbnails for existing uploaded photos.
//
// Idempotent + re-runnable: only touches image rows whose thumb_path IS NULL.
// Downloads each original via the service-role client, generates a ~256px WebP
// with sharp, uploads it beside the original under thumb/, and sets thumb_path.
// Skips PDFs and HEIC (mime not in the image allow-list). Failures (e.g. a
// missing original) are counted and left null so a later run retries them.
//
// Run:  node --env-file=.env.local scripts/backfill-thumbnails.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY from the env file.
// Secrets are never printed.

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error(
    "Missing env. Run with: node --env-file=.env.local scripts/backfill-thumbnails.mjs",
  );
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Only these decode with sharp's bundled libs (HEIC needs extra libs; PDFs n/a).
const THUMB_MIME = ["image/jpeg", "image/png", "image/webp"];

// Same derivation as src/lib/storage/thumbnail.ts:thumbPathFor.
function thumbPathFor(storagePath) {
  const slash = storagePath.lastIndexOf("/");
  const dir = slash >= 0 ? storagePath.slice(0, slash) : "";
  const base = slash >= 0 ? storagePath.slice(slash + 1) : storagePath;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${dir ? dir + "/" : ""}thumb/${stem}.webp`;
}

async function makeThumb(buf) {
  return sharp(buf)
    .rotate()
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 60 })
    .toBuffer();
}

const TABLES = [
  {
    table: "load_documents",
    bucket: "load-documents",
    pathCol: "storage_path",
    mimeCol: "mime_type",
  },
  {
    table: "maintenance_attachments",
    bucket: "maintenance-receipts",
    pathCol: "file_path",
    mimeCol: "content_type",
  },
];

async function fetchCandidates(cfg) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from(cfg.table)
      .select(`id, ${cfg.pathCol}, ${cfg.mimeCol}`)
      .is("thumb_path", null)
      .in(cfg.mimeCol, THUMB_MIME)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${cfg.table} fetch: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

async function processTable(cfg) {
  const rows = await fetchCandidates(cfg);
  console.log(`\n[${cfg.table}] ${rows.length} image row(s) need a thumbnail`);
  let done = 0;
  let failed = 0;
  for (const row of rows) {
    const path = row[cfg.pathCol];
    try {
      const { data: blob, error: dErr } = await sb.storage
        .from(cfg.bucket)
        .download(path);
      if (dErr || !blob) throw new Error(`download: ${dErr?.message ?? "no data"}`);
      const buf = Buffer.from(await blob.arrayBuffer());
      const thumb = await makeThumb(buf);
      const tp = thumbPathFor(path);
      const { error: uErr } = await sb.storage
        .from(cfg.bucket)
        .upload(tp, thumb, { contentType: "image/webp", upsert: true });
      if (uErr) throw new Error(`upload: ${uErr.message}`);
      const { error: updErr } = await sb
        .from(cfg.table)
        .update({ thumb_path: tp })
        .eq("id", row.id);
      if (updErr) throw new Error(`update: ${updErr.message}`);
      done++;
    } catch (e) {
      failed++;
      console.warn(`  ! ${cfg.table} ${row.id}: ${e.message}`);
    }
  }
  console.log(`[${cfg.table}] done=${done} failed=${failed}`);
  return { table: cfg.table, total: rows.length, done, failed };
}

const results = [];
for (const cfg of TABLES) {
  // eslint-disable-next-line no-await-in-loop
  results.push(await processTable(cfg));
}

console.log("\n=== Backfill summary ===");
for (const r of results) {
  console.log(
    `${r.table}: processed ${r.done}/${r.total} (failed ${r.failed})`,
  );
}
process.exit(0);

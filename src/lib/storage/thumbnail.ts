import sharp from "sharp";

/**
 * Server-only image-thumbnail helper. Imported ONLY from "use server" upload
 * actions. `sharp` is a native module (auto-externalized by Next.js); importing
 * it into client code fails the build, which keeps this module server-side.
 *
 * Free-plan image shrinking: Supabase Image Transformations aren't available,
 * so we generate a small WebP thumbnail at upload time and serve that into the
 * grid tiles instead of the multi-MB original.
 */

// Image types sharp decodes here. PDFs and HEIC are intentionally excluded —
// HEIC needs extra native libs sharp doesn't bundle — so those get no thumb
// (thumb_path stays null and the grid falls back to the original).
export const THUMBNAILABLE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const THUMB_MAX_DIM = 256;

/**
 * Derive the thumbnail object path from an original storage path, keeping it
 * beside the original under a `thumb/` segment with a `.webp` extension:
 *   "loadId/abc-photo.jpg"        -> "loadId/thumb/abc-photo.webp"
 *   "maintenance/x/abc-rcpt.png"  -> "maintenance/x/thumb/abc-rcpt.webp"
 */
export function thumbPathFor(storagePath: string): string {
  const slash = storagePath.lastIndexOf("/");
  const dir = slash >= 0 ? storagePath.slice(0, slash) : "";
  const base = slash >= 0 ? storagePath.slice(slash + 1) : storagePath;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${dir ? dir + "/" : ""}thumb/${stem}.webp`;
}

/**
 * Resize an image to a <=256px WebP thumbnail. Returns null on ANY failure so
 * the caller keeps the original and leaves thumb_path null (graceful
 * fallback). `.rotate()` honors EXIF orientation from phone cameras.
 */
export async function makeThumbnail(
  bytes: Uint8Array,
): Promise<Uint8Array | null> {
  try {
    const out = await sharp(bytes)
      .rotate()
      .resize(THUMB_MAX_DIM, THUMB_MAX_DIM, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 60 })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Upload a file's bytes DIRECTLY to Supabase storage from the browser, using a
 * signed upload URL token minted by a server action. This bypasses the Next.js
 * Server Action / Vercel function request-body limits (~1–4.5 MB), which phone
 * photos (3–12 MB) blow past — that was the real cause of the upload failures.
 *
 * Signed upload URLs authorize the write via the token, so this works against
 * PRIVATE buckets with no public policy (verified end-to-end).
 */
export async function uploadFileToSignedUrl(
  bucket: string,
  path: string,
  token: string,
  file: File,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.storage
      .from(bucket)
      .uploadToSignedUrl(path, token, file, { contentType: file.type });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Direct upload failed.",
    };
  }
}

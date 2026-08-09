"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Client-side signed-URL access to a stored RC/BOL PDF (bucket
 * "crm-documents", private) — same mechanism as accounts/[id]/BolSection.tsx's
 * view()/download(), just factored out so both document editors and the
 * shipment's Documents history section share one implementation instead of
 * three copies of the same createSignedUrl call.
 */

export const CRM_DOCUMENTS_BUCKET = "crm-documents";

/** Short-lived — a signed URL here is only ever used immediately (opened in
 * a new tab, downloaded, or handed to the PDF viewer), never persisted. */
const SIGNED_URL_TTL_SECONDS = 300;

export async function getSignedPdfUrl(
  storagePath: string,
  downloadFileName?: string,
): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.storage
    .from(CRM_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, downloadFileName ? { download: downloadFileName } : undefined);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Open a stored PDF's signed URL in a new tab — used for "Download" buttons
 * (with a file name, forcing Save As) and plain "Reprint" reopens. */
export async function openStoredPdf(storagePath: string, downloadFileName?: string): Promise<boolean> {
  const url = await getSignedPdfUrl(storagePath, downloadFileName);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

"use client";

/**
 * Force a real download of a signed storage URL, browser-side. A bare
 * `download` attribute on an `<a>` is ignored for a CROSS-ORIGIN url (the
 * storage host is a different origin than the app) — most browsers just
 * navigate to/open it instead of saving. Fetching the bytes into a blob and
 * handing the browser a same-origin object URL is what actually forces the
 * save dialog. Falls back to opening the url in a new tab if the fetch is
 * blocked (e.g. an ad-blocker, or the signed URL already expired).
 *
 * Shared by DocumentPreviewModal.tsx and the Files page's download button —
 * the same technique src/components/ui/DocViewer.tsx (admin's own full-
 * screen viewer) independently established first.
 */
export async function downloadFromUrl(url: string, suggestedName: string, knownMime?: string | null): Promise<void> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("fetch");
    const blob = await resp.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = withExtension(suggestedName, url, knownMime || blob.type);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Best-effort filename for the download — a name derived server-side is
 * usually extension-less ("Rate con — Jul 9"), which would land in
 * Downloads as a file the OS doesn't know how to open. Recover the
 * extension from the storage path, or fall back to the blob's MIME type. */
function withExtension(name: string, url: string, mime: string): string {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  let ext = "";
  try {
    const path = new URL(url).pathname;
    ext = path.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "";
  } catch {
    /* signed URLs are absolute, but never let this break the download */
  }
  if (!ext) {
    if (mime === "application/pdf") ext = "pdf";
    else if (mime.startsWith("image/")) ext = mime.slice(6).split("+")[0];
  }
  return ext ? `${name}.${ext}` : name;
}

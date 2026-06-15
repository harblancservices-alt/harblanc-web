import type { IntakeUploadAdminRow } from "./LoadDetailsCard";

/**
 * AttachmentsList — compact chip row of customer-uploaded intake files.
 *
 * Reuses the existing `IntakeUploadAdminRow` type (server-signed URLs
 * computed by `loadIntakeUploadsForAdmin` in page.tsx) — no new upload
 * logic, no new Supabase storage calls.
 *
 * Compressed visual: each upload is a single clickable pill rather
 * than a stacked row. Type badge + filename + arrow glyph fit on one
 * line; source label, byte-size, and note hide into the `title`
 * attribute so they remain discoverable without consuming vertical
 * space. Returns null when the upload list is empty.
 */

export function AttachmentsList({
  uploads,
}: {
  uploads: ReadonlyArray<IntakeUploadAdminRow>;
}) {
  if (uploads.length === 0) return null;
  return (
    <div className="bg-card px-3 py-2">
      <ul className="flex flex-wrap gap-1.5">
        {uploads.map((u) => {
          const badge = u.mimeType.startsWith("image/") ? "IMG" : "PDF";
          const sourceLabel =
            u.source === "quick_quote" ? "Quick quote" : "Customer intake";
          const sizeText =
            u.sizeBytes > 0 ? " \u00b7 " + formatBytes(u.sizeBytes) : "";
          const tooltip =
            sourceLabel +
            sizeText +
            (u.note ? " \u00b7 " + u.note : "") +
            (u.signedUrl ? "" : " \u00b7 (link unavailable)");
          const Inner = (
            <>
              <span className="rounded-sm border border-line-strong bg-elevated px-1 py-[1px] font-mono text-[8.5px] font-medium uppercase tracking-[0.16em] text-fg-subtle">
                {badge}
              </span>
              <span className="max-w-[180px] truncate text-fg">
                {u.originalFilename}
              </span>
              <span aria-hidden className="text-fg-subtle">
                {"\u2197"}
              </span>
            </>
          );
          return (
            <li key={u.id}>
              {u.signedUrl ? (
                <a
                  href={u.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={"Open " + u.originalFilename + " in a new tab"}
                  title={tooltip}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong/80 bg-panel px-2 py-1 text-[10.5px] no-underline transition-colors hover:border-line-strong hover:bg-card"
                >
                  {Inner}
                </a>
              ) : (
                <span
                  aria-label={"Signed URL unavailable for " + u.originalFilename}
                  title={tooltip}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-card px-2 py-1 text-[10.5px] text-fg-subtle"
                >
                  {Inner}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

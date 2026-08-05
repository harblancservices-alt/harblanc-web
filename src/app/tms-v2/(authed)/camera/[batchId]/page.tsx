import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { getCameraBatch } from "@/lib/data/camera";

export const dynamic = "force-dynamic";

const EXPORT_LINK_CLASS =
  "inline-flex h-8 items-center justify-center rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg hover:bg-elevated";

/**
 * Read-only batch review. Export reuses the existing `/admin/camera`
 * PDF/ZIP route handlers as-is (they share this same session/auth — see
 * v2-architecture.md §7 — and already do exactly this job correctly), so
 * this phase adds zero new export/assembly code. Plain `<a>` tags (not
 * next/link) so the browser handles the Content-Disposition download
 * natively instead of the App Router trying to client-navigate to a
 * binary response.
 */
export default async function CameraBatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const batch = await getCameraBatch(batchId);
  if (!batch) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={batch.name}
        actions={
          <div className="flex items-center gap-2">
            <a href={`/admin/camera/${batch.id}/export/pdf`} className={EXPORT_LINK_CLASS}>
              Export PDF
            </a>
            <a href={`/admin/camera/${batch.id}/export/zip`} className={EXPORT_LINK_CLASS}>
              Export ZIP
            </a>
          </div>
        }
      />

      <div className="flex items-center justify-between">
        <Link href="/tms-v2/camera" className="text-[13px] font-medium text-fg-muted hover:text-fg">
          ← All batches
        </Link>
        <span className="text-[13px] text-fg-muted">
          Captured <DateTimeCST value={batch.createdAt} mode="date" /> · {batch.photos.length} photo
          {batch.photos.length === 1 ? "" : "s"}
        </span>
      </div>

      {batch.photos.length === 0 ? (
        <p className="text-[13px] text-fg-muted">This batch has no photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {batch.photos.map((photo) =>
            photo.url ? (
              <a
                key={photo.id}
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-1.5"
              >
                <div className="aspect-[3/4] overflow-hidden rounded-lg border border-line bg-elevated">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                  />
                </div>
                <span className="text-[12px] font-medium text-fg-muted">{photo.name}</span>
              </a>
            ) : (
              <div key={photo.id} className="flex flex-col gap-1.5">
                <div className="flex aspect-[3/4] items-center justify-center rounded-lg border border-line bg-elevated text-[12px] text-fg-muted">
                  Unavailable
                </div>
                <span className="text-[12px] font-medium text-fg-muted">{photo.name}</span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

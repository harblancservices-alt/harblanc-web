import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Card } from "@/components/tms-v2/ui/Card";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { listCameraBatches } from "@/lib/data/camera";

// Batches/photo counts change whenever a scan is captured on /admin/camera —
// always read fresh.
export const dynamic = "force-dynamic";

export default async function CameraPage() {
  const batches = await listCameraBatches();

  return (
    <PageScroll
      header={
        <PageHeader
          title="Camera"
          description="Scan batches captured in-cab — review photos and export a batch as a PDF or ZIP. Capture happens on /admin/camera; this is the review surface."
        />
      }
    >
      {batches.length === 0 ? (
        <Card>
          <p className="text-[13px] text-fg-muted">
            No scan batches yet. Batches are created from the camera capture
            tool — once one exists, it shows up here with its photos ready to
            review and export.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {batches.map((b) => (
            <Link
              key={b.id}
              href={`/tms-v2/camera/${b.id}`}
              className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-3 shadow-e1 transition-shadow hover:shadow-e2"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-medium text-fg">{b.name}</span>
                <span className="text-[12px] text-fg-muted">
                  <DateTimeCST value={b.createdAt} mode="date" />
                </span>
              </div>
              <span className="rounded-md border border-line-strong bg-elevated px-2 py-0.5 text-[12px] font-medium text-fg-muted">
                {b.photoCount} photo{b.photoCount === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </PageScroll>
  );
}

import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Card } from "@/components/tms-v2/ui/Card";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { listCameraBatches } from "@/lib/data/camera";
import { NewBatchButton, DeleteBatchButton } from "./CameraBatchActions";

// Batches/photo counts change whenever a scan is captured — always read fresh.
export const dynamic = "force-dynamic";

export default async function CameraPage() {
  const batches = await listCameraBatches();

  return (
    <PageScroll
      header={
        <PageHeader
          title="Camera"
          description="Photograph paper BOLs in-cab — place, tap, swap — then export a batch as a PDF or ZIP."
          actions={<NewBatchButton />}
        />
      }
    >
      {batches.length === 0 ? (
        <Card>
          <p className="text-[13px] text-fg-muted">No scan batches yet. Start one to begin photographing documents.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {batches.map((b) => (
            <Link
              key={b.id}
              href={`/tms-v2/camera/${b.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-e1 transition-shadow hover:shadow-e2"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-medium text-fg">{b.name}</span>
                <span className="text-[12px] text-fg-muted">
                  <DateTimeCST value={b.createdAt} mode="date" />
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-md border border-line-strong bg-elevated px-2 py-0.5 text-[12px] font-medium text-fg-muted">
                  {b.photoCount} photo{b.photoCount === 1 ? "" : "s"}
                </span>
                <DeleteBatchButton id={b.id} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageScroll>
  );
}

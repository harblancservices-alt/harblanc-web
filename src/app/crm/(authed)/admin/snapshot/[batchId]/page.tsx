import Link from "next/link";
import { notFound } from "next/navigation";
import { createCrmServerClient } from "@/lib/crm/auth";
import { getBatch, listSnapshots, requireSnapshotAdmin } from "../snapshot-data";
import { Capture } from "./Capture";
import { SnapshotGrid } from "./SnapshotGrid";
import { BatchControls } from "./BatchControls";
import { RefreshFiles } from "./RefreshFiles";

export const dynamic = "force-dynamic";

/**
 * Snapshot → one batch. Capture on top, the file area underneath.
 *
 * The batch id is IN THE URL by design: that is what makes a sitting survive
 * a dropped connection or a locked phone. Reloading returns to the same
 * batch rather than silently starting a nameless new one.
 */
export default async function SnapshotBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { isOwner } = await requireSnapshotAdmin();
  if (!isOwner) notFound();

  const { batchId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const batch = await getBatch(batchId);
  if (!batch) notFound();

  const { rows, total, page: safePage, pageCount } = await listSnapshots(batchId, page);

  // Where numbering resumes. Read separately from the page above, which is
  // sorted for display and paginated — the highest seq in the batch is not
  // necessarily on the page being shown.
  const supabase = await createCrmServerClient();
  const { data: topRow } = await supabase
    .from("crm_snapshots")
    .select("seq")
    .eq("batch_id", batchId)
    .is("deleted_at", null)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  const startSeq = (topRow?.seq as number | undefined) ?? 0;

  const { user } = await requireSnapshotAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="bg-graphite px-4 py-3">
        <Link
          href="/crm/admin/snapshot"
          prefetch={false}
          className="text-[11.5px] font-semibold text-white/60 hover:text-white"
        >
          ← All batches
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[22px] font-extrabold leading-none tracking-[-0.02em] text-white">
            {batch.label}
          </h1>
          <span className="text-[12px] text-white/60">
            <span className="crm-num">{batch.total}</span>{" "}
            {batch.total === 1 ? "photo" : "photos"}
            {batch.parsed > 0 && (
              <>
                {" · "}
                <span className="crm-num">{batch.parsed}</span> parsed
              </>
            )}
            {batch.closedAt && " · closed"}
          </span>
        </div>
      </header>

      <Capture
        batchId={batch.id}
        orgId={user.orgId}
        startSeq={startSeq}
        closed={Boolean(batch.closedAt)}
      />

      <div className="border-b border-line bg-card px-3 py-2.5">
        <BatchControls
          batchId={batch.id}
          closed={Boolean(batch.closedAt)}
          unparsed={batch.total - batch.parsed}
        />
      </div>

      <div className="flex-1">
        <div className="border-b border-line bg-inset px-3 py-2">
          <RefreshFiles count={total} />
        </div>
        <SnapshotGrid
          batchId={batch.id}
          rows={rows}
          total={total}
          page={safePage}
          pageCount={pageCount}
        />
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { listBatches, requireSnapshotAdmin } from "./snapshot-data";
import { StartBatchButton } from "./StartBatchButton";

export const dynamic = "force-dynamic";

/**
 * SNAPSHOT — the batch index.
 *
 * A sitting is a batch, and a batch is what a parsing session is pointed at.
 * An open batch (nothing marked "done shooting") is listed first with a
 * Resume, because the most likely reason anybody lands here is that a phone
 * locked or a signal dropped mid-scan and they want to carry on where they
 * left off — not start again.
 */
export default async function SnapshotIndexPage() {
  const { isOwner } = await requireSnapshotAdmin();
  if (!isOwner) notFound();

  const batches = await listBatches();
  const open = batches.filter((b) => !b.closedAt);
  const done = batches.filter((b) => b.closedAt);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="bg-graphite px-4 py-4">
        <h1 className="text-[24px] font-extrabold leading-none tracking-[-0.02em] text-white">
          Snapshot
        </h1>
        <p className="mt-2 max-w-[62ch] text-[12.5px] text-white/60">
          Photograph bills of lading in bulk. The app captures and stores them — it does not read
          them. A separate session parses a batch afterwards.
        </p>
      </header>

      <div className="border-b border-line-strong bg-card px-4 py-3">
        <StartBatchButton />
      </div>

      <div className="flex-1 p-3">
        {batches.length === 0 ? (
          <div className="rounded-md border border-line bg-card py-14 text-center">
            <p className="text-[14px] font-bold text-fg">No batches yet</p>
            <p className="mx-auto mt-1 max-w-[44ch] text-[12.5px] text-fg-subtle">
              Start a batch, prop the phone over the paperwork, and shoot. Each batch keeps its
              photos together so a parsing session can be handed one sitting at a time.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {open.length > 0 && <BatchGroup title="Open" batches={open} />}
            {done.length > 0 && <BatchGroup title="Done shooting" batches={done} />}
          </div>
        )}
      </div>
    </div>
  );
}

function BatchGroup({
  title,
  batches,
}: {
  title: string;
  batches: Awaited<ReturnType<typeof listBatches>>;
}) {
  return (
    <section>
      <div className="border-b border-line px-1 pb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-fg-muted">
          {title}
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {batches.map((b) => (
          <li key={b.id}>
            <Link
              href={`/crm/admin/snapshot/${b.id}`}
              prefetch={false}
              className="flex items-center gap-3 rounded-md border border-line bg-card px-3 py-2.5 transition-colors hover:border-accent/50 hover:bg-accent-bg"
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-extrabold text-fg">
                  {b.label}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-fg-subtle">
                  <span className="crm-num">{b.total}</span> {b.total === 1 ? "photo" : "photos"}
                  {b.total > 0 && (
                    <>
                      {" · "}
                      <span className="crm-num">{b.total - b.parsed}</span> to parse
                    </>
                  )}
                  {b.note && ` · ${b.note}`}
                </span>
              </div>
              <span className="shrink-0 rounded-md border border-accent/40 px-2.5 py-1 text-[12px] font-bold text-accent">
                {b.closedAt ? "Open" : "Resume"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

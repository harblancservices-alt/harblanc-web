"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteSnapshot } from "../actions";
import type { SnapshotRow } from "../snapshot-data";

/**
 * THE FILE AREA — what is actually in storage, newest first.
 *
 * Separate from the capture bar's filmstrip on purpose. The filmstrip is
 * optimistic and lives in the browser; this is the server's answer. When the
 * two disagree, this one is right, and that is exactly what somebody
 * checking after a bad signal needs.
 *
 * PAGED, NOT VIRTUALISED. Four hundred photos in one DOM would survive; four
 * hundred SIGNED URLs would not — the bucket is private, signing is
 * per-object server work, and asking for four hundred to draw one screen is
 * the obvious way to kill this page. Paging caps that at sixty per request
 * and needs no scroll-position machinery to go wrong.
 */
export function SnapshotGrid({
  batchId,
  rows,
  total,
  page,
  pageCount,
}: {
  batchId: string;
  rows: SnapshotRow[];
  total: number;
  page: number;
  pageCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function remove(row: SnapshotRow) {
    if (!window.confirm(`Delete shot #${row.seq}? The file stays recoverable in storage.`)) return;
    setError(null);
    setBusyId(row.id);
    startTransition(async () => {
      const res = await deleteSnapshot(row.id, batchId);
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  if (total === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[13px] font-bold text-fg">Nothing captured yet</p>
        <p className="mx-auto mt-1 max-w-[40ch] text-[12px] text-fg-subtle">
          Photos appear here as they reach storage. This list is the server&apos;s answer, not the
          strip above — if a shot is here, it is safe.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {error && (
        <p className="rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
          {error}
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
        {rows.map((row) => (
          <figure
            key={row.id}
            className="group relative overflow-hidden rounded-md border border-line bg-card"
          >
            <div className="aspect-[3/4] w-full bg-inset">
              {row.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.url}
                  alt={`Shot ${row.seq}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10.5px] text-fg-subtle">
                  Preview unavailable
                </div>
              )}
            </div>

            <figcaption className="flex items-center justify-between gap-1 border-t border-line px-2 py-1">
              <span className="crm-num text-[11px] font-bold text-fg">#{row.seq}</span>
              {row.parsedAt ? (
                <span className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-ok">
                  parsed
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => remove(row)}
                  disabled={pending && busyId === row.id}
                  className="text-[11px] font-bold text-bad hover:underline disabled:opacity-50"
                >
                  {pending && busyId === row.id ? "…" : "Delete"}
                </button>
              )}
            </figcaption>
          </figure>
        ))}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-[12px] text-fg-muted">
            Page <span className="crm-num">{page}</span> of{" "}
            <span className="crm-num">{pageCount}</span> ·{" "}
            <span className="crm-num">{total}</span> photos
          </span>
          <div className="flex gap-2">
            <PageLink batchId={batchId} to={page - 1} disabled={page <= 1} label="← Newer" />
            <PageLink
              batchId={batchId}
              to={page + 1}
              disabled={page >= pageCount}
              label="Older →"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PageLink({
  batchId,
  to,
  disabled,
  label,
}: {
  batchId: string;
  to: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="cursor-default rounded-md border border-line px-3 py-1.5 text-[12px] font-bold text-fg-subtle opacity-50">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`/crm/admin/snapshot/${batchId}?page=${to}`}
      prefetch={false}
      className="rounded-md border border-accent/40 bg-card px-3 py-1.5 text-[12px] font-bold text-accent hover:bg-accent/10"
    >
      {label}
    </Link>
  );
}

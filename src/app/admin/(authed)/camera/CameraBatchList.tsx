"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import type { BatchSummary } from "@/lib/camera/shared";
import { createCameraBatch, deleteCameraBatch } from "./actions";

/**
 * Camera home — the list of scan batches, plus a "New scan batch" CTA. Each
 * batch is a V2 card (name · date · photo count). Tap opens the capture view;
 * a batch can be deleted (with a confirm) which also removes its stored
 * photos. Resilient to an empty list (tables not migrated → no batches).
 */

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function CameraBatchList({ batches }: { batches: BatchSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function onNew() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await createCameraBatch();
    if (res.ok) {
      router.push(`/admin/camera/${res.id}`);
      return;
    }
    setErr(res.reason);
    setBusy(false);
  }

  async function onDelete(id: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await deleteCameraBatch(id);
    setConfirmId(null);
    if (!res.ok) setErr(res.reason);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <PageHeader
        eyebrow="Records"
        title="Camera"
        actions={
          <Button
            type="button"
            variant="primary-raised"
            onClick={onNew}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Working…" : "+ New scan batch"}
          </Button>
        }
      />

      <p className="mt-3 text-[13px] text-fg-muted">
        Photograph paper BOLs fast — place, tap, swap — then export the batch as
        a PDF or image ZIP to send to your rep.
      </p>

      {err ? (
        <p role="alert" className="mt-3 text-[12px] font-semibold text-bad">
          {err}
        </p>
      ) : null}

      {batches.length === 0 ? (
        <div className="mt-5 rounded-lg border border-line bg-card px-4 py-12 text-center shadow-e1">
          <p className="text-[14px] font-semibold text-fg">No batches yet</p>
          <p className="mt-1 text-[12px] text-fg-muted">
            Start a scan batch to begin photographing documents.
          </p>
          <div className="mt-4 flex justify-center">
            <Button
              type="button"
              variant="primary"
              onClick={onNew}
              disabled={busy}
            >
              + New scan batch
            </Button>
          </div>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {batches.map((b) => (
            <li
              key={b.id}
              className="flex items-stretch overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2 transition-shadow hover:shadow-e3"
            >
              <button
                type="button"
                onClick={() => router.push(`/admin/camera/${b.id}`)}
                className="min-w-0 flex-1 cursor-pointer px-3 py-3 text-left active:bg-inset"
              >
                <div className="truncate text-[15px] font-semibold leading-tight text-fg">
                  {b.name}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-fg shadow-e1">
                    {fmtDate(b.createdAt)}
                  </span>
                  <span className="rounded border border-steel/40 bg-steel-bg px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-steel shadow-e1">
                    {b.photoCount} photo{b.photoCount === 1 ? "" : "s"}
                  </span>
                </div>
              </button>
              <div className="flex items-center border-l border-line px-2">
                {confirmId === b.id ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="destructive-solid"
                      size="sm"
                      onClick={() => onDelete(b.id)}
                      disabled={busy}
                    >
                      Delete
                    </Button>
                    <Button
                      type="button"
                      variant="cancel"
                      size="sm"
                      onClick={() => setConfirmId(null)}
                      disabled={busy}
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmId(b.id)}
                    disabled={busy}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

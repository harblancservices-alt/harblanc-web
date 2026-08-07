"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { createCameraBatch, deleteCameraBatch } from "@/actions/tms-v2/camera";

/** "+ New scan batch" — creates an empty batch then routes straight into
 * its capture view, matching legacy's onNew() (CameraBatchList.tsx). */
export function NewBatchButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onNew() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await createCameraBatch();
    if (res.ok) {
      router.push(`/tms-v2/camera/${res.id}`);
      return;
    }
    setErr(res.reason);
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="primary" size="sm" onClick={onNew} disabled={busy} aria-busy={busy}>
        {busy ? "Working…" : "+ New scan batch"}
      </Button>
      {err ? (
        <p role="alert" className="text-[12px] font-medium text-bad">
          {err}
        </p>
      ) : null}
    </div>
  );
}

/** Row-level delete for a batch — click-to-confirm, no modal (matches the
 * ArchivedApplicationsSection / ContactsSection row-action precedent). */
export function DeleteBatchButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    const res = await deleteCameraBatch(id);
    setBusy(false);
    setConfirming(false);
    if (!res.ok) alert(res.reason);
    router.refresh();
  }

  function onCancel(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
  }

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={onDelete} disabled={busy} className="rounded-md bg-bad px-2 py-1 text-[12px] font-medium text-white disabled:opacity-50">
          {busy ? "…" : "Delete"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-md border border-line-strong px-2 py-1 text-[12px] font-medium text-fg-muted hover:text-fg">
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button type="button" onClick={onDelete} className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-fg-subtle hover:bg-bad-bg hover:text-bad">
      Delete
    </button>
  );
}

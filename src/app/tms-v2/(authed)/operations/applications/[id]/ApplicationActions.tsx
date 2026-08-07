"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { FormError, FormActions } from "../../../loads/_form";
import { softDeleteApplication, restoreApplication, permanentlyDeleteApplication } from "@/actions/tms-v2/applications";
import type { MutationResult } from "@/lib/demo/mutation";

/** Applications detail's contact-card action set — ported from legacy's
 * applications/[id]/page.tsx (Trash when active; Restore + permanently
 * Delete when trashed). Applications are read/contact/decide only — no
 * "convert to lead" action exists in legacy, so none is added here. */
export function ApplicationActions({ id, isTrashed }: { id: string; isTrashed: boolean }) {
  const router = useRouter();
  const [openModal, setOpenModal] = useState<"trash" | "delete" | null>(null);
  const [restoring, setRestoring] = useState(false);
  const close = () => setOpenModal(null);

  async function onRestore() {
    setRestoring(true);
    const result: MutationResult = await restoreApplication(id);
    if (result.ok) {
      router.refresh();
    } else {
      setRestoring(false);
      alert(result.reason);
    }
  }

  if (isTrashed) {
    return (
      <div className="flex items-center gap-2">
        <Button type="button" variant="primary" size="sm" onClick={onRestore} disabled={restoring} aria-busy={restoring}>
          {restoring ? "Restoring…" : "Restore"}
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={() => setOpenModal("delete")}>
          Delete permanently
        </Button>
        <DeleteForeverModal open={openModal === "delete"} onClose={close} id={id} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpenModal("trash")}>
        Trash
      </Button>
      <TrashModal open={openModal === "trash"} onClose={close} id={id} />
    </div>
  );
}

function TrashModal({ open, onClose, id }: { open: boolean; onClose: () => void; id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setError(null);
    const result: MutationResult = await softDeleteApplication(id);
    if (result.ok) {
      router.push("/tms-v2/operations?tab=applications");
      router.refresh();
    } else {
      setPending(false);
      setError(result.reason);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Trash application">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-muted">
          Recoverable for 30 days from the Applications tab&apos;s Archived section, then permanently removed.
        </p>
        <FormError message={error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending} aria-busy={pending}>
            {pending ? "Trashing…" : "Trash application"}
          </Button>
        </FormActions>
      </div>
    </Modal>
  );
}

function DeleteForeverModal({ open, onClose, id }: { open: boolean; onClose: () => void; id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setError(null);
    const result: MutationResult = await permanentlyDeleteApplication(id);
    if (result.ok) {
      router.push("/tms-v2/operations?tab=applications");
      router.refresh();
    } else {
      setPending(false);
      setError(result.reason);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete permanently">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-muted">This cannot be undone — the application record will be permanently removed.</p>
        <FormError message={error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending} aria-busy={pending}>
            {pending ? "Deleting…" : "Delete permanently"}
          </Button>
        </FormActions>
      </div>
    </Modal>
  );
}

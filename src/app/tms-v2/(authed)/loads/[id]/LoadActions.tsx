"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { markLoadDelivered, markLoadTonu, undoLoadTonu, markLoadPaid, markLoadUnpaid, deleteLoad } from "@/actions/tms-v2/loads";
import type { MutationResult } from "@/lib/demo/mutation";
import { Field, FormError, FormActions } from "../_form";
import { LoadFormModal, type LoadFormValues } from "../LoadFormModal";
import { OdometerModal } from "./OdometerModal";

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

type Props = {
  load: LoadFormValues & {
    status: string;
    paymentStatus: "unpaid" | "paid";
    odoAssigned: number | null;
    odoLoaded: number | null;
    odoDelivered: number | null;
  };
  brokerNames: string[];
  activeTripNames: string[];
};

/** Load Detail's write actions — Edit load, Mark delivered, Mark TONU, Edit
 * odometer, Mark paid/unpaid, Delete load. One component so the detail page
 * stays a plain data-fetching Server Component (v2-architecture.md §2's
 * page-shell rule) and every interactive bit lives in this one client
 * island. */
export function LoadActions({ load, brokerNames, activeTripNames }: Props) {
  const router = useRouter();
  const [openModal, setOpenModal] = useState<"edit" | "delivered" | "tonu" | "restore" | "odometer" | "delete" | null>(null);
  const close = () => setOpenModal(null);
  const refresh = () => router.refresh();

  const canMarkDelivered = load.status !== "delivered" && load.status !== "tonu";
  const canMarkTonu = load.status !== "tonu";
  const canRestoreFromTonu = load.status === "tonu";
  const isClosedOut = load.status === "delivered" || load.status === "tonu";

  const [payState, setPayState] = useState<{ pending: boolean; error: string | null }>({ pending: false, error: null });

  async function togglePaid() {
    setPayState({ pending: true, error: null });
    const result: MutationResult = load.paymentStatus === "paid" ? await markLoadUnpaid(load.id) : await markLoadPaid(load.id);
    if (result.ok) {
      setPayState({ pending: false, error: null });
      refresh();
    } else {
      setPayState({ pending: false, error: result.reason });
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpenModal("edit")}>
          Edit load
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpenModal("odometer")}>
          Edit odometer
        </Button>
        {canMarkDelivered ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpenModal("delivered")}>
            Mark delivered
          </Button>
        ) : null}
        {canMarkTonu ? (
          <Button type="button" variant="destructive" size="sm" onClick={() => setOpenModal("tonu")}>
            Mark TONU
          </Button>
        ) : null}
        {canRestoreFromTonu ? (
          <Button type="button" variant="primary" size="sm" onClick={() => setOpenModal("restore")}>
            Restore load
          </Button>
        ) : null}
        {isClosedOut ? (
          <Button
            type="button"
            variant={load.paymentStatus === "paid" ? "secondary" : "primary"}
            size="sm"
            onClick={togglePaid}
            disabled={payState.pending}
            aria-busy={payState.pending}
          >
            {payState.pending ? "Saving…" : load.paymentStatus === "paid" ? "Undo mark paid" : "Mark paid"}
          </Button>
        ) : null}
        <Button type="button" variant="destructive" size="sm" onClick={() => setOpenModal("delete")}>
          Delete
        </Button>
      </div>
      {payState.error ? <span className="text-[12px] text-bad">{payState.error}</span> : null}

      <LoadFormModal
        open={openModal === "edit"}
        onClose={close}
        brokerNames={brokerNames}
        activeTripNames={activeTripNames}
        load={load}
        onSaved={refresh}
      />
      <MarkDeliveredModal open={openModal === "delivered"} onClose={close} loadId={load.id} onSaved={refresh} />
      <MarkTonuModal open={openModal === "tonu"} onClose={close} loadId={load.id} onSaved={refresh} />
      <RestoreTonuModal open={openModal === "restore"} onClose={close} loadId={load.id} onSaved={refresh} />
      <OdometerModal
        open={openModal === "odometer"}
        onClose={close}
        loadId={load.id}
        odoAssigned={load.odoAssigned}
        odoLoaded={load.odoLoaded}
        odoDelivered={load.odoDelivered}
        onSaved={refresh}
      />
      <DeleteLoadModal open={openModal === "delete"} onClose={close} loadId={load.id} />
    </div>
  );
}

function DeleteLoadModal({ open, onClose, loadId }: { open: boolean; onClose: () => void; loadId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setError(null);
    const result: MutationResult = await deleteLoad(loadId);
    if (result.ok) {
      router.push("/tms-v2/loads");
      router.refresh();
    } else {
      setPending(false);
      setError(result.reason);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete load">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-muted">
          This removes the load from the Load Board, Trips, and Broker rollups. This can&apos;t be undone from tms-v2.
        </p>
        <FormError message={error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending} aria-busy={pending}>
            {pending ? "Deleting…" : "Delete load"}
          </Button>
        </FormActions>
      </div>
    </Modal>
  );
}

function MarkDeliveredModal({
  open,
  onClose,
  loadId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  loadId: string;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await markLoadDelivered(loadId, formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      onSaved();
      onClose();
    }
  }, [state.ok, onSaved, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Mark delivered">
      <form action={formAction} className="flex flex-col gap-3">
        <Field label="Delivery odometer (optional)" name="odo_delivered" type="number" min="0" placeholder="Leave blank to skip" />
        <FormError message={state.error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Mark delivered"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

function RestoreTonuModal({
  open,
  onClose,
  loadId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  loadId: string;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setError(null);
    const result: MutationResult = await undoLoadTonu(loadId);
    if (result.ok) {
      setPending(false);
      onSaved();
      onClose();
    } else {
      setPending(false);
      setError(result.reason);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Restore load">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-muted">
          Takes this load out of TONU and back to its active status, re-derived from its odometer readings (assigned/loaded/delivered — pending if none are logged). The TONU amount is cleared.
        </p>
        <FormError message={error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={pending} aria-busy={pending}>
            {pending ? "Restoring…" : "Restore load"}
          </Button>
        </FormActions>
      </div>
    </Modal>
  );
}

function MarkTonuModal({
  open,
  onClose,
  loadId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  loadId: string;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await markLoadTonu(loadId, formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      onSaved();
      onClose();
    }
  }, [state.ok, onSaved, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Mark TONU">
      <form action={formAction} className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-muted">
          Truck ordered, not used — replaces the rate with a flat fee. No fuel, factoring, or expenses are deducted.
        </p>
        <Field label="TONU amount ($)" name="tonu_amount" type="number" step="any" min="0" defaultValue="150" required />
        <FormError message={state.error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Keep load
          </Button>
          <Button type="submit" variant="destructive" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Mark TONU"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

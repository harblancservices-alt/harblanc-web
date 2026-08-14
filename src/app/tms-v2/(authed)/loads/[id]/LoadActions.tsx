"use client";

import { createContext, useActionState, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { IconTrash } from "@/lib/nav/icons";
import { markLoadDelivered, markLoadTonu, undoLoadTonu, markLoadPaid, markLoadUnpaid, deleteLoad } from "@/actions/tms-v2/loads";
import type { MutationResult } from "@/lib/demo/mutation";
import { Field, FormError, FormActions } from "../_form";
import { LoadFormModal, type LoadFormValues } from "../LoadFormModal";
import { OdometerModal } from "./OdometerModal";

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

type LoadActionsLoad = LoadFormValues & {
  status: string;
  paymentStatus: "unpaid" | "paid";
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
};

type Props = {
  load: LoadActionsLoad;
  brokerNames: string[];
  activeTripNames: string[];
};

/**
 * Load Detail's write actions, split across the page the way legacy /admin
 * splits them (Brent's "almost to the T" ask) — the top command bar gets
 * Edit/TONU/Delete, the Odometer card gets its own Edit (+ Mark delivered),
 * the Financials card gets Mark paid — rather than one button row. All of
 * them share ONE modal/mutation controller (this context) so there's still
 * only one place owning `openModal` state and only one copy of each modal,
 * even though the trigger buttons now render in three different DOM
 * locations across the page.
 */
type Ctx = {
  load: LoadActionsLoad;
  setOpenModal: (m: "edit" | "delivered" | "tonu" | "restore" | "odometer" | "delete" | null) => void;
  togglePaid: () => void;
  payPending: boolean;
  payError: string | null;
  canMarkDelivered: boolean;
  canMarkTonu: boolean;
  canRestoreFromTonu: boolean;
  isClosedOut: boolean;
};

const LoadActionsCtx = createContext<Ctx | null>(null);

function useLoadActions(): Ctx {
  const ctx = useContext(LoadActionsCtx);
  if (!ctx) throw new Error("Load Detail's action buttons must render inside <LoadActionsProvider>.");
  return ctx;
}

export function LoadActionsProvider({ load, brokerNames, activeTripNames, children }: Props & { children: ReactNode }) {
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
    <LoadActionsCtx.Provider
      value={{
        load,
        setOpenModal,
        togglePaid,
        payPending: payState.pending,
        payError: payState.error,
        canMarkDelivered,
        canMarkTonu,
        canRestoreFromTonu,
        isClosedOut,
      }}
    >
      {children}

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
    </LoadActionsCtx.Provider>
  );
}

/** The "✎ Edit" trigger for LoadFormModal — reused both in the top command
 * bar and in the Load details card header (admin shows Edit in both
 * places too), one shared trigger for the one edit flow. */
export function EditLoadTriggerButton() {
  const { setOpenModal } = useLoadActions();
  return (
    <Button type="button" variant="info" size="sm" onClick={() => setOpenModal("edit")}>
      ✎ Edit
    </Button>
  );
}

/** Command bar (top of page): Edit (blue) / TONU or Restore (blue) / Delete
 * (red, icon-only trash) — matches admin's exact 3-button top-bar set. */
export function TopBarActions() {
  const { setOpenModal, canMarkTonu, canRestoreFromTonu } = useLoadActions();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EditLoadTriggerButton />
      {canMarkTonu ? (
        <Button type="button" variant="info" size="sm" onClick={() => setOpenModal("tonu")}>
          TONU
        </Button>
      ) : null}
      {canRestoreFromTonu ? (
        <Button type="button" variant="info" size="sm" onClick={() => setOpenModal("restore")}>
          Restore
        </Button>
      ) : null}
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpenModal("delete")} aria-label="Delete load" title="Delete load">
        <IconTrash className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** Odometer & status card header: Edit odometer (blue) — status is derived
 * from the odometer readings entered via Edit, so there's no separate
 * "Mark delivered" shortcut here. */
export function OdometerActions() {
  const { setOpenModal } = useLoadActions();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="info" size="sm" onClick={() => setOpenModal("odometer")}>
        ✎ Edit
      </Button>
    </div>
  );
}

/** Financials card header: Mark paid/Undo mark paid — admin's Load Detail
 * has no payment-status control at all, so this is tms-v2-only; placed here
 * since payment status is a financial fact. */
export function FinancialsPayAction() {
  const { load, togglePaid, payPending, payError, isClosedOut } = useLoadActions();
  if (!isClosedOut) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={load.paymentStatus === "paid" ? "secondary" : "primary"}
        size="sm"
        onClick={togglePaid}
        disabled={payPending}
        aria-busy={payPending}
      >
        {payPending ? "Saving…" : load.paymentStatus === "paid" ? "Undo mark paid" : "Mark paid"}
      </Button>
      {payError ? <span className="text-[12px] text-bad">{payError}</span> : null}
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
          Truck ordered, not used — replaces the rate with a flat fee. Only factoring is deducted; no fuel or other expenses.
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

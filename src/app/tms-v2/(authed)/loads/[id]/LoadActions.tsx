"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { markLoadDelivered, markLoadTonu, editLoadOdometer } from "@/actions/tms-v2/loads";
import type { MutationResult } from "@/lib/demo/mutation";
import { Field, FormError, FormActions } from "../_form";
import { LoadFormModal, type LoadFormValues } from "../LoadFormModal";

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

type Props = {
  load: LoadFormValues & {
    status: string;
    odoAssigned: number | null;
    odoLoaded: number | null;
    odoDelivered: number | null;
  };
  brokerNames: string[];
  activeTripNames: string[];
};

/** Load Detail's write actions — Edit load, Mark delivered, Mark TONU, Edit
 * odometer. One component so the detail page stays a plain data-fetching
 * Server Component (v2-architecture.md §2's page-shell rule) and every
 * interactive bit lives in this one client island. */
export function LoadActions({ load, brokerNames, activeTripNames }: Props) {
  const router = useRouter();
  const [openModal, setOpenModal] = useState<"edit" | "delivered" | "tonu" | "odometer" | null>(null);
  const close = () => setOpenModal(null);
  const refresh = () => router.refresh();

  const canMarkDelivered = load.status !== "delivered" && load.status !== "tonu";
  const canMarkTonu = load.status !== "tonu";

  return (
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
      <OdometerModal
        open={openModal === "odometer"}
        onClose={close}
        loadId={load.id}
        odoAssigned={load.odoAssigned}
        odoLoaded={load.odoLoaded}
        odoDelivered={load.odoDelivered}
        onSaved={refresh}
      />
    </div>
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

function OdometerModal({
  open,
  onClose,
  loadId,
  odoAssigned,
  odoLoaded,
  odoDelivered,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  loadId: string;
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await editLoadOdometer(loadId, formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      onSaved();
      onClose();
    }
  }, [state.ok, onSaved, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Edit odometer">
      <form action={formAction} className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-muted">
          The odometer only climbs — status is derived from the highest reading you enter (Delivered → Loaded →
          Assigned → Pending).
        </p>
        <Field label="Assigned" name="odo_assigned" type="number" min="0" defaultValue={odoAssigned != null ? String(odoAssigned) : ""} />
        <Field label="Loaded" name="odo_loaded" type="number" min="0" defaultValue={odoLoaded != null ? String(odoLoaded) : ""} />
        <Field label="Delivered" name="odo_delivered" type="number" min="0" defaultValue={odoDelivered != null ? String(odoDelivered) : ""} />
        <FormError message={state.error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Save odometer"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

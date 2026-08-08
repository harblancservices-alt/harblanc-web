"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { updateTrip, updateTripOdometer, closeTrip, reopenTrip, deleteTrip } from "@/actions/tms-v2/trips";
import { addLoadExpense } from "@/actions/tms-v2/loads";
import type { MutationResult } from "@/lib/demo/mutation";
import { Field, SelectField, FormError, FormActions } from "../../loads/_form";

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

type TripLoadOption = { id: string; label: string };

type Props = {
  trip: {
    id: string;
    name: string | null;
    status: string;
    notes: string | null;
    startedAt: string | null;
    endedAt: string | null;
    startOdometer: number | null;
    endOdometer: number | null;
  };
  /** This trip's linked loads, for the "Add expense" modal's load picker —
   * there's no trip-level expense table, so this reuses the same per-load
   * addLoadExpense() the Load Board already uses, just scoped to picking
   * one of this trip's own loads. */
  loads: TripLoadOption[];
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/** Trip Detail's write actions — Edit, Odometer bookends, Close/Reopen
 * (status stays derived by an explicit action, never a free dropdown), and
 * Delete. Closes the audit's record-trap #4 (a trip started in tms-v2
 * couldn't be closed or given odometer bookends). */
export function TripActions({ trip, loads }: Props) {
  const router = useRouter();
  const [openModal, setOpenModal] = useState<"edit" | "odometer" | "delete" | "expense" | null>(null);
  const close = () => setOpenModal(null);
  const refresh = () => router.refresh();

  const [statusPending, setStatusPending] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function toggleStatus() {
    setStatusPending(true);
    setStatusError(null);
    const result: MutationResult = trip.status === "closed" ? await reopenTrip(trip.id) : await closeTrip(trip.id);
    if (result.ok) {
      setStatusPending(false);
      refresh();
    } else {
      setStatusPending(false);
      setStatusError(result.reason);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1 border-t border-line pt-4 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={trip.status === "closed" ? "secondary" : "primary"}
          size="sm"
          onClick={toggleStatus}
          disabled={statusPending}
          aria-busy={statusPending}
        >
          {statusPending ? "Saving…" : trip.status === "closed" ? "Reopen trip" : "Close trip"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpenModal("expense")} disabled={loads.length === 0}>
          Add expense
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpenModal("edit")}>
          Edit trip
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpenModal("odometer")}>
          Edit odometer
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={() => setOpenModal("delete")}>
          Delete
        </Button>
      </div>
      {statusError ? <span className="text-[12px] text-bad">{statusError}</span> : null}

      <EditTripModal open={openModal === "edit"} onClose={close} trip={trip} onSaved={refresh} />
      <OdometerModal open={openModal === "odometer"} onClose={close} trip={trip} onSaved={refresh} />
      <DeleteTripModal open={openModal === "delete"} onClose={close} tripId={trip.id} />
      <AddExpenseModal open={openModal === "expense"} onClose={close} loads={loads} onSaved={refresh} />
    </div>
  );
}

function AddExpenseModal({
  open,
  onClose,
  loads,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  loads: TripLoadOption[];
  onSaved: () => void;
}) {
  const [loadId, setLoadId] = useState(loads[0]?.id ?? "");

  useEffect(() => {
    if (open) setLoadId(loads[0]?.id ?? "");
  }, [open, loads]);

  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    if (!loadId) return { ok: false, error: "Pick a load." };
    const result: MutationResult = await addLoadExpense(loadId, formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      onSaved();
      onClose();
    }
  }, [state.ok, onSaved, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Add expense">
      <form action={formAction} className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-muted">There's no trip-level expense log — pick which of this trip's loads the charge belongs to.</p>
        <SelectField label="Load" name="load_id" value={loadId} onChange={(e) => setLoadId(e.target.value)}>
          {loads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </SelectField>
        <Field label="Category" name="category" required placeholder="Toll, lumper, parking…" />
        <Field label="Amount ($)" name="amount" type="number" step="any" min="0" required />
        <Field label="Note (optional)" name="note" />
        <FormError message={state.error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !loadId} aria-busy={pending}>
            {pending ? "Saving…" : "Add expense"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

function EditTripModal({ open, onClose, trip, onSaved }: { open: boolean; onClose: () => void; trip: Props["trip"]; onSaved: () => void }) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await updateTrip(trip.id, formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      onSaved();
      onClose();
    }
  }, [state.ok, onSaved, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Edit trip">
      <form action={formAction} className="flex flex-col gap-3">
        <Field label="Name" name="name" defaultValue={trip.name ?? ""} required />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start date" name="start_date" type="date" defaultValue={toDateInput(trip.startedAt)} />
          <Field label="End date" name="end_date" type="date" defaultValue={toDateInput(trip.endedAt)} />
        </div>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
          Notes
          <textarea
            name="notes"
            rows={3}
            defaultValue={trip.notes ?? ""}
            className="rounded-md border border-line-strong bg-card px-2.5 py-2 text-[14px] text-fg focus:border-fg focus:outline-none"
          />
        </label>
        <FormError message={state.error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Save trip"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

function OdometerModal({ open, onClose, trip, onSaved }: { open: boolean; onClose: () => void; trip: Props["trip"]; onSaved: () => void }) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await updateTripOdometer(trip.id, formData);
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
        <p className="text-[13px] text-fg-muted">Start/end bookends drive this trip's PC miles and PC diesel cost into its net.</p>
        <Field label="Start odometer" name="start_odometer" type="number" min="0" defaultValue={trip.startOdometer != null ? String(trip.startOdometer) : ""} />
        <Field label="End odometer" name="end_odometer" type="number" min="0" defaultValue={trip.endOdometer != null ? String(trip.endOdometer) : ""} />
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

function DeleteTripModal({ open, onClose, tripId }: { open: boolean; onClose: () => void; tripId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setError(null);
    const result: MutationResult = await deleteTrip(tripId);
    if (result.ok) {
      router.push("/tms-v2/trips");
      router.refresh();
    } else {
      setPending(false);
      setError(result.reason);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete trip">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-muted">Linked loads keep their trip name but are unlinked. This can&apos;t be undone from tms-v2.</p>
        <FormError message={error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending} aria-busy={pending}>
            {pending ? "Deleting…" : "Delete trip"}
          </Button>
        </FormActions>
      </div>
    </Modal>
  );
}

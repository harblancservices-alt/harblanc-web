"use client";

import { useActionState } from "react";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { editLoadOdometer } from "@/actions/tms-v2/loads";
import type { MutationResult } from "@/lib/demo/mutation";
import { Field, FormError, FormActions } from "../_form";

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

/**
 * Shared odometer entry modal — Load Detail's LoadActions and Today's
 * Active Loads row actions (Phase 5D) both open this same component, so
 * "quick odometer entry" is one implementation, not two. Status derives
 * from whichever reading is highest — never a separate dropdown.
 */
export function OdometerModal({
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
  // Side effects run inline in the action itself, not a `useEffect` keyed on
  // `state.ok` — see LoadFormModal.tsx for why.
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await editLoadOdometer(loadId, formData);
    if (!result.ok) return { ok: false, error: result.reason };
    onSaved();
    onClose();
    return { ok: true, error: null };
  }, INITIAL);

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

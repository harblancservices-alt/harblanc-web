"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { addLoad, editLoad } from "@/actions/tms-v2/loads";
import type { MutationResult } from "@/lib/demo/mutation";
import { Field, SelectField, FormError, FormActions } from "./_form";

export type LoadFormValues = {
  id: string;
  loadNumber: string | null;
  brokerName: string | null;
  originZip: string | null;
  destZip: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  rate: number | null;
  loadedMiles: number | null;
  tripName: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  brokerNames: string[];
  activeTripNames: string[];
  /** Present = editing this load; absent = adding a new one. */
  load?: LoadFormValues;
  /** Called after a successful save with the affected load id. */
  onSaved?: (id: string) => void;
};

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

const NEW_TRIP = "__new__";
const NO_TRIP = "";

/** Stored date → the YYYY-MM-DD a native <input type="date"> expects. */
function dateValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/** One form, two callers: the Loads page's "Add load" button and the Load
 * Detail page's "Edit load" button — both via this component, so the two
 * flows can never drift apart (v2-architecture.md §2's inline-edit-over-
 * modal preference doesn't apply cleanly to a multi-field record like a
 * load, so this is one of the "genuinely needs a modal" cases §2 carves
 * out). */
export function LoadFormModal({ open, onClose, brokerNames, activeTripNames, load, onSaved }: Props) {
  const editing = load != null;
  const loadTrip = load?.tripName?.trim() ?? "";
  const [trip, setTrip] = useState(loadTrip);
  const [namingNewTrip, setNamingNewTrip] = useState(false);

  const tripOptions = useMemo(
    () => Array.from(new Set(loadTrip ? [...activeTripNames, loadTrip] : activeTripNames)),
    [activeTripNames, loadTrip],
  );

  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult<unknown> = load ? await editLoad(load.id, formData) : await addLoad(formData);
    if (!result.ok) return { ok: false, error: result.reason };
    return { ok: true, error: null };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      onSaved?.(load?.id ?? "");
      onClose();
    }
  }, [state.ok, load?.id, onSaved, onClose]);

  useEffect(() => {
    if (open) {
      setTrip(loadTrip);
      setNamingNewTrip(false);
    }
  }, [open, loadTrip]);

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit load" : "Add load"}>
      <form action={formAction} className="flex flex-col gap-3">
        <datalist id="tms-v2-broker-options">
          {brokerNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Load #" name="load_number" defaultValue={load?.loadNumber ?? ""} className="col-span-2 sm:col-span-1" />
          <Field
            label="Broker"
            name="broker_name"
            required
            defaultValue={load?.brokerName ?? ""}
            list="tms-v2-broker-options"
            autoComplete="off"
            className="col-span-2 sm:col-span-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Origin ZIP" name="origin_zip" required defaultValue={load?.originZip ?? ""} inputMode="numeric" autoComplete="off" />
          <Field label="Destination ZIP" name="dest_zip" required defaultValue={load?.destZip ?? ""} inputMode="numeric" autoComplete="off" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pickup date" name="pickup_date" type="date" defaultValue={dateValue(load?.pickupDate)} />
          <Field label="Delivery date" name="delivery_date" type="date" defaultValue={dateValue(load?.deliveryDate)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Rate ($)" name="rate" type="number" step="any" min="0" required defaultValue={load?.rate != null ? String(load.rate) : ""} />
          <Field
            label="Loaded miles"
            name="loaded_miles"
            type="number"
            min="0"
            defaultValue={load?.loadedMiles != null ? String(load.loadedMiles) : ""}
          />
        </div>

        <div>
          <input type="hidden" name="trip_name" value={trip} />
          {namingNewTrip ? (
            <div className="flex items-end gap-2">
              <Field
                label="New trip name"
                name="_trip_name_display"
                autoFocus
                autoComplete="off"
                value={trip}
                onChange={(e) => setTrip(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setNamingNewTrip(false);
                  setTrip("");
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <SelectField
              label="Trip"
              name="_trip_select"
              value={trip || NO_TRIP}
              onChange={(e) => {
                const v = e.target.value;
                if (v === NEW_TRIP) {
                  setNamingNewTrip(true);
                  setTrip("");
                } else {
                  setTrip(v);
                }
              }}
            >
              <option value={NO_TRIP}>No trip</option>
              {tripOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value={NEW_TRIP}>+ New trip…</option>
            </SelectField>
          )}
        </div>

        <FormError message={state.error} />

        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add load"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

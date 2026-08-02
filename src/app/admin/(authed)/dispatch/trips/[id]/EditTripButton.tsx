"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { updateTrip, deleteTrip } from "../actions";
import { TripDateTimeFields, tripDatesAreValid } from "../TripDateTimeFields";

/**
 * Red "✎ Edit trip" button + modal — matches the edit affordance on the
 * broker and maintenance detail pages (a red Edit button that opens a modal).
 * The modal hosts the trip's name / status / notes / start-end dates form
 * (updateTrip) and the Delete trip action (deleteTrip); both are the same
 * server actions the page used before, just moved out of an inline <details>
 * into a proper modal.
 */
export function EditTripButton({
  tripId,
  name,
  status,
  notes,
  startDate,
  startTime,
  endDate,
  endTime,
  hasEnd,
}: {
  tripId: string;
  name: string;
  status: string;
  notes: string | null;
  /** Pre-split into Central date/time strings by the server page. */
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  hasEnd?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dateError, setDateError] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button
        variant="edit"
        type="button"
        onClick={() => setOpen(true)}
        className="h-9"
      >
        ✎ Edit trip
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit trip"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="my-4 w-full max-w-md overflow-hidden rounded-lg border border-line-strong bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
              <span className="truncate font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
                Edit trip
              </span>
              <Button
                variant="cancel"
                size="sm"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>

            <form
              action={updateTrip.bind(null, tripId)}
              className="space-y-3 bg-elevated px-4 py-4"
              onSubmit={(e) => {
                // Delete goes through this same form (via formAction) but
                // isn't saving anything — an invalid end date shouldn't block
                // deleting the trip.
                const submitter = (e.nativeEvent as SubmitEvent).submitter as
                  | HTMLElement
                  | null;
                if (submitter?.getAttribute("data-action") === "delete") return;
                const valid = tripDatesAreValid(new FormData(e.currentTarget));
                setDateError(!valid);
                if (!valid) e.preventDefault();
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                    Trip name<span className="text-red-600"> *</span>
                  </label>
                  <input
                    name="name"
                    defaultValue={name}
                    required
                    autoComplete="off"
                    className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                    Status
                  </label>
                  <select
                    name="status"
                    defaultValue={status}
                    className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              <TripDateTimeFields
                defaultStartDate={startDate}
                defaultStartTime={startTime}
                defaultEndDate={endDate}
                defaultEndTime={endTime}
                defaultHasEnd={hasEnd}
              />
              {dateError ? (
                <p className="font-mono text-[11px] font-semibold text-bad">
                  Fix the end date &amp; time before saving.
                </p>
              ) : null}

              <div>
                <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                  Notes
                </label>
                <textarea
                  name="notes"
                  defaultValue={notes ?? ""}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                <Button variant="primary" type="submit">
                  Save trip
                </Button>
                <Button
                  variant="destructive"
                  type="submit"
                  formAction={deleteTrip.bind(null, tripId)}
                  data-action="delete"
                >
                  Delete trip
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

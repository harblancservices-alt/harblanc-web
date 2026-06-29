"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { createTrip } from "./actions";

/** "+ New Trip" button + modal for the Trips page. */
export function NewTripButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="primary"
        type="button"
        onClick={() => setOpen(true)}
        leftIcon={<span className="text-[14px] leading-none">+</span>}
      >
        New Trip
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-lg border border-line bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-line bg-elevated px-4 py-2.5">
              <span className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-fg">
                New trip
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[18px] leading-none text-fg-subtle transition-colors hover:text-fg"
              >
                ×
              </button>
            </div>
            <form action={createTrip} className="px-4 py-4">
              <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                Trip name<span className="text-red-600"> *</span>
              </label>
              <input
                name="name"
                required
                autoComplete="off"
                placeholder="e.g. Houston out & back"
                className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
              <label className="mt-3 block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                Notes
              </label>
              <textarea
                name="notes"
                rows={2}
                className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="cancel"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="primary" type="submit">
                  Create trip
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

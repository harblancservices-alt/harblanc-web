"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cancelLoad } from "../actions";

/**
 * TONU button (top bar) → dialog offering a plain cancel or a TONU (truck
 * ordered, not used) charge, $150 by default. Both move the load to cancelled;
 * TONU records the fee as the load's revenue.
 *
 * The trigger is labelled "TONU" rather than "Cancel load" because that is what
 * dispatch is almost always reaching for — the no-charge cancel is still one tap
 * away inside the dialog. Behaviour is unchanged; only the trigger label is.
 */
export function CancelLoadButton({ loadId }: { loadId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="blue"
        size="xs"
        onClick={() => setOpen(true)}
        title="Cancel load — TONU or no charge"
      >
        TONU
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm overflow-hidden rounded-lg border border-line bg-card text-fg shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-line bg-elevated px-4 py-2.5">
              <span className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-fg">
                Cancel load
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[18px] leading-none text-fg-subtle transition-colors hover:text-fg"
              >
                ×
              </button>
            </div>

            <div className="px-4 py-4">
              <p className="text-[13px] text-fg-muted">
                How do you want to cancel this load?
              </p>

              {/* TONU */}
              <form action={cancelLoad.bind(null, loadId)} className="mt-3">
                <input type="hidden" name="mode" value="tonu" />
                <div className="rounded-md border border-line-strong bg-elevated p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-fg">TONU</p>
                      <p className="text-[11px] text-fg-subtle">
                        Truck ordered, not used
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[13px] text-fg-subtle">$</span>
                      <input
                        name="tonu_amount"
                        type="number"
                        step="1"
                        min="0"
                        defaultValue={150}
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-20 rounded-md border border-line-strong bg-card px-2 py-1 font-mono text-[14px] text-fg focus:border-fg focus:outline-none"
                      />
                    </div>
                  </div>
                  <Button type="submit" variant="destructive" size="sm" fullWidth className="mt-2.5">
                    Cancel + TONU
                  </Button>
                </div>
              </form>

              {/* Plain cancel */}
              <form action={cancelLoad.bind(null, loadId)} className="mt-3">
                <input type="hidden" name="mode" value="cancel" />
                <Button type="submit" variant="destructive" size="sm" fullWidth>
                  Cancel — no charge
                </Button>
              </form>

              <Button
                type="button"
                variant="cancel"
                size="sm"
                fullWidth
                onClick={() => setOpen(false)}
                className="mt-3"
              >
                Keep load
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDispatchOwnership } from "../actions";

/**
 * Dispatch ownership panel — lightweight free-text capture of who's
 * responsible for a load. Not a full driver / asset assignment system;
 * these are placeholders that surface on the ops home so dispatch can
 * see at a glance which carrier / truck is on which load.
 *
 * Fields:
 *   - Assigned dispatcher (Brent, in this single-operator setup)
 *   - Assigned carrier (which carrier is moving the freight)
 *   - Assigned truck (unit number / nickname)
 *   - Trailer type (flatbed / step-deck / RGN / hotshot / etc.)
 *
 * Save logs to the activity timeline as a note so changes are auditable.
 */

export type DispatchOwnership = {
  assignedDispatcher: string | null;
  assignedCarrier: string | null;
  assignedTruck: string | null;
  trailerType: string | null;
};

const labelCls =
  "block font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase";
const inputCls =
  "mt-2 block w-full bg-neutral-900 border border-neutral-800 px-3 py-2.5 text-base text-zinc-100 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none";

export function DispatchOwnershipPanel({
  quoteRequestId,
  ownership,
}: {
  quoteRequestId: string;
  ownership: DispatchOwnership;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [dispatcher, setDispatcher] = useState(ownership.assignedDispatcher ?? "");
  const [carrier, setCarrier] = useState(ownership.assignedCarrier ?? "");
  const [truck, setTruck] = useState(ownership.assignedTruck ?? "");
  const [trailer, setTrailer] = useState(ownership.trailerType ?? "");

  function onSave() {
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.append("quote_request_id", quoteRequestId);
    fd.append("assigned_dispatcher", dispatcher);
    fd.append("assigned_carrier", carrier);
    fd.append("assigned_truck", truck);
    fd.append("trailer_type", trailer);
    startTransition(async () => {
      try {
        await updateDispatchOwnership(fd);
        setNotice("Ownership saved.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  return (
    <section className="border border-neutral-800 bg-neutral-900/40 p-5 sm:p-6">
      <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
        Dispatch ownership
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
        Track who&rsquo;s moving this load. Free-text for now — full driver
        assignment lands later.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="assigned_dispatcher" className={labelCls}>
            Dispatcher
          </label>
          <input
            id="assigned_dispatcher"
            type="text"
            value={dispatcher}
            onChange={(e) => setDispatcher(e.target.value)}
            placeholder="Brent"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="assigned_carrier" className={labelCls}>
            Carrier
          </label>
          <input
            id="assigned_carrier"
            type="text"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            placeholder="HARBLANC SERVICES LLC"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="assigned_truck" className={labelCls}>
            Truck
          </label>
          <input
            id="assigned_truck"
            type="text"
            value={truck}
            onChange={(e) => setTruck(e.target.value)}
            placeholder="Unit 23 / black F-450"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="trailer_type" className={labelCls}>
            Trailer type
          </label>
          <input
            id="trailer_type"
            type="text"
            value={trailer}
            onChange={(e) => setTrailer(e.target.value)}
            placeholder="Flatbed / step-deck / RGN / hotshot"
            className={inputCls}
          />
        </div>
      </div>

      {notice ? (
        <p
          role="status"
          className="mt-4 font-mono text-[10px] tracking-[0.14em] text-green-400 uppercase"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="mt-4 flex items-start gap-3 border border-red-700 bg-red-950/30 p-4">
          <span aria-hidden className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600" />
          <p className="text-sm leading-relaxed text-red-200">{error}</p>
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={isPending}
          className="btn-outline-cut inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save ownership"}
        </button>
      </div>
    </section>
  );
}

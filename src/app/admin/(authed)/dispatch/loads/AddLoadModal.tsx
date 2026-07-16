"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createLoad, updateLoad } from "./actions";

/** An existing load's values, to reopen this form on. */
export type LoadFormValues = {
  id: string;
  loadNumber: string | null;
  brokerName: string | null;
  status: string;
  originZip: string | null;
  destZip: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  rate: number | null;
  loadedMiles: number | null;
  tripName: string | null;
};

/**
 * Add-load modal — shared by the Load Board header button and the Dashboard
 * "Active loads" empty state (both via <AddLoadButton/>), so the flow,
 * fields, FMCSA/geo lookups and the createLoad server action stay identical
 * wherever a load is added.
 *
 * Pass `load` and the same form reopens on an existing load and saves through
 * updateLoad instead — the load detail page's full Edit. One form, so an edit
 * offers every field an add does (the trip especially: a load created before
 * its trip existed gets attached from here).
 */
export function AddLoadModal({
  onClose,
  brokerNames,
  activeTrips,
  load,
}: {
  onClose: () => void;
  brokerNames: ReadonlyArray<string>;
  activeTrips: ReadonlyArray<string>;
  load?: LoadFormValues;
}) {
  const editing = load != null;
  const [broker, setBroker] = useState(load?.brokerName ?? "");
  const [brokerMc, setBrokerMc] = useState("");
  const [brokerDot, setBrokerDot] = useState("");
  const [brokerMainPhone, setBrokerMainPhone] = useState("");
  const [brokerContactName, setBrokerContactName] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");
  const [brokerPhone, setBrokerPhone] = useState("");
  const [status, setStatus] = useState(load?.status ?? "pending");
  const [lookupKind, setLookupKind] = useState<"mc" | "dot">("mc");
  const [lookupVal, setLookupVal] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<
    { tone: "ok" | "err"; text: string } | null
  >(null);
  const [originZip, setOriginZip] = useState(load?.originZip ?? "");
  const [destZip, setDestZip] = useState(load?.destZip ?? "");
  const [originCity, setOriginCity] = useState("");
  const [destCity, setDestCity] = useState("");
  const [miles, setMiles] = useState(
    load?.loadedMiles != null ? String(load.loadedMiles) : "",
  );
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  // Adding: default the trip to the sole active trip, if there's exactly one.
  // Editing: show the trip the load actually has — a blank trip stays blank
  // rather than silently adopting whichever trip happens to be the only one.
  const [trip, setTrip] = useState(
    editing
      ? (load?.tripName ?? "")
      : activeTrips.length === 1
        ? activeTrips[0]
        : "",
  );
  const reqId = useRef(0);

  // Save lifecycle. Wrapping createLoad in useActionState gives us a pending
  // flag (to disable the button + block double-submits), an inline error on
  // failure instead of a silent throw, and an ok flag we close on. Closing
  // unmounts the modal, so the next open starts from a fresh, empty form.
  const [saveState, saveAction, saving] = useActionState<
    { ok: boolean; error: string | null },
    FormData
  >(
    async (_prev, formData) => {
      try {
        if (load) await updateLoad(load.id, formData);
        else await createLoad(formData);
        return { ok: true, error: null };
      } catch (e) {
        return {
          ok: false,
          error:
            e instanceof Error
              ? e.message
              : "Could not save load. Please try again.",
        };
      }
    },
    { ok: false, error: null },
  );

  useEffect(() => {
    if (saveState.ok) onClose();
  }, [saveState.ok, onClose]);

  const five = (z: string) => /^\d{5}$/.test(z.trim());

  // Resolve city/state for whichever ZIP changed, and lane miles once both
  // are valid 5-digit ZIPs. Server-side dataset via the geo API.
  useEffect(() => {
    const o = originZip.trim();
    const d = destZip.trim();
    const id = ++reqId.current;

    if (five(o) && five(d)) {
      setGeoMsg("Calculating lane…");
      fetch(`/api/admin/dispatch/geo?o=${o}&d=${d}`)
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (id !== reqId.current) return;
          if (!ok) {
            setGeoMsg(j?.error ?? "Could not resolve ZIPs.");
            return;
          }
          setOriginCity(`${j.origin.city}, ${j.origin.state}`);
          setDestCity(`${j.dest.city}, ${j.dest.state}`);
          setMiles(String(j.miles));
          setGeoMsg(null);
        })
        .catch(() => id === reqId.current && setGeoMsg("Network error."));
      return;
    }

    // Single-ZIP resolves for live city feedback.
    if (five(o)) {
      fetch(`/api/admin/dispatch/geo?zip=${o}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (id === reqId.current && j) setOriginCity(`${j.city}, ${j.state}`);
        })
        .catch(() => {});
    } else {
      setOriginCity("");
    }
    if (five(d)) {
      fetch(`/api/admin/dispatch/geo?zip=${d}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (id === reqId.current && j) setDestCity(`${j.city}, ${j.state}`);
        })
        .catch(() => {});
    } else {
      setDestCity("");
    }
    setMiles("");
    setGeoMsg(null);
  }, [originZip, destZip]);

  async function runBrokerLookup() {
    const v = lookupVal.trim();
    if (!v) return;
    setLookupLoading(true);
    setLookupMsg(null);
    try {
      const res = await fetch(
        `/api/admin/fmcsa?${lookupKind}=${encodeURIComponent(v)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setLookupMsg({ tone: "err", text: data?.error ?? "No match found." });
        return;
      }
      setBroker(data.name ?? data.dbaName ?? "");
      setBrokerMc(data.mcNumber ?? (lookupKind === "mc" ? v : ""));
      setBrokerDot(data.dotNumber ?? (lookupKind === "dot" ? v : ""));
      // FMCSA returns the broker's own company line — keep it as broker-level
      // info (saved onto the broker record), not a dispatcher contact.
      if (data.phone) setBrokerMainPhone(data.phone);
      const op =
        data.allowedToOperate === false ? " — NOT allowed to operate" : "";
      setLookupMsg({
        tone: data.allowedToOperate === false ? "err" : "ok",
        text: `${data.name ?? data.dbaName ?? "Found"}${op}`,
      });
    } catch {
      setLookupMsg({ tone: "err", text: "Network error reaching FMCSA." });
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit load" : "Add load"}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-3 sm:p-8"
      onClick={onClose}
    >
      <form
        action={saveAction}
        onClick={(e) => {
          e.stopPropagation();
          // Tap any blank area of the form to dismiss the mobile keyboard.
          const t = e.target as HTMLElement;
          if (!t.closest("input, select, textarea, button, a, label")) {
            (document.activeElement as HTMLElement | null)?.blur();
          }
        }}
        className="my-2 w-full max-w-2xl overflow-hidden rounded-md border border-line-strong bg-card shadow-2xl sm:my-6"
      >
        <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
          <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-bar-fg">
            {editing ? "Edit load" : "Add load"}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-sm border border-white/25 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-bar-fg transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        <datalist id="broker-options">
          {brokerNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <datalist id="trip-options">
          {activeTrips.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <div className="space-y-3 bg-elevated px-4 py-4 sm:px-5">
          {/* Status — dropdown, at the very top */}
          <div>
            <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
              Status
            </label>
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-2 text-[13px] text-fg focus:border-fg focus:outline-none"
            >
              <option value="pending">Pending</option>
              <option value="assigned">Rolling to pickup</option>
              <option value="loaded">Loaded</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Broker card — load #, broker, contact */}
          <section className="rounded-md border border-line bg-card p-3">
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-fg">
              Broker
            </p>

            <LField
              label="Load #"
              name="load_number"
              defaultValue={load?.loadNumber ?? ""}
            />

            <div className="mt-3">
              <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
                Broker / customer<span className="ml-1.5 rounded bg-red-100 px-1.5 py-[1px] align-middle font-mono text-[8.5px] font-bold uppercase tracking-[0.08em] text-red-700">Required</span>
              </label>
              <input
                name="broker_name"
                required
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                list="broker-options"
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
              <input type="hidden" name="broker_mc" value={brokerMc} />
              <input type="hidden" name="broker_dot" value={brokerDot} />
              <input
                type="hidden"
                name="broker_main_phone"
                value={brokerMainPhone}
              />

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <div className="inline-flex overflow-hidden rounded border border-line-strong">
                  {(["mc", "dot"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setLookupKind(k)}
                      className={
                        "px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] transition-colors " +
                        (lookupKind === k
                          ? "bg-fg text-canvas"
                          : "bg-card text-fg-muted hover:bg-elevated")
                      }
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <input
                  value={lookupVal}
                  onChange={(e) => setLookupVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void runBrokerLookup();
                    }
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  className="w-28 rounded border border-line-strong bg-card px-2 py-1 text-[12px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void runBrokerLookup()}
                  disabled={lookupLoading || !lookupVal.trim()}
                  className="rounded border border-line-strong bg-card px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-fg transition-colors hover:bg-elevated disabled:opacity-40"
                >
                  {lookupLoading ? "…" : "Look up"}
                </button>
                {lookupMsg ? (
                  <span
                    className={
                      "truncate text-[11px] " +
                      (lookupMsg.tone === "err"
                        ? "text-red-700"
                        : "text-green-700")
                    }
                  >
                    {lookupMsg.text}
                  </span>
                ) : brokerMc || brokerDot ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
                    MC {brokerMc || "—"} · DOT {brokerDot || "—"}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Dispatcher contact — saved under the broker, not as its main
                line. Stacks on mobile, side-by-side on desktop. */}
            <div className="mt-3">
              <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
                Dispatcher name
              </label>
              <input
                name="broker_contact_name"
                value={brokerContactName}
                onChange={(e) => setBrokerContactName(e.target.value)}
                autoComplete="off"
                placeholder="e.g. Mike at Dispatch"
                className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
                  Dispatcher email
                </label>
                <input
                  name="broker_email"
                  type="email"
                  value={brokerEmail}
                  onChange={(e) => setBrokerEmail(e.target.value)}
                  autoComplete="off"
                  className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
                  Dispatcher phone
                </label>
                <input
                  name="broker_phone"
                  value={brokerPhone}
                  onChange={(e) => setBrokerPhone(e.target.value)}
                  autoComplete="off"
                  className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Lane & schedule card — ZIPs, dates, rate, trip */}
          <section className="rounded-md border border-line bg-card p-3">
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-fg">
              Lane &amp; schedule
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="min-w-0">
                <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
                  Origin ZIP<span className="ml-1.5 rounded bg-red-100 px-1.5 py-[1px] align-middle font-mono text-[8.5px] font-bold uppercase tracking-[0.08em] text-red-700">Required</span>
                </label>
                <input
                  name="origin_zip"
                  required
                  value={originZip}
                  onChange={(e) => setOriginZip(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  className="mt-1 block w-full min-w-0 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                />
                <p className="mt-1 truncate text-[11px] text-fg-muted">
                  {originCity || "City, ST"}
                </p>
              </div>
              <div className="min-w-0">
                <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
                  Destination ZIP<span className="ml-1.5 rounded bg-red-100 px-1.5 py-[1px] align-middle font-mono text-[8.5px] font-bold uppercase tracking-[0.08em] text-red-700">Required</span>
                </label>
                <input
                  name="dest_zip"
                  required
                  value={destZip}
                  onChange={(e) => setDestZip(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  className="mt-1 block w-full min-w-0 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                />
                <p className="mt-1 truncate text-[11px] text-fg-muted">
                  {destCity || "City, ST"}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <LField
                label="Pickup date"
                name="pickup_date"
                type="date"
                defaultValue={dateValue(load?.pickupDate)}
              />
              <LField
                label="Delivery date"
                name="delivery_date"
                type="date"
                defaultValue={dateValue(load?.deliveryDate)}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <LField
                label="Rate ($)"
                name="rate"
                type="number"
                required
                defaultValue={load?.rate != null ? String(load.rate) : ""}
              />
              <div className="min-w-0">
                <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
                  Loaded miles
                </label>
                <input
                  name="loaded_miles"
                  type="number"
                  value={miles}
                  onChange={(e) => setMiles(e.target.value)}
                  autoComplete="off"
                  className="mt-1 block w-full min-w-0 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                />
              </div>
            </div>
            {geoMsg ? (
              <p className="mt-1 truncate text-[11px] text-fg-muted">{geoMsg}</p>
            ) : null}

            <div className="mt-3">
              <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
                Trip
              </label>
              <input
                name="trip_name"
                value={trip}
                onChange={(e) => setTrip(e.target.value)}
                list="trip-options"
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-elevated px-4 py-3">
          {saveState.error ? (
            <span
              role="alert"
              className="min-w-0 flex-1 font-mono text-[11px] font-semibold leading-snug text-red-700"
            >
              {saveState.error}
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-subtle">
              Equipment: Hotshot
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-red-700 bg-red-600 px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? (
              <>
                <span
                  aria-hidden
                  className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
                Saving…
              </>
            ) : editing ? (
              "Save changes"
            ) : (
              "Save load"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Stored date → the YYYY-MM-DD a native <input type="date"> expects. */
function dateValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

function LField({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
  list,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  list?: string;
  defaultValue?: string;
}) {
  return (
    <div className="min-w-0">
      <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
        {label}
        {required ? <span className="ml-1.5 rounded bg-red-100 px-1.5 py-[1px] align-middle font-mono text-[8.5px] font-bold uppercase tracking-[0.08em] text-red-700">Required</span> : null}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        list={list}
        defaultValue={defaultValue}
        autoComplete="off"
        step={type === "number" ? "any" : undefined}
        className="mt-1 block w-full min-w-0 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
      />
    </div>
  );
}

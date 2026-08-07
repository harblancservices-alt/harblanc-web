"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
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
const FORM_ID = "tms-v2-load-form";

const SECTION_TITLE = "text-[13px] font-semibold text-fg";
const SECTION = "flex flex-col gap-2.5 rounded-md border border-line-strong bg-elevated p-2.5";
const TOGGLE_BASE = "px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors";

/** Stored date → the YYYY-MM-DD a native <input type="date"> expects. */
function dateValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * One form, two callers: the Loads page's "Add load" button and the Load
 * Detail page's "Edit load" button — both via this component, so the two
 * flows can never drift apart.
 *
 * Rebuilt to match legacy /admin's Add Load form (AddLoadModal.tsx) per
 * Brent's explicit ask: same field set and order — Broker (Load #, broker
 * name, MC/DOT lookup), Lane & schedule (ZIPs with live city preview,
 * dates, rate, loaded miles auto-filled from the ZIPs, trip picker),
 * Dispatcher contact (name/email/phone) last, plus the static "Equipment:
 * Hotshot" footer note (not an editable field in legacy either — this
 * one-truck operation is hotshot-only, already hardcoded server-side).
 * The MC/DOT lookup hits the same /api/admin/fmcsa proxy legacy's form
 * uses (already reachable from tms-v2 — the two portals share one admin
 * session); the ZIP→city/miles preview hits the same /api/admin/dispatch/
 * geo route legacy uses too. Neither lookup is new server logic, just
 * this form calling the same existing endpoints.
 *
 * The write path (addLoad/editLoad, lib/data resolveBrokerId/
 * resolveTripId) was extended in place to carry the new fields through
 * (MC/DOT/main-phone backfill onto the broker, dispatcher contact capture
 * onto broker_contacts) rather than forked — see src/actions/tms-v2/
 * loads.ts's header for detail. Legacy's Add form also has a status
 * dropdown; deliberately NOT ported here — tms-v2 keeps status changes
 * scoped to their own dedicated actions (markLoadDelivered/markLoadTonu/
 * editLoadOdometer), not a side effect of this form.
 */
export function LoadFormModal({ open, onClose, brokerNames, activeTripNames, load, onSaved }: Props) {
  const editing = load != null;
  const loadTrip = load?.tripName?.trim() ?? "";
  const [trip, setTrip] = useState(loadTrip);
  const [namingNewTrip, setNamingNewTrip] = useState(false);

  const [broker, setBroker] = useState(load?.brokerName ?? "");
  const [brokerMc, setBrokerMc] = useState("");
  const [brokerDot, setBrokerDot] = useState("");
  const [brokerMainPhone, setBrokerMainPhone] = useState("");
  const [brokerContactName, setBrokerContactName] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");
  const [brokerPhone, setBrokerPhone] = useState("");
  const [lookupKind, setLookupKind] = useState<"mc" | "dot">("mc");
  const [lookupVal, setLookupVal] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [originZip, setOriginZip] = useState(load?.originZip ?? "");
  const [destZip, setDestZip] = useState(load?.destZip ?? "");
  const [originCity, setOriginCity] = useState("");
  const [destCity, setDestCity] = useState("");
  const [miles, setMiles] = useState(load?.loadedMiles != null ? String(load.loadedMiles) : "");
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const reqId = useRef(0);

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
      setLookupMsg(null);
      setLookupVal("");
    }
  }, [open, loadTrip]);

  const five = (z: string) => /^\d{5}$/.test(z.trim());

  // Resolve city/state for whichever ZIP changed, and lane miles once both
  // are valid 5-digit ZIPs — same /api/admin/dispatch/geo route legacy's
  // form calls. The server still recomputes all of this on submit
  // (loadFieldsFromForm); this is live feedback only.
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
    setGeoMsg(null);
    // Deliberately no setMiles("") here on partial input — matches legacy,
    // avoids clobbering a manually-typed miles value while a ZIP is mid-edit.
  }, [originZip, destZip]);

  async function runBrokerLookup() {
    const v = lookupVal.trim();
    if (!v) return;
    setLookupLoading(true);
    setLookupMsg(null);
    try {
      const res = await fetch(`/api/admin/fmcsa?${lookupKind}=${encodeURIComponent(v)}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupMsg({ tone: "err", text: data?.error ?? "No match found." });
        return;
      }
      setBroker(data.name ?? data.dbaName ?? "");
      setBrokerMc(data.mcNumber ?? (lookupKind === "mc" ? v : ""));
      setBrokerDot(data.dotNumber ?? (lookupKind === "dot" ? v : ""));
      if (data.phone) setBrokerMainPhone(data.phone);
      const op = data.allowedToOperate === false ? " — NOT allowed to operate" : "";
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
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit load" : "Add load"}
      maxWidthClassName="max-w-xl"
      footer={
        <div className="flex flex-col gap-2">
          <FormError message={state.error} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Equipment: Hotshot</span>
            <FormActions>
              <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" form={FORM_ID} disabled={pending} aria-busy={pending}>
                {pending ? "Saving…" : editing ? "Save changes" : "Add load"}
              </Button>
            </FormActions>
          </div>
        </div>
      }
    >
      <form id={FORM_ID} action={formAction} className="flex flex-col gap-3">
        <datalist id="tms-v2-broker-options">
          {brokerNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        {/* Broker */}
        <section className={SECTION}>
          <p className={SECTION_TITLE}>Broker</p>
          <Field label="Load #" name="load_number" defaultValue={load?.loadNumber ?? ""} />

          <div>
            <Field
              label="Broker / customer"
              name="broker_name"
              required
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              list="tms-v2-broker-options"
              autoComplete="off"
            />
            <input type="hidden" name="broker_mc" value={brokerMc} />
            <input type="hidden" name="broker_dot" value={brokerDot} />
            <input type="hidden" name="broker_main_phone" value={brokerMainPhone} />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-md border border-line-strong">
                {(["mc", "dot"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setLookupKind(k)}
                    className={`${TOGGLE_BASE} ${lookupKind === k ? "bg-fg text-canvas" : "bg-card text-fg-muted hover:bg-elevated"}`}
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
                placeholder={lookupKind === "mc" ? "MC number" : "DOT number"}
                className="h-9 w-32 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => void runBrokerLookup()} disabled={lookupLoading || !lookupVal.trim()}>
                {lookupLoading ? "…" : "Look up"}
              </Button>
              {lookupMsg ? (
                <span className={`truncate text-[12px] ${lookupMsg.tone === "err" ? "text-bad" : "text-ok"}`}>{lookupMsg.text}</span>
              ) : brokerMc || brokerDot ? (
                <span className="truncate text-[12px] text-fg-muted">
                  MC {brokerMc || "—"} · DOT {brokerDot || "—"}
                </span>
              ) : null}
            </div>
          </div>
        </section>

        {/* Lane & schedule */}
        <section className={SECTION}>
          <p className={SECTION_TITLE}>Lane &amp; schedule</p>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <Field
                label="Origin ZIP"
                name="origin_zip"
                required
                value={originZip}
                onChange={(e) => setOriginZip(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
              />
              <p className="mt-1 truncate text-[12px] text-fg-muted">{originCity || "City, ST"}</p>
            </div>
            <div className="min-w-0">
              <Field
                label="Destination ZIP"
                name="dest_zip"
                required
                value={destZip}
                onChange={(e) => setDestZip(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
              />
              <p className="mt-1 truncate text-[12px] text-fg-muted">{destCity || "City, ST"}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Pickup date" name="pickup_date" type="date" defaultValue={dateValue(load?.pickupDate)} />
            <Field label="Delivery date" name="delivery_date" type="date" defaultValue={dateValue(load?.deliveryDate)} />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Rate ($)" name="rate" type="number" step="any" min="0" required defaultValue={load?.rate != null ? String(load.rate) : ""} />
            <Field label="Loaded miles" name="loaded_miles" type="number" min="0" value={miles} onChange={(e) => setMiles(e.target.value)} autoComplete="off" />
          </div>
          {geoMsg ? <p className="text-[12px] text-fg-muted">{geoMsg}</p> : null}

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
        </section>

        {/* Dispatcher contact — last, since it's often not known until the
            load is nearly booked. Saved under the broker via
            broker_contacts, not as its main line. */}
        <section className={SECTION}>
          <p className={SECTION_TITLE}>Dispatcher contact</p>
          <Field
            label="Dispatcher name"
            name="broker_contact_name"
            value={brokerContactName}
            onChange={(e) => setBrokerContactName(e.target.value)}
            autoComplete="off"
            placeholder="e.g. Mike at Dispatch"
          />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Field
              label="Dispatcher email"
              name="broker_email"
              type="email"
              value={brokerEmail}
              onChange={(e) => setBrokerEmail(e.target.value)}
              autoComplete="off"
            />
            <Field
              label="Dispatcher phone"
              name="broker_phone"
              value={brokerPhone}
              onChange={(e) => setBrokerPhone(e.target.value)}
              autoComplete="off"
            />
          </div>
        </section>
      </form>
    </Modal>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { farmBrokerContact } from "./farm-contact-actions";

/**
 * "Farm a Broker Contact" — a dashboard card (shown only when there are no
 * active loads) that captures a broker + a zip-coded lane off a load board so
 * it feeds the Backhaul matcher even when nothing is booked.
 *
 * MC → FMCSA auto-fill, two smart city typeaheads (city → ZIP, selection only),
 * optional rate / equipment / note, and an is_backhaul toggle. Save upserts the
 * broker, the (backhaul-flagged) contact, and the broker_lanes row.
 */

type CityHit = {
  city: string;
  state: string;
  zip: string;
  lat: number;
  lon: number;
};

type FmcsaResult = {
  name: string;
  phone: string | null;
  mc: string;
  dot: string;
  authority: string;
} | null;

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

export function FarmBrokerContactCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="my-5 h-px bg-line" />
      <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
              Farm a broker contact
            </p>
            <p className="mt-1 text-[12.5px] text-emerald-900/80">
              You&apos;re empty — grab a broker + lane off the board so Backhaul
              can match it later.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-600 px-3.5 py-2 font-mono text-[12px] font-bold uppercase leading-none tracking-[0.08em] text-white transition-colors hover:bg-emerald-700"
          >
            + Quick Add Contact
          </button>
        </div>
      </section>

      {open ? <FarmModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function FarmModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mc, setMc] = useState("");
  const [searching, setSearching] = useState(false);
  const [fmcsa, setFmcsa] = useState<FmcsaResult>(null);
  const [lookupMsg, setLookupMsg] = useState<
    { tone: "ok" | "err"; text: string } | null
  >(null);

  const [brokerName, setBrokerName] = useState("");
  const [dot, setDot] = useState("");
  const [phone, setPhone] = useState("");

  const [origin, setOrigin] = useState<CityHit | null>(null);
  const [originState, setOriginState] = useState("");
  const [dest, setDest] = useState<CityHit | null>(null);
  const [destState, setDestState] = useState("");

  const [rate, setRate] = useState("");
  const [equipment, setEquipment] = useState("");
  const [note, setNote] = useState("");
  const [isBackhaul, setIsBackhaul] = useState(true);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  async function runLookup() {
    const v = mc.trim();
    if (!v) return;
    setSearching(true);
    setLookupMsg(null);
    try {
      const res = await fetch(`/api/admin/fmcsa?mc=${encodeURIComponent(v)}`);
      const data = await res.json();
      if (!res.ok) {
        setFmcsa(null);
        setLookupMsg({
          tone: "err",
          text: `${data?.error ?? "No match"} — you can still type the name and save.`,
        });
        return;
      }
      const name = data.name ?? data.dbaName ?? "";
      const authority =
        data.authoritySummary ??
        (data.brokerAuthority === true
          ? "Broker authority active"
          : data.brokerAuthority === false
            ? "Broker authority inactive"
            : "");
      setBrokerName(name);
      setDot(data.dotNumber ?? "");
      if (data.phone) setPhone(data.phone);
      setFmcsa({
        name,
        phone: data.phone ?? null,
        mc: data.mcNumber ?? v,
        dot: data.dotNumber ?? "",
        authority,
      });
      setLookupMsg(null);
    } catch {
      setFmcsa(null);
      setLookupMsg({
        tone: "err",
        text: "Network error reaching FMCSA — type the name and save.",
      });
    } finally {
      setSearching(false);
    }
  }

  async function onSave() {
    if (busy) return;
    if (!brokerName.trim()) {
      setErr("Add a broker name (search MC or type it).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("broker_name", brokerName.trim());
      if (mc.trim()) fd.set("mc_number", mc.trim());
      if (dot.trim()) fd.set("dot_number", dot.trim());
      if (phone.trim()) {
        fd.set("contact_phone", phone.trim());
        fd.set("contact_name", "Dispatch");
      }
      fd.set("is_backhaul", isBackhaul ? "true" : "false");

      if (origin) {
        fd.set("origin_zip", origin.zip);
        fd.set("origin_city", origin.city);
        fd.set("origin_state", origin.state);
      } else if (originState) {
        fd.set("origin_state", originState);
      }
      if (dest) {
        fd.set("dest_zip", dest.zip);
        fd.set("dest_city", dest.city);
        fd.set("dest_state", dest.state);
      } else if (destState) {
        fd.set("dest_state", destState);
      }

      if (rate.trim()) fd.set("rate", rate.trim());
      if (equipment.trim()) fd.set("equipment", equipment.trim());
      if (note.trim()) fd.set("note", note.trim());

      const res = await farmBrokerContact(fd);
      if (!res.ok) {
        setErr(res.reason);
        return;
      }
      setOk("Saved to contacts + lanes");
      router.refresh();
      closeTimer.current = setTimeout(onClose, 1100);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick add broker contact"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-3 sm:p-6"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="my-2 w-full max-w-md overflow-hidden rounded-md border border-line-strong bg-card shadow-2xl sm:my-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
          <span className="truncate font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            Farm a broker contact
          </span>
          <Button
            type="button"
            variant="cancel"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>

        <div className="space-y-3 bg-elevated px-4 py-4">
          {/* MC lookup */}
          <div>
            <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
              MC number
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={mc}
                onChange={(e) => setMc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runLookup();
                  }
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 123456"
                className="min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
              <Button
                type="button"
                variant="navigate"
                size="sm"
                onClick={() => void runLookup()}
                disabled={searching || !mc.trim()}
              >
                {searching ? "…" : "Search"}
              </Button>
            </div>
            {lookupMsg ? (
              <p
                className={
                  "mt-1 text-[11px] " +
                  (lookupMsg.tone === "err" ? "text-red-700" : "text-green-700")
                }
              >
                {lookupMsg.text}
              </p>
            ) : null}
          </div>

          {/* FMCSA auto-fill card */}
          {fmcsa ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2.5">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                Auto-filled from FMCSA
              </p>
              <p className="mt-0.5 truncate text-[13px] font-semibold text-fg">
                {fmcsa.name || "—"}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-fg-muted">
                MC {fmcsa.mc || "—"}
                {fmcsa.dot ? ` · DOT ${fmcsa.dot}` : ""}
                {fmcsa.phone ? ` · ${fmcsa.phone}` : ""}
              </p>
              {fmcsa.authority ? (
                <p className="mt-0.5 text-[11px] text-emerald-800">
                  {fmcsa.authority}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Broker name (editable / manual fallback) */}
          <div>
            <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
              Broker / customer
              <span className="ml-1.5 rounded bg-red-100 px-1.5 py-[1px] align-middle font-mono text-[8.5px] font-bold uppercase tracking-[0.08em] text-red-700">
                Required
              </span>
            </label>
            <input
              value={brokerName}
              onChange={(e) => setBrokerName(e.target.value)}
              autoComplete="off"
              placeholder="Type the broker name"
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
            />
          </div>

          {/* Lane — city typeaheads (selection only) */}
          <div className="rounded-md border border-line bg-card p-3">
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-fg">
              Lane
            </p>
            <CityPicker
              label="Origin city"
              value={origin}
              onChange={setOrigin}
              stateOnly={originState}
              onStateOnly={setOriginState}
            />
            <div className="mt-3">
              <CityPicker
                label="Destination city"
                value={dest}
                onChange={setDest}
                stateOnly={destState}
                onStateOnly={setDestState}
              />
            </div>
          </div>

          {/* Optional */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
                Posted rate ($)
              </label>
              <input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                className="mt-1 block w-full min-w-0 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
            </div>
            <div className="min-w-0">
              <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
                Equipment
              </label>
              <input
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                autoComplete="off"
                placeholder="Reefer, Flatbed…"
                className="mt-1 block w-full min-w-0 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
              Note
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoComplete="off"
              placeholder="Anything worth remembering"
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={isBackhaul}
              onChange={(e) => setIsBackhaul(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            <span className="text-[12.5px] font-semibold text-fg">
              Mark as backhaul lane
            </span>
          </label>

          {ok ? (
            <p
              role="status"
              className="flex items-center gap-1.5 rounded-md border border-green-300 bg-green-50 px-2.5 py-1.5 text-[12px] font-semibold text-green-700"
            >
              <span aria-hidden>✓</span> {ok}
            </p>
          ) : null}
          {err ? (
            <p role="alert" className="text-[12px] font-semibold text-red-700">
              {err}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
          <Button type="button" variant="cancel" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onSave}
            disabled={busy || ok != null}
            aria-busy={busy}
          >
            {ok ? "Saved ✓" : busy ? "Saving…" : "Save Contact"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Smart city typeahead. He types a city, picks one from the dropdown, and the
 * ZIP is attached automatically — no manual ZIPs, no free-typed cities in the
 * saved record. If nothing matches, a state-only select is the fallback so the
 * save is never blocked.
 */
function CityPicker({
  label,
  value,
  onChange,
  stateOnly,
  onStateOnly,
}: {
  label: string;
  value: CityHit | null;
  onChange: (v: CityHit | null) => void;
  stateOnly: string;
  onStateOnly: (s: string) => void;
}) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<CityHit[]>([]);
  const [openList, setOpenList] = useState(false);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    if (value) return; // a city is chosen — stop searching
    const q = text.trim();
    if (q.length < 2) {
      setHits([]);
      setOpenList(false);
      return;
    }
    const id = ++reqRef.current;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/admin/dispatch/cities?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => {
          if (id !== reqRef.current) return;
          setHits(j.cities ?? []);
          setOpenList(true);
        })
        .catch(() => {})
        .finally(() => {
          if (id === reqRef.current) setLoading(false);
        });
    }, 200);
    return () => clearTimeout(t);
  }, [text, value]);

  return (
    <div className="relative">
      <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg">
        {label}
      </label>

      {value ? (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5">
          <span className="min-w-0 truncate text-[13px] font-semibold text-fg">
            {value.city}, {value.state}
            <span className="ml-1.5 font-mono text-[11px] font-normal text-fg-muted">
              {value.zip}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setText("");
            }}
            className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700 hover:text-emerald-800"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => hits.length > 0 && setOpenList(true)}
            autoComplete="off"
            placeholder="Type a city…"
            className="mt-1 block w-full min-w-0 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
          />
          {openList && hits.length > 0 ? (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line-strong bg-card shadow-lg">
              {hits.map((h) => (
                <li key={`${h.zip}-${h.city}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(h);
                      onStateOnly("");
                      setOpenList(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-fg transition-colors hover:bg-elevated"
                  >
                    <span className="truncate">
                      {h.city}, {h.state}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                      {h.zip}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {/* Fallback: no city match → confirm a state so the save isn't blocked. */}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
              No match? State only
            </span>
            <select
              value={stateOnly}
              onChange={(e) => onStateOnly(e.target.value)}
              className="rounded-md border border-line-strong bg-card px-2 py-1 font-mono text-[11px] text-fg focus:border-fg focus:outline-none"
            >
              <option value="">—</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {loading ? (
              <span className="font-mono text-[10px] text-fg-subtle">
                searching…
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

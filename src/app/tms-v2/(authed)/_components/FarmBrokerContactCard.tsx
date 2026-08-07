"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { farmBrokerContact } from "@/actions/tms-v2/farm-contact";
import type { MutationResult } from "@/lib/demo/mutation";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC",
];

type FmcsaResult = { name: string; phone: string | null; mc: string; dot: string } | null;

/** "Farm a broker contact" — the empty-truck nudge Brent asked to keep from
 * legacy (FarmBrokerContactCard.tsx), modernized into V2 tokens. Simplified
 * from legacy: origin/destination are plain city + state text rather than
 * a ZIP-driven city typeahead (disclosed in farm-contact.ts's header). MC
 * lookup still hits the shared /api/admin/fmcsa proxy (same admin session
 * /tms-v2 already shares). */
export function FarmBrokerContactCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-xl border border-ok/30 bg-ok-bg px-4 py-4 text-center shadow-e1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ok">Farm a broker contact</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-ok/90">
          You&apos;re empty — grab a broker + lane off the board so Backhaul can match it later.
        </p>
        <Button type="button" size="sm" onClick={() => setOpen(true)} className="mt-3 bg-ok text-white hover:bg-ok hover:opacity-90">
          + Quick add contact
        </Button>
      </div>
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
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [brokerName, setBrokerName] = useState("");
  const [contactName, setContactName] = useState("");
  const [dot, setDot] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [originCity, setOriginCity] = useState("");
  const [originState, setOriginState] = useState("");
  const [destCity, setDestCity] = useState("");
  const [destState, setDestState] = useState("");
  const [isBackhaul, setIsBackhaul] = useState(true);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  async function runLookup() {
    const v = mc.trim();
    if (!v) return;
    setSearching(true);
    setLookupError(null);
    try {
      const res = await fetch(`/api/admin/fmcsa?mc=${encodeURIComponent(v)}`);
      const data = await res.json();
      if (!res.ok) {
        setFmcsa(null);
        setLookupError(`${data?.error ?? "No match"} — you can still type the name and save.`);
        return;
      }
      const name = data.name ?? data.dbaName ?? "";
      setBrokerName(name);
      setDot(data.dotNumber ?? "");
      if (data.phone) setPhone(data.phone);
      setFmcsa({ name, phone: data.phone ?? null, mc: data.mcNumber ?? v, dot: data.dotNumber ?? "" });
    } catch {
      setFmcsa(null);
      setLookupError("Network error reaching FMCSA — type the name and save.");
    } finally {
      setSearching(false);
    }
  }

  async function onSave() {
    if (busy) return;
    const broker = brokerName.trim() || contactName.trim();
    if (!broker) {
      setErr("Search an MC, or enter a contact name, to save.");
      return;
    }
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("broker_name", broker);
    if (mc.trim()) fd.set("mc_number", mc.trim());
    if (dot.trim()) fd.set("dot_number", dot.trim());
    if (contactName.trim()) fd.set("contact_name", contactName.trim());
    if (phone.trim()) fd.set("contact_phone", phone.trim());
    if (email.trim()) fd.set("contact_email", email.trim());
    fd.set("is_backhaul", isBackhaul ? "true" : "false");
    if (originCity.trim()) fd.set("origin_city", originCity.trim());
    if (originState) fd.set("origin_state", originState);
    if (destCity.trim()) fd.set("dest_city", destCity.trim());
    if (destState) fd.set("dest_state", destState);

    const result: MutationResult<{ brokerId: string }> = await farmBrokerContact(fd);
    if (!result.ok) {
      setBusy(false);
      setErr(result.reason);
      return;
    }
    setOk("Saved to contacts + lanes");
    router.refresh();
    closeTimer.current = setTimeout(onClose, 1100);
  }

  return (
    <Modal open onClose={onClose} title="Farm a broker contact">
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[12px] font-medium text-fg-muted">MC number</label>
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
              placeholder="e.g. 123456"
              className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => void runLookup()} disabled={searching || !mc.trim()}>
              {searching ? "…" : "Search"}
            </Button>
          </div>
          {lookupError ? <p className="mt-1 text-[12px] text-bad">{lookupError}</p> : null}
        </div>

        {fmcsa ? (
          <div className="rounded-md border border-ok/30 bg-ok-bg px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ok">Auto-filled from FMCSA</p>
            <p className="mt-0.5 truncate text-[13px] font-semibold text-fg">{fmcsa.name || "—"}</p>
            <p className="mt-0.5 text-[12px] text-fg-muted">
              MC {fmcsa.mc || "—"}
              {fmcsa.dot ? ` · DOT ${fmcsa.dot}` : ""}
              {fmcsa.phone ? ` · ${fmcsa.phone}` : ""}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[12px] font-medium text-fg-muted">Broker / company</label>
            <input
              value={brokerName}
              onChange={(e) => setBrokerName(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-fg-muted">Contact name</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Dispatcher"
              className="mt-1 h-9 w-full rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[12px] font-medium text-fg-muted">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              className="mt-1 h-9 w-full rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-fg-muted">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="mt-1 h-9 w-full rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
            />
          </div>
        </div>

        <div className="rounded-md border border-line bg-elevated p-2.5">
          <p className="mb-2 text-[12px] font-semibold text-fg">Lane</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={originCity}
              onChange={(e) => setOriginCity(e.target.value)}
              placeholder="Origin city"
              className="h-9 w-full rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
            />
            <select
              value={originState}
              onChange={(e) => setOriginState(e.target.value)}
              className="h-9 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg focus:border-fg focus:outline-none"
            >
              <option value="">State</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <input
              value={destCity}
              onChange={(e) => setDestCity(e.target.value)}
              placeholder="Destination city"
              className="h-9 w-full rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
            />
            <select
              value={destState}
              onChange={(e) => setDestState(e.target.value)}
              className="h-9 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg focus:border-fg focus:outline-none"
            >
              <option value="">State</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <label className="mt-2 flex items-center gap-2 text-[12px] font-medium text-fg">
            <input type="checkbox" checked={isBackhaul} onChange={(e) => setIsBackhaul(e.target.checked)} className="h-4 w-4" />
            Mark as backhaul lane
          </label>
        </div>

        {ok ? <p className="text-[13px] font-medium text-ok">✓ {ok}</p> : null}
        {err ? <p className="text-[13px] font-medium text-bad">{err}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={busy || ok != null} aria-busy={busy}>
            {ok ? "Saved ✓" : busy ? "Saving…" : "Save contact"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

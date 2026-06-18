"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { quickAddBrokerLane } from "./actions";

const FIELD =
  "mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none";
const LABEL =
  "block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg";

type Msg = { tone: "ok" | "err"; text: string } | null;

export function QuickAddForm({ brokerNames }: { brokerNames: string[] }) {
  const router = useRouter();
  const [mc, setMc] = useState("");
  const [dot, setDot] = useState("");
  const [brokerName, setBrokerName] = useState("");
  const [dispatcher, setDispatcher] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [originZip, setOriginZip] = useState("");
  const [destZip, setDestZip] = useState("");
  const [rate, setRate] = useState("");

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<Msg>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [msg, setMsg] = useState<Msg>(null);
  const mcRef = useRef<HTMLInputElement>(null);

  async function runLookup() {
    const v = mc.trim();
    if (!v) return;
    setLookupLoading(true);
    setLookupMsg(null);
    try {
      const res = await fetch(`/api/admin/fmcsa?mc=${encodeURIComponent(v)}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupMsg({ tone: "err", text: data?.error ?? "No match found." });
        return;
      }
      const name = data.name ?? data.dbaName ?? "";
      if (name) setBrokerName(name);
      if (data.dotNumber) setDot(String(data.dotNumber));
      if (data.mcNumber) setMc(String(data.mcNumber));
      setLookupMsg({ tone: "ok", text: name ? `Found: ${name}` : "Found." });
    } catch {
      setLookupMsg({ tone: "err", text: "Network error reaching FMCSA." });
    } finally {
      setLookupLoading(false);
    }
  }

  function clearForm() {
    setMc("");
    setDot("");
    setBrokerName("");
    setDispatcher("");
    setEmail("");
    setPhone("");
    setOriginZip("");
    setDestZip("");
    setRate("");
    setLookupMsg(null);
    mcRef.current?.focus();
  }

  async function save(addAnother: boolean) {
    if (!brokerName.trim()) {
      setMsg({ tone: "err", text: "Broker name is required." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("broker_name", brokerName);
      fd.append("mc_number", mc);
      fd.append("dot_number", dot);
      fd.append("dispatcher_name", dispatcher);
      fd.append("email", email);
      fd.append("phone", phone);
      fd.append("origin_zip", originZip);
      fd.append("dest_zip", destZip);
      fd.append("rate", rate);
      const res = await quickAddBrokerLane(fd);
      if (!res.ok) {
        setMsg({ tone: "err", text: res.reason });
        return;
      }
      setSavedCount((c) => c + 1);
      if (addAnother) {
        clearForm();
        setMsg({ tone: "ok", text: "Saved. Add the next one." });
      } else {
        router.push(`/admin/dispatch/brokers/${res.brokerId}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-5 sm:px-6">
      <header className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
            Dispatch
          </p>
          <h1 className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-fg">
            Quick add broker
          </h1>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Capture brokers &amp; lanes off the load board so Backhaul can
            surface them later.
          </p>
        </div>
        {savedCount > 0 ? (
          <span className="shrink-0 rounded border border-line bg-card px-2 py-1 font-mono text-[11px] text-fg-muted">
            {savedCount} added
          </span>
        ) : null}
      </header>

      <div className="rounded-md border border-line bg-card p-3.5 shadow-sm">
        <label className={LABEL}>MC number</label>
        <div className="mt-1 flex gap-2">
          <input
            ref={mcRef}
            value={mc}
            onChange={(e) => setMc(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 765587"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runLookup();
              }
            }}
            className="flex-1 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void runLookup()}
            disabled={lookupLoading || !mc.trim()}
            className="rounded-md border border-line-strong bg-card px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-fg transition-colors hover:bg-elevated disabled:opacity-40"
          >
            {lookupLoading ? "…" : "Look up"}
          </button>
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

        <div className="mt-3">
          <label className={LABEL}>Broker / company</label>
          <input
            value={brokerName}
            onChange={(e) => setBrokerName(e.target.value)}
            list="qa-brokers"
            autoComplete="off"
            className={FIELD}
          />
          <datalist id="qa-brokers">
            {brokerNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>

        <div className="mt-3">
          <label className={LABEL}>Dispatcher name</label>
          <input
            value={dispatcher}
            onChange={(e) => setDispatcher(e.target.value)}
            placeholder="e.g. Mike R."
            autoComplete="off"
            className={FIELD}
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="off"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="off"
              className={FIELD}
            />
          </div>
        </div>

        <div className="my-3 border-t border-line" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Origin ZIP</label>
            <input
              value={originZip}
              onChange={(e) => setOriginZip(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="powers Backhaul"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL}>Destination ZIP</label>
            <input
              value={destZip}
              onChange={(e) => setDestZip(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="optional"
              className={FIELD}
            />
          </div>
        </div>

        <div className="mt-3">
          <label className={LABEL}>Posted rate (optional)</label>
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="$"
            className={FIELD}
          />
        </div>

        {msg ? (
          <p
            className={
              "mt-3 text-[12px] " +
              (msg.tone === "err" ? "text-red-700" : "text-green-700")
            }
          >
            {msg.text}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void save(true)}
            disabled={saving}
            className="flex-1 rounded-md border border-red-700 bg-red-600 px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save & add another"}
          </button>
          <button
            type="button"
            onClick={() => void save(false)}
            disabled={saving}
            className="rounded-md border border-line-strong bg-card px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-fg transition-colors hover:bg-elevated disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

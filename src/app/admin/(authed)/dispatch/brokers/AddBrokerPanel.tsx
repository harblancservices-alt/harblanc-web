"use client";

import { useState } from "react";
import { createBroker } from "./actions";

/**
 * Add-broker panel for the Brokers directory. Lets the operator either type
 * an MC or DOT number and pull the registered company straight from FMCSA
 * (auto-filling name / DOT / MC / phone / authority), or fill it manually.
 * Submits to the createBroker server action.
 */

type Filled = {
  name: string;
  broker_type: string;
  mc_number: string;
  dot_number: string;
  phone: string;
  authority: string;
};

const EMPTY: Filled = {
  name: "",
  broker_type: "Brokerage",
  mc_number: "",
  dot_number: "",
  phone: "",
  authority: "",
};

export function AddBrokerPanel({ forceOpen = false }: { forceOpen?: boolean }) {
  const [open, setOpen] = useState(forceOpen);
  const [lookupKind, setLookupKind] = useState<"mc" | "dot">("mc");
  const [lookupValue, setLookupValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );
  const [fields, setFields] = useState<Filled>(EMPTY);

  async function runLookup() {
    const v = lookupValue.trim();
    if (!v) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/admin/fmcsa?${lookupKind}=${encodeURIComponent(v)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setMsg({ tone: "err", text: data?.error ?? "Lookup failed." });
        return;
      }
      const authText = data.authoritySummary
        ? data.authoritySummary
        : data.brokerAuthority === true
          ? "Broker authority active"
          : data.brokerAuthority === false
            ? "Broker authority inactive"
            : "";
      setFields({
        name: data.name ?? data.dbaName ?? "",
        broker_type: "Brokerage",
        mc_number: data.mcNumber ?? "",
        dot_number: data.dotNumber ?? "",
        phone: data.phone ?? "",
        authority: authText,
      });
      const op =
        data.allowedToOperate === false ? " — NOT allowed to operate" : "";
      setMsg({
        tone: data.allowedToOperate === false ? "err" : "ok",
        text: `Found: ${data.name ?? data.dbaName ?? "company"}${op}. Review and create.`,
      });
    } catch {
      setMsg({ tone: "err", text: "Network error reaching FMCSA." });
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof Filled>(k: K, val: string) {
    setFields((f) => ({ ...f, [k]: val }));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-3 inline-flex items-center gap-2 rounded-md border border-red-700 bg-red-600 px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-700"
      >
        <span className="text-[14px] leading-none">+</span> Add broker
      </button>
    );
  }

  return (
    <div className="mb-3 overflow-hidden rounded-md border border-line bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-line bg-bar px-3.5 py-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-bar-fg">
          Add broker
        </span>
        {forceOpen ? null : (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setMsg(null);
            }}
            className="font-mono text-[11px] uppercase tracking-[0.1em] text-bar-fg/70 transition-colors hover:text-bar-fg"
          >
            Cancel
          </button>
        )}
      </div>

      {/* FMCSA lookup */}
      <div className="border-b border-line bg-elevated px-3.5 py-3">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-600">
          Pull from FMCSA
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-line-strong">
            {(["mc", "dot"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setLookupKind(k)}
                className={
                  "px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] transition-colors " +
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
            value={lookupValue}
            onChange={(e) => setLookupValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runLookup();
              }
            }}
            placeholder={lookupKind === "mc" ? "MC number" : "DOT number"}
            inputMode="numeric"
            className="w-40 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void runLookup()}
            disabled={loading || !lookupValue.trim()}
            className="rounded-md border border-line-strong bg-card px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-fg transition-colors hover:bg-elevated disabled:opacity-40"
          >
            {loading ? "Looking up…" : "Look up"}
          </button>
        </div>
        {msg ? (
          <p
            className={
              "mt-2 text-[12px] " +
              (msg.tone === "err" ? "text-red-700" : "text-green-700")
            }
          >
            {msg.text}
          </p>
        ) : null}
      </div>

      {/* Create form (pre-filled by lookup, fully editable) */}
      <form
        action={createBroker}
        className="grid grid-cols-1 gap-3 px-3.5 py-4 sm:grid-cols-3"
      >
        <label className="flex items-start gap-2.5 rounded-md border border-line-strong bg-elevated px-3 py-2.5 sm:col-span-3">
          <input
            type="checkbox"
            name="factoring"
            defaultChecked
            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
          />
          <span className="min-w-0">
            <span className="block font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-fg">
              Factoring
            </span>
            <span className="block text-[11.5px] text-fg-subtle">
              This broker&apos;s loads are factored.
            </span>
          </span>
        </label>
        <In name="name" label="Broker name" value={fields.name} onChange={(v) => set("name", v)} required />
        <In name="broker_type" label="Type" value={fields.broker_type} onChange={(v) => set("broker_type", v)} />
        <In name="dot_number" label="DOT number" value={fields.dot_number} onChange={(v) => set("dot_number", v)} />
        <In name="mc_number" label="MC number" value={fields.mc_number} onChange={(v) => set("mc_number", v)} />
        <In name="phone" label="Phone" value={fields.phone} onChange={(v) => set("phone", v)} />
        <In name="authority" label="Authority" value={fields.authority} onChange={(v) => set("authority", v)} />
        <div className="flex items-end sm:col-span-3 sm:justify-end">
          <button
            type="submit"
            className="rounded-md border border-red-700 bg-red-600 px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700"
          >
            Create broker
          </button>
        </div>
      </form>
    </div>
  );
}

function In({
  name,
  label,
  value,
  onChange,
  required = false,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete="off"
        className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
      />
    </div>
  );
}

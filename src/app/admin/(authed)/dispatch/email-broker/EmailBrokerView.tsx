"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { quickAddBrokerLane } from "../brokers/quick-add/actions";
import { bodyLines, subjectFor } from "./content";
import { parseLoadLine } from "./parse";
import {
  sendBrokerEmail,
  sendBrokerEmailTest,
  type BrokerSendResult,
} from "./send-actions";

/**
 * Email-a-Broker — compose UI. Two paste inputs (broker email + a load line off
 * a load board), a live email preview, and a confirmed one-broker send. After a
 * real send succeeds it offers to save the broker via the existing FMCSA/MC
 * lookup + quick-add. Mobile-first.
 */

const FIELD =
  "mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none";
const LABEL =
  "block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg";

type Msg = { tone: "ok" | "err"; text: string } | null;

// "compose" → editing; "confirm" → the "Send this email?" step; "sent" → done,
// offering to add the broker.
type Phase = "compose" | "confirm" | "sent";

function isEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
}

export function EmailBrokerView() {
  const [brokerEmail, setBrokerEmail] = useState("");
  const [paste, setPaste] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  // Parse metadata for the "Read as" chip. `touched` stays false until the first
  // paste so we don't nag before he's typed anything.
  const [deadhead, setDeadhead] = useState<number | null>(null);
  const [confident, setConfident] = useState(false);
  const [touched, setTouched] = useState(false);

  const [phase, setPhase] = useState<Phase>("compose");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const subject = useMemo(
    () => subjectFor(origin.trim() || "Origin", destination.trim() || "Destination"),
    [origin, destination],
  );
  const preview = useMemo(
    () => bodyLines(origin.trim() || "Origin", destination.trim() || "Destination"),
    [origin, destination],
  );

  const canSend =
    isEmail(brokerEmail) && origin.trim().length > 0 && destination.trim().length > 0;

  function onPaste(text: string) {
    setPaste(text);
    setTouched(true);
    const parsed = parseLoadLine(text);
    setOrigin(parsed.origin);
    setDestination(parsed.destination);
    setDeadhead(parsed.deadhead);
    setConfident(parsed.confident);
    // Any edit invalidates a prior send flow.
    setPhase("compose");
    setMsg(null);
  }

  async function runTest() {
    setBusy(true);
    setMsg(null);
    try {
      const res: BrokerSendResult = await sendBrokerEmailTest({
        origin: origin.trim(),
        destination: destination.trim(),
      });
      setMsg(
        res.ok
          ? { tone: "ok", text: `Test sent to ${res.to}.` }
          : { tone: "err", text: res.reason },
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmSend() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await sendBrokerEmail({
        to: brokerEmail.trim(),
        origin: origin.trim(),
        destination: destination.trim(),
      });
      if (res.ok) {
        setPhase("sent");
        setMsg({ tone: "ok", text: `Sent to ${res.to}.` });
      } else {
        setPhase("compose");
        setMsg({ tone: "err", text: res.reason });
      }
    } finally {
      setBusy(false);
    }
  }

  function resetForNext() {
    setBrokerEmail("");
    setPaste("");
    setOrigin("");
    setDestination("");
    setDeadhead(null);
    setConfident(false);
    setTouched(false);
    setPhase("compose");
    setMsg(null);
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-5 sm:px-6">
      <header className="mb-3">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
          Dispatch
        </p>
        <h1 className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-fg">
          Email a Broker
        </h1>
        <p className="mt-1.5 text-[13px] text-fg-muted">
          Paste the broker&apos;s email and the load line off the board — we
          email them about that load in one tap.
        </p>
      </header>

      {/* Compose card */}
      <div className="rounded-md border border-line bg-card p-3.5 shadow-sm">
        <label className={LABEL}>Broker email</label>
        <input
          value={brokerEmail}
          onChange={(e) => setBrokerEmail(e.target.value)}
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="paste the broker's email"
          className={FIELD}
        />

        <div className="mt-3">
          <label className={LABEL}>Paste load</label>
          <textarea
            value={paste}
            onChange={(e) => onPaste(e.target.value)}
            rows={2}
            autoComplete="off"
            placeholder="e.g. Dallas, TX  45  Atlanta, GA"
            className={FIELD + " resize-none font-mono"}
          />
          <p className="mt-1 text-[11px] text-fg-subtle">
            The number between the two cities is the truck-stop deadhead — we drop
            it.
          </p>
        </div>

        {/* Read-as chip */}
        {touched ? (
          confident ? (
            <div className="mt-2 rounded-md border border-green-600/40 bg-green-600/10 px-2.5 py-1.5 text-[12px] text-fg">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-green-700">
                Read as
              </span>{" "}
              {origin} → {destination}
              {deadhead != null ? (
                <span className="text-fg-muted">
                  {" "}
                  · dropped {deadhead} mi deadhead
                </span>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-[12px] text-fg">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700">
                Check this
              </span>{" "}
              Couldn&apos;t read that cleanly — confirm the origin and destination
              below.
            </div>
          )
        ) : null}

        {/* Always-editable origin / destination so he can fix any parse. */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Origin</label>
            <input
              value={origin}
              onChange={(e) => {
                setOrigin(e.target.value);
                setPhase("compose");
              }}
              autoComplete="off"
              placeholder="City, ST"
              className={
                FIELD + (touched && !confident ? " ring-2 ring-amber-500/50" : "")
              }
            />
          </div>
          <div>
            <label className={LABEL}>Destination</label>
            <input
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                setPhase("compose");
              }}
              autoComplete="off"
              placeholder="City, ST"
              className={
                FIELD + (touched && !confident ? " ring-2 ring-amber-500/50" : "")
              }
            />
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="mt-3 rounded-md border border-line bg-card p-3.5 shadow-sm">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-muted">
          Preview
        </p>
        <p className="mt-2 text-[12px] text-fg-subtle">
          <span className="font-mono">Subject:</span>{" "}
          <span className="text-fg">{subject}</span>
        </p>
        {/* Body — ONE uniform text style for every line (matches the email). */}
        <div className="mt-2 rounded border border-line bg-canvas p-3 text-[13px] leading-relaxed text-fg">
          {preview.map((line, i) => (
            <p key={i} className="mb-2 last:mb-0">
              {line}
            </p>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-fg-subtle">
          — then your branded signature (logo, Brent Harbaugh, MC, phone,
          Dispatch@).
        </p>
      </div>

      {/* Status */}
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

      {/* Actions */}
      {phase === "compose" ? (
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            variant="utility"
            onClick={() => void runTest()}
            disabled={busy || !origin.trim() || !destination.trim()}
          >
            {busy ? "…" : "Send test"}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setMsg(null);
              setPhase("confirm");
            }}
            disabled={busy || !canSend}
            className="flex-1"
          >
            Send
          </Button>
        </div>
      ) : null}

      {/* Confirm step */}
      {phase === "confirm" ? (
        <div className="mt-3 rounded-md border border-accent/40 bg-accent/5 p-3.5">
          <p className="text-[13px] font-semibold text-fg">Send this email?</p>
          <p className="mt-1.5 text-[12px] text-fg-muted">
            To <span className="font-mono text-fg">{brokerEmail.trim()}</span>
          </p>
          <p className="text-[12px] text-fg-muted">
            Subject <span className="font-mono text-fg">{subject}</span>
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="cancel"
              onClick={() => setPhase("compose")}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void confirmSend()}
              disabled={busy}
              className="flex-1"
            >
              {busy ? "Sending…" : "Yes, send it"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* After a real send — offer to save the broker. */}
      {phase === "sent" ? (
        <AddBrokerPanel
          brokerEmail={brokerEmail.trim()}
          onDone={resetForNext}
        />
      ) : null}
    </div>
  );
}

/**
 * Post-send "Add this broker?" flow. Yes → MC number + FMCSA lookup (reusing the
 * existing /api/admin/fmcsa proxy) auto-fills name + phone, then saves via the
 * existing quickAddBrokerLane action (broker + a contact carrying the email).
 */
function AddBrokerPanel({
  brokerEmail,
  onDone,
}: {
  brokerEmail: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState<null | boolean>(null); // null = prompt
  const [mc, setMc] = useState("");
  const [dot, setDot] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<Msg>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<Msg>(null);
  const [saved, setSaved] = useState(false);

  async function runLookup() {
    const v = mc.trim();
    if (!v) return;
    setLookupBusy(true);
    setLookupMsg(null);
    try {
      const res = await fetch(`/api/admin/fmcsa?mc=${encodeURIComponent(v)}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupMsg({ tone: "err", text: data?.error ?? "No match found." });
        return;
      }
      const found = data.name ?? data.dbaName ?? "";
      if (found) setName(found);
      if (data.phone) setPhone(String(data.phone));
      if (data.dotNumber) setDot(String(data.dotNumber));
      if (data.mcNumber) setMc(String(data.mcNumber));
      setLookupMsg({ tone: "ok", text: found ? `Found: ${found}` : "Found." });
    } catch {
      setLookupMsg({ tone: "err", text: "Network error reaching FMCSA." });
    } finally {
      setLookupBusy(false);
    }
  }

  async function save() {
    if (!name.trim()) {
      setSaveMsg({ tone: "err", text: "Broker name is required." });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const fd = new FormData();
      fd.append("broker_name", name);
      fd.append("mc_number", mc);
      fd.append("dot_number", dot);
      fd.append("email", brokerEmail);
      fd.append("phone", phone);
      const res = await quickAddBrokerLane(fd);
      if (!res.ok) {
        setSaveMsg({ tone: "err", text: res.reason });
        return;
      }
      setSaved(true);
      setSaveMsg({ tone: "ok", text: "Broker saved." });
    } finally {
      setSaving(false);
    }
  }

  // Prompt state.
  if (open === null) {
    return (
      <div className="mt-3 rounded-md border border-line bg-card p-3.5 shadow-sm">
        <p className="text-[13px] font-semibold text-fg">Add this broker?</p>
        <p className="mt-1 text-[12px] text-fg-muted">
          Save <span className="font-mono text-fg">{brokerEmail}</span> to your
          brokers.
        </p>
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="cancel" onClick={onDone}>
            No
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => setOpen(true)}
            className="flex-1"
          >
            Yes, add broker
          </Button>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="mt-3 rounded-md border border-green-600/40 bg-green-600/10 p-3.5">
        <p className="text-[13px] font-semibold text-green-700">Broker saved.</p>
        <div className="mt-3">
          <Button type="button" variant="primary" onClick={onDone}>
            Done — new email
          </Button>
        </div>
      </div>
    );
  }

  // Add form.
  return (
    <div className="mt-3 rounded-md border border-line bg-card p-3.5 shadow-sm">
      <p className="text-[13px] font-semibold text-fg">Add broker</p>
      <p className="mt-1 text-[12px] text-fg-muted">
        Email <span className="font-mono text-fg">{brokerEmail}</span>
      </p>

      <div className="mt-3">
        <label className={LABEL}>MC number</label>
        <div className="mt-1 flex gap-2">
          <input
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
            disabled={lookupBusy || !mc.trim()}
            className="rounded-md border border-line-strong bg-card px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-fg transition-colors hover:bg-elevated disabled:opacity-40"
          >
            {lookupBusy ? "…" : "Look up"}
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
      </div>

      <div className="mt-3">
        <label className={LABEL}>Broker / company</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          placeholder="auto-fills from the MC lookup"
          className={FIELD}
        />
      </div>

      <div className="mt-3">
        <label className={LABEL}>Phone</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="off"
          placeholder="auto-fills from the MC lookup"
          className={FIELD}
        />
      </div>

      {saveMsg ? (
        <p
          className={
            "mt-3 text-[12px] " +
            (saveMsg.tone === "err" ? "text-red-700" : "text-green-700")
          }
        >
          {saveMsg.text}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button type="button" variant="cancel" onClick={onDone} disabled={saving}>
          Skip
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void save()}
          disabled={saving}
          className="flex-1"
        >
          {saving ? "Saving…" : "Save broker"}
        </Button>
      </div>
    </div>
  );
}

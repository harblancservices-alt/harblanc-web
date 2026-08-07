"use client";

import { useState } from "react";
import { Button } from "@/components/tms-v2/ui/Button";
import { parseLoadLine } from "@/app/admin/(authed)/dispatch/email-broker/parse";
import { subjectFor, bodyLines } from "@/app/admin/(authed)/dispatch/email-broker/content";
import { sendBrokerEmail, sendBrokerEmailTest } from "@/app/admin/(authed)/dispatch/email-broker/send-actions";

type SentEntry = { lane: string; to: string; at: string };

/** Load Inquiry — paste a load-board line, get an editable Origin/
 * Destination + live preview, send (or test-send) a one-off broker email.
 * Reuses V1's parse/content/send logic unchanged (self-contained by
 * design — "no templates, no markets, no suppression log"); only the UI
 * shell is new. Closes the audit's Load Inquiry gap (0% built in tms-v2). */
export function LoadInquiryComposer() {
  const [pasted, setPasted] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [confident, setConfident] = useState(true);
  const [to, setTo] = useState("");
  const [testPending, setTestPending] = useState(false);
  const [sendPending, setSendPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<SentEntry[]>([]);

  function onPaste(value: string) {
    setPasted(value);
    const parsed = parseLoadLine(value);
    setOrigin(parsed.origin);
    setDestination(parsed.destination);
    setConfident(parsed.confident);
  }

  const lines = origin && destination ? bodyLines(origin, destination) : [];
  const subject = origin && destination ? subjectFor(origin, destination) : "";

  async function onSendTest() {
    setTestPending(true);
    setMessage(null);
    const res = await sendBrokerEmailTest({ origin, destination });
    setTestPending(false);
    setMessage(res.ok ? { ok: true, text: `Test sent to ${res.to}.` } : { ok: false, text: res.reason });
  }

  async function onSend() {
    if (!confirm(`Send this inquiry to ${to}?`)) return;
    setSendPending(true);
    setMessage(null);
    const res = await sendBrokerEmail({ to, origin, destination });
    setSendPending(false);
    if (res.ok) {
      setMessage({ ok: true, text: `Sent to ${res.to}.` });
      setHistory((prev) => [{ lane: `${origin} - ${destination}`, to: res.to, at: new Date().toLocaleTimeString() }, ...prev]);
    } else {
      setMessage({ ok: false, text: res.reason });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
        Paste a load-board line
        <input
          value={pasted}
          onChange={(e) => onPaste(e.target.value)}
          placeholder="Dallas, TX   45   Atlanta, GA"
          className="h-10 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg focus:border-fg focus:outline-none"
        />
      </label>

      {pasted && !confident ? (
        <p className="text-[12px] font-medium text-warn">Couldn&apos;t read this cleanly — check origin/destination below.</p>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
          Origin
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
          Destination
          <input value={destination} onChange={(e) => setDestination(e.target.value)} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
        Broker email
        <input value={to} onChange={(e) => setTo(e.target.value)} type="email" placeholder="dispatch@broker.com" className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
      </label>

      {subject ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-line-strong bg-elevated p-3">
          <p className="text-[13px] font-semibold text-fg">{subject}</p>
          {lines.map((l, i) => (
            <p key={i} className="text-[13px] text-fg">
              {l}
            </p>
          ))}
        </div>
      ) : null}

      {message ? <p className={`text-[13px] font-medium ${message.ok ? "text-ok" : "text-bad"}`}>{message.text}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onSendTest} disabled={testPending || !origin || !destination} aria-busy={testPending}>
          {testPending ? "Sending…" : "Send test to myself"}
        </Button>
        <Button type="button" size="sm" onClick={onSend} disabled={sendPending || !to || !origin || !destination} aria-busy={sendPending}>
          {sendPending ? "Sending…" : "Send inquiry"}
        </Button>
      </div>

      {history.length > 0 ? (
        <div className="border-t border-line pt-3">
          <p className="mb-1.5 text-[12px] font-medium text-fg-muted">Sent this session</p>
          <div className="flex flex-col gap-1">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between text-[12.5px] text-fg-muted">
                <span>{h.lane}</span>
                <span>
                  {h.to} · {h.at}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { sendReach, sendReachTest, saveReachStyleEmail } from "@/actions/tms-v2/reach";
import {
  POSTURES,
  LEVERAGES,
  POSTURE_LABEL,
  STYLE_LABEL,
  STYLE_BLURB,
  renderTemplate,
  type Posture,
  type Leverage,
  type ReachMarket,
  type ReachSettings,
  type ReachTemplate,
  type ReachRecipient,
} from "@/lib/domain/reach/types";

/**
 * Reach composer — auto-detected posture/market/recipients, a style
 * (leverage) toggle, an editable live preview, and Send/Send-test. Reuses
 * the neutral @/lib/domain/reach/{settings,send}.ts core via
 * @/actions/tms-v2/reach.ts, shared with admin's own wrapper (per the phase
 * brief: Reach is "a mature existing design... port rather than
 * redesign"); this is a new, simpler tms-v2 shell around the same logic
 * (no tabs, one continuous
 * flow) rather than a port of ReachView.tsx's 1300-line tabbed UI.
 */
export function ReachComposer({
  market,
  townParen,
  initialPosture,
  settings,
  templates,
  recipients,
  heldBack,
}: {
  market: ReachMarket;
  townParen: string;
  initialPosture: Posture;
  settings: ReachSettings;
  templates: ReachTemplate[];
  recipients: ReachRecipient[];
  heldBack: ReachRecipient[];
}) {
  const router = useRouter();
  const [posture, setPosture] = useState<Posture>(initialPosture);
  const [leverage, setLeverage] = useState<Leverage>(settings.defaultLeverage);
  const templateFor = (p: Posture, l: Leverage) => templates.find((t) => t.posture === p && t.leverage === l) ?? null;

  const [subject, setSubject] = useState(() => templateFor(initialPosture, settings.defaultLeverage)?.subject ?? "");
  const [body, setBody] = useState(() => templateFor(initialPosture, settings.defaultLeverage)?.body ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(recipients.filter((r) => r.email).map((r) => r.brokerId)));

  const [testPending, setTestPending] = useState(false);
  const [sendPending, setSendPending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function onStyleChange(p: Posture, l: Leverage) {
    setPosture(p);
    setLeverage(l);
    const t = templateFor(p, l);
    setSubject(t?.subject ?? "");
    setBody(t?.body ?? "");
  }

  const ctxBase = useMemo(
    () => ({ market: market.wording, equipment: settings.truckLine, townParen, mc: settings.mc, phone: settings.phone }),
    [market.wording, settings.truckLine, townParen, settings.mc, settings.phone],
  );

  const previewSubject = renderTemplate(subject, { ...ctxBase, broker: "there" });
  const previewBody = renderTemplate(body, { ...ctxBase, broker: "there" });

  function toggleRecipient(brokerId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(brokerId)) next.delete(brokerId);
      else next.add(brokerId);
      return next;
    });
  }

  async function onSaveDefault() {
    setSavePending(true);
    setMessage(null);
    const res = await saveReachStyleEmail(posture, leverage, { subject, body });
    setSavePending(false);
    setMessage(res.ok ? { ok: true, text: "Saved as the default for this style." } : { ok: false, text: res.reason });
  }

  async function onSendTest() {
    setTestPending(true);
    setMessage(null);
    const res = await sendReachTest({ ...ctxBase, subjectTemplate: subject, bodyTemplate: body }, settings.replyToName, settings.replyToEmail);
    setTestPending(false);
    setMessage(res.ok ? { ok: true, text: `Test sent to ${res.to.join(", ")}.` } : { ok: false, text: res.reason });
  }

  async function onSend() {
    if (selected.size === 0) {
      setMessage({ ok: false, text: "Select at least one recipient." });
      return;
    }
    if (!confirm(`Send to ${selected.size} broker${selected.size === 1 ? "" : "s"}? This can't be undone.`)) return;
    setSendPending(true);
    setMessage(null);
    const res = await sendReach({
      brokerIds: [...selected],
      posture,
      leverage,
      marketId: market.id,
      marketName: market.name,
      replyToName: settings.replyToName,
      replyToEmail: settings.replyToEmail,
      ctx: { ...ctxBase, subjectTemplate: subject, bodyTemplate: body },
    });
    setSendPending(false);
    if (res.ok) {
      setMessage({ ok: true, text: `Sent ${res.sent}${res.failed > 0 ? `, ${res.failed} failed` : ""}.` });
      router.refresh();
    } else {
      setMessage({ ok: false, text: res.reason });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-fg-muted">Posture</span>
        {POSTURES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onStyleChange(p, leverage)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium ${posture === p ? "bg-accent text-white" : "border border-line-strong text-fg-muted hover:text-fg"}`}
          >
            {POSTURE_LABEL[p]}
          </button>
        ))}
        <span className="ml-3 text-[12px] font-medium text-fg-muted">Style</span>
        {LEVERAGES.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onStyleChange(posture, l)}
            title={STYLE_BLURB[l]}
            className={`rounded-full px-3 py-1 text-[12px] font-medium ${leverage === l ? "bg-accent text-white" : "border border-line-strong text-fg-muted hover:text-fg"}`}
          >
            {STYLE_LABEL[l]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Body — tokens: {"{broker} {market} {equipment} {town_paren} {mc} {phone}"}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
          <Button type="button" variant="secondary" size="sm" onClick={onSaveDefault} disabled={savePending} aria-busy={savePending} className="w-fit">
            {savePending ? "Saving…" : `Save as default for ${STYLE_LABEL[leverage]}`}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-medium text-fg-muted">Preview</p>
          <div className="flex flex-col gap-1.5 rounded-md border border-line-strong bg-elevated p-3">
            <p className="text-[13px] font-semibold text-fg">{previewSubject || "—"}</p>
            <p className="whitespace-pre-wrap text-[13px] text-fg">{previewBody || "—"}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-fg">Recipients ({selected.size} selected of {recipients.length})</p>
        {recipients.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No matching brokers with an email on file for this market.</p>
        ) : (
          <div className="no-scrollbar max-h-64 overflow-y-auto rounded-xl border border-line bg-card px-3 shadow-e1">
            {recipients.map((r) => (
              <label key={r.brokerId} className="flex items-center justify-between gap-2 border-b border-line py-2 text-[13px] last:border-b-0">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={selected.has(r.brokerId)} onChange={() => toggleRecipient(r.brokerId)} disabled={!r.email} className="h-4 w-4" />
                  <span className="text-fg">{r.name}</span>
                  <span className="text-fg-muted">{r.area}</span>
                </span>
                <span className={`text-[11px] font-medium uppercase ${r.warmth === "hot" ? "text-bad" : r.warmth === "warm" ? "text-warn" : "text-fg-muted"}`}>{r.warmth}</span>
              </label>
            ))}
          </div>
        )}
        {heldBack.length > 0 ? (
          <details className="text-[12px] text-fg-muted">
            <summary className="cursor-pointer">Held back — reached recently ({heldBack.length})</summary>
            <div className="mt-1 flex flex-col gap-1">
              {heldBack.map((r) => (
                <div key={r.brokerId} className="flex items-center justify-between">
                  <span>{r.name}</span>
                  <span>reached {r.reachedDaysAgo}d ago</span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      {message ? <p className={`text-[13px] font-medium ${message.ok ? "text-ok" : "text-bad"}`}>{message.text}</p> : null}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        <Button type="button" variant="secondary" size="sm" onClick={onSendTest} disabled={testPending} aria-busy={testPending}>
          {testPending ? "Sending…" : "Send test to myself"}
        </Button>
        <Button type="button" size="sm" onClick={onSend} disabled={sendPending} aria-busy={sendPending}>
          {sendPending ? "Sending…" : `Send to ${selected.size}`}
        </Button>
      </div>
    </div>
  );
}

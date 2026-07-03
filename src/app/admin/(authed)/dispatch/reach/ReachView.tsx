"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { FarmContactButton } from "../../FarmBrokerContactCard";
import {
  sendReach,
  sendReachTest,
  type ReachSendResult,
} from "./send-actions";
import { ReachSettingsPanel } from "./ReachSettingsPanel";
import {
  LEVERAGES,
  LEVERAGE_LABEL,
  POSTURE_LABEL,
  renderTemplate,
  type Leverage,
  type Posture,
  type ReachMarket,
  type ReachRecipient,
  type ReachSettings,
  type ReachTemplate,
} from "./types";

/** Last-ditch wording if a posture×leverage template row is missing. */
function fallbackTemplate(posture: Posture): { subject: string; body: string } {
  const verb = posture === "planning" ? "headed into" : "running in";
  return {
    subject: "Hotshot capacity — {market}",
    body: `Hi {broker},\n\nHARBLANC has a {equipment} ${verb} {market} {town_paren} with capacity opening up. What do you have moving out of the area?\n\nReply here or give me a call.\n\nThanks,\nHARBLANC`,
  };
}

export function ReachView({
  markets,
  effectiveMarket,
  marketsAvailable,
  templates,
  templatesAvailable,
  settings,
  detectedPosture,
  postureReason,
  townParen,
  townLabel,
  anchorZip,
  recipients,
  heldBack,
}: {
  markets: ReachMarket[];
  effectiveMarket: ReachMarket | null;
  marketsAvailable: boolean;
  templates: ReachTemplate[];
  templatesAvailable: boolean;
  settings: ReachSettings;
  detectedPosture: Posture;
  postureReason: string;
  townParen: string;
  townLabel: string;
  anchorZip: string | null;
  recipients: ReachRecipient[];
  heldBack: ReachRecipient[];
}) {
  const router = useRouter();

  const [posture, setPosture] = useState<Posture>(detectedPosture);
  const [leverage, setLeverage] = useState<Leverage>(settings.defaultLeverage);

  // Selection: brokers with an email, pre-checked. Held-back rows start off and
  // can be tapped in.
  const preselected = useMemo(
    () => new Set(recipients.filter((r) => r.email).map((r) => r.brokerId)),
    [recipients],
  );
  const [selected, setSelected] = useState<Set<string>>(preselected);
  // Reset the selection when the recipient set changes (market flip, or a
  // post-send refresh). Adjusting state during render — React's endorsed
  // alternative to a setState-in-effect — keyed on the recipient id list.
  const recipientKey = recipients.map((r) => r.brokerId).join(",");
  const [prevKey, setPrevKey] = useState(recipientKey);
  if (recipientKey !== prevKey) {
    setPrevKey(recipientKey);
    setSelected(preselected);
  }

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReachSendResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [zipDraft, setZipDraft] = useState(anchorZip ?? "");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const templateFor = useMemo(() => {
    const map = new Map<string, ReachTemplate>();
    for (const t of templates) map.set(`${t.posture}-${t.leverage}`, t);
    return map;
  }, [templates]);

  const active = templateFor.get(`${posture}-${leverage}`);
  const tpl = active ?? { ...fallbackTemplate(posture), id: "", posture, leverage };

  const marketWording = effectiveMarket?.wording || effectiveMarket?.name || "the area";
  const equipment = settings.truckLine;

  // Sample name for the live preview — the first selected broker so the operator
  // sees a real, personalized email (each send fills {broker} per-recipient).
  const sampleName =
    recipients.find((r) => selected.has(r.brokerId))?.name ??
    recipients[0]?.name ??
    "there";

  const ctx = { market: marketWording, equipment, townParen };
  const previewSubject = renderTemplate(tpl.subject, { ...ctx, broker: sampleName });
  const previewBody = renderTemplate(tpl.body, { ...ctx, broker: sampleName });

  const allRows = [...recipients, ...heldBack];
  const selectedWithEmail = allRows.filter(
    (r) => selected.has(r.brokerId) && r.email,
  );
  const sendCount = selectedWithEmail.length;

  function toggle(id: string, hasEmail: boolean) {
    if (!hasEmail) return;
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeMarket(id: string) {
    const params = new URLSearchParams();
    if (id) params.set("market", id);
    params.set("posture", posture);
    router.push(`/admin/dispatch/reach?${params.toString()}`);
  }

  function applyZip() {
    const z = zipDraft.trim();
    const params = new URLSearchParams();
    if (/^\d{5}/.test(z)) params.set("zip", z);
    router.push(`/admin/dispatch/reach?${params.toString()}`);
  }

  async function onSend() {
    const ids = selectedWithEmail.map((r) => r.brokerId);
    if (ids.length === 0 || sending || cooldown > 0) return;
    setSending(true);
    setResult(null);
    try {
      const r = await sendReach({
        brokerIds: ids,
        posture,
        leverage,
        marketId: effectiveMarket?.id ?? null,
        marketName: effectiveMarket?.name ?? marketWording,
        ctx: {
          market: marketWording,
          equipment,
          townParen,
          subjectTemplate: tpl.subject,
          bodyTemplate: tpl.body,
        },
      });
      setResult(r);
      if (r.ok) {
        setCooldown(60);
        setConfirmOpen(false);
        router.refresh(); // pull any newly-suppressed rows on next paint
      }
    } finally {
      setSending(false);
    }
  }

  async function onTestSend() {
    if (testing) return;
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await sendReachTest({
        market: marketWording,
        equipment,
        townParen,
        subjectTemplate: tpl.subject,
        bodyTemplate: tpl.body,
      });
      setTestMsg(
        r.ok
          ? { ok: true, text: `Test sent to ${r.to}` }
          : { ok: false, text: r.reason },
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Dispatch"
          title="Reach"
          className="mb-3"
          actions={<FarmContactButton />}
        />

        {!effectiveMarket ? (
          <div className="rounded-md border border-dashed border-line-strong bg-card px-4 py-10 text-center font-mono text-[12px] text-ink-3 shadow-e1">
            {marketsAvailable
              ? "No markets yet — add one in Settings below to start reaching brokers."
              : "Reach isn't migrated yet — apply the reach_* migration to enable markets."}
          </div>
        ) : (
          <ReachFocalCard
            posture={posture}
            onFlipPosture={() =>
              setPosture((p) => (p === "available" ? "planning" : "available"))
            }
            postureReason={postureReason}
            marketWording={marketWording}
            townParen={townParen}
            townLabel={townLabel}
            markets={markets}
            effectiveMarketId={effectiveMarket.id}
            onChangeMarket={changeMarket}
            zipDraft={zipDraft}
            onZipDraft={setZipDraft}
            onApplyZip={applyZip}
            leverage={leverage}
            onLeverage={setLeverage}
            previewSubject={previewSubject}
            previewBody={previewBody}
            sendCount={sendCount}
            cooldown={cooldown}
            onOpenSend={() => {
              setResult(null);
              setConfirmOpen(true);
            }}
            result={result}
            templatesAvailable={templatesAvailable}
            testing={testing}
            testMsg={testMsg}
            onTestSend={onTestSend}
          />
        )}

        {/* Self-building recipient list */}
        {effectiveMarket ? (
          <RecipientList
            recipients={recipients}
            heldBack={heldBack}
            selected={selected}
            onToggle={toggle}
          />
        ) : null}

        {/* Settings */}
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border border-line bg-card px-4 py-3 text-left shadow-e1 transition-colors hover:bg-inset"
          >
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-2">
              Settings
            </span>
            <span aria-hidden className="font-mono text-[12px] text-ink-3">
              {showSettings ? "▲" : "▼"}
            </span>
          </button>
          {showSettings ? (
            <div className="mt-3">
              <ReachSettingsPanel
                settings={settings}
                markets={markets}
                templates={templates}
                marketsAvailable={marketsAvailable}
                templatesAvailable={templatesAvailable}
              />
            </div>
          ) : null}
        </div>
      </div>

      {confirmOpen ? (
        <ConfirmSendModal
          subject={previewSubject}
          body={tpl.body}
          ctx={ctx}
          recipients={selectedWithEmail.map((r) => ({
            name: r.name,
            email: r.email as string,
          }))}
          sending={sending}
          result={result}
          onConfirm={onSend}
          onClose={() => {
            if (!sending) setConfirmOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

// ── Focal card (graphite) ─────────────────────────────────────────────────────

function ReachFocalCard({
  posture,
  onFlipPosture,
  postureReason,
  marketWording,
  townParen,
  townLabel,
  markets,
  effectiveMarketId,
  onChangeMarket,
  zipDraft,
  onZipDraft,
  onApplyZip,
  leverage,
  onLeverage,
  previewSubject,
  previewBody,
  sendCount,
  cooldown,
  onOpenSend,
  result,
  templatesAvailable,
  testing,
  testMsg,
  onTestSend,
}: {
  posture: Posture;
  onFlipPosture: () => void;
  postureReason: string;
  marketWording: string;
  townParen: string;
  townLabel: string;
  markets: ReachMarket[];
  effectiveMarketId: string;
  onChangeMarket: (id: string) => void;
  zipDraft: string;
  onZipDraft: (v: string) => void;
  onApplyZip: () => void;
  leverage: Leverage;
  onLeverage: (l: Leverage) => void;
  previewSubject: string;
  previewBody: string;
  sendCount: number;
  cooldown: number;
  onOpenSend: () => void;
  result: ReachSendResult | null;
  templatesAvailable: boolean;
  testing: boolean;
  testMsg: { ok: boolean; text: string } | null;
  onTestSend: () => void;
}) {
  const readyLine =
    posture === "planning" ? "inbound · will be open" : "ready to roll";
  return (
    <div className="relative overflow-hidden rounded-md bg-graphite p-5 pl-6 shadow-e2">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />

      {/* Posture badge + reason */}
      <div className="flex items-center justify-between gap-3">
        <span
          className={
            "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] " +
            (posture === "planning"
              ? "bg-steel/25 text-white"
              : "bg-accent/25 text-white")
          }
        >
          <span
            aria-hidden
            className={
              "h-1.5 w-1.5 rounded-full " +
              (posture === "planning" ? "bg-steel" : "bg-accent")
            }
          />
          {POSTURE_LABEL[posture]}
        </span>
        <button
          type="button"
          onClick={onFlipPosture}
          className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-on-dark-dim underline-offset-2 hover:text-white hover:underline"
        >
          Flip →{" "}
          {POSTURE_LABEL[posture === "available" ? "planning" : "available"]}
        </button>
      </div>

      {/* Market big */}
      <div className="mt-2.5 text-[24px] font-bold leading-tight text-white sm:text-[27px]">
        {marketWording}
      </div>
      <div className="mt-1 text-[13px] text-on-dark-dim">
        {townParen ? <span className="text-white/90">{townParen} </span> : null}
        {townParen ? "· " : townLabel ? `${townLabel} · ` : ""}
        {readyLine}
      </div>
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-on-dark-dim/80">
        {postureReason}
      </div>

      {/* Change market / location */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={effectiveMarketId}
          onChange={(e) => onChangeMarket(e.target.value)}
          aria-label="Change market"
          className="h-9 rounded-md border border-graphite-line bg-graphite-2 px-2.5 text-[13px] text-white outline-none focus:border-accent"
        >
          {markets.map((m) => (
            <option key={m.id} value={m.id} className="text-ink">
              {m.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input
            value={zipDraft}
            onChange={(e) => onZipDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onApplyZip();
            }}
            inputMode="numeric"
            placeholder="Sitting elsewhere? ZIP"
            className="h-9 w-[150px] rounded-md border border-graphite-line bg-graphite-2 px-2.5 text-[13px] text-white outline-none placeholder:text-on-dark-dim/70 focus:border-accent"
          />
          <button
            type="button"
            onClick={onApplyZip}
            className="h-9 rounded-md border border-graphite-line bg-graphite-2 px-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-white hover:bg-graphite-line"
          >
            Set
          </button>
        </div>
      </div>

      {/* Leverage dial */}
      <div className="mt-4">
        <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-on-dark-dim">
          Leverage
        </p>
        <div className="inline-flex rounded-md border border-graphite-line bg-graphite-2 p-0.5">
          {LEVERAGES.map((l) => {
            const on = l === leverage;
            return (
              <button
                key={l}
                type="button"
                onClick={() => onLeverage(l)}
                className={
                  "rounded px-3 py-1.5 text-[12px] font-semibold transition-colors " +
                  (on
                    ? "bg-accent text-white"
                    : "text-on-dark-dim hover:text-white")
                }
              >
                {LEVERAGE_LABEL[l]}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-on-dark-dim">
          {leverage === "confident"
            ? "Protects your rate."
            : leverage === "balanced"
              ? "Invites a rate."
              : "Asks their number."}
        </p>
      </div>

      {/* Live preview */}
      <div className="mt-4 rounded-md border border-line bg-card p-3.5 text-ink shadow-e1">
        <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Preview
        </p>
        <p className="mt-1.5 text-[13.5px] font-semibold text-ink">
          {previewSubject}
        </p>
        <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-ink-2">
          {previewBody}
        </pre>
        <p className="mt-2 font-mono text-[9.5px] text-ink-3">
          Each broker sees their own name.
        </p>
        {!templatesAvailable ? (
          <p className="mt-1 font-mono text-[9.5px] text-warn">
            Using built-in wording.
          </p>
        ) : null}
      </div>

      {/* Send */}
      <button
        type="button"
        onClick={onOpenSend}
        disabled={sendCount === 0 || cooldown > 0}
        className="mt-4 w-full rounded-md border border-accent bg-accent px-4 py-2.5 font-mono text-[13px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {cooldown > 0
          ? `Locked · ${cooldown}s`
          : `Send to ${sendCount} broker${sendCount === 1 ? "" : "s"} →`}
      </button>
      <p className="mt-1.5 text-center font-mono text-[10px] text-on-dark-dim">
        Replies land in your inbox · nothing sends until you tap.
      </p>
      <div className="mt-2 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onTestSend}
          disabled={testing}
          className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-on-dark-dim underline-offset-2 hover:text-white hover:underline disabled:opacity-50"
        >
          {testing ? "Sending test…" : "Send test to myself"}
        </button>
        {testMsg ? (
          <span
            className={
              "text-[11px] " + (testMsg.ok ? "text-white" : "text-accent")
            }
          >
            {testMsg.text}
          </span>
        ) : null}
      </div>
      {result ? (
        <p
          className={
            "mt-1.5 text-center text-[12px] " +
            (result.ok ? "text-white" : "text-accent")
          }
        >
          {result.ok
            ? `Sent ${result.sent}${result.failed ? `, ${result.failed} failed` : ""}.`
            : result.reason}
        </p>
      ) : null}
    </div>
  );
}

// ── Recipient list ────────────────────────────────────────────────────────────

const WARMTH_TONE: Record<string, string> = {
  hot: "bg-bad-bg text-bad",
  warm: "bg-warn-bg text-warn",
  cold: "bg-slate-bg text-slate",
};

function RecipientRow({
  r,
  checked,
  onToggle,
  held,
}: {
  r: ReachRecipient;
  checked: boolean;
  onToggle: (id: string, hasEmail: boolean) => void;
  held: boolean;
}) {
  const hasEmail = !!r.email;
  return (
    <label
      className={
        "flex items-start gap-2.5 border-l-[3px] px-3 py-2.5 transition-colors " +
        (checked ? "border-l-accent bg-inset " : "border-l-transparent ") +
        (held ? "opacity-60 " : "") +
        (hasEmail ? "cursor-pointer hover:bg-inset" : "opacity-70")
      }
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={!hasEmail}
        onChange={() => onToggle(r.brokerId, hasEmail)}
        className="mt-1 accent-accent"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold text-fg">{r.name}</span>
          <span
            className={
              "rounded px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] " +
              WARMTH_TONE[r.warmth]
            }
          >
            {r.warmth}
          </span>
          {held && r.reachedDaysAgo !== null ? (
            <span className="rounded bg-slate-bg px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-slate">
              reached {r.reachedDaysAgo}d ago
            </span>
          ) : null}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded bg-ok-bg px-1.5 py-[1px] text-ok">
            {r.matchCount} lane{r.matchCount === 1 ? "" : "s"} in market
          </span>
          {hasEmail ? (
            <span className="font-mono text-steel">{r.email}</span>
          ) : (
            <span className="flex items-center gap-1.5 text-warn">
              No email on file
              <Link
                href={`/admin/dispatch/brokers/${r.brokerId}`}
                prefetch={false}
                className="font-mono font-bold uppercase tracking-[0.06em] text-steel hover:underline"
              >
                + Add
              </Link>
            </span>
          )}
        </span>
      </span>
    </label>
  );
}

function RecipientList({
  recipients,
  heldBack,
  selected,
  onToggle,
}: {
  recipients: ReachRecipient[];
  heldBack: ReachRecipient[];
  selected: Set<string>;
  onToggle: (id: string, hasEmail: boolean) => void;
}) {
  if (recipients.length === 0 && heldBack.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-line-strong bg-card px-4 py-8 text-center font-mono text-[12px] text-ink-3 shadow-e1">
        No brokers in this market yet.
      </div>
    );
  }
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
          Recipients · {recipients.length}
        </span>
        <span className="font-mono text-[11px] text-fg-subtle">
          {[...selected].length} selected
        </span>
      </div>
      <div className="overflow-hidden rounded-md border border-line bg-card shadow-e2 divide-y divide-line">
        {recipients.map((r) => (
          <RecipientRow
            key={r.brokerId}
            r={r}
            checked={selected.has(r.brokerId)}
            onToggle={onToggle}
            held={false}
          />
        ))}
      </div>

      {heldBack.length > 0 ? (
        <>
          <p className="mb-1.5 mt-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
            Held back · tap to include
          </p>
          <div className="overflow-hidden rounded-md border border-line bg-card shadow-e1 divide-y divide-line">
            {heldBack.map((r) => (
              <RecipientRow
                key={r.brokerId}
                r={r}
                checked={selected.has(r.brokerId)}
                onToggle={onToggle}
                held
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── Confirm send modal ────────────────────────────────────────────────────────

function ConfirmSendModal({
  subject,
  body,
  ctx,
  recipients,
  sending,
  result,
  onConfirm,
  onClose,
}: {
  subject: string;
  body: string;
  ctx: { market: string; equipment: string; townParen: string };
  recipients: { name: string; email: string }[];
  sending: boolean;
  result: ReachSendResult | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !sending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sending, onClose]);

  // Preview body with {broker} left visible so it's clear it personalizes.
  const previewBody = renderTemplate(body, { ...ctx, broker: "{broker}" });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review reach"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6"
      onClick={() => {
        if (!sending) onClose();
      }}
    >
      <div
        className="my-4 w-full max-w-lg overflow-hidden rounded-lg border border-line-strong bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            Review reach · {recipients.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-sm border border-white/25 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-bar-fg transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto bg-elevated px-4 py-4">
          <section className="rounded-md border border-line bg-card p-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg">
              Recipients · {recipients.length}
            </p>
            <p className="mb-2 mt-0.5 text-[11px] text-fg-subtle">
              One personalized email per broker.
            </p>
            {recipients.length === 0 ? (
              <p className="text-[12px] text-warn">
                None of the selected brokers have an email on file.
              </p>
            ) : (
              <ul className="max-h-44 space-y-1 overflow-y-auto">
                {recipients.map((r) => (
                  <li
                    key={r.email}
                    className="flex items-baseline justify-between gap-3 text-[12px]"
                  >
                    <span className="truncate font-medium text-fg">{r.name}</span>
                    <span className="shrink-0 font-mono text-[11.5px] text-steel">
                      {r.email}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-md border border-line bg-card p-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg">
              Email
            </p>
            <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
              Subject
            </p>
            <p className="mt-0.5 text-[13px] font-semibold text-fg">{subject}</p>
            <p className="mt-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
              Body · {"{broker}"} fills each broker’s name
            </p>
            <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-fg">
              {previewBody}
            </pre>
          </section>

          {result && !result.ok ? (
            <p role="alert" className="text-[12px] font-semibold text-bad">
              {result.reason}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
          <Button variant="cancel" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={sending || recipients.length === 0}
            aria-busy={sending}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent bg-accent px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {sending ? (
              <>
                <span
                  aria-hidden
                  className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
                Sending…
              </>
            ) : (
              `Send to ${recipients.length} →`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

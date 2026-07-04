"use client";

/**
 * Backhaul Reach — two tabs, one job: reach brokers.
 *
 *   Send      — a "situation" line (truck opens up in <city> — <date>), a style
 *               toggle (Low-key / Standard / Eager), and the email as a real
 *               editable form (To / Subject / Message) that auto-fills and saves
 *               your edits as the default for that style. Send, or send a test.
 *   Contacts  — every broker contact, with an Include on/off toggle.
 *
 * Under the hood the date picks posture (today = truck open now → "available";
 * a future date = planning ahead → "planning") and the style is the old leverage
 * value — so the existing posture×style templates, markets, recipient auto-build
 * and per-broker send path all carry over unchanged. Nothing sends until you tap.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { sendReach, sendReachTest, type ReachSendResult } from "./send-actions";
import { saveReachStyleEmail } from "./actions";
import { SetupModal } from "./SetupModal";
import { ContactsTab } from "./ContactsTab";
import type { ReachContact } from "./queries";
import {
  LEVERAGES,
  STYLE_BLURB,
  STYLE_LABEL,
  renderTemplate,
  type Leverage,
  type Posture,
  type ReachMarket,
  type ReachRecipient,
  type ReachSettings,
  type ReachTemplate,
} from "./types";

/** Last-ditch wording if a posture×style template row is missing. */
function fallbackTemplate(posture: Posture): { subject: string; body: string } {
  const verb = posture === "planning" ? "headed into" : "running in";
  return {
    subject: "Hotshot capacity — {market}",
    body: `Hi {broker},\n\nHARBLANC has a {equipment} ${verb} {market} {town_paren} with capacity opening up. What do you have moving out of the area?\n\nReply here or give me a call.\n\nThanks,\nHARBLANC`,
  };
}

/** Local YYYY-MM-DD (not UTC) so "today" matches the operator's calendar. */
function todayISO(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** "Jul 9" style label for a YYYY-MM-DD date. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}`;
}

type Tab = "send" | "contacts";

export function ReachView({
  markets,
  effectiveMarket,
  marketsAvailable,
  templates,
  templatesAvailable,
  settings,
  townParen,
  townLabel,
  anchorZip,
  anchorLoadNumber,
  anchorReason,
  recipients,
  heldBack,
  contacts,
  contactsAvailable,
}: {
  markets: ReachMarket[];
  effectiveMarket: ReachMarket | null;
  marketsAvailable: boolean;
  templates: ReachTemplate[];
  templatesAvailable: boolean;
  settings: ReachSettings;
  townParen: string;
  townLabel: string;
  anchorZip: string | null;
  anchorLoadNumber: string | null;
  anchorReason: string;
  recipients: ReachRecipient[];
  heldBack: ReachRecipient[];
  contacts: ReachContact[];
  contactsAvailable: boolean;
}) {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("send");
  const [style, setStyle] = useState<Leverage>(settings.defaultLeverage);
  const [today] = useState<string>(() => todayISO());
  const [date, setDate] = useState<string>(() => todayISO());
  // Date drives posture: today = truck open now; any future date = planning.
  const posture: Posture = date > today ? "planning" : "available";

  // Truck line + from name live here so the email preview updates as they're
  // edited in Setup, and the send uses the current from-name.
  const [equipment, setEquipment] = useState(settings.truckLine);
  const [replyToName, setReplyToName] = useState(settings.replyToName);

  const [setupOpen, setSetupOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReachSendResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [zipOpen, setZipOpen] = useState(false);
  const [zipDraft, setZipDraft] = useState(anchorZip ?? "");

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // ── Email drafts, keyed by posture-style. `drafts` holds in-session edits so
  //    switching style and back keeps your text; the stored template is the base.
  const templateFor = useMemo(() => {
    const map = new Map<string, ReachTemplate>();
    for (const t of templates) map.set(`${t.posture}-${t.leverage}`, t);
    return map;
  }, [templates]);

  const key = `${posture}-${style}`;
  const baseText = useMemo(() => {
    const t = templateFor.get(key);
    if (t) return { subject: t.subject, body: t.body };
    return fallbackTemplate(posture);
  }, [templateFor, key, posture]);

  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const current = drafts[key] ?? baseText;
  const [saveFlash, setSaveFlash] = useState<string>("");

  function editField(patch: Partial<{ subject: string; body: string }>) {
    setDrafts((d) => ({ ...d, [key]: { ...current, ...patch } }));
    setSaveFlash("");
  }

  async function saveDefault() {
    const draft = drafts[key];
    if (!draft) return; // untouched
    if (draft.subject === baseText.subject && draft.body === baseText.body) return;
    const res = await saveReachStyleEmail(posture, style, {
      subject: draft.subject,
      body: draft.body,
    });
    setSaveFlash(res.ok ? "Saved as default" : `Couldn’t save: ${res.reason}`);
  }

  // ── Recipients / send ──────────────────────────────────────────────────────
  const sendRecipients = useMemo(
    () => recipients.filter((r) => r.email),
    [recipients],
  );
  const sendCount = sendRecipients.length;
  const sampleName = sendRecipients[0]?.name ?? recipients[0]?.name ?? "there";

  const marketWording = effectiveMarket?.wording || effectiveMarket?.name || "the area";
  const cityLabel = townLabel || effectiveMarket?.name || "your area";
  const radiusMi = effectiveMarket?.radiusMi ?? 0;

  const ctx = { market: marketWording, equipment, townParen };
  const previewSubject = renderTemplate(current.subject, { ...ctx, broker: sampleName });
  const previewBody = renderTemplate(current.body, { ...ctx, broker: sampleName });

  function changeMarket(id: string) {
    const params = new URLSearchParams();
    if (id) params.set("market", id);
    router.push(`/admin/dispatch/reach?${params.toString()}`);
  }
  function applyZip() {
    const z = zipDraft.trim();
    const params = new URLSearchParams();
    if (/^\d{5}/.test(z)) params.set("zip", z);
    router.push(`/admin/dispatch/reach?${params.toString()}`);
  }

  async function onSend() {
    const ids = sendRecipients.map((r) => r.brokerId);
    if (ids.length === 0 || sending || cooldown > 0) return;
    setSending(true);
    setResult(null);
    try {
      const r = await sendReach({
        brokerIds: ids,
        posture,
        leverage: style,
        // Built-in markets aren't DB rows, so market_id stays null; the
        // market_name snapshot records which one.
        marketId: null,
        marketName: effectiveMarket?.name ?? marketWording,
        replyToName,
        ctx: {
          market: marketWording,
          equipment,
          townParen,
          subjectTemplate: current.subject,
          bodyTemplate: current.body,
        },
      });
      setResult(r);
      if (r.ok) {
        // Persist any edits as the style default alongside the send.
        await saveDefault();
        setCooldown(60);
        setConfirmOpen(false);
        router.refresh();
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
      const r = await sendReachTest(
        {
          market: marketWording,
          equipment,
          townParen,
          subjectTemplate: current.subject,
          bodyTemplate: current.body,
        },
        replyToName,
      );
      setTestMsg(
        r.ok
          ? { ok: true, text: `Test sent to ${r.to.join(" and ")}` }
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
          className="mb-4"
          actions={
            tab === "send" ? (
              <Button variant="edit" size="sm" onClick={() => setSetupOpen(true)}>
                Setup
              </Button>
            ) : null
          }
        />

        {/* Raised, button-like tabs with depth */}
        <div className="mb-4 inline-flex gap-1 rounded-lg border border-line bg-inset p-1 shadow-e1">
          <TabButton active={tab === "send"} onClick={() => setTab("send")}>
            Send
          </TabButton>
          <TabButton active={tab === "contacts"} onClick={() => setTab("contacts")}>
            Contacts
          </TabButton>
        </div>

        {tab === "send" ? (
          !effectiveMarket ? (
            <div className="rounded-lg border border-dashed border-line-strong bg-card px-4 py-10 text-center font-mono text-[12px] text-ink-3 shadow-e1">
              {marketsAvailable
                ? "Pick where you're sitting to start — no market matched your last load."
                : "Reach isn't migrated yet — apply the reach_* migration to enable it."}
            </div>
          ) : (
            <div className="space-y-4">
              <SituationCard
                markets={markets}
                effectiveMarketId={effectiveMarket.id}
                onChangeMarket={changeMarket}
                cityLabel={cityLabel}
                townParen={townParen}
                date={date}
                today={today}
                onDate={setDate}
                posture={posture}
                anchorLoadNumber={anchorLoadNumber}
                anchorReason={anchorReason}
                zipOpen={zipOpen}
                onToggleZip={() => setZipOpen((v) => !v)}
                zipDraft={zipDraft}
                onZipDraft={setZipDraft}
                onApplyZip={applyZip}
              />

              <StyleToggle style={style} onStyle={setStyle} />

              <EmailForm
                sendCount={sendCount}
                radiusMi={radiusMi}
                cityLabel={cityLabel}
                recipients={sendRecipients}
                heldBack={heldBack}
                subject={current.subject}
                body={current.body}
                onSubject={(v) => editField({ subject: v })}
                onBody={(v) => editField({ body: v })}
                onBlurSave={saveDefault}
                saveFlash={saveFlash}
                previewSubject={previewSubject}
                previewBody={previewBody}
                templatesAvailable={templatesAvailable}
              />

              <ActionBar
                sendCount={sendCount}
                cooldown={cooldown}
                onOpenSend={() => {
                  setResult(null);
                  setConfirmOpen(true);
                }}
                testing={testing}
                testMsg={testMsg}
                onTestSend={onTestSend}
                result={result}
              />
            </div>
          )
        ) : (
          <ContactsTab contacts={contacts} available={contactsAvailable} />
        )}
      </div>

      {setupOpen ? (
        <SetupModal
          settings={settings}
          truckLine={equipment}
          onTruckLineChange={setEquipment}
          replyToName={replyToName}
          onReplyToNameChange={setReplyToName}
          onSaved={() => router.refresh()}
          onClose={() => setSetupOpen(false)}
        />
      ) : null}

      {confirmOpen ? (
        <ConfirmSendModal
          subject={previewSubject}
          bodyTemplate={current.body}
          ctx={ctx}
          recipients={sendRecipients.map((r) => ({
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

// ── Tabs ──────────────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-md px-6 py-2 text-[13px] font-bold uppercase tracking-[0.08em] transition-all " +
        (active
          ? "-translate-y-px border border-line-strong bg-card text-accent shadow-e2"
          : "border border-transparent text-ink-3 hover:text-ink")
      }
    >
      {children}
    </button>
  );
}

// ── Situation card (graphite, with depth) ──────────────────────────────────────

function SituationCard({
  markets,
  effectiveMarketId,
  onChangeMarket,
  cityLabel,
  townParen,
  date,
  today,
  onDate,
  posture,
  anchorLoadNumber,
  anchorReason,
  zipOpen,
  onToggleZip,
  zipDraft,
  onZipDraft,
  onApplyZip,
}: {
  markets: ReachMarket[];
  effectiveMarketId: string;
  onChangeMarket: (id: string) => void;
  cityLabel: string;
  townParen: string;
  date: string;
  today: string;
  onDate: (v: string) => void;
  posture: Posture;
  anchorLoadNumber: string | null;
  anchorReason: string;
  zipOpen: boolean;
  onToggleZip: () => void;
  zipDraft: string;
  onZipDraft: (v: string) => void;
  onApplyZip: () => void;
}) {
  const dark =
    "h-9 rounded-md border border-graphite-line bg-graphite-2 px-2.5 text-[14px] font-semibold text-white outline-none focus:border-accent";
  return (
    <div className="relative overflow-hidden rounded-lg bg-graphite p-5 pl-6 shadow-e2">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-on-dark-dim">
        Your situation
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-2 text-[17px] font-semibold leading-tight text-white sm:text-[19px]">
        <span>Your truck opens up in</span>
        <select
          value={effectiveMarketId}
          onChange={(e) => onChangeMarket(e.target.value)}
          aria-label="City / market"
          className={dark}
        >
          {markets.map((m) => (
            <option key={m.id} value={m.id} className="text-ink">
              {m.name}
            </option>
          ))}
        </select>
        <span aria-hidden className="text-on-dark-dim">
          —
        </span>
        <input
          type="date"
          value={date}
          min={today}
          onChange={(e) => onDate(e.target.value || today)}
          aria-label="When the truck opens up"
          className={dark + " [color-scheme:dark]"}
        />
      </div>

      {/* Sub-line: precision town + posture meaning + load provenance */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-on-dark-dim">
        {townParen ? <span className="text-white/90">{townParen}</span> : null}
        <span
          className={
            "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] " +
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
          {posture === "planning"
            ? `Planning ahead · opens ${shortDate(date)}`
            : "Truck open now"}
        </span>
        {anchorLoadNumber ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-on-dark-dim/80">
            from load #{anchorLoadNumber}
          </span>
        ) : anchorReason ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-on-dark-dim/80">
            {anchorReason}
          </span>
        ) : null}
      </div>

      {/* Sitting elsewhere — tucked away */}
      <div className="mt-2.5">
        {zipOpen ? (
          <div className="flex items-center gap-1.5">
            <input
              value={zipDraft}
              onChange={(e) => onZipDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onApplyZip();
              }}
              inputMode="numeric"
              placeholder="ZIP where you're sitting"
              className="h-8 w-[180px] rounded-md border border-graphite-line bg-graphite-2 px-2.5 text-[13px] text-white outline-none placeholder:text-on-dark-dim/70 focus:border-accent"
            />
            <button
              type="button"
              onClick={onApplyZip}
              className="h-8 rounded-md border border-graphite-line bg-graphite-2 px-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-white hover:bg-graphite-line"
            >
              Set
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleZip}
            className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-on-dark-dim underline-offset-2 hover:text-white hover:underline"
          >
            Sitting somewhere else? Set by ZIP →
          </button>
        )}
      </div>
      <p className="sr-only">Currently anchored on {cityLabel}.</p>
    </div>
  );
}

// ── Style toggle (segmented) ────────────────────────────────────────────────────

function StyleToggle({
  style,
  onStyle,
}: {
  style: Leverage;
  onStyle: (l: Leverage) => void;
}) {
  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-e1">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
          Style
        </span>
        <span className="text-[11px] text-ink-3">{STYLE_BLURB[style]}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-md border border-line-strong bg-inset p-1">
        {LEVERAGES.map((l) => {
          const on = l === style;
          return (
            <button
              key={l}
              type="button"
              onClick={() => onStyle(l)}
              aria-pressed={on}
              className={
                "rounded-md py-2 text-[13px] font-bold transition-all " +
                (on
                  ? "bg-accent text-white shadow-e1"
                  : "text-ink-2 hover:bg-card hover:text-ink")
              }
            >
              {STYLE_LABEL[l]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Email form ──────────────────────────────────────────────────────────────────

function EmailForm({
  sendCount,
  radiusMi,
  cityLabel,
  recipients,
  heldBack,
  subject,
  body,
  onSubject,
  onBody,
  onBlurSave,
  saveFlash,
  previewSubject,
  previewBody,
  templatesAvailable,
}: {
  sendCount: number;
  radiusMi: number;
  cityLabel: string;
  recipients: ReachRecipient[];
  heldBack: ReachRecipient[];
  subject: string;
  body: string;
  onSubject: (v: string) => void;
  onBody: (v: string) => void;
  onBlurSave: () => void;
  saveFlash: string;
  previewSubject: string;
  previewBody: string;
  templatesAvailable: boolean;
}) {
  const inputCls =
    "w-full h-10 rounded-md border border-line-strong bg-card px-3 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40";
  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-e2">
      {/* TO */}
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
          To
        </label>
        <details className="group rounded-md border border-line bg-inset">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
            <span className="text-[14px] font-semibold text-ink">
              {sendCount} broker{sendCount === 1 ? "" : "s"} within {radiusMi} mi
              of {cityLabel}
            </span>
            <span
              aria-hidden
              className="font-mono text-[11px] text-ink-3 group-open:hidden"
            >
              view ▾
            </span>
            <span
              aria-hidden
              className="hidden font-mono text-[11px] text-ink-3 group-open:inline"
            >
              hide ▴
            </span>
          </summary>
          <div className="max-h-52 overflow-y-auto border-t border-line px-3 py-2">
            {recipients.length === 0 ? (
              <p className="py-2 text-[12px] text-warn">
                No brokers with an email in this market yet — add contacts on the
                Contacts tab.
              </p>
            ) : (
              <ul className="space-y-1">
                {recipients.map((r) => (
                  <li
                    key={r.brokerId}
                    className="flex items-baseline justify-between gap-3 text-[12px]"
                  >
                    <span className="truncate font-medium text-fg">{r.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-steel">
                      {r.email}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {heldBack.length > 0 ? (
              <p className="mt-2 border-t border-line pt-2 font-mono text-[10px] text-ink-3">
                {heldBack.length} recently-reached held back to avoid double-sends.
              </p>
            ) : null}
          </div>
        </details>
      </div>

      {/* SUBJECT */}
      <div className="mt-3">
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
          Subject
        </label>
        <input
          value={subject}
          onChange={(e) => onSubject(e.target.value)}
          onBlur={onBlurSave}
          className={inputCls}
        />
      </div>

      {/* MESSAGE */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
            Message
          </label>
          {saveFlash ? (
            <span className="text-[11px] text-ok">{saveFlash}</span>
          ) : (
            <span className="text-[11px] text-ink-3">
              edits save as this style’s default
            </span>
          )}
        </div>
        <textarea
          value={body}
          onChange={(e) => onBody(e.target.value)}
          onBlur={onBlurSave}
          rows={9}
          className="w-full rounded-md border border-line-strong bg-card px-3 py-2 text-[14px] leading-relaxed text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
        />
        <p className="mt-1 font-mono text-[10px] text-ink-3">
          {"{broker}"} · {"{market}"} · {"{equipment}"} · {"{town_paren}"} fill in
          automatically.
        </p>
        {!templatesAvailable ? (
          <p className="mt-1 font-mono text-[10px] text-warn">
            Using built-in wording — saving needs the reach_* migration.
          </p>
        ) : null}
      </div>

      {/* Live preview */}
      <div className="mt-3 rounded-md border border-line bg-inset p-3">
        <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Preview · what a broker sees
        </p>
        <p className="mt-1.5 text-[13.5px] font-semibold text-ink">
          {previewSubject}
        </p>
        <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-ink-2">
          {previewBody}
        </pre>
      </div>
    </div>
  );
}

// ── Action bar ──────────────────────────────────────────────────────────────────

function ActionBar({
  sendCount,
  cooldown,
  onOpenSend,
  testing,
  testMsg,
  onTestSend,
  result,
}: {
  sendCount: number;
  cooldown: number;
  onOpenSend: () => void;
  testing: boolean;
  testMsg: { ok: boolean; text: string } | null;
  onTestSend: () => void;
  result: ReachSendResult | null;
}) {
  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-e1">
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
        <button
          type="button"
          onClick={onOpenSend}
          disabled={sendCount === 0 || cooldown > 0}
          className="flex-1 rounded-md border border-accent bg-accent px-4 py-3 font-mono text-[13px] font-bold uppercase tracking-[0.1em] text-white shadow-e1 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cooldown > 0
            ? `Locked · ${cooldown}s`
            : `Send to ${sendCount} broker${sendCount === 1 ? "" : "s"} →`}
        </button>
        <button
          type="button"
          onClick={onTestSend}
          disabled={testing}
          className="rounded-md border border-line-strong bg-card px-4 py-3 font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-inset disabled:opacity-50 sm:flex-none"
        >
          {testing ? "Sending test…" : "Send a test"}
        </button>
      </div>
      <p className="mt-2 text-center font-mono text-[10px] text-ink-3">
        One personalized email per broker · replies land in your inbox · nothing
        sends until you tap.
      </p>
      {testMsg ? (
        <p
          className={
            "mt-1 text-center text-[12px] " +
            (testMsg.ok ? "text-ok" : "text-bad")
          }
        >
          {testMsg.text}
        </p>
      ) : null}
      {result ? (
        <p
          className={
            "mt-1 text-center text-[12px] font-semibold " +
            (result.ok ? "text-ok" : "text-bad")
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

// ── Confirm send modal ──────────────────────────────────────────────────────────

function ConfirmSendModal({
  subject,
  bodyTemplate,
  ctx,
  recipients,
  sending,
  result,
  onConfirm,
  onClose,
}: {
  subject: string;
  bodyTemplate: string;
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

  const previewBody = renderTemplate(bodyTemplate, { ...ctx, broker: "{broker}" });

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
        className="my-4 w-full max-w-lg overflow-hidden rounded-lg border border-line-strong bg-card shadow-e3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            Review · {recipients.length} broker{recipients.length === 1 ? "" : "s"}
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
              One personalized email per broker — never bundled.
            </p>
            {recipients.length === 0 ? (
              <p className="text-[12px] text-warn">
                None of the brokers have an email on file.
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

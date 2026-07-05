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

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { sendReach, sendReachTest, type ReachSendResult } from "./send-actions";
import { saveReachStyleEmail, resolveLocation } from "./actions";
import { reachSignatureHtml, REACH_PREVIEW_LOGO_URL } from "./signature";
import { SetupModal } from "./SetupModal";
import { ContactsTab } from "./ContactsTab";
import type { ReachContact } from "./queries";
import {
  LEVERAGES,
  STYLE_BLURB,
  STYLE_LABEL,
  renderTemplate,
  templatize,
  type Leverage,
  type Posture,
  type ReachMarket,
  type ReachRecipient,
  type ReachSettings,
  type ReachTemplate,
} from "./types";

/** A city typeahead hit from /api/admin/dispatch/cities. */
type CityHit = { city: string; state: string; zip: string; lat: number; lon: number };

/** Where "Send a test" delivers — the owner's own inbox (mirrors send-actions). */
const TEST_INBOX = "harblancservices@gmail.com";

/** Last-ditch wording if a posture×style template row is missing. */
function fallbackTemplate(posture: Posture): { subject: string; body: string } {
  const lead =
    posture === "planning" ? "Headed Your Way" : "Available and Ready to Roll";
  return {
    subject: "Hotshot Capacity — {market}",
    body: `Hi {broker},\n\nHARBLANC has a {equipment} ${lead} {town_paren} with Capacity opening up. What do you have coming out of the area?\n\nReply here or give me a call.\n\nThanks,`,
  };
}

/** Local YYYY-MM-DD (not UTC) so "today" matches the operator's calendar. */
function todayISO(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Add `days` to a YYYY-MM-DD date, staying in local time. */
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
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
  effectiveMarket,
  marketsAvailable,
  templates,
  templatesAvailable,
  settings,
  townParen,
  townLabel,
  anchorLoadNumber,
  anchorReason,
  detectedPosture,
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
  /** Auto-detected posture — seeds the Open now / Planning ahead toggle. */
  detectedPosture: Posture;
  recipients: ReachRecipient[];
  heldBack: ReachRecipient[];
  contacts: ReachContact[];
  contactsAvailable: boolean;
}) {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("send");
  const [style, setStyle] = useState<Leverage>(settings.defaultLeverage);
  const [today] = useState<string>(() => todayISO());
  // Posture is now an explicit Open now / Planning ahead toggle, seeded from the
  // auto-detect. It (not the date) drives the templates. The date is only the
  // planning "opens on" display; it defaults to a near-future day.
  const [posture, setPosture] = useState<Posture>(detectedPosture);
  const [date, setDate] = useState<string>(() =>
    detectedPosture === "planning" ? addDaysISO(todayISO(), 3) : todayISO(),
  );

  function chooseMode(m: Posture) {
    setPosture(m);
    if (m === "planning" && date <= today) setDate(addDaysISO(today, 3));
  }

  // Truck line, from name, and reply-to live here so the email preview updates
  // as they're edited in Setup, and the send uses the current values.
  const [equipment, setEquipment] = useState(settings.truckLine);
  const [replyToName, setReplyToName] = useState(settings.replyToName);
  const [replyToEmail, setReplyToEmail] = useState(settings.replyToEmail);
  // Legacy signature tokens — still filled for any template that uses
  // {mc}/{phone}; the branded footer is the canonical signature now, so these
  // aren't edited in Setup.
  const mc = settings.mc;
  const phone = settings.phone;

  const [setupOpen, setSetupOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReachSendResult | null>(null);
  // The confirm modal is shared by the real blast and the test send.
  const [confirmMode, setConfirmMode] = useState<null | "real" | "test">(null);
  const [cooldown, setCooldown] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  const marketWording = effectiveMarket?.wording || effectiveMarket?.name || "the area";
  const cityLabel = townLabel || effectiveMarket?.name || "your area";
  const radiusMi = effectiveMarket?.radiusMi ?? 0;

  // Token context. The editable fields + preview show a fully-RENDERED email
  // (every {token} filled, {broker} → "there") so the operator never sees a raw
  // token. On save/send we reverse it back to a token template with templatize()
  // so per-broker personalization + auto-fill survive an edit.
  const tokenCtx = useMemo(
    () => ({ market: marketWording, equipment, townParen, mc, phone }),
    [marketWording, equipment, townParen, mc, phone],
  );

  const key = `${posture}-${style}`;
  // Base token template for this posture×style.
  const baseTemplate = useMemo(() => {
    const t = templateFor.get(key);
    if (t) return { subject: t.subject, body: t.body };
    return fallbackTemplate(posture);
  }, [templateFor, key, posture]);
  // What the form/preview show: the base template rendered for display.
  const baseDisplay = useMemo(
    () => ({
      subject: renderTemplate(baseTemplate.subject, { ...tokenCtx, broker: "there" }),
      body: renderTemplate(baseTemplate.body, { ...tokenCtx, broker: "there" }),
    }),
    [baseTemplate, tokenCtx],
  );

  // Drafts hold in-session edits as DISPLAY text, keyed by posture-style.
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const current = drafts[key] ?? baseDisplay;
  const [saveFlash, setSaveFlash] = useState<string>("");

  const isEdited =
    !!drafts[key] &&
    (drafts[key].subject !== baseDisplay.subject ||
      drafts[key].body !== baseDisplay.body);

  /** The token template to send/save: reverse-mapped when edited, else the base. */
  function sendTemplates(): { subject: string; body: string } {
    if (!isEdited) return baseTemplate;
    return {
      subject: templatize(current.subject, tokenCtx),
      body: templatize(current.body, tokenCtx),
    };
  }

  function editField(patch: Partial<{ subject: string; body: string }>) {
    setDrafts((d) => ({ ...d, [key]: { ...(d[key] ?? baseDisplay), ...patch } }));
    setSaveFlash("");
  }

  async function saveDefault() {
    if (!isEdited) return; // untouched — keep the stored template as-is
    const res = await saveReachStyleEmail(posture, style, sendTemplates());
    setSaveFlash(res.ok ? "Saved as default" : `Couldn’t save: ${res.reason}`);
  }

  // ── Recipients / send ──────────────────────────────────────────────────────
  const sendRecipients = useMemo(
    () => recipients.filter((r) => r.email),
    [recipients],
  );
  const sendCount = sendRecipients.length;

  // Preview/editor are already fully rendered (display text); show them directly.
  const previewSubject = current.subject;
  const previewBody = current.body;

  // Picking a city from the typeahead re-anchors by ZIP; the server resolves the
  // market, recipients, and town phrase for that spot.
  function pickCity(hit: CityHit) {
    const params = new URLSearchParams();
    if (/^\d{5}/.test(hit.zip)) params.set("zip", hit.zip);
    router.push(`/admin/dispatch/reach?${params.toString()}`);
  }

  // Sends only to the ids the user left checked in the confirm modal.
  async function onSend(ids: string[]) {
    const clean = ids.filter(Boolean);
    if (clean.length === 0 || sending || cooldown > 0) return;
    setSending(true);
    setResult(null);
    const tpl = sendTemplates();
    try {
      const r = await sendReach({
        brokerIds: clean,
        posture,
        leverage: style,
        // Built-in markets aren't DB rows, so market_id stays null; the
        // market_name snapshot records which one.
        marketId: null,
        marketName: effectiveMarket?.name ?? marketWording,
        replyToName,
        replyToEmail,
        ctx: {
          market: marketWording,
          equipment,
          townParen,
          mc,
          phone,
          subjectTemplate: tpl.subject,
          bodyTemplate: tpl.body,
        },
      });
      setResult(r);
      if (r.ok) {
        // Persist any edits as the style default alongside the send.
        await saveDefault();
        setCooldown(60);
        setConfirmMode(null);
        router.refresh();
      }
    } finally {
      setSending(false);
    }
  }

  // Fired from the confirm modal (test mode) — same review gate as a real blast,
  // just to the single test inbox.
  async function onTestConfirm() {
    if (testing) return;
    setTesting(true);
    setTestMsg(null);
    const tpl = sendTemplates();
    try {
      const r = await sendReachTest(
        {
          market: marketWording,
          equipment,
          townParen,
          mc,
          phone,
          subjectTemplate: tpl.subject,
          bodyTemplate: tpl.body,
        },
        replyToName,
        replyToEmail,
      );
      setTestMsg(
        r.ok
          ? { ok: true, text: `Test sent to ${r.to.join(" and ")}` }
          : { ok: false, text: r.reason },
      );
      if (r.ok) setConfirmMode(null);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      {/* No portal top bar below sm — clear the status bar / notch but stay
          tight (compact header, no empty utility strip). */}
      <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6 sm:py-5 lg:px-8">
        <header className="mb-4 flex items-end justify-between gap-3 border-b-2 border-line-strong pb-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-accent">
              Dispatch
            </div>
            <h1 className="truncate text-[24px] font-bold leading-tight text-ink">
              Reach
            </h1>
          </div>
          {tab === "send" ? (
            <Button variant="edit" size="sm" onClick={() => setSetupOpen(true)}>
              Setup
            </Button>
          ) : null}
        </header>

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
                cityLabel={cityLabel}
                onPickCity={pickCity}
                townParen={townParen}
                date={date}
                today={today}
                onDate={setDate}
                posture={posture}
                onMode={chooseMode}
                anchorLoadNumber={anchorLoadNumber}
                anchorReason={anchorReason}
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
                  setConfirmMode("real");
                }}
                testing={testing}
                testMsg={testMsg}
                onTestSend={() => {
                  setTestMsg(null);
                  setConfirmMode("test");
                }}
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
          replyToEmail={replyToEmail}
          onReplyToEmailChange={setReplyToEmail}
          onSaved={() => router.refresh()}
          onClose={() => setSetupOpen(false)}
        />
      ) : null}

      {confirmMode ? (
        <ConfirmSendModal
          mode={confirmMode}
          subject={previewSubject}
          body={previewBody}
          recipients={
            confirmMode === "test"
              ? [
                  {
                    brokerId: "test",
                    name: "Test send",
                    email: TEST_INBOX,
                    area: "Goes only to you",
                  },
                ]
              : sendRecipients.map((r) => ({
                  brokerId: r.brokerId,
                  name: r.name,
                  email: r.email as string,
                  area: r.area,
                }))
          }
          sending={confirmMode === "test" ? testing : sending}
          errorText={
            confirmMode === "test"
              ? testMsg && !testMsg.ok
                ? testMsg.text
                : null
              : result && !result.ok
                ? result.reason
                : null
          }
          onConfirm={confirmMode === "test" ? () => onTestConfirm() : onSend}
          onClose={() => {
            const busy = confirmMode === "test" ? testing : sending;
            if (!busy) setConfirmMode(null);
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

function LocationPin() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10z" />
      <circle cx="12" cy="11" r="2" />
    </svg>
  );
}

function SituationCard({
  cityLabel,
  onPickCity,
  townParen,
  date,
  today,
  onDate,
  posture,
  onMode,
  anchorLoadNumber,
  anchorReason,
}: {
  cityLabel: string;
  onPickCity: (hit: CityHit) => void;
  townParen: string;
  date: string;
  today: string;
  onDate: (v: string) => void;
  posture: Posture;
  onMode: (m: Posture) => void;
  anchorLoadNumber: string | null;
  anchorReason: string;
}) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  // The town field's displayed value — owned here so BOTH the typeahead pick
  // and the Use-my-location button write the same visible string.
  const [townText, setTownText] = useState(cityLabel);

  // "Use my location": browser geolocation → server reverse-lookup → same
  // re-anchor as a typed-and-picked town. Fails soft to a type-it message.
  function onUseLocation() {
    if (locating) return;
    setGeoError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Couldn't get your location — type your town instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void resolveLocation(pos.coords.latitude, pos.coords.longitude)
          .then((hit) => {
            if (hit) {
              // Show the resolved current-location town in the field, then
              // re-anchor recipients + email/preview to it.
              setTownText(`${hit.city}, ${hit.state}`);
              onPickCity(hit);
            } else {
              setGeoError("Couldn't find a town near you — type it instead.");
            }
          })
          .catch(() =>
            setGeoError("Couldn't get your location — type your town instead."),
          )
          .finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        setGeoError("Couldn't get your location — type your town instead.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  const modeBtn = (m: Posture, label: string) => {
    const on = posture === m;
    return (
      <button
        type="button"
        onClick={() => onMode(m)}
        aria-pressed={on}
        className={
          "rounded py-1.5 text-[12px] font-bold transition-colors " +
          (on
            ? "bg-accent text-white shadow-e1"
            : "text-on-dark-dim hover:text-white")
        }
      >
        {label}
      </button>
    );
  };

  const darkLabel =
    "mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-on-dark-dim";

  return (
    <div className="relative rounded-lg bg-graphite p-5 pl-6 shadow-e2">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-lg bg-accent"
      />
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-on-dark-dim">
        Your situation
      </p>

      {/* Town (+ Use my location) and the Open now / Planning ahead toggle.
          Stacks full-width on mobile, side by side on sm+. */}
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:gap-5">
        <div className="min-w-0 sm:flex-1">
          <span className={darkLabel}>Town</span>
          <div className="flex items-center gap-2">
            <CityTypeahead
              value={townText}
              onValueChange={setTownText}
              onPick={onPickCity}
            />
            <button
              type="button"
              onClick={onUseLocation}
              disabled={locating}
              title="Use my current location"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-graphite-line bg-graphite-2 px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-graphite-line disabled:opacity-60"
            >
              <LocationPin />
              <span className="hidden sm:inline">
                {locating ? "Locating…" : "Use my location"}
              </span>
              <span className="sm:hidden">{locating ? "…" : "Locate"}</span>
            </button>
          </div>
          {geoError ? (
            <p className="mt-1.5 text-[11px] text-white/90">{geoError}</p>
          ) : null}
        </div>

        <div className="min-w-0 sm:w-[260px]">
          <span className={darkLabel}>When</span>
          <div className="grid grid-cols-2 gap-1 rounded-md border border-graphite-line bg-graphite-2 p-0.5">
            {modeBtn("available", "Open now")}
            {modeBtn("planning", "Planning ahead")}
          </div>
          {posture === "planning" ? (
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => onDate(e.target.value || today)}
              aria-label="When the truck will be open"
              // appearance-none tames the chunky native mobile date control so it
              // matches the Town field's height/box exactly; desktop keeps the
              // native picker chrome (sm:appearance-auto). color-scheme:light keeps
              // the value + calendar icon dark/readable on the white field.
              className="mt-2 h-9 w-full appearance-none rounded-md border border-line-strong bg-card px-2.5 text-[14px] font-semibold text-ink outline-none [color-scheme:light] focus:border-accent focus:ring-2 focus:ring-accent/40 sm:appearance-auto"
            />
          ) : null}
        </div>
      </div>

      {/* Sub-line: precision town + posture meaning + load provenance. On mobile
          these stack so the pill never crowds the location text. */}
      <div className="mt-3 flex flex-col items-start gap-1.5 text-[12px] text-on-dark-dim sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
        {townParen ? (
          <span className="text-white/90">Sitting {townParen}</span>
        ) : null}
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
      <p className="mt-2 font-mono text-[10px] text-on-dark-dim/70">
        Type a town or tap Use my location. Switch to Planning ahead to reach out
        before you get there.
      </p>
    </div>
  );
}

// ── City typeahead ──────────────────────────────────────────────────────────────

/**
 * Type-to-search location field (reuses /api/admin/dispatch/cities). The
 * displayed value is CONTROLLED by the parent (`value`/`onValueChange`) so the
 * Use-my-location button and a typed-and-picked suggestion both drive the same
 * visible string. Typing searches; picking (or an external set) re-anchors.
 * Light-styled so it's readable on the graphite card.
 */
function CityTypeahead({
  value,
  onValueChange,
  onPick,
}: {
  value: string;
  onValueChange: (v: string) => void;
  onPick: (hit: CityHit) => void;
}) {
  const [hits, setHits] = useState<CityHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Only search when the user is actively typing — external value changes
  // (a pick, or the Use-my-location button) must NOT trigger a search.
  const [typing, setTyping] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!typing) return;
    const q = value.trim();
    const id = ++reqRef.current;
    const t = setTimeout(() => {
      if (q.length < 2) {
        setHits([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      fetch(`/api/admin/dispatch/cities?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => {
          if (id !== reqRef.current) return;
          setHits(j.cities ?? []);
          setOpen(true);
        })
        .catch(() => {})
        .finally(() => {
          if (id === reqRef.current) setLoading(false);
        });
    }, 60);
    return () => clearTimeout(t);
  }, [value, typing]);

  return (
    <span className="relative block min-w-0 flex-1">
      <input
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setTyping(true);
        }}
        onFocus={(e) => {
          e.currentTarget.select();
          if (hits.length > 0) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="City you're reaching from"
        placeholder="Type a town…"
        className="h-9 w-full rounded-md border border-line-strong bg-card px-2.5 text-[14px] font-semibold text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
      />
      {loading ? (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-ink-3">
          …
        </span>
      ) : null}
      {open && hits.length > 0 ? (
        <ul className="absolute left-0 z-20 mt-1 max-h-56 w-full min-w-[200px] max-w-[calc(100vw-2.5rem)] overflow-auto rounded-md border border-line-strong bg-card text-ink shadow-e3">
          {hits.map((h) => (
            <li key={`${h.zip}-${h.city}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // mousedown (before blur) so the pick registers.
                  e.preventDefault();
                  onValueChange(`${h.city}, ${h.state}`);
                  setTyping(false);
                  setOpen(false);
                  onPick(h);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium text-ink transition-colors hover:bg-inset"
              >
                <span className="truncate">
                  {h.city}, {h.state}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-3">
                  {h.zip}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </span>
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
        <p className="mt-1 text-[11px] text-ink-3">
          Your market, truck, and location are already filled in. On send, each
          broker gets their own name in place of “there.”
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
        {/* Branded signature footer — exactly what's appended to every email. */}
        <div
          className="mt-2 overflow-x-auto rounded-md bg-white p-3"
          dangerouslySetInnerHTML={{
            __html: reachSignatureHtml(REACH_PREVIEW_LOGO_URL),
          }}
        />
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
  mode,
  subject,
  body,
  recipients,
  sending,
  errorText,
  onConfirm,
  onClose,
}: {
  /** "real" = the broker blast; "test" = the single test-inbox send. */
  mode: "real" | "test";
  subject: string;
  /** Already-rendered display body (greeting shows "there"). */
  body: string;
  recipients: { brokerId: string; name: string; email: string; area: string }[];
  sending: boolean;
  errorText: string | null;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const isTest = mode === "test";
  // Every recipient starts CHECKED; unchecking drops them from this send.
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(recipients.map((r) => r.brokerId)),
  );
  const checkedCount = checked.size;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !sending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sending, onClose]);

  function toggle(id: string) {
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isTest ? "Review test send" : "Review reach before sending"}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-6"
      onClick={() => {
        if (!sending) onClose();
      }}
    >
      <div
        className="my-2 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-line-strong bg-card shadow-e3 sm:my-4 sm:max-h-[calc(100dvh-3rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — live count */}
        <div className="flex shrink-0 items-center justify-between gap-3 bg-bar px-4 py-2.5">
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            {isTest
              ? "Test send"
              : `Review · ${checkedCount} of ${recipients.length}`}
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

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-elevated px-4 py-4">
          {/* The email — subject + full rendered body + branded footer */}
          <details open className="group rounded-md border border-line bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg">
                The email
              </span>
              <span
                aria-hidden
                className="font-mono text-[11px] text-ink-3 group-open:hidden"
              >
                show ▾
              </span>
              <span
                aria-hidden
                className="hidden font-mono text-[11px] text-ink-3 group-open:inline"
              >
                hide ▴
              </span>
            </summary>
            <div className="border-t border-line px-3 py-3">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
                Subject
              </p>
              <p className="mt-0.5 text-[13px] font-semibold text-fg">{subject}</p>
              <p className="mt-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
                Body · each broker gets their name in place of “there”
              </p>
              <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-fg">
                {body}
              </pre>
              <div
                className="mt-2 overflow-x-auto rounded-md bg-white p-3"
                dangerouslySetInnerHTML={{
                  __html: reachSignatureHtml(REACH_PREVIEW_LOGO_URL),
                }}
              />
            </div>
          </details>

          {/* Recipients — one tappable card per broker, checked by default */}
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg">
                {isTest
                  ? "Test recipient"
                  : `Recipients · ${checkedCount} selected`}
              </p>
              {isTest ? (
                <p className="font-mono text-[10px] text-fg-subtle">
                  only your inbox
                </p>
              ) : (
                <p className="font-mono text-[10px] text-fg-subtle">
                  uncheck to skip
                </p>
              )}
            </div>
            {recipients.length === 0 ? (
              <p className="text-[12px] text-warn">
                None of the brokers have an email on file.
              </p>
            ) : (
              <div className="space-y-2">
                {recipients.map((r) => {
                  const on = checked.has(r.brokerId);
                  return (
                    <label
                      key={r.brokerId}
                      className={
                        "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors " +
                        (on
                          ? "border-line-strong bg-card"
                          : "border-line bg-inset opacity-55")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={sending}
                        onChange={() => toggle(r.brokerId)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-fg">
                          {r.name}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11.5px] text-steel">
                          {r.email}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-fg-subtle">
                          {r.area || "—"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {errorText ? (
            <p role="alert" className="text-[12px] font-semibold text-bad">
              {errorText}
            </p>
          ) : null}
        </div>

        {/* Footer — Cancel + confirm with the live count */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
          <Button variant="cancel" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={() => onConfirm([...checked])}
            disabled={sending || checkedCount === 0}
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
            ) : isTest ? (
              "Send test →"
            ) : (
              `Send to ${checkedCount} broker${checkedCount === 1 ? "" : "s"} →`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

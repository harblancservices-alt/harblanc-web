"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  sendBackhaul,
  sendBackhaulTest,
  createEmailPreset,
  updateEmailPreset,
  deleteEmailPreset,
  type BackhaulSendResult,
} from "./actions";
import {
  resolveTokens,
  STARTER_PRESETS,
  type EmailPreset,
} from "./presets";
import { FarmContactButton } from "../../FarmBrokerContactCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { field } from "@/components/ui/styles";

export type BackhaulBroker = {
  id: string;
  name: string;
  email: string | null;
  loadsFromHere: number;
  warmth: "hot" | "warm" | "cold";
};

const WARMTH_PILL: Record<string, string> = {
  hot: "bg-bad-bg text-bad",
  warm: "bg-warn-bg text-warn",
  cold: "bg-slate-bg text-slate",
};

/** A preset plus a stable client key (DB id, or a synthetic key for the
 *  in-memory starters shown before the table is migrated). */
type PresetItem = EmailPreset & { key: string };

function toItems(presets: readonly EmailPreset[]): PresetItem[] {
  return presets.map((p, i) => ({
    ...p,
    key: p.id ?? `starter-${i}`,
  }));
}

export function BackhaulView({
  brokers,
  emptyState,
  locationLabel,
  zip,
  date,
  radiusMi,
  presets,
  presetsAvailable,
}: {
  brokers: BackhaulBroker[];
  emptyState: string | null;
  locationLabel: string | null;
  zip: string;
  date: string;
  radiusMi: number;
  presets: EmailPreset[];
  /** False when the email_presets table isn't migrated yet → saving disabled. */
  presetsAvailable: boolean;
}) {
  const place = locationLabel ?? "the area";
  const when = date || "now";
  const router = useRouter();

  const defaultSelected = useMemo(
    () =>
      new Set(
        brokers.filter((b) => b.email && b.warmth !== "cold").map((b) => b.id),
      ),
    [brokers],
  );
  const [selected, setSelected] = useState<Set<string>>(defaultSelected);

  // Presets: DB rows when available, otherwise the in-memory starters. The
  // compose box shows the RAW template (with {broker}/{area}/{when} tokens);
  // {area}/{when} are resolved from the current search only at send/preview
  // time, so saving a preset is lossless.
  const initialItems = useMemo(
    () => toItems(presets.length > 0 ? presets : STARTER_PRESETS),
    [presets],
  );
  const [presetList, setPresetList] = useState<PresetItem[]>(initialItems);
  const [activeKey, setActiveKey] = useState<string>(
    initialItems[0]?.key ?? "",
  );
  const [presetName, setPresetName] = useState(initialItems[0]?.name ?? "");
  const [subject, setSubject] = useState(initialItems[0]?.subject ?? "");
  const [body, setBody] = useState(initialItems[0]?.body ?? "");
  const [presetBusy, setPresetBusy] = useState(false);
  const [presetMsg, setPresetMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BackhaulSendResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Seconds left on the one-email-per-minute cooldown (0 = unlocked).
  const [cooldown, setCooldown] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locateErr, setLocateErr] = useState<string | null>(null);

  const activeItem =
    presetList.find((p) => p.key === activeKey) ?? presetList[0] ?? null;

  // {broker} stays literal (filled per-recipient at send); {area}/{when} are
  // resolved from the current search for the preview + the actual send.
  const resolvedSubject = resolveTokens(subject, { area: place, when });
  const resolvedBody = resolveTokens(body, { area: place, when });

  function loadPreset(key: string) {
    const p = presetList.find((x) => x.key === key);
    if (!p) return;
    setActiveKey(p.key);
    setPresetName(p.name);
    setSubject(p.subject);
    setBody(p.body);
    setPresetMsg(null);
  }

  async function onSavePreset() {
    if (presetBusy || !activeItem) return;
    setPresetBusy(true);
    setPresetMsg(null);
    try {
      const payload = { name: presetName, subject, body };
      // A starter (no DB id) becomes a real row on first save.
      const res = activeItem.id
        ? await updateEmailPreset(activeItem.id, payload)
        : await createEmailPreset(payload);
      if (!res.ok) {
        setPresetMsg({ ok: false, text: res.reason });
        return;
      }
      const saved: PresetItem = { ...res.preset, key: res.preset.id ?? activeKey };
      setPresetList((list) =>
        list.some((p) => p.key === activeKey)
          ? list.map((p) => (p.key === activeKey ? saved : p))
          : [...list, saved],
      );
      setActiveKey(saved.key);
      setPresetMsg({ ok: true, text: "Saved" });
    } finally {
      setPresetBusy(false);
    }
  }

  async function onSaveAsNew() {
    if (presetBusy) return;
    setPresetBusy(true);
    setPresetMsg(null);
    try {
      const res = await createEmailPreset({
        name: presetName.trim() ? `${presetName} (copy)` : "New preset",
        subject,
        body,
      });
      if (!res.ok) {
        setPresetMsg({ ok: false, text: res.reason });
        return;
      }
      const saved: PresetItem = { ...res.preset, key: res.preset.id! };
      setPresetList((list) => [...list, saved]);
      setActiveKey(saved.key);
      setPresetName(saved.name);
      setPresetMsg({ ok: true, text: "Saved as new preset" });
    } finally {
      setPresetBusy(false);
    }
  }

  async function onDeletePreset() {
    if (presetBusy || !activeItem?.id) return;
    if (!window.confirm(`Delete the "${activeItem.name}" preset?`)) return;
    setPresetBusy(true);
    setPresetMsg(null);
    try {
      const res = await deleteEmailPreset(activeItem.id);
      if (!res.ok) {
        setPresetMsg({ ok: false, text: res.reason });
        return;
      }
      const remaining = presetList.filter((p) => p.key !== activeKey);
      setPresetList(remaining);
      if (remaining[0]) loadPreset(remaining[0].key);
      else {
        setActiveKey("");
        setPresetName("");
      }
    } finally {
      setPresetBusy(false);
    }
  }

  async function onTestSend() {
    if (testing) return;
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await sendBackhaulTest(resolvedSubject, resolvedBody);
      setTestMsg(
        r.ok
          ? { ok: true, text: `Test sent to ${r.to}` }
          : { ok: false, text: r.reason },
      );
    } finally {
      setTesting(false);
    }
  }

  // Reset the recipient selection when a new search runs. The compose text is
  // intentionally NOT reset (it holds tokens, so it's search-independent).
  useEffect(() => {
    setSelected(defaultSelected);
    setResult(null);
  }, [defaultSelected]);

  useEffect(() => {
    setLocating(false);
  }, [zip]);

  // Tick the cooldown down to zero each second, then auto-unlock.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function onLocate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateErr("Location isn't available on this device.");
      return;
    }
    setLocateErr(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `/api/admin/dispatch/geo?lat=${latitude}&lon=${longitude}`,
          );
          if (!res.ok) {
            setLocateErr("Couldn't find a ZIP near you. Enter it manually.");
            setLocating(false);
            return;
          }
          const j = (await res.json()) as { zip?: string };
          const params = new URLSearchParams();
          if (j.zip) params.set("zip", String(j.zip));
          if (date) params.set("date", date);
          router.push(`/admin/dispatch/backhaul?${params.toString()}`);
        } catch {
          setLocateErr("Couldn't look up your location. Enter it manually.");
          setLocating(false);
        }
      },
      () => {
        setLocateErr("Location permission denied. Enter your ZIP manually.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSend() {
    const ids = [...selected];
    if (ids.length === 0 || sending || cooldown > 0) return;
    setSending(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("broker_ids", ids.join(","));
      // {area}/{when} resolved here; {broker} stays for the server to fill
      // per-recipient — the existing send contract is unchanged.
      fd.append("subject", resolvedSubject);
      fd.append("body", resolvedBody);
      const r = await sendBackhaul(fd);
      setResult(r);
      if (r.ok) {
        // Lock for one minute and close the confirmation; the result shows
        // below the button. On failure the dialog stays open to retry.
        setCooldown(60);
        setConfirmOpen(false);
      }
    } finally {
      setSending(false);
    }
  }

  const selectableCount = brokers.filter((b) => b.email).length;
  // The brokers each personalized email will actually go to.
  const recipients = brokers
    .filter((b) => selected.has(b.id) && !!b.email)
    .map((b) => ({ name: b.name, email: b.email as string }));

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Dispatch"
          title="Backhaul"
          className="mb-1.5"
          actions={<FarmContactButton />}
        />
        <p className="mb-3 text-[13px] text-fg-muted">
          Email brokers for freight out of where you&apos;re sitting empty.
        </p>

        {/* 1 — Find */}
        <form
          method="get"
          action="/admin/dispatch/backhaul"
          className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-line bg-card px-3.5 py-3 shadow-e1"
        >
          <div className="flex-1 min-w-[140px]">
            <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Empty ZIP
            </label>
            <input
              name="zip"
              defaultValue={zip}
              inputMode="numeric"
              placeholder="e.g. 38101"
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Available
            </label>
            <input
              name="date"
              defaultValue={date}
              placeholder="Today"
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-accent bg-accent px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-accent-hover hover:border-accent-hover"
          >
            Find
          </button>
          <button
            type="button"
            onClick={onLocate}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-fg transition-colors hover:bg-inset disabled:opacity-50"
          >
            {locating ? "Locating…" : "Use my location"}
          </button>
        </form>
        {locateErr ? (
          <p className="mb-3 -mt-2 font-mono text-[11px] text-bad">
            {locateErr}
          </p>
        ) : null}

        {/* 2 — Message (always visible) */}
        <Card className="mb-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
              Message
            </p>
          </div>

          {/* Preset picker */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {presetList.map((p) => {
              const active = p.key === activeKey;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => loadPreset(p.key)}
                  className={
                    "rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors " +
                    (active
                      ? "border-accent bg-accent text-white"
                      : "border-line-strong bg-card text-ink-2 hover:bg-inset")
                  }
                >
                  {p.name}
                </button>
              );
            })}
          </div>

          {/* Preset name + save controls */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name"
              aria-label="Preset name"
              className={field.input + " h-9 min-w-[150px] flex-1 text-[13px]"}
            />
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={onSavePreset}
              disabled={!presetsAvailable || presetBusy}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="navigate"
              onClick={onSaveAsNew}
              disabled={!presetsAvailable || presetBusy}
            >
              Save as new
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={onDeletePreset}
              disabled={!presetsAvailable || presetBusy || !activeItem?.id}
            >
              Delete
            </Button>
          </div>
          {presetMsg ? (
            <p
              className={
                "mt-1 text-[11px] " + (presetMsg.ok ? "text-ok" : "text-bad")
              }
            >
              {presetMsg.text}
            </p>
          ) : null}
          {!presetsAvailable ? (
            <p className="mt-1 font-mono text-[10px] text-ink-3">
              Preset saving needs the email_presets migration — editing still
              works for this send.
            </p>
          ) : null}

          {/* Subject + body */}
          <label className={field.label + " mt-3"}>Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={field.input}
          />
          <label className={field.label + " mt-2.5"}>Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            className={field.textarea}
          />
          <p className="mt-1 font-mono text-[10px] text-ink-3">
            Tokens — {"{broker}"} each broker&apos;s name · {"{area}"} where
            you&apos;re empty · {"{when}"} your date.
          </p>

          {/* Test send */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Button
              type="button"
              size="sm"
              variant="navigate"
              onClick={onTestSend}
              disabled={testing}
            >
              {testing ? "Sending test…" : "Send test to myself"}
            </Button>
            {testMsg ? (
              <span
                className={
                  "text-[11px] " + (testMsg.ok ? "text-ok" : "text-bad")
                }
              >
                {testMsg.text}
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-[10px] text-ink-3">
            Sends the current message to harblancservices@gmail.com ·{" "}
            {"{broker}"} shows as &ldquo;there&rdquo;.
          </p>
        </Card>

        {/* 3 — Broker list (the selectable recipients) */}
        {!emptyState ? (
          <div className="rounded-md border border-dashed border-line-strong bg-card px-4 py-10 text-center font-mono text-[12px] text-ink-3 shadow-e1">
            {zip
              ? `Couldn't resolve "${zip}" to a state. Try a 5-digit ZIP.`
              : "Enter the ZIP where you're empty to rank brokers."}
          </div>
        ) : brokers.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-strong bg-card px-4 py-10 text-center font-mono text-[12px] text-ink-3 shadow-e1">
            No brokers with outbound freight within {radiusMi} mi of{" "}
            {locationLabel ?? "here"} yet.
          </div>
        ) : (
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
                Outbound within {radiusMi} mi · {brokers.length} broker
                {brokers.length === 1 ? "" : "s"} · {selectableCount} with email
              </span>
              <span className="font-mono text-[11px] text-fg-subtle">
                {selected.size} selected
              </span>
            </div>
            <div className="overflow-hidden rounded-md border border-line bg-card shadow-e2">
              {brokers.map((b, i) => {
                const hasEmail = !!b.email;
                const checked = selected.has(b.id);
                return (
                  <label
                    key={b.id}
                    className={
                      "flex items-start gap-2.5 border-l-[3px] px-3 py-2.5 transition-colors " +
                      (i === brokers.length - 1 ? "" : "border-b border-line ") +
                      (checked
                        ? "border-l-accent bg-inset "
                        : "border-l-transparent ") +
                      (hasEmail ? "cursor-pointer hover:bg-inset" : "opacity-70")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!hasEmail}
                      onChange={() => toggle(b.id)}
                      className="mt-1 accent-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-fg">
                          {b.name}
                        </span>
                        <span
                          className={
                            "rounded px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] " +
                            WARMTH_PILL[b.warmth]
                          }
                        >
                          {b.warmth}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                        {b.loadsFromHere > 0 ? (
                          <span className="rounded bg-ok-bg px-1.5 py-[1px] text-ok">
                            {b.loadsFromHere} load
                            {b.loadsFromHere === 1 ? "" : "s"} within {radiusMi}{" "}
                            mi
                          </span>
                        ) : (
                          <span className="text-fg-subtle">No history here</span>
                        )}
                        {hasEmail ? (
                          <span className="font-mono text-steel">{b.email}</span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-warn">
                            No email on file
                            <Link
                              href={`/admin/dispatch/brokers/${b.id}`}
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
              })}
            </div>
          </div>
        )}

        {/* 4 — Send */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setConfirmOpen(true);
            }}
            disabled={sending || cooldown > 0 || selected.size === 0}
            className="w-full rounded-md border border-accent bg-accent px-4 py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-accent-hover hover:border-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cooldown > 0
              ? `Locked · ${cooldown}s`
              : `Email ${selected.size} selected →`}
          </button>
          <p className="mt-1.5 font-mono text-[10px] text-fg-subtle">
            {cooldown > 0
              ? `Rate-limited to one send per minute — unlocks in ${cooldown}s.`
              : "Review recipients before sending · replies land in your inbox."}
          </p>
          {result ? (
            <p
              className={
                "mt-2 text-[12px] " + (result.ok ? "text-ok" : "text-bad")
              }
            >
              {result.ok
                ? `Sent ${result.sent}${result.failed ? `, ${result.failed} failed` : ""}.`
                : result.reason}
            </p>
          ) : null}
        </div>

        {confirmOpen ? (
          <ConfirmSendModal
            subject={resolvedSubject}
            body={resolvedBody}
            recipients={recipients}
            sending={sending}
            result={result}
            onConfirm={onSend}
            onClose={() => {
              if (!sending) setConfirmOpen(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Confirmation dialog shown before a backhaul send. Lists every recipient
 * and previews the exact subject + body that will go out (one personalized
 * email per broker). Nothing sends until the operator hits Send.
 */
function ConfirmSendModal({
  subject,
  body,
  recipients,
  sending,
  result,
  onConfirm,
  onClose,
}: {
  subject: string;
  body: string;
  recipients: { name: string; email: string }[];
  sending: boolean;
  result: BackhaulSendResult | null;
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review backhaul email"
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
            Review backhaul email
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
          {/* Recipients */}
          <section className="rounded-md border border-line bg-card p-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg">
              Recipients · {recipients.length}
            </p>
            <p className="mb-2 mt-0.5 text-[11px] text-fg-subtle">
              Each broker gets their own personalized copy — one email per
              recipient.
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
                    <span className="truncate font-medium text-fg">
                      {r.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] text-steel">
                      {r.email}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Email preview */}
          <section className="rounded-md border border-line bg-card p-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg">
              Email
            </p>
            <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
              Subject
            </p>
            <p className="mt-0.5 text-[13px] font-semibold text-fg">{subject}</p>
            <p className="mt-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
              Body · {"{broker}"} fills each broker&apos;s name
            </p>
            <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-fg">
              {body}
            </pre>
          </section>

          {result && !result.ok ? (
            <p role="alert" className="text-[12px] font-semibold text-bad">
              {result.reason}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-md border border-line-strong bg-card px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-fg transition-colors hover:bg-elevated disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={sending || recipients.length === 0}
            aria-busy={sending}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent bg-accent px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-accent-hover hover:border-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
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

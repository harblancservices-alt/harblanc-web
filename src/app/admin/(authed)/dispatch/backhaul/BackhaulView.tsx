"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { sendBackhaul, type BackhaulSendResult } from "./actions";

export type BackhaulBroker = {
  id: string;
  name: string;
  email: string | null;
  loadsFromHere: number;
  warmth: "hot" | "warm" | "cold";
};

const WARMTH_PILL: Record<string, string> = {
  hot: "bg-red-100 text-red-700",
  warm: "bg-amber-100 text-amber-700",
  cold: "bg-elevated text-fg-muted",
};

export function BackhaulView({
  brokers,
  emptyState,
  locationLabel,
  zip,
  date,
  radiusMi,
}: {
  brokers: BackhaulBroker[];
  emptyState: string | null;
  locationLabel: string | null;
  zip: string;
  date: string;
  radiusMi: number;
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
  const [subject, setSubject] = useState(
    `Hotshot empty ${place} — available ${when}`,
  );
  const [body, setBody] = useState(
    `Hi {broker},\n\nHARBLANC has a hotshot sitting empty in ${place}, ready ${when} and willing to deadhead. Anything moving out of the area?\n\nReply to this email or call (xxx) xxx-xxxx.\n\nThanks,\nHARBLANC`,
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BackhaulSendResult | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateErr, setLocateErr] = useState<string | null>(null);

  // Reset selection + template when a new search runs.
  useEffect(() => {
    setSelected(defaultSelected);
    setSubject(`Hotshot empty ${place} — available ${when}`);
    setResult(null);
  }, [defaultSelected, place, when]);

  useEffect(() => {
    setLocating(false);
  }, [zip]);

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
    if (ids.length === 0) return;
    setSending(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("broker_ids", ids.join(","));
      fd.append("subject", subject);
      fd.append("body", body);
      setResult(await sendBackhaul(fd));
    } finally {
      setSending(false);
    }
  }

  const selectableCount = brokers.filter((b) => b.email).length;

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-3">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
            Dispatch
          </p>
          <h1 className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-fg">
            Backhaul
          </h1>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Email brokers for freight out of where you&apos;re sitting empty.
          </p>
        </header>

        {/* Search */}
        <form
          method="get"
          action="/admin/dispatch/backhaul"
          className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-line bg-card px-3.5 py-3 shadow-sm"
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
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
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
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-red-700 bg-red-600 px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700"
          >
            Find
          </button>
          <button
            type="button"
            onClick={onLocate}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-fg transition-colors hover:bg-elevated disabled:opacity-50"
          >
            {locating ? "Locating…" : "Use my location"}
          </button>
        </form>
        {locateErr ? (
          <p className="mb-3 -mt-2 font-mono text-[11px] text-red-700">
            {locateErr}
          </p>
        ) : null}

        {!emptyState ? (
          <div className="rounded-xl border border-dashed border-line bg-card px-4 py-10 text-center font-mono text-[12px] text-fg-subtle">
            {zip
              ? `Couldn't resolve "${zip}" to a state. Try a 5-digit ZIP.`
              : "Enter the ZIP where you're empty to rank brokers."}
          </div>
        ) : brokers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-card px-4 py-10 text-center font-mono text-[12px] text-fg-subtle">
            No brokers with outbound freight within {radiusMi} mi of{" "}
            {locationLabel ?? "here"} yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            {/* Ranked brokers */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
                  Outbound within {radiusMi} mi · {brokers.length} broker
                  {brokers.length === 1 ? "" : "s"} · {selectableCount} with
                  email
                </span>
                <span className="font-mono text-[11px] text-fg-subtle">
                  {selected.size} selected
                </span>
              </div>
              <div className="overflow-hidden rounded-md border border-line bg-card shadow-sm">
                {brokers.map((b, i) => {
                  const hasEmail = !!b.email;
                  const checked = selected.has(b.id);
                  return (
                    <label
                      key={b.id}
                      className={
                        "flex items-start gap-2.5 px-3 py-2.5 " +
                        (i === brokers.length - 1 ? "" : "border-b border-line") +
                        (hasEmail ? " cursor-pointer hover:bg-elevated" : " opacity-70")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!hasEmail}
                        onChange={() => toggle(b.id)}
                        className="mt-1"
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
                            <span className="rounded bg-green-100 px-1.5 py-[1px] text-green-700">
                              {b.loadsFromHere} load
                              {b.loadsFromHere === 1 ? "" : "s"} within{" "}
                              {radiusMi} mi
                            </span>
                          ) : (
                            <span className="text-fg-subtle">No history here</span>
                          )}
                          {hasEmail ? (
                            <span className="font-mono text-blue-700">
                              {b.email}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-amber-700">
                              No email on file
                              <Link
                                href={`/admin/dispatch/brokers/${b.id}`}
                                prefetch={false}
                                className="font-mono font-bold uppercase tracking-[0.06em] text-blue-700 hover:underline"
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

            {/* Compose */}
            <div className="rounded-md border border-line bg-card p-3 shadow-sm">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
                Message
              </div>
              <label className="mt-2 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
                Subject
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
              />
              <label className="mt-2.5 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
                Body · {"{broker}"} fills each name
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
              />
              <button
                type="button"
                onClick={onSend}
                disabled={sending || selected.size === 0}
                className="mt-3 w-full rounded-md border border-red-700 bg-red-600 px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {sending ? "Sending…" : `Email ${selected.size} selected →`}
              </button>
              <p className="mt-1.5 font-mono text-[10px] text-fg-subtle">
                Sent from your dispatch address · replies land in your inbox.
              </p>
              {result ? (
                <p
                  className={
                    "mt-2 text-[12px] " +
                    (result.ok ? "text-green-700" : "text-red-700")
                  }
                >
                  {result.ok
                    ? `Sent ${result.sent}${result.failed ? `, ${result.failed} failed` : ""}.`
                    : result.reason}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

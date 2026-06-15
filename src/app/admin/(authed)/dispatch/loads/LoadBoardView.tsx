"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createLoad } from "./actions";

export type LoadRow = {
  id: string;
  loadNumber: string;
  broker: string;
  equipment: string;
  origin: string;
  destination: string;
  pickup: string;
  delivery: string;
  trip: string;
  rate: number;
  net: number;
  loadedMiles: number | null;
  dhMiles: number;
  deadheadTo: number;
  deadheadFrom: number;
  status: string;
  paymentStatus: string;
};

export type LoadBoardData = {
  rows: ReadonlyArray<LoadRow>;
  brokerNames: ReadonlyArray<string>;
  activeTrips: ReadonlyArray<string>;
  kpis: {
    totalLoads: number;
    inTransit: number;
    openAssigned: number;
    delivered: number;
    completionPct: number;
    gross: number;
    net: number;
    ar: number;
    arCount: number;
    avgNetPerMile: number;
    avgGrossPerMile: number;
  };
  deadhead: {
    toPickup: number;
    fromDelivery: number;
    totalDh: number;
    dhFuelCost: number;
  };
};

type Filter = "all" | "active" | "delivered" | "cancelled";

const STATUS_PILL: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  assigned: "bg-amber-50 text-amber-700",
  loaded: "bg-blue-50 text-blue-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-elevated text-fg-subtle",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  assigned: "Rolling",
  loaded: "Loaded",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const GRID =
  "92px 90px minmax(0,1.2fr) minmax(0,1.4fr) 60px 60px minmax(0,0.9fr) 88px 64px 56px 96px 96px";

export function LoadBoardView({ data }: { data: LoadBoardData }) {
  const { kpis, deadhead } = data;
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const rows = useMemo(() => {
    let r = [...data.rows];
    if (filter === "active")
      r = r.filter(
        (x) =>
          x.status === "pending" ||
          x.status === "assigned" ||
          x.status === "loaded",
      );
    else if (filter === "delivered")
      r = r.filter((x) => x.status === "delivered");
    else if (filter === "cancelled")
      r = r.filter((x) => x.status === "cancelled");
    const q = query.trim().toLowerCase();
    if (q) {
      r = r.filter((x) =>
        [x.loadNumber, x.broker, x.origin, x.destination, x.trip]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return r;
  }, [data.rows, filter, query]);

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
              Dispatch
            </p>
            <h1 className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-fg">
              Load board
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-700 bg-red-600 px-3.5 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700"
          >
            + Add load
          </button>
        </header>

        <ProfitGoalBar net={kpis.net} />

        {/* KPI strip */}
        <div className="mb-2 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line shadow-sm sm:grid-cols-6">
          <Kpi label="Total loads" value={String(kpis.totalLoads)} tone="count" />
          <Kpi
            label="A/R"
            value={usd(kpis.ar)}
            tone={kpis.ar > 0 ? "red" : "muted"}
          />
          <Kpi label="Delivered" value={String(kpis.delivered)} tone="green" />
          <Kpi label="Gross" value={usd(kpis.gross)} tone="green" />
          <Kpi label="Net profit" value={usd(kpis.net)} tone="green" />
          <div className="min-w-0 bg-card px-3 py-2.5">
            <div className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-600">
              Avg / mi
            </div>
            <div className="mt-1 truncate text-[16px] font-bold tabular-nums leading-none text-green-700 sm:text-[18px]">
              ${kpis.avgNetPerMile.toFixed(2)}
              <span className="ml-1 text-[10px] font-medium text-fg-subtle">net</span>
            </div>
            <div className="mt-1 truncate text-[13px] font-bold tabular-nums leading-none text-green-700">
              ${kpis.avgGrossPerMile.toFixed(2)}
              <span className="ml-1 text-[10px] font-medium text-fg-subtle">gross</span>
            </div>
          </div>
        </div>

        {/* Deadhead strip */}
        <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line shadow-sm sm:grid-cols-5">
          <DhCell label="Deadhead" value="" muted />
          <DhCell label="To pickup" value={`${deadhead.toPickup.toLocaleString()} mi`} />
          <DhCell label="From delivery" value={`${deadhead.fromDelivery.toLocaleString()} mi`} />
          <DhCell label="Total DH" value={`${deadhead.totalDh.toLocaleString()} mi`} />
          <DhCell label="DH fuel cost" value={`-${usd(deadhead.dhFuelCost)}`} tone="red" />
        </div>

        {/* Toolbar */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search load #, broker, origin, destination…"
            className="min-w-0 flex-1 rounded-md border border-line bg-card px-3 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none sm:max-w-sm"
          />
          {(["all", "active", "delivered", "cancelled"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                "rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors " +
                (filter === f
                  ? "border-fg bg-bar text-bar-fg"
                  : "border-line bg-card text-fg-muted hover:bg-elevated")
              }
            >
              {f}
            </button>
          ))}
        </div>

        {/* Table (desktop) */}
        <div className="hidden overflow-x-auto rounded-md border border-line bg-card shadow-md md:block">
          <div className="min-w-[1040px]">
            <div
              className="grid items-center gap-2 bg-bar px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-bar-fg"
              style={{ gridTemplateColumns: GRID }}
            >
              <span>Status</span>
              <span>Load #</span>
              <span>Broker</span>
              <span>Origin → Dest</span>
              <span>Pickup</span>
              <span>Delivery</span>
              <span>Trip</span>
              <span className="text-right">Rate</span>
              <span className="text-right">Miles</span>
              <span className="text-right">DH</span>
              <span className="text-right">Net</span>
              <span />
            </div>

            {rows.length === 0 ? (
              <div className="px-3 py-8 text-center font-mono text-[13px] text-fg-subtle">
                No loads yet. Hit “Add load” to start tracking.
              </div>
            ) : (
              rows.map((r, i) => (
                <div
                  key={r.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/admin/dispatch/loads/${r.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      router.push(`/admin/dispatch/loads/${r.id}`);
                  }}
                  className={
                    "grid cursor-pointer items-center gap-2 px-3 py-2 text-[12.5px] transition-colors hover:bg-elevated " +
                    (i === rows.length - 1 ? "" : "border-b border-line")
                  }
                  style={{ gridTemplateColumns: GRID }}
                >
                  <span>
                    <span
                      className={
                        "inline-block rounded-sm px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] " +
                        (STATUS_PILL[r.status] ?? "bg-elevated text-fg-subtle")
                      }
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </span>
                  <span className="truncate font-mono text-fg-muted">
                    {r.loadNumber}
                  </span>
                  <span className="truncate font-semibold text-fg">
                    {r.broker}
                  </span>
                  <span className="truncate text-fg">
                    {r.origin} <span className="text-fg-subtle">→</span>{" "}
                    {r.destination}
                  </span>
                  <span className="text-fg-muted">{r.pickup}</span>
                  <span className="text-fg-muted">{r.delivery}</span>
                  <span className="truncate text-blue-700">{r.trip}</span>
                  <span className="text-right font-bold tabular-nums text-green-700">
                    {usd(r.rate)}
                  </span>
                  <span className="text-right tabular-nums text-fg-muted">
                    {r.loadedMiles != null
                      ? r.loadedMiles.toLocaleString()
                      : "—"}
                  </span>
                  <span className="text-right tabular-nums text-red-600">
                    {r.dhMiles > 0 ? r.dhMiles.toLocaleString() : "—"}
                  </span>
                  <span className="text-right font-bold tabular-nums text-green-700">
                    {usd(r.net)}
                  </span>
                  <span className="flex justify-end">
                    {r.paymentStatus === "paid" ? (
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-green-700">
                        Paid
                      </span>
                    ) : null}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Cards (mobile) */}
        <div className="space-y-2 md:hidden">
          {rows.length === 0 ? (
            <div className="rounded-md border border-line bg-card px-3 py-8 text-center font-mono text-[13px] text-fg-subtle">
              No loads yet. Hit “Add load” to start tracking.
            </div>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/admin/dispatch/loads/${r.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    router.push(`/admin/dispatch/loads/${r.id}`);
                }}
                className="rounded-md border border-line bg-card p-3 shadow-sm transition-colors active:bg-elevated"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={
                      "inline-block rounded-sm px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] " +
                      (STATUS_PILL[r.status] ?? "bg-elevated text-fg-subtle")
                    }
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  <span className="font-mono text-[15px] font-bold tabular-nums text-green-700">
                    {usd(r.rate)}
                  </span>
                </div>

                <div className="mt-1.5 truncate text-[14px] font-semibold text-fg">
                  {r.broker}
                </div>
                <div className="truncate text-[12.5px] text-fg-muted">
                  {r.origin} <span className="text-fg-subtle">→</span>{" "}
                  {r.destination}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-subtle">
                  <span>#{r.loadNumber}</span>
                  <span>
                    {r.pickup} <span className="text-fg-subtle">→</span>{" "}
                    {r.delivery}
                  </span>
                  {r.loadedMiles != null ? (
                    <span>{r.loadedMiles.toLocaleString()} mi</span>
                  ) : null}
                  <span className="font-bold text-green-700">
                    Net {usd(r.net)}
                  </span>
                </div>

                {r.paymentStatus === "paid" ? (
                  <div className="mt-2 text-right font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-green-700">
                    Paid
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      {addOpen ? (
        <AddLoadModal
          onClose={() => setAddOpen(false)}
          brokerNames={data.brokerNames}
          activeTrips={data.activeTrips}
        />
      ) : null}
    </div>
  );
}

function ProfitGoalBar({ net }: { net: number }) {
  const GOAL = 10000;
  const pct = Math.max(0, Math.min(100, (net / GOAL) * 100));
  const reached = net >= GOAL;
  // Inner slash marks at each $2,500 (25/50/75%).
  const marks = [25, 50, 75];
  const labels = ["$0", "$2.5k", "$5k", "$7.5k", "$10k"];
  return (
    <div className="mb-2 rounded-md border border-line bg-card px-3.5 py-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-600">
          Net profit goal
        </span>
        <span className="font-mono text-[12px] tabular-nums">
          <span className="font-bold text-green-700">{usd(net)}</span>
          <span className="text-fg-subtle"> / {usd(GOAL)}</span>
          {reached ? (
            <span className="ml-2 rounded bg-green-100 px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-[0.06em] text-green-700">
              Goal!
            </span>
          ) : null}
        </span>
      </div>
      <div className="relative mt-2 h-3.5 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full bg-green-600 transition-all"
          style={{ width: `${pct}%` }}
        />
        {marks.map((m) => (
          <span
            key={m}
            className="absolute top-0 h-full w-[2px] bg-card"
            style={{ left: `${m}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] tabular-nums text-fg-subtle">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "count" | "green" | "red" | "muted";
  hint?: string;
}) {
  const color =
    tone === "green"
      ? "text-green-700"
      : tone === "red"
        ? "text-red-700"
        : tone === "muted"
          ? "text-fg-subtle"
          : "text-blue-700";
  return (
    <div className="min-w-0 bg-card px-3 py-2.5">
      <div className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-600">
        {label}
      </div>
      <div className={"mt-1 truncate text-[18px] font-bold tabular-nums leading-none sm:text-[20px] " + color}>
        {value}
      </div>
      {hint ? (
        <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-amber-700">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function DhCell({
  label,
  value,
  tone,
  muted = false,
}: {
  label: string;
  value: string;
  tone?: "red";
  muted?: boolean;
}) {
  return (
    <div
      className={
        "min-w-0 px-3 py-2 " + (muted ? "bg-elevated" : "bg-card")
      }
    >
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </div>
      {value ? (
        <div
          className={
            "mt-0.5 text-[14px] font-bold tabular-nums " +
            (tone === "red" ? "text-red-700" : "text-fg")
          }
        >
          {value}
        </div>
      ) : null}
    </div>
  );
}

function AddLoadModal({
  onClose,
  brokerNames,
  activeTrips,
}: {
  onClose: () => void;
  brokerNames: ReadonlyArray<string>;
  activeTrips: ReadonlyArray<string>;
}) {
  const [broker, setBroker] = useState("");
  const [brokerMc, setBrokerMc] = useState("");
  const [brokerDot, setBrokerDot] = useState("");
  const [lookupKind, setLookupKind] = useState<"mc" | "dot">("mc");
  const [lookupVal, setLookupVal] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<
    { tone: "ok" | "err"; text: string } | null
  >(null);
  const [originZip, setOriginZip] = useState("");
  const [destZip, setDestZip] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [destCity, setDestCity] = useState("");
  const [miles, setMiles] = useState("");
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  // Default the trip to the sole active trip, if there's exactly one.
  const [trip, setTrip] = useState(
    activeTrips.length === 1 ? activeTrips[0] : "",
  );
  const reqId = useRef(0);

  const five = (z: string) => /^\d{5}$/.test(z.trim());

  // Resolve city/state for whichever ZIP changed, and lane miles once both
  // are valid 5-digit ZIPs. Server-side dataset via the geo API.
  useEffect(() => {
    const o = originZip.trim();
    const d = destZip.trim();
    const id = ++reqId.current;

    if (five(o) && five(d)) {
      setGeoMsg("Calculating lane…");
      fetch(`/api/admin/dispatch/geo?o=${o}&d=${d}`)
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (id !== reqId.current) return;
          if (!ok) {
            setGeoMsg(j?.error ?? "Could not resolve ZIPs.");
            return;
          }
          setOriginCity(`${j.origin.city}, ${j.origin.state}`);
          setDestCity(`${j.dest.city}, ${j.dest.state}`);
          setMiles(String(j.miles));
          setGeoMsg(null);
        })
        .catch(() => id === reqId.current && setGeoMsg("Network error."));
      return;
    }

    // Single-ZIP resolves for live city feedback.
    if (five(o)) {
      fetch(`/api/admin/dispatch/geo?zip=${o}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (id === reqId.current && j) setOriginCity(`${j.city}, ${j.state}`);
        })
        .catch(() => {});
    } else {
      setOriginCity("");
    }
    if (five(d)) {
      fetch(`/api/admin/dispatch/geo?zip=${d}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (id === reqId.current && j) setDestCity(`${j.city}, ${j.state}`);
        })
        .catch(() => {});
    } else {
      setDestCity("");
    }
    setMiles("");
    setGeoMsg(null);
  }, [originZip, destZip]);

  async function runBrokerLookup() {
    const v = lookupVal.trim();
    if (!v) return;
    setLookupLoading(true);
    setLookupMsg(null);
    try {
      const res = await fetch(
        `/api/admin/fmcsa?${lookupKind}=${encodeURIComponent(v)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setLookupMsg({ tone: "err", text: data?.error ?? "No match found." });
        return;
      }
      setBroker(data.name ?? data.dbaName ?? "");
      setBrokerMc(data.mcNumber ?? (lookupKind === "mc" ? v : ""));
      setBrokerDot(data.dotNumber ?? (lookupKind === "dot" ? v : ""));
      const op =
        data.allowedToOperate === false ? " — NOT allowed to operate" : "";
      setLookupMsg({
        tone: data.allowedToOperate === false ? "err" : "ok",
        text: `${data.name ?? data.dbaName ?? "Found"}${op}`,
      });
    } catch {
      setLookupMsg({ tone: "err", text: "Network error reaching FMCSA." });
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add load"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-3 sm:p-8"
      onClick={onClose}
    >
      <form
        action={createLoad}
        onClick={(e) => e.stopPropagation()}
        className="my-2 w-full max-w-2xl overflow-hidden rounded-md border border-line-strong bg-card shadow-2xl sm:my-6"
      >
        <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
          <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-bar-fg">
            Add load
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-white/25 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-bar-fg transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
        <datalist id="broker-options">
          {brokerNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <datalist id="trip-options">
          {activeTrips.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
          {/* Broker + FMCSA MC/DOT lookup */}
          <div className="sm:col-span-2">
            <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Broker / customer<span className="ml-0.5 text-red-600">*</span>
            </label>
            <input
              name="broker_name"
              required
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              list="broker-options"
              placeholder="Type to search or add new…"
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
            />
            <input type="hidden" name="broker_mc" value={brokerMc} />
            <input type="hidden" name="broker_dot" value={brokerDot} />

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-subtle">
                Have MC/DOT?
              </span>
              <div className="inline-flex overflow-hidden rounded border border-line-strong">
                {(["mc", "dot"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setLookupKind(k)}
                    className={
                      "px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] transition-colors " +
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
                value={lookupVal}
                onChange={(e) => setLookupVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runBrokerLookup();
                  }
                }}
                placeholder={lookupKind === "mc" ? "MC #" : "DOT #"}
                inputMode="numeric"
                autoComplete="off"
                className="w-28 rounded border border-line-strong bg-card px-2 py-1 text-[12px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void runBrokerLookup()}
                disabled={lookupLoading || !lookupVal.trim()}
                className="rounded border border-line-strong bg-card px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-fg transition-colors hover:bg-elevated disabled:opacity-40"
              >
                {lookupLoading ? "…" : "Look up"}
              </button>
              {lookupMsg ? (
                <span
                  className={
                    "truncate text-[11px] " +
                    (lookupMsg.tone === "err"
                      ? "text-red-700"
                      : "text-green-700")
                  }
                >
                  {lookupMsg.text}
                </span>
              ) : brokerMc || brokerDot ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
                  MC {brokerMc || "—"} · DOT {brokerDot || "—"}
                </span>
              ) : null}
            </div>
          </div>

          <LField label="Load #" name="load_number" />

          {/* Origin ZIP → city */}
          <div>
            <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Origin ZIP<span className="ml-0.5 text-red-600">*</span>
            </label>
            <input
              name="origin_zip"
              required
              value={originZip}
              onChange={(e) => setOriginZip(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 30303"
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
            />
            <p className="mt-1 truncate text-[11px] text-fg-muted">
              {originCity || "City, ST"}
            </p>
          </div>

          {/* Destination ZIP → city */}
          <div>
            <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Destination ZIP<span className="ml-0.5 text-red-600">*</span>
            </label>
            <input
              name="dest_zip"
              required
              value={destZip}
              onChange={(e) => setDestZip(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 33101"
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
            />
            <p className="mt-1 truncate text-[11px] text-fg-muted">
              {destCity || "City, ST"}
            </p>
          </div>

          <LField label="Pickup date" name="pickup_date" type="date" />
          <LField label="Delivery date" name="delivery_date" type="date" />

          {/* Trip — active trips suggested, defaults to the only one */}
          <div>
            <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Trip
            </label>
            <input
              name="trip_name"
              value={trip}
              onChange={(e) => setTrip(e.target.value)}
              list="trip-options"
              placeholder={
                activeTrips.length
                  ? "Pick an active trip or start new…"
                  : "Start a new trip…"
              }
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
            />
          </div>

          <LField label="Rate ($)" name="rate" type="number" required />

          {/* Loaded miles — auto from ZIPs, editable override */}
          <div>
            <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Loaded miles
            </label>
            <input
              name="loaded_miles"
              type="number"
              value={miles}
              onChange={(e) => setMiles(e.target.value)}
              placeholder="Auto from ZIPs"
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
            />
            <p className="mt-1 truncate text-[11px] text-fg-muted">
              {geoMsg ?? (miles ? "Auto-calculated · editable" : "")}
            </p>
          </div>

          <div>
            <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Status
            </label>
            <select
              name="status"
              defaultValue="pending"
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
            >
              <option value="pending">Pending</option>
              <option value="assigned">Rolling to pickup</option>
              <option value="loaded">Loaded</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line bg-elevated px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-subtle">
            Equipment: Hotshot
          </span>
          <button
            type="submit"
            className="rounded-md border border-red-700 bg-red-600 px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700"
          >
            Save load
          </button>
        </div>
      </form>
    </div>
  );
}

function LField({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
  list,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  list?: string;
}) {
  return (
    <div>
      <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        list={list}
        autoComplete="off"
        step={type === "number" ? "any" : undefined}
        className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
      />
    </div>
  );
}

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

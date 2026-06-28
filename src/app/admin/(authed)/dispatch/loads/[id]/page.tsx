import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { CollapsibleWorkspaceSection } from "../../../quotes/[id]/CollapsibleWorkspaceSection";
import { OdometerStatusCard } from "./OdometerStatusCard";
import { LoadPnlCard } from "./LoadPnlCard";
import { FinancialsPanel } from "./FinancialsPanel";
import { CancelLoadButton } from "./CancelLoadButton";
import { DeleteLoadButton } from "./DeleteLoadButton";
import { DocumentsCard } from "./DocumentsCard";
import {
  loadDiesel,
  dieselCost,
  loadNet,
  FUEL_DEFAULTS,
  type FuelSettings,
} from "@/lib/dispatch/fuel";

export const metadata: Metadata = {
  title: "Load",
  robots: { index: false, follow: false },
};

type Load = {
  id: string;
  load_number: string | null;
  broker_name: string | null;
  broker_id: string | null;
  trip_id: string | null;
  trip_name: string | null;
  equipment: string | null;
  origin: string | null;
  destination: string | null;
  origin_zip: string | null;
  dest_zip: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
  rate: number | string | null;
  tonu_amount: number | string | null;
  fuel_cost: number | string | null;
  factoring_fee: number | string | null;
  misc_cost: number | string | null;
  loaded_miles: number | null;
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
  status: string;
  payment_status: string;
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  assigned: "Rolling",
  loaded: "Loaded",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default async function LoadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createServiceRoleClient();
  const { data: load } = await sb
    .from("loads")
    .select(
      "id, load_number, broker_name, broker_id, trip_id, trip_name, equipment, origin, destination, origin_zip, dest_zip, pickup_date, delivery_date, rate, tonu_amount, fuel_cost, factoring_fee, misc_cost, loaded_miles, odo_assigned, odo_loaded, odo_delivered, status, payment_status",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<Load>();

  if (!load) notFound();

  const { data: fuelRow } = await sb
    .from("dispatch_settings")
    .select("mpg, diesel_price_per_gallon, factoring_pct")
    .eq("id", true)
    .maybeSingle<{
      mpg: number | string;
      diesel_price_per_gallon: number | string;
      factoring_pct: number | string;
    }>();
  const fuel: FuelSettings = {
    mpg: num(fuelRow?.mpg ?? null) || FUEL_DEFAULTS.mpg,
    ppg: num(fuelRow?.diesel_price_per_gallon ?? null) || FUEL_DEFAULTS.ppg,
    factoringPct: fuelRow?.factoring_pct != null ? num(fuelRow.factoring_pct) : FUEL_DEFAULTS.factoringPct,
  };

  const [{ data: expenseRows }, { data: catRows }] = await Promise.all([
    sb
      .from("load_expenses")
      .select("id, category, amount, note")
      .eq("load_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .returns<{ id: string; category: string; amount: number | string; note: string | null }[]>(),
    sb
      .from("load_expenses")
      .select("category")
      .is("deleted_at", null)
      .order("category", { ascending: true })
      .returns<{ category: string }[]>(),
  ]);
  const expenses = (expenseRows ?? []).map((e) => ({
    id: e.id,
    category: e.category,
    amount: num(e.amount),
    note: e.note,
  }));
  const expenseCategories = Array.from(
    new Set((catRows ?? []).map((c) => c.category?.trim()).filter((c): c is string => !!c)),
  );

  const { data: docRows } = await sb
    .from("load_documents")
    .select(
      "id, kind, original_filename, storage_path, thumb_path, size_bytes, mime_type",
    )
    .eq("load_id", id)
    .order("created_at", { ascending: false })
    .returns<{
      id: string;
      kind: string;
      original_filename: string;
      storage_path: string;
      thumb_path: string | null;
      size_bytes: number | null;
      mime_type: string | null;
    }[]>();
  // Sign originals (tap-to-view) and thumbnails (grid) in ONE storage request.
  const docs = docRows ?? [];
  const signedByPath = new Map<string, string>();
  if (docs.length > 0) {
    const paths = [
      ...docs.map((d) => d.storage_path),
      ...docs.map((d) => d.thumb_path).filter((p): p is string => !!p),
    ];
    const { data: signedList } = await sb.storage
      .from("load-documents")
      .createSignedUrls(paths, 3600);
    for (const s of signedList ?? []) {
      if (s.path && s.signedUrl && !s.error) {
        signedByPath.set(s.path, s.signedUrl);
      }
    }
  }
  const loadDocs = docs.map((d) => {
    const url = signedByPath.get(d.storage_path) ?? null;
    // Grid uses the thumb when present, falling back to the full-size original.
    const thumbUrl =
      (d.thumb_path ? signedByPath.get(d.thumb_path) : null) ?? url;
    return {
      id: d.id,
      kind: d.kind,
      name: d.original_filename,
      url,
      thumbUrl,
      sizeBytes: d.size_bytes,
      mime: d.mime_type,
    };
  });

  const [{ data: broker }, { data: trip }] = await Promise.all([
    load.broker_id
      ? sb
          .from("brokers")
          .select("id, name, mc_number, dot_number, phone, email, factoring")
          .eq("id", load.broker_id)
          .maybeSingle<{
            id: string;
            name: string | null;
            mc_number: string | null;
            dot_number: string | null;
            phone: string | null;
            email: string | null;
            factoring: boolean | null;
          }>()
      : Promise.resolve({ data: null }),
    load.trip_id
      ? sb
          .from("trips")
          .select("id, name, status")
          .eq("id", load.trip_id)
          .maybeSingle<{ id: string; name: string | null; status: string }>()
      : Promise.resolve({ data: null }),
  ]);

  const isCancelled = load.status === "cancelled";
  // A cancelled load earns nothing — except a TONU fee, which becomes its
  // revenue. Active loads earn their rate.
  const rate = isCancelled ? num(load.tonu_amount) : num(load.rate);
  const mileage = loadDiesel(
    {
      odoAssigned: load.odo_assigned,
      odoLoaded: load.odo_loaded,
      odoDelivered: load.odo_delivered,
      estimate: load.loaded_miles,
    },
    fuel,
  );
  const diesel = mileage.diesel;
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  // Factoring is applied ONLY when this load's broker is a factoring broker.
  const brokerFactoring = broker?.factoring === true;
  const { factoring, net } = loadNet(
    { rate, diesel, expensesTotal },
    fuel,
    brokerFactoring,
  );
  const miles = mileage.loaded;
  const ratePerMile = miles && miles > 0 ? rate / miles : null;
  const netPerMile = miles && miles > 0 ? net / miles : null;
  const lastReading = Math.max(
    load.odo_assigned ?? 0,
    load.odo_loaded ?? 0,
    load.odo_delivered ?? 0,
  );

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        {/* Command bar — back + actions, clean lane, financial tiles */}
        <div className="overflow-hidden rounded-md bg-bar shadow-md">
          {/* Tier 1: back button + cancel / delete actions */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-2.5">
            <Link
              href="/admin/dispatch/loads"
              prefetch={false}
              aria-label="Back to all loads"
              className="inline-flex items-center gap-1 rounded-md border border-red-700 bg-red-600 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 12H5M11 18l-6-6 6-6" />
              </svg>
              Loads
            </Link>
            <div className="flex items-center gap-2">
              {!isCancelled ? <CancelLoadButton loadId={load.id} /> : null}
              <DeleteLoadButton loadId={load.id} />
            </div>
          </div>

          {/* Tier 2: clean origin → destination with ZIPs underneath each city */}
          <div className="flex items-start gap-3 border-t border-white/10 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-bar-fg">
                {load.origin?.trim() || "—"}
              </div>
              {load.origin_zip ? (
                <div className="font-mono text-[11px] tabular-nums text-bar-fg/45">
                  {load.origin_zip}
                </div>
              ) : null}
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0 text-bar-fg/45">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
            <div className="min-w-0 flex-1 text-right">
              <div className="truncate text-[15px] font-semibold text-bar-fg">
                {load.destination?.trim() || "—"}
              </div>
              {load.dest_zip ? (
                <div className="font-mono text-[11px] tabular-nums text-bar-fg/45">
                  {load.dest_zip}
                </div>
              ) : null}
            </div>
          </div>

          {/* Tier 3: overview KPIs */}
          <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4">
            <OverviewStat
              label="Revenue"
              value={usd(rate)}
              tone="green"
              sub={ratePerMile != null ? `$${ratePerMile.toFixed(2)}/mi` : undefined}
            />
            <OverviewStat
              label="Net"
              value={usd(net)}
              tone="green"
              border
              sub={netPerMile != null ? `$${netPerMile.toFixed(2)}/mi` : undefined}
            />
            <OverviewStat
              label="Total mi"
              value={(
                (mileage.deadhead ?? 0) + (mileage.loaded ?? 0)
              ).toLocaleString()}
              border
              sub={`${usd(diesel)} fuel`}
            />
            <OverviewStat
              label="Deadhead"
              value={mileage.deadhead != null ? `${mileage.deadhead.toLocaleString()} mi` : "—"}
              tone="amber"
              border
              sub={
                mileage.deadhead != null
                  ? `${usd(dieselCost(mileage.deadhead, fuel))} fuel`
                  : undefined
              }
            />
          </div>
        </div>

        {/* Panels */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-3">
            <CollapsibleWorkspaceSection title="Load details" defaultOpen>
              <div className="space-y-3 p-3">
                <InnerCard title="Load">
                  <Spec
                    label="Load #"
                    value={
                      load.load_number?.trim()
                        ? `#${load.load_number.trim()}`
                        : null
                    }
                  />
                  <Spec label="Broker" value={load.broker_name} />
                  <Spec
                    label="Mileage"
                    value={miles != null ? `${miles.toLocaleString()} mi` : null}
                  />
                </InnerCard>

                <InnerCard title="Schedule">
                  <Spec label="Pickup" value={dateLabel(load.pickup_date)} />
                  <Spec label="Delivery" value={dateLabel(load.delivery_date)} />
                  <Spec
                    label="Origin"
                    value={
                      load.origin
                        ? `${load.origin}${load.origin_zip ? " " + load.origin_zip : ""}`
                        : null
                    }
                  />
                  <Spec
                    label="Dest"
                    value={
                      load.destination
                        ? `${load.destination}${load.dest_zip ? " " + load.dest_zip : ""}`
                        : null
                    }
                  />
                </InnerCard>
              </div>
            </CollapsibleWorkspaceSection>

            <OdometerStatusCard
              loadId={load.id}
              status={load.status}
              statusLabel={STATUS_LABEL[load.status] ?? load.status}
              lastReading={lastReading > 0 ? lastReading : null}
              odoAssigned={load.odo_assigned}
              odoLoaded={load.odo_loaded}
              odoDelivered={load.odo_delivered}
            />
          </div>

          <div className="space-y-3">
            <FinancialsPanel loadId={load.id} categories={expenseCategories}>
              <LoadPnlCard
                loadId={load.id}
                loadedMiles={mileage.loaded}
                loadedDiesel={mileage.loaded != null ? dieselCost(mileage.loaded, fuel) : 0}
                deadheadMiles={mileage.deadhead}
                deadheadDiesel={mileage.deadhead != null ? dieselCost(mileage.deadhead, fuel) : 0}
                totalDiesel={diesel}
                factoringPct={fuel.factoringPct}
                factoring={factoring}
                brokerFactoring={brokerFactoring}
                expenses={expenses}
                expensesTotal={expensesTotal}
              />
            </FinancialsPanel>
          </div>

          <div className="space-y-3">
            <CollapsibleWorkspaceSection title="Broker & trip" defaultOpen>
              <div className="space-y-3 p-3">
                <InnerCard title="Broker">
                  <Spec label="Name" value={load.broker_name} />
                  <Spec label="MC" value={broker?.mc_number ?? null} />
                  <Spec label="DOT" value={broker?.dot_number ?? null} />
                  <Spec label="Phone" value={broker?.phone ?? null} />
                  {load.broker_id ? (
                    <Link
                      href={`/admin/dispatch/brokers/${load.broker_id}`}
                      prefetch={false}
                      className="mt-2 inline-flex items-center rounded-md border border-blue-700 bg-blue-600 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-blue-700"
                    >
                      Open broker →
                    </Link>
                  ) : null}
                </InnerCard>

                {load.trip_id ? (
                  <InnerCard title="Trip">
                    <Spec label="Name" value={trip?.name ?? load.trip_name} />
                    <Spec
                      label="Status"
                      value={trip?.status === "closed" ? "Closed" : "Active"}
                      tone={trip?.status === "closed" ? undefined : "green"}
                    />
                    <Link
                      href={`/admin/dispatch/trips/${load.trip_id}`}
                      prefetch={false}
                      className="mt-2 inline-flex items-center rounded-md border border-blue-700 bg-blue-600 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-blue-700"
                    >
                      Open trip →
                    </Link>
                  </InnerCard>
                ) : null}
              </div>
            </CollapsibleWorkspaceSection>

            <CollapsibleWorkspaceSection title="Documents" defaultOpen>
              <div className="p-3">
                <DocumentsCard loadId={load.id} docs={loadDocs} />
              </div>
            </CollapsibleWorkspaceSection>
          </div>
        </div>
      </div>
    </div>
  );
}

function InnerCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-line bg-card">
      <header className="border-b border-line bg-card/70 px-3 py-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-fg-muted">
          {title}
        </p>
      </header>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

function Spec({
  label,
  value,
  money = false,
  tone,
}: {
  label: string;
  value: string | null;
  money?: boolean;
  tone?: "green" | "red";
}) {
  const text = (value ?? "").trim();
  const color =
    tone === "green"
      ? "text-green-700"
      : tone === "red"
        ? "text-red-700"
        : money
          ? "text-green-700"
          : text
            ? "text-fg"
            : "text-fg-subtle";
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-baseline gap-2 py-1">
      <dt className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </dt>
      <dd className={"text-[12.5px] tabular-nums " + color + (money ? " font-bold" : " font-medium")}>
        {text || "—"}
      </dd>
    </div>
  );
}

function OverviewStat({
  label,
  value,
  tone,
  border = false,
  sub,
}: {
  label: string;
  value: string;
  tone?: "green" | "amber";
  border?: boolean;
  sub?: string;
}) {
  const color =
    tone === "green"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : "text-bar-fg";
  return (
    <div className={"px-3.5 py-2 text-center " + (border ? "border-l border-white/10" : "")}>
      <div className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-bar-fg/45">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline justify-center gap-1.5">
        <span className={"font-mono text-[16px] font-bold tabular-nums " + color}>
          {value}
        </span>
        {sub ? (
          <span className="rounded bg-white/10 px-1.5 py-[1px] font-mono text-[11px] font-semibold tabular-nums text-bar-fg/90">
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}


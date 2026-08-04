/**
 * The demo dataset (v2-architecture.md §10) — a curated, in-memory set of
 * fake loads/trips/expenses/brokers. NEVER touches Supabase. Generated
 * RELATIVE TO "now" so the demo is evergreen: whenever it's shown, the
 * current month looks like a healthy month in progress and the trailing
 * history looks like a real operating history, not a frozen snapshot.
 *
 * `demo-data-source.ts` runs this raw data through the exact same
 * `lib/domain/money.ts` helpers the live data source uses, so demo numbers
 * agree across screens internally exactly like real numbers do — a demo
 * load's net on Today equals what it would be anywhere else it's shown.
 */

export type DemoBroker = {
  id: string;
  name: string;
  status: string;
  mcNumber: string | null;
  dotNumber: string | null;
  phone: string | null;
  email: string;
  factoring: boolean;
};

export type DemoLoad = {
  id: string;
  loadNumber: string;
  brokerId: string;
  tripId: string | null;
  origin: string;
  destination: string;
  pickupDate: string;
  deliveryDate: string | null;
  rate: number;
  tonuAmount: number | null;
  loadedMilesEstimate: number;
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
  status: "pending" | "assigned" | "loaded" | "delivered" | "tonu";
  paymentStatus: "unpaid" | "paid";
  paidAt: string | null;
  createdAt: string;
};

export type DemoTrip = {
  id: string;
  name: string;
  status: "active" | "closed";
  notes: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
  startedAt: string | null;
  endedAt: string | null;
  closedAt: string | null;
  createdAt: string;
};

export type DemoExpense = {
  id: string;
  loadId: string;
  category: string;
  amount: number;
  note: string | null;
  createdAt: string;
};

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(now: Date, n: number): Date {
  return new Date(now.getTime() - n * 86_400_000);
}

export const DEMO_BROKERS: DemoBroker[] = [
  { id: "demo-broker-werner", name: "Werner Enterprises (Demo)", status: "active", mcNumber: "MC-100001", dotNumber: "DOT-200001", phone: "555-010-1000", email: "dispatch@werner.example.com", factoring: true },
  { id: "demo-broker-chrobinson", name: "CH Robinson (Demo)", status: "active", mcNumber: "MC-100002", dotNumber: "DOT-200002", phone: "555-010-2000", email: "loads@chrobinson.example.com", factoring: false },
  { id: "demo-broker-landstar", name: "Landstar (Demo)", status: "active", mcNumber: "MC-100003", dotNumber: "DOT-200003", phone: "555-010-3000", email: "book@landstar.example.com", factoring: true },
];

export function buildDemoData(now: Date = new Date()): { brokers: DemoBroker[]; trips: DemoTrip[]; loads: DemoLoad[]; expenses: DemoExpense[] } {
  const trips: DemoTrip[] = [
    {
      id: "demo-trip-1",
      name: "TX-TN run (Demo)",
      status: "active",
      notes: null,
      startOdometer: 83_900,
      endOdometer: null,
      startedAt: ymd(daysAgo(now, 3)),
      endedAt: null,
      closedAt: null,
      createdAt: ymd(daysAgo(now, 3)),
    },
  ];

  const loads: DemoLoad[] = [
    // Active trip loads.
    {
      id: "demo-load-active-1",
      loadNumber: "D-4821",
      brokerId: "demo-broker-werner",
      tripId: "demo-trip-1",
      origin: "Dallas, TX",
      destination: "Memphis, TN",
      pickupDate: ymd(daysAgo(now, 2)),
      deliveryDate: ymd(daysAgo(now, 1)),
      rate: 1850,
      tonuAmount: null,
      loadedMilesEstimate: 450,
      odoAssigned: 83_900,
      odoLoaded: 83_950,
      odoDelivered: 84_450,
      status: "delivered",
      paymentStatus: "unpaid",
      paidAt: null,
      createdAt: ymd(daysAgo(now, 3)),
    },
    {
      id: "demo-load-active-2",
      loadNumber: "D-4822",
      brokerId: "demo-broker-chrobinson",
      tripId: "demo-trip-1",
      origin: "Memphis, TN",
      destination: "Nashville, TN",
      pickupDate: ymd(daysAgo(now, 0)),
      deliveryDate: null,
      rate: 1400,
      tonuAmount: null,
      loadedMilesEstimate: 210,
      odoAssigned: 84_500,
      odoLoaded: 84_610,
      odoDelivered: null,
      status: "loaded",
      paymentStatus: "unpaid",
      paidAt: null,
      createdAt: ymd(daysAgo(now, 1)),
    },
    // Standalone active load, not yet picked up.
    {
      id: "demo-load-pending-1",
      loadNumber: "D-4823",
      brokerId: "demo-broker-landstar",
      tripId: null,
      origin: "Nashville, TN",
      destination: "Louisville, KY",
      pickupDate: ymd(daysAgo(now, -2)), // 2 days from now
      deliveryDate: null,
      rate: 1250,
      tonuAmount: null,
      loadedMilesEstimate: 175,
      odoAssigned: null,
      odoLoaded: null,
      odoDelivered: null,
      status: "assigned",
      paymentStatus: "unpaid",
      paidAt: null,
      createdAt: ymd(daysAgo(now, 0)),
    },
    // This-period, closed-out, paid loads (fill out the KPI strip).
    {
      id: "demo-load-paid-1",
      loadNumber: "D-4810",
      brokerId: "demo-broker-werner",
      tripId: null,
      origin: "Houston, TX",
      destination: "San Antonio, TX",
      pickupDate: ymd(daysAgo(now, 8)),
      deliveryDate: ymd(daysAgo(now, 7)),
      rate: 980,
      tonuAmount: null,
      loadedMilesEstimate: 200,
      odoAssigned: 82_900,
      odoLoaded: 82_950,
      odoDelivered: 83_150,
      status: "delivered",
      paymentStatus: "paid",
      paidAt: ymd(daysAgo(now, 2)),
      createdAt: ymd(daysAgo(now, 9)),
    },
    {
      id: "demo-load-paid-2",
      loadNumber: "D-4805",
      brokerId: "demo-broker-landstar",
      tripId: null,
      origin: "Austin, TX",
      destination: "Waco, TX",
      pickupDate: ymd(daysAgo(now, 12)),
      deliveryDate: ymd(daysAgo(now, 11)),
      rate: 720,
      tonuAmount: null,
      loadedMilesEstimate: 100,
      odoAssigned: 82_700,
      odoLoaded: 82_720,
      odoDelivered: 82_820,
      status: "delivered",
      paymentStatus: "paid",
      paidAt: ymd(daysAgo(now, 4)),
      createdAt: ymd(daysAgo(now, 13)),
    },
    // A TONU'd load this period — exercises the one TONU rule end to end.
    {
      id: "demo-load-tonu-1",
      loadNumber: "D-4790",
      brokerId: "demo-broker-werner",
      tripId: null,
      origin: "Dallas, TX",
      destination: "Tulsa, OK",
      pickupDate: ymd(daysAgo(now, 15)),
      deliveryDate: ymd(daysAgo(now, 15)),
      rate: 900,
      tonuAmount: 150,
      loadedMilesEstimate: 250,
      odoAssigned: null,
      odoLoaded: null,
      odoDelivered: null,
      status: "tonu",
      paymentStatus: "paid",
      paidAt: ymd(daysAgo(now, 10)),
      createdAt: ymd(daysAgo(now, 16)),
    },
    // A genuinely overdue receivable — delivered, unpaid, well past the
    // 40-day threshold, from a prior month — drives the attention list.
    {
      id: "demo-load-overdue-1",
      loadNumber: "D-4700",
      brokerId: "demo-broker-chrobinson",
      tripId: null,
      origin: "Fort Worth, TX",
      destination: "Little Rock, AR",
      pickupDate: ymd(daysAgo(now, 55)),
      deliveryDate: ymd(daysAgo(now, 54)),
      rate: 1650,
      tonuAmount: null,
      loadedMilesEstimate: 330,
      odoAssigned: 81_900,
      odoLoaded: 81_950,
      odoDelivered: 82_280,
      status: "delivered",
      paymentStatus: "unpaid",
      paidAt: null,
      createdAt: ymd(daysAgo(now, 56)),
    },
    // Prior month, for a trailing-month comparison later if a screen wants it.
    {
      id: "demo-load-prior-1",
      loadNumber: "D-4650",
      brokerId: "demo-broker-landstar",
      tripId: null,
      origin: "San Antonio, TX",
      destination: "Corpus Christi, TX",
      pickupDate: ymd(daysAgo(now, 40)),
      deliveryDate: ymd(daysAgo(now, 39)),
      rate: 810,
      tonuAmount: null,
      loadedMilesEstimate: 145,
      odoAssigned: 81_500,
      odoLoaded: 81_520,
      odoDelivered: 81_665,
      status: "delivered",
      paymentStatus: "paid",
      paidAt: ymd(daysAgo(now, 35)),
      createdAt: ymd(daysAgo(now, 41)),
    },
  ];

  const expenses: DemoExpense[] = [
    { id: "demo-exp-1", loadId: "demo-load-active-1", category: "Lumper", amount: 75, note: null, createdAt: ymd(daysAgo(now, 1)) },
    { id: "demo-exp-2", loadId: "demo-load-paid-1", category: "Scale", amount: 15, note: null, createdAt: ymd(daysAgo(now, 7)) },
    { id: "demo-exp-3", loadId: "demo-load-overdue-1", category: "Truck wash", amount: 40, note: null, createdAt: ymd(daysAgo(now, 54)) },
  ];

  return { brokers: DEMO_BROKERS, trips, loads, expenses };
}

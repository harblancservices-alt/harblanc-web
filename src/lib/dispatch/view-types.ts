import type { MaintStatus } from "@/lib/dispatch/maintenance";
import type { PerfLoad } from "@/lib/dispatch/performance";
import type { CountdownGoal, NetPace } from "@/lib/dispatch/countdown";
import type { AlertGroup } from "@/lib/dispatch/alerts";
import type { PipelineCard } from "@/lib/dispatch/pipeline";

/**
 * View-data shapes for admin's Dashboard/LoadBoard/Performance/Receivables/
 * Broker pages. Moved out of their page component files (DashboardView.tsx,
 * dispatch/loads/LoadBoardView.tsx, performance/PerformanceView.tsx,
 * dispatch/receivables/ReceivablesView.tsx,
 * dispatch/brokers/[id]/BrokerDetail.tsx,
 * dispatch/brokers/BrokerListSidebar.tsx — all under src/app/admin/**)
 * into this neutral module (pre-deletion code fix — see
 * ADMIN_RETIREMENT_PREDELETION_AUDIT.md's Item A.1).
 *
 * Why this had to move: src/lib/demo/demoData.ts (the admin demo-mode
 * dataset) needs these exact shapes to build its fake data, and
 * demoData.ts is transitively imported by /tms-v2 (via
 * src/lib/dispatch/pipeline.ts's loadPipelineCards()). Every one of these
 * is a pure data shape (primitives, arrays, and already-neutral
 * lib/dispatch/** types) — no JSX, no component logic, no admin-specific
 * behavior — so moving the type declaration doesn't move any UI or
 * business logic, only where the TYPE NAME is declared. The page
 * components import these back from here; nothing about their rendering
 * or behavior changed.
 */

// ─── Dashboard (DashboardView.tsx) ─────────────────────────────────────────

export type MaintWidgetItem = {
  id: string;
  name: string;
  status: MaintStatus;
  milesRemaining: number | null;
  pct: number;
  neverServiced: boolean;
};

export type ActiveLoadItem = {
  id: string;
  broker: string;
  lane: string;
  status: string;
  rateDisplay: string;
  rateConCount: number;
  bolCount: number;
  podCount: number;
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
};

export type DashboardData = {
  expiredQuotes: ReadonlyArray<PipelineCard>;
  activeLoads: ReadonlyArray<ActiveLoadItem>;
  maintenance: ReadonlyArray<MaintWidgetItem>;
  brokerNames: ReadonlyArray<string>;
  activeTrips: ReadonlyArray<string>;
  countdownGoals: ReadonlyArray<CountdownGoal>;
  netPace: NetPace;
  /** Grouped "Needs attention" alerts. Empty groups are filtered by the panel. */
  alertGroups: ReadonlyArray<AlertGroup>;
  currentCash: number;
};

// ─── Load board (dispatch/loads/LoadBoardView.tsx) ─────────────────────────

export type LoadRow = {
  id: string;
  loadNumber: string;
  broker: string;
  /** Broker profile id, when the load is linked to one — drives Call Broker. */
  brokerId: string | null;
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
  /**
   * Calendar month 0–11 the load is attributed to, by pickup date (falling
   * back to delivery_date then created_at) — no shift, matching the Calendar
   * and Performance page exactly. Drives the month dropdown.
   */
  month: number;
  status: string;
  paymentStatus: string;
};

export type LoadBoardData = {
  rows: ReadonlyArray<LoadRow>;
  brokerNames: ReadonlyArray<string>;
  activeTrips: ReadonlyArray<string>;
  /**
   * Current calendar month (0–11) in the business timezone (America/Chicago) —
   * the month the dropdown defaults to when the board opens.
   */
  currentMonth: number;
  /**
   * ALL-TIME accounts receivable: the total RATE owed across every
   * delivered-but-unpaid load, regardless of month. Deliberately NOT
   * month-scoped — the A/R card shows the same number on every month view.
   */
  arTotal: number;
  /** Editable goal-bar targets (Settings → Net profit goals). */
  monthlyGoal: number;
  annualGoal: number;
  /**
   * Calendar context for the performance card's pace figures, resolved on the
   * server in America/Chicago so the client can't compute a different "today"
   * during hydration. `daysLeftInMonth` includes today.
   */
  daysLeftInMonth: number;
  daysInMonth: number;
};

// ─── Performance (performance/PerformanceView.tsx) ─────────────────────────

export type PerformanceData = {
  /** Every non-deleted load, pre-costed and pre-attributed by the server. */
  loads: PerfLoad[];
  monthlyGoal: number;
  /** Owed on delivered-but-unpaid loads (rate) and unpaid TONU loads (fee), all-time. */
  arTotal: number;
  /** "YYYY-MM-DD", business timezone (America/Chicago) — the server's "now". */
  today: string;
};

// ─── Receivables (dispatch/receivables/ReceivablesView.tsx) ────────────────

export type ReceivableItem = {
  id: string;
  loadNumber: string | null;
  brokerId: string | null;
  brokerName: string | null;
  origin: string | null;
  destination: string | null;
  /** Preformatted on the server so the list can't drift by timezone. */
  deliveredLabel: string;
  /** The load's rate — what was invoiced, and (no partial payments exist in
      the schema) equally what is still owed. */
  rate: number;
  /** Whole days from delivery to today, computed server-side against one
      `now` so every card agrees and nothing rehydrates differently. */
  days: number | null;
};

export type PaidItem = {
  id: string;
  loadNumber: string | null;
  brokerName: string | null;
  rate: number;
};

// ─── Broker detail/list (dispatch/brokers/[id]/BrokerDetail.tsx,
//     dispatch/brokers/BrokerListSidebar.tsx) ──────────────────────────────

export type Phone = { number: string; ext: string | null; label: string | null };
export type Email = { address: string; label: string | null };

export type BrokerContact = {
  id: string;
  name: string | null;
  title: string | null;
  phones: Phone[];
  emails: Email[];
  is_backhaul: boolean;
};

export type Lane = {
  lane: string;
  origin: string;
  destination: string;
  count: number;
  gross: number;
  avgRate: number;
  miles: number;
  avgRpm: number;
  lastDate: string;
};

export type BrokerDetailData = {
  broker: {
    id: string;
    name: string;
    status: string;
    mc: string | null;
    dot: string | null;
    type: string | null;
    phone: string | null;
    email: string | null;
    office: string | null;
    timezone: string | null;
    authority: string | null;
    insurance: string | null;
    w9: string | null;
    ten99: string | null;
    notes: string | null;
    factoring: boolean;
  };
  kpis: { loads: number; gross: number; net: number; ar: number };
  summary: {
    totalLoads: number;
    delivered: number;
    active: number;
    cancelled: number;
    gross: number;
    avgRate: number;
    avgMiles: number;
  };
  receivables: { gross: number; collected: number; ar: number; net: number };
  aging: {
    b1: number; c1: number; b2: number; c2: number;
    b3: number; c3: number; b4: number; c4: number;
  };
  contacts: BrokerContact[];
  loads: {
    id: string;
    lane: string;
    equipment: string;
    date: string;
    rate: number;
    net: number;
    status: string;
    paymentStatus: string;
    ageDays: number | null;
    unpaid: boolean;
  }[];
  lanes: Lane[];
};

export type BrokerListItem = {
  id: string;
  name: string;
  status: string;
  mc: string | null;
  loads: number;
  gross: number;
};

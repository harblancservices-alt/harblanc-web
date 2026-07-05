import type { Category, Freshness, MaintStatus } from "@/lib/dispatch/repair-log";

/** A signed receipt (photo/PDF) on an entry. */
export type ReceiptView = {
  id: string;
  name: string;
  url: string | null;
  isImage: boolean;
};

/** Minimal entry shape for pickers (attach-related) and list rows. */
export type EntryLite = {
  id: string;
  description: string;
  date: string | null;
  odometer: number | null;
  position: string | null;
  partGroup: string | null;
};

/** A repair-log row as shown in the searchable / category lists. */
export type RepairEntry = EntryLite & {
  cost: number | null;
  notes: string | null;
  category: Category;
  /** Freshness of this repair vs the current odometer/today (null = n/a). */
  freshness: Freshness | null;
  receiptCount: number;
  relatedCount: number;
  /** True when this entry's part_group has an active reminder. */
  hasReminder: boolean;
};

/** Full entry for the detail + edit views. */
export type RepairEntryFull = {
  id: string;
  description: string;
  odometer: number | null;
  date: string | null;
  cost: number | null;
  notes: string | null;
  category: Category;
  position: string | null;
  partGroup: string | null;
  /** Reminder interval for this entry's group, if a reminder exists. */
  reminderInterval: number | null;
  receipts: ReceiptView[];
  relatedIds: string[];
};

/** An active reminder + its computed status against the current odometer. */
export type ReminderView = {
  id: string;
  label: string;
  partGroup: string;
  category: Category;
  interval: number;
  status: MaintStatus;
  milesRemaining: number | null;
  nextDue: number | null;
  lastOdo: number | null;
  lastDate: string | null;
  neverServiced: boolean;
  /** 0–100 through the interval, for the progress bar. */
  pct: number;
};

/** A related repair on the detail view, with its freshness badge. */
export type RelatedView = EntryLite & {
  cost: number | null;
  freshness: Freshness;
};

/** Cost rollups shown as KPI tiles. */
export type CostRollups = {
  month: number;
  ytd: number;
  lifetime: number;
};

/** One category card on the maintenance home grid. */
export type CategoryCard = {
  category: Category;
  slug: string;
  count: number;
  spend: number;
  /** Worst attention state inside the category (null = nothing pressing). */
  badge: "overdue" | "soon" | "aging" | null;
};

/** One set (positioned part group) surfaced on the main page. */
export type SetSummary = {
  partGroup: string;
  positions: number;
  combinedCost: number;
};

/** One position slot in a set view (a corner or a side). */
export type SetSlot = {
  position: string;
  label: string;
  entry: {
    id: string;
    description: string;
    date: string | null;
    odometer: number | null;
    cost: number | null;
  } | null;
  freshness: Freshness;
};

/** A set within a category view: its corner slots inline + combined cost. */
export type CategorySet = {
  partGroup: string;
  slots: SetSlot[];
  combinedCost: number;
};

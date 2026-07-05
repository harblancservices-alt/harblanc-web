import type { Category, Freshness, MaintStatus } from "@/lib/dispatch/repair-log";

/** A signed receipt (photo/PDF) on a service. */
export type ReceiptView = {
  id: string;
  name: string;
  url: string | null;
  isImage: boolean;
};

/** Minimal part shape for pickers (attach-related). */
export type EntryLite = {
  id: string;
  description: string;
  date: string | null;
  odometer: number | null;
  position: string | null;
  partGroup: string | null;
};

/** Another part replaced in the same visit (shown on part detail). */
export type PartLite = {
  id: string;
  description: string;
  category: Category;
  position: string | null;
};

/** The service (visit) a part belongs to. */
export type ServiceView = {
  id: string;
  date: string | null;
  odometer: number | null;
  shop: string | null;
  totalCost: number | null;
  notes: string | null;
  receipts: ReceiptView[];
};

/**
 * A part row in the searchable / category lists. Its date + odometer are read
 * from the parent service (populated by the loader).
 */
export type RepairEntry = {
  id: string;
  description: string;
  category: Category;
  position: string | null;
  partGroup: string | null;
  date: string | null;
  odometer: number | null;
  /** Service notes, kept for global search only (not displayed on the row). */
  notes: string | null;
  freshness: Freshness | null;
  /** Receipts on the part's service (>0 → the row shows a receipt icon). */
  receiptCount: number;
  relatedCount: number;
  /** True when this part's part_group has an active reminder. */
  hasReminder: boolean;
};

/** One part inside the log/edit service form. */
export type ServiceFormPart = {
  id?: string;
  description: string;
  category: Category;
  position: string | null;
  partGroup: string | null;
  reminderInterval: number | null;
};

/** Full service for the edit form. */
export type ServiceFull = {
  id: string;
  date: string | null;
  odometer: number | null;
  shop: string | null;
  totalCost: number | null;
  notes: string | null;
  receipts: ReceiptView[];
  parts: ServiceFormPart[];
};

/** Full part detail: the part + its service + siblings + related links. */
export type RepairEntryFull = {
  id: string;
  description: string;
  category: Category;
  position: string | null;
  partGroup: string | null;
  reminderInterval: number | null;
  freshness: Freshness | null;
  service: ServiceView;
  /** The other parts replaced in the same visit. */
  otherParts: PartLite[];
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
  freshness: Freshness;
};

/** One category card on the maintenance home grid (parts-first — no $). */
export type CategoryCard = {
  category: Category;
  slug: string;
  count: number;
  /** Worst attention state inside the category (null = nothing pressing). */
  badge: "overdue" | "soon" | "aging" | null;
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
  } | null;
  freshness: Freshness;
};

/** A set within a category view: its corner slots inline. */
export type CategorySet = {
  partGroup: string;
  slots: SetSlot[];
};

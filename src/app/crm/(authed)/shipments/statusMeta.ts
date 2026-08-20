/**
 * Shipment status vocabulary. crm_shipments.status is a plain text column
 * with no DB check constraint (confirmed live via OpenAPI introspection,
 * same as accounts/lifecycle.ts's lifecycle_status) — this is just the
 * vocabulary the UI offers, not something the DB enforces. Default is
 * "open" (set by createShipment). Same shape/pattern as lifecycle.ts's
 * LIFECYCLE_STAGES/LABEL/TONE.
 */
export const SHIPMENT_STATUSES = [
  "open",
  "dispatched",
  "in_transit",
  "delivered",
  "invoiced",
  "cancelled",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  open: "Open",
  dispatched: "Dispatched",
  in_transit: "In Transit",
  delivered: "Delivered",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

export const SHIPMENT_STATUS_TONE: Record<ShipmentStatus, string> = {
  open: "bg-slate-bg text-slate",
  dispatched: "bg-steel-bg text-steel",
  in_transit: "bg-steel-bg text-steel",
  delivered: "bg-ok-bg text-ok",
  invoiced: "bg-ok-bg text-ok",
  cancelled: "bg-bad-bg text-bad",
};

function normalizeStatus(value: string | null | undefined): ShipmentStatus {
  const v = (value ?? "").trim().toLowerCase();
  return (SHIPMENT_STATUSES as readonly string[]).includes(v) ? (v as ShipmentStatus) : "open";
}

export function shipmentStatusLabel(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "Open";
  const known = (SHIPMENT_STATUSES as readonly string[]).includes(v.toLowerCase());
  return known ? SHIPMENT_STATUS_LABEL[normalizeStatus(v)] : v;
}

export function shipmentStatusTone(value: string | null | undefined): string {
  return SHIPMENT_STATUS_TONE[normalizeStatus(value)];
}

/** Status -> shared Badge tone (2026-08-20, matching crm-design's Badge
 * set). Replaces SHIPMENT_STATUS_TONE's raw className strings (steel/slate
 * hues crm-design's palette doesn't have) at every Badge call site. */
export const SHIPMENT_STATUS_BADGE_TONE: Record<ShipmentStatus, "neutral" | "accent" | "success" | "danger"> = {
  open: "neutral",
  dispatched: "accent",
  in_transit: "accent",
  delivered: "success",
  invoiced: "success",
  cancelled: "danger",
};

export function shipmentStatusBadgeTone(value: string | null | undefined): "neutral" | "accent" | "success" | "danger" {
  return SHIPMENT_STATUS_BADGE_TONE[normalizeStatus(value)];
}

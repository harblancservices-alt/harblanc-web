"use client";

import { Badge, type BadgeTone } from "../../_shell/ui";
import { titleCaseWords, upperCaseState } from "../../_shell/format";
import { shipmentStatusBadgeTone, shipmentStatusLabel } from "../../shipments/statusMeta";
import { docStatusLabel } from "../../shipments/docStatusMeta";
import { isLiveDoc, type DocState, type LoadRow } from "./loadRow";

/**
 * The bits of a load row that render identically in the desktop table and
 * the mobile card, so the two can't drift.
 */

/**
 * Status tone for THIS screen. Defers to the shared
 * shipmentStatusBadgeTone() for everything except `dispatched`, which is
 * promoted to the `admin` (violet) tone.
 *
 * A deliberate, screen-scoped divergence, per Brent's spec for the Load
 * Center: the shared map paints dispatched and in_transit the same accent
 * blue, which is fine on a mixed shipment list but useless here, where the
 * whole point is telling apart "handed to a carrier" from "actually
 * rolling". Done LOCALLY rather than by editing the shared map, because
 * every other list (Shipments, the company profile) already reads correctly
 * and shouldn't repaint because of this screen.
 */
export function loadStatusTone(status: string): BadgeTone {
  if ((status || "").trim().toLowerCase() === "dispatched") return "admin";
  return shipmentStatusBadgeTone(status);
}

export function LoadStatusBadge({ status }: { status: string }) {
  return <Badge tone={loadStatusTone(status)}>{shipmentStatusLabel(status)}</Badge>;
}

/** "Houston, TX → Dallas, TX", or as much of it as exists. */
export function laneLabel(row: LoadRow): string {
  const from = [titleCaseWords(row.shipperCity), upperCaseState(row.shipperState)]
    .filter(Boolean)
    .join(", ");
  const to = [titleCaseWords(row.consigneeCity), upperCaseState(row.consigneeState)]
    .filter(Boolean)
    .join(", ");
  if (from && to) return `${from} → ${to}`;
  return from || to || "Lane not set";
}

/**
 * One document's state as a compact pill — "RC Sent", "BOL Draft", or a
 * danger-toned "No RC" when the load has none (or only a cancelled one).
 *
 * Missing paperwork is the actionable state on this screen, so it gets the
 * loud treatment; a document that exists is informational and stays quiet.
 */
export function DocPill({ kind, status }: { kind: "RC" | "BOL"; status: DocState }) {
  const live = isLiveDoc(status);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase leading-none tracking-wide ${
        live
          ? "border-line-strong bg-inset text-fg"
          : "border-bad/45 bg-bad-bg text-bad"
      }`}
    >
      {live ? `${kind} ${docStatusLabel(status)}` : `No ${kind}`}
    </span>
  );
}

/** The Docs cell / card strip: RC and BOL side by side. */
export function DocPills({ row }: { row: LoadRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <DocPill kind="RC" status={row.rcStatus} />
      <DocPill kind="BOL" status={row.bolStatus} />
    </span>
  );
}

/** Carrier name, or an explicit red "not assigned" — an unassigned carrier
 * on an active load is a problem, not an empty cell, so it never renders as
 * a bare dash. */
export function CarrierCell({ carrierName }: { carrierName: string | null }) {
  if (!carrierName) {
    return <span className="font-semibold text-bad">— not assigned</span>;
  }
  return <span className="text-fg">{titleCaseWords(carrierName)}</span>;
}

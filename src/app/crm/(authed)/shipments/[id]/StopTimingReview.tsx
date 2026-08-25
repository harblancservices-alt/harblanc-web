import Link from "next/link";
import { Card } from "../../_shell/ui";
import { SectionDivider } from "./fields";
import { resolveShipmentTimingFromDomain, type ResolvedStopTiming } from "../timing";
import type { CrmShipmentDetail } from "../types";

/**
 * Read-only pickup/delivery timing on a document editor, so an agent can SEE
 * what will print before generating the PDF. Neither editor had a single date
 * field before this — the dates went onto the document invisibly.
 *
 * Deliberately NOT editable here. The shipment is the source of truth for
 * timing; letting a document screen edit it would recreate the two-writers
 * problem the audits found (the RC editor already writes truck/trailer and
 * dimensions back to the shipment, which is exactly the confusion to avoid).
 * "Change" links back to the shipment, matching how this editor already
 * handles Shipper / Consignee / Carrier.
 */
function StopLine({ title, timing }: { title: string; timing: ResolvedStopTiming }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-fg-subtle">{title}</p>
      {timing.dateLabel ? (
        <>
          <p className="text-[13.5px] font-semibold text-fg">{timing.dateLabel}</p>
          <p className="text-[12.5px] text-fg-muted">{timing.timeLabel ?? "No time recorded"}</p>
        </>
      ) : (
        <p className="text-[13px] text-fg-subtle">No date set — this stop will print blank.</p>
      )}
      {timing.source === "legacy" && (
        <p className="text-[11px] text-fg-subtle">
          Legacy timing — recorded before timing modes existed, shown as stored.
        </p>
      )}
    </div>
  );
}

export function StopTimingReview({
  shipment,
  onEdit,
}: {
  shipment: CrmShipmentDetail;
  /** Present in modal mode — closes back to the shipment instead of navigating. */
  onEdit?: () => void;
}) {
  const timing = resolveShipmentTimingFromDomain(shipment);

  return (
    <Card>
      <SectionDivider
        label="Timing"
        hint="Set on the shipment"
        right={
          onEdit ? (
            <button type="button" onClick={onEdit} className="text-[11px] font-semibold text-accent underline underline-offset-2">
              Change
            </button>
          ) : (
            <Link href={`/crm/shipments/${shipment.id}`} className="text-[11px] font-semibold text-accent underline underline-offset-2">
              Change
            </Link>
          )
        }
      />
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
        <StopLine title="Pickup" timing={timing.pickup} />
        <StopLine title="Delivery" timing={timing.delivery} />
      </div>
    </Card>
  );
}

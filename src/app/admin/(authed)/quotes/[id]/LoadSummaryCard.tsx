/**
 * LoadSummaryCard — always-visible top summary on the Load workspace.
 *
 * Shows the operational facts the operator needs at a glance, without
 * duplicating what the dark header already carries (customer name,
 * status pill, rate, lane, miles, WorkflowProgress). The card answers:
 *
 *   - When's pickup? When's delivery?
 *   - How do I reach the customer?
 *   - What's my next move on this load?
 *   - Did the customer leave any notes?
 *
 * Empty fields collapse gracefully — pickup/delivery windows render
 * as "—" when not set; notes block renders only when non-empty.
 *
 * Server component (no client state). Pure presentation.
 */

export type LoadSummaryCardProps = {
  pickupWindow: string | null;
  deliveryWindow: string | null;
  contactPhone: string;
  contactEmail: string;
  nextActionVerb: string;
  /** Optional context line under the next-action verb — e.g. "Pickup today · 0800". */
  nextActionSubtitle?: string | null;
  customerNotes: string | null;
};

export function LoadSummaryCard({
  pickupWindow,
  deliveryWindow,
  contactPhone,
  contactEmail,
  nextActionVerb,
  nextActionSubtitle,
  customerNotes,
}: LoadSummaryCardProps) {
  const phone = (contactPhone ?? "").trim();
  const email = (contactEmail ?? "").trim();
  const notes = (customerNotes ?? "").trim();
  const subtitle = (nextActionSubtitle ?? "").trim();

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-3 sm:px-4 sm:py-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryItem
          label="Pickup"
          primary={pickupWindow ?? "—"}
          dim={!pickupWindow}
        />
        <SummaryItem
          label="Delivery"
          primary={deliveryWindow ?? "—"}
          dim={!deliveryWindow}
        />
        <SummaryItem
          label="Contact"
          primary={phone || "—"}
          secondary={email || undefined}
          mono
        />
      </div>

      <div className="mt-3 border-t border-zinc-800 pt-3">
        <SummaryItem
          label="Next action"
          primary={nextActionVerb}
          secondary={subtitle || undefined}
          accentPrimary
        />
      </div>

      {notes ? (
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <p className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            Customer notes
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-200">
            {notes}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function SummaryItem({
  label,
  primary,
  secondary,
  dim,
  mono,
  accentPrimary,
}: {
  label: string;
  primary: string;
  secondary?: string;
  dim?: boolean;
  mono?: boolean;
  accentPrimary?: boolean;
}) {
  const primaryClass =
    "block truncate text-[13px] " +
    (mono ? "font-mono tabular-nums " : "") +
    (dim
      ? "text-zinc-500"
      : accentPrimary
        ? "font-medium text-white"
        : "font-medium text-zinc-100");
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className={"mt-1 " + primaryClass}>{primary}</p>
      {secondary ? (
        <p className="mt-[2px] truncate text-[10.5px] text-zinc-500">
          {secondary}
        </p>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell } from "../_shell/ui";
import { IconTruck, IconX } from "../_shell/icons";
import { BTN_EDIT, BTN_NEUTRAL } from "../_shell/ui";
import { titleCaseWords } from "../_shell/format";
import { listShipments } from "./actions";
import { ShipmentsListClient } from "./ShipmentsListClient";
import { toShipmentListRow, type ShipmentListRow } from "./shipmentListRow";
import { NewShipmentButton } from "./NewShipmentButton";

export const dynamic = "force-dynamic";

/**
 * Shipments list — the entry point into the brokerage document system's
 * operational side (Shipment workspace, then Rate Confirmation/BOL generated
 * from it). Reads listShipments() (org-wide, newest first, already carrying
 * carrier name + RC/BOL counts) and hands it to a client component for
 * instant search filtering.
 *
 * `?account=<id>` (from the Companies list's per-row "Loads" action, active
 * customers only) filters to that customer's shipments — a plain read-only
 * filter over the same org-wide listShipments() result, not a new query path
 * or schema change. The banner names the customer and links back to the
 * unfiltered list.
 */
export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const sp = await searchParams;
  const accountFilter = (sp.account ?? "").trim();

  const shipments = await listShipments();
  const scoped = accountFilter ? shipments.filter((s) => s.accountId === accountFilter) : shipments;

  let accountName: string | null = null;
  if (accountFilter) {
    await requireCrmUser();
    const supabase = await createCrmServerClient();
    const { data } = await supabase.from("crm_accounts").select("name").eq("id", accountFilter).maybeSingle();
    accountName = data?.name ? titleCaseWords(data.name as string) : "this customer";
  }

  const rows: ShipmentListRow[] = scoped.map(toShipmentListRow);

  return (
    <PageShell
      title="Shipments"
      actions={
        <>
          <Link
            href="/crm/operations/carriers"
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold transition-colors ${BTN_EDIT}`}
          >
            <IconTruck width={16} height={16} />
            Carriers
          </Link>
          <NewShipmentButton />
        </>
      }
    >
      {accountFilter && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-line-strong bg-inset px-4 py-2.5">
          <p className="text-[13px] text-fg">
            Showing loads for <span className="font-semibold">{accountName}</span>
          </p>
          <Link
            href="/crm/shipments"
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_NEUTRAL}`}
          >
            <IconX width={11} height={11} />
            Clear filter
          </Link>
        </div>
      )}
      <ShipmentsListClient shipments={rows} />
    </PageShell>
  );
}

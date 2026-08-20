import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { Card, EmptyState } from "../../_shell/ui";
import { IconBillOfLading } from "../../_shell/icons";
import { AddBolEntryButton } from "./AddBolEntryButton";
import { BolEntryCard, type BolEntryData } from "./BolEntryCard";
import type { BolStatus } from "./actions";

export const dynamic = "force-dynamic";

type BolRow = {
  id: string;
  bol_number: string | null;
  carrier: string | null;
  shipper_name: string | null;
  shipper_address: string | null;
  consignee_name: string | null;
  consignee_address: string | null;
  bill_to: string | null;
  commodity: string | null;
  weight: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
  reference: string | null;
  notes: string | null;
  status: BolStatus;
};

/**
 * BOL Center — researched BOL profiles: a bill of lading Brent has already
 * worked (shipper/consignee/route captured), tracked through a
 * research→approval workflow. Mirrors admin/otr/page.tsx's shape (see
 * ./actions.ts and the crm_bol_entries migration's header comment) — a
 * single page/card-list, admin-only.
 */
export default async function AdminBolCenterPage() {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_bol_entries")
    .select(
      "id, bol_number, carrier, shipper_name, shipper_address, consignee_name, consignee_address, bill_to, commodity, weight, pickup_date, delivery_date, reference, notes, status"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const entries = (data ?? []) as BolRow[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-fg-muted">
          {entries.length} {entries.length === 1 ? "profile" : "profiles"} — bills of lading researched into shipper/consignee/route detail.
        </p>
        <AddBolEntryButton />
      </div>

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconBillOfLading />}
            title="No BOL profiles yet"
            body="Add a bill of lading Brent has worked — shipper, consignee, route, and whatever research turns up before it's released."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((e) => (
            <BolEntryCard
              key={e.id}
              bol={{
                id: e.id,
                bolNumber: e.bol_number,
                carrier: e.carrier,
                shipperName: e.shipper_name,
                shipperAddress: e.shipper_address,
                consigneeName: e.consignee_name,
                consigneeAddress: e.consignee_address,
                billTo: e.bill_to,
                commodity: e.commodity,
                weight: e.weight,
                pickupDate: e.pickup_date,
                deliveryDate: e.delivery_date,
                reference: e.reference,
                notes: e.notes,
                status: e.status,
              } satisfies BolEntryData}
            />
          ))}
        </div>
      )}
    </div>
  );
}

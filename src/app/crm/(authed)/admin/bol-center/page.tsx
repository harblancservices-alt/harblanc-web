import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { Card, EmptyState } from "../../_shell/ui";
import { IconBillOfLading } from "../../_shell/icons";
import { BolTable, type BolRow } from "./BolTable";
import type { BolStatus } from "./actions";

export const dynamic = "force-dynamic";

/**
 * BOL Center — the document-inbox list. Intake is external (an upstream
 * Claude session extracts/researches a BOL photo and inserts the row +
 * attaches the document); this page is purely the review queue: one row per
 * BOL, click through to the detail workspace to resolve it against real
 * companies/contacts. See ./actions.ts's header comment for the full model.
 */
export default async function AdminBolCenterPage() {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_bol_entries")
    .select(
      "id, bol_number, carrier, shipper_name, consignee_name, status, created_at, matched_shipper_account_id, matched_consignee_account_id",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const entries = data ?? [];
  const ids = entries.map((e) => e.id as string);

  const contactCounts = new Map<string, number>();
  if (ids.length) {
    const { data: contacts } = await supabase.from("crm_bol_contacts").select("bol_id").in("bol_id", ids);
    for (const c of contacts ?? []) {
      const key = c.bol_id as string;
      contactCounts.set(key, (contactCounts.get(key) ?? 0) + 1);
    }
  }

  const rows: BolRow[] = entries.map((e) => {
    const totalSides = [e.shipper_name, e.consignee_name].filter(Boolean).length;
    const resolvedSides = [e.matched_shipper_account_id, e.matched_consignee_account_id].filter(Boolean).length;
    return {
      id: e.id as string,
      bolNumber: e.bol_number as string | null,
      carrier: e.carrier as string | null,
      shipperName: e.shipper_name as string | null,
      consigneeName: e.consignee_name as string | null,
      status: e.status as BolStatus,
      createdAt: e.created_at as string,
      companiesResolved: resolvedSides,
      companiesTotal: totalSides,
      contactCount: contactCounts.get(e.id as string) ?? 0,
    };
  });

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-muted">
        {rows.length} {rows.length === 1 ? "BOL" : "BOLs"} in the review queue — extracted upstream, resolved against real companies here.
      </p>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconBillOfLading />}
            title="No BOLs to review"
            body="BOLs arrive here once they've been extracted and researched upstream — nothing to do until one lands."
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <BolTable rows={rows} />
        </Card>
      )}
    </div>
  );
}

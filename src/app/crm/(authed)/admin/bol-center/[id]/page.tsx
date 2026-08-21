import { notFound } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead, Badge, type BadgeTone } from "../../../_shell/ui";
import { BackButton } from "../../../_shell/BackButton";
import { formatDate, formatDateTime } from "../../../_shell/format";
import type { BolContactRole, BolStatus } from "../actions";
import { StatusBar } from "./StatusBar";
import { DocumentSection } from "./DocumentSection";
import { InformationSection } from "./InformationSection";
import { CompanyMatchSection } from "./CompanyMatchSection";
import { billToPartyName } from "../matching";
import { LocationMatchSection } from "./LocationMatchSection";
import { ContactsSection } from "./ContactsSection";
import { ResearchSection } from "./ResearchSection";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<BolStatus, string> = {
  new: "New",
  needs_review: "Needs Review",
  ready: "Ready",
  processed: "Processed",
  ignored: "Ignored",
};
const STATUS_TONE: Record<BolStatus, BadgeTone> = {
  new: "neutral",
  needs_review: "warning",
  ready: "accent",
  processed: "success",
  ignored: "danger",
};

export default async function BolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: bol } = await supabase
    .from("crm_bol_entries")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!bol) notFound();

  const [{ data: contacts }, { data: document }, { data: shipperAccount }, { data: consigneeAccount }, { data: billToAccount }] = await Promise.all([
    supabase
      .from("crm_bol_contacts")
      .select("id, role, name, phone, email, matched_contact_id")
      .eq("bol_id", id)
      .order("created_at", { ascending: true }),
    bol.document_id
      ? supabase.from("crm_documents").select("id, file_name, storage_path, mime_type").eq("id", bol.document_id).maybeSingle()
      : Promise.resolve({ data: null }),
    bol.matched_shipper_account_id
      ? supabase.from("crm_accounts").select("id, name, lifecycle_status").eq("id", bol.matched_shipper_account_id).maybeSingle()
      : Promise.resolve({ data: null }),
    bol.matched_consignee_account_id
      ? supabase.from("crm_accounts").select("id, name, lifecycle_status").eq("id", bol.matched_consignee_account_id).maybeSingle()
      : Promise.resolve({ data: null }),
    bol.matched_bill_to_account_id
      ? supabase.from("crm_accounts").select("id, name, lifecycle_status").eq("id", bol.matched_bill_to_account_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const status = bol.status as BolStatus;
  const title = bol.bol_number ? `BOL ${bol.bol_number}` : "Untitled BOL";
  const hint = [bol.carrier, [bol.shipper_name, bol.consignee_name].filter(Boolean).join(" → ")].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <BackButton fallbackHref="/crm/admin/bol-center" label="Back to BOL Center" exact />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHead
            title={title}
            hint={hint || undefined}
            right={<Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>}
          />
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[12.5px] text-fg-muted">Received {formatDateTime(bol.created_at as string)}</p>
            <StatusBar bolId={id} status={status} />
          </div>
        </Card>

        <DocumentSection
          bolId={id}
          orgId={user.orgId}
          document={document ? { id: document.id as string, fileName: document.file_name as string, storagePath: document.storage_path as string, mimeType: document.mime_type as string | null } : null}
        />
      </div>

      <InformationSection
        bolId={id}
        fields={{
          bolNumber: bol.bol_number,
          carrier: bol.carrier,
          shipperName: bol.shipper_name,
          shipperAddress: bol.shipper_address,
          consigneeName: bol.consignee_name,
          consigneeAddress: bol.consignee_address,
          billTo: bol.bill_to,
          commodity: bol.commodity,
          weight: bol.weight,
          pickupDate: bol.pickup_date,
          deliveryDate: bol.delivery_date,
          reference: bol.reference,
        }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CompanyMatchSection
          bolId={id}
          side="shipper"
          queryName={(bol.shipper_name as string | null) ?? ""}
          queryAddress={bol.shipper_address as string | null}
          matchedAccount={shipperAccount ? { id: shipperAccount.id as string, name: shipperAccount.name as string, lifecycleStatus: shipperAccount.lifecycle_status as string } : null}
        />
        <CompanyMatchSection
          bolId={id}
          side="consignee"
          queryName={(bol.consignee_name as string | null) ?? ""}
          queryAddress={bol.consignee_address as string | null}
          matchedAccount={consigneeAccount ? { id: consigneeAccount.id as string, name: consigneeAccount.name as string, lifecycleStatus: consigneeAccount.lifecycle_status as string } : null}
        />
        {bol.bill_to && (
          <CompanyMatchSection
            bolId={id}
            side="bill_to"
            queryName={billToPartyName(bol.bill_to as string | null)}
            queryAddress={null}
            matchedAccount={billToAccount ? { id: billToAccount.id as string, name: billToAccount.name as string, lifecycleStatus: billToAccount.lifecycle_status as string } : null}
          />
        )}
      </div>

      <ContactsSection
        contacts={(contacts ?? []).map((c) => ({
          id: c.id as string,
          role: c.role as BolContactRole,
          name: c.name as string | null,
          phone: c.phone as string | null,
          email: c.email as string | null,
          matchedContactId: c.matched_contact_id as string | null,
        }))}
        shipperAccountId={bol.matched_shipper_account_id as string | null}
        consigneeAccountId={bol.matched_consignee_account_id as string | null}
        billToAccountId={bol.matched_bill_to_account_id as string | null}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LocationMatchSection
          bolId={id}
          side="shipper"
          accountId={bol.matched_shipper_account_id as string | null}
          queryAddress={bol.shipper_address as string | null}
          matchedLocationId={bol.matched_shipper_location_id as string | null}
        />
        <LocationMatchSection
          bolId={id}
          side="consignee"
          accountId={bol.matched_consignee_account_id as string | null}
          queryAddress={bol.consignee_address as string | null}
          matchedLocationId={bol.matched_consignee_location_id as string | null}
        />
      </div>

      <ResearchSection bolId={id} notes={bol.notes as string | null} />

      <p className="text-[11px] text-fg-subtle">
        {[formatDate(bol.created_at as string) && `Entered ${formatDate(bol.created_at as string)}`, bol.processed_at ? `Processed ${formatDate(bol.processed_at as string)}` : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

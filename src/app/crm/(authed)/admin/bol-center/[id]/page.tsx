import { notFound } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { Badge, type BadgeTone } from "../../../_shell/ui";
import { BackButton } from "../../../_shell/BackButton";
import { formatDate, formatDateTime } from "../../../_shell/format";
import type { BolContactRole, BolStatus, CompanySide } from "../actions";
import { StatusBar } from "./StatusBar";
import { ProgressRail } from "./ProgressRail";
import { DocumentPanel } from "./DocumentPanel";
import { CompanyRow } from "./CompanyRow";
import { CarrierRow } from "./CarrierRow";
import { LoadDetailSummary } from "./LoadDetailSummary";
import { ActionDock, type PartySummary } from "./ActionDock";
import { billToPartyName } from "../matching";
import type { BolContact } from "./ContactRow";

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

  const [{ data: contactRows }, { data: document }, { data: shipperAccount }, { data: consigneeAccount }, { data: billToAccount }] = await Promise.all([
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
  const shipperName = bol.shipper_name as string | null;
  const consigneeName = bol.consignee_name as string | null;
  const partiesTitle = [shipperName, consigneeName].filter(Boolean).join(" → ");
  const title = partiesTitle || (bol.bol_number ? `BOL ${bol.bol_number}` : "Untitled BOL");

  const contacts: BolContact[] = (contactRows ?? []).map((c) => ({
    id: c.id as string,
    role: c.role as BolContactRole,
    name: c.name as string | null,
    phone: c.phone as string | null,
    email: c.email as string | null,
    matchedContactId: c.matched_contact_id as string | null,
  }));
  const contactsForRole = (role: BolContactRole) => contacts.filter((c) => c.role === role);
  const otherContacts = contactsForRole("other");

  const shipperMatched = shipperAccount ? { id: shipperAccount.id as string, name: shipperAccount.name as string, lifecycleStatus: shipperAccount.lifecycle_status as string } : null;
  const consigneeMatched = consigneeAccount ? { id: consigneeAccount.id as string, name: consigneeAccount.name as string, lifecycleStatus: consigneeAccount.lifecycle_status as string } : null;
  const billToMatched = billToAccount ? { id: billToAccount.id as string, name: billToAccount.name as string, lifecycleStatus: billToAccount.lifecycle_status as string } : null;

  const parties: PartySummary[] = [
    { side: "shipper" as CompanySide, hasName: Boolean(shipperName?.trim()), matchedAccount: shipperMatched ? { id: shipperMatched.id, lifecycleStatus: shipperMatched.lifecycleStatus } : null },
    { side: "consignee" as CompanySide, hasName: Boolean(consigneeName?.trim()), matchedAccount: consigneeMatched ? { id: consigneeMatched.id, lifecycleStatus: consigneeMatched.lifecycleStatus } : null },
    { side: "bill_to" as CompanySide, hasName: Boolean(bol.bill_to), matchedAccount: billToMatched ? { id: billToMatched.id, lifecycleStatus: billToMatched.lifecycleStatus } : null },
  ];

  return (
    <div className="space-y-4">
      <BackButton fallbackHref="/crm/admin/bol-center" label="Back to BOL Center" exact />

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line-strong bg-card p-4 shadow-e2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[18px] font-bold tracking-tight text-fg">{title}</h1>
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          </div>
          <p className="mt-1 text-[12.5px] text-fg-muted">
            {[bol.bol_number ? `BOL ${bol.bol_number}` : null, bol.carrier as string | null, `Received ${formatDateTime(bol.created_at as string)}`, document ? (document.file_name as string) : "No file attached"]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <StatusBar bolId={id} status={status} />
      </div>

      <ProgressRail status={status} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="lg:sticky lg:top-4">
          <DocumentPanel
            bolId={id}
            orgId={user.orgId}
            document={document ? { id: document.id as string, fileName: document.file_name as string, storagePath: document.storage_path as string, mimeType: document.mime_type as string | null } : null}
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-inset px-4 py-2.5">
              <h2 className="text-[14px] font-bold tracking-tight text-fg">Companies</h2>
            </div>
            <CompanyRow
              bolId={id}
              side="shipper"
              queryName={shipperName ?? ""}
              queryAddress={bol.shipper_address as string | null}
              matchedAccount={shipperMatched}
              contacts={contactsForRole("shipper")}
              showLocation
              matchedLocationId={bol.matched_shipper_location_id as string | null}
            />
            <CompanyRow
              bolId={id}
              side="consignee"
              queryName={consigneeName ?? ""}
              queryAddress={bol.consignee_address as string | null}
              matchedAccount={consigneeMatched}
              contacts={contactsForRole("consignee")}
              showLocation
              matchedLocationId={bol.matched_consignee_location_id as string | null}
            />
            {bol.bill_to && (
              <CompanyRow
                bolId={id}
                side="bill_to"
                queryName={billToPartyName(bol.bill_to as string | null)}
                queryAddress={null}
                matchedAccount={billToMatched}
                contacts={contactsForRole("bill_to")}
                showLocation={false}
                matchedLocationId={null}
              />
            )}
            {otherContacts.length > 0 && (
              <div className="flex flex-col gap-2 p-4">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-fg-subtle">Other contacts — no company side on this BOL</p>
                <ul className="flex flex-col gap-1.5">
                  {otherContacts.map((c) => (
                    <li key={c.id} className="text-[12.5px] text-fg-muted">
                      {c.name || "—"} {[c.phone, c.email].filter(Boolean).length > 0 ? `· ${[c.phone, c.email].filter(Boolean).join(" · ")}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <CarrierRow bolId={id} carrier={bol.carrier as string | null} />

          <LoadDetailSummary
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
            notes={bol.notes as string | null}
          />
        </div>
      </div>

      <ActionDock bolId={id} status={status} parties={parties} />

      <p className="text-[11px] text-fg-subtle">
        {[formatDate(bol.created_at as string) && `Entered ${formatDate(bol.created_at as string)}`, bol.processed_at ? `Processed ${formatDate(bol.processed_at as string)}` : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

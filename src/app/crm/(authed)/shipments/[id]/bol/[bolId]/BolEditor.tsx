"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DocViewer } from "@/components/ui/DocViewer";
import { Card, BTN_PRIMARY, BTN_EDIT, BTN_ACTION, BTN_DANGER, BTN_NEUTRAL, BTN_SUCCESS, ZEBRA_ROWS } from "../../../../_shell/ui";
import { FormError } from "../../../../_shell/form";
import { formatDateTime, titleCaseWords } from "../../../../_shell/format";
import { TextRow, SelectRow, SectionDivider } from "../../fields";
import { DocumentSigner } from "../../DocumentSigner";
import { docStatusLabel, docStatusTone } from "../../../docStatusMeta";
import { getSignedPdfUrl, openStoredPdf } from "../../../pdfClient";
import {
  getBol,
  saveBolDraft,
  addBolLineItem,
  removeBolLineItem,
  updateBol,
  generateBol,
  sendBolDocument,
  markBolCompleted,
  cancelBolDocument,
  duplicateBol,
  supersedeBolDocument,
  softDeleteBol,
} from "../../../bol-actions";
import type { BolFields, BolLineItemInput, CrmBillOfLadingDetail, CrmShipmentDetail } from "../../../types";

function str(v: string | null | undefined): string {
  return v ?? "";
}
function orNull(v: string): string | null {
  const t = v.trim();
  return t || null;
}
function moneyOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

type FieldsState = {
  freightChargeTerms: string;
  codAmount: string;
  declaredValue: string;
};

function toLocal(bol: CrmBillOfLadingDetail): FieldsState {
  return {
    freightChargeTerms: str(bol.freightChargeTerms),
    codAmount: bol.codAmount != null ? String(bol.codAmount) : "",
    declaredValue: str(bol.declaredValue),
  };
}

type ItemRow = {
  id: string;
  qty: string;
  unitType: string;
  description: string;
  weight: string;
  nmfc: string;
  freightClass: string;
  hazmat: boolean;
  sortOrder: number;
};

function toItemRows(bol: CrmBillOfLadingDetail): ItemRow[] {
  return bol.lineItems.map((li) => ({
    id: li.id,
    qty: str(li.qty),
    unitType: str(li.unitType),
    description: str(li.description),
    weight: str(li.weight),
    nmfc: str(li.nmfc),
    freightClass: str(li.freightClass),
    hazmat: li.hazmat,
    sortOrder: li.sortOrder,
  }));
}

function toItemInputs(rows: ItemRow[]): BolLineItemInput[] {
  return rows.map((r) => ({
    qty: orNull(r.qty),
    unitType: orNull(r.unitType),
    description: orNull(r.description),
    weight: orNull(r.weight),
    nmfc: orNull(r.nmfc),
    freightClass: orNull(r.freightClass),
    hazmat: r.hazmat,
    sortOrder: r.sortOrder,
  }));
}

const SIGN_ROLES = ["shipper", "carrier", "consignee"] as const;

/**
 * The Bill of Lading editor — freight charge terms/COD/declared value and
 * line items are genuinely independent columns on crm_bills_of_lading, so
 * those are editable here. Shipper/consignee/carrier are NOT independent
 * BOL columns (they only ever live inside doc_snapshot, written fresh at
 * each Generate — see bol-actions.ts's header comment); this editor shows
 * them read-only, sourced from the live shipment, with a link back to edit
 * them on the shipment itself. Editing a line item goes through updateBol's
 * full-array replace (no per-line update action exists for BOL, unlike the
 * RC's updateRateConfirmationLine) — every edit re-sends the whole list and
 * refreshes from the server afterward.
 */
export function BolEditor({
  shipment,
  initialBol,
}: {
  shipment: CrmShipmentDetail;
  initialBol: CrmBillOfLadingDetail;
}) {
  const router = useRouter();
  const [bol, setBol] = useState(initialBol);
  const [state, setState] = useState<FieldsState>(() => toLocal(initialBol));
  const [items, setItems] = useState<ItemRow[]>(() => toItemRows(initialBol));
  const [newItem, setNewItem] = useState({ qty: "", unitType: "", description: "", weight: "" });

  const [saveError, setSaveError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startSave] = useTransition();
  const [itemPending, startItem] = useTransition();
  const [actionPending, startAction] = useTransition();
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [signerRole, setSignerRole] = useState<string | null>(null);

  async function refresh() {
    const fresh = await getBol(bol.id);
    if (!fresh) return;
    setBol(fresh);
    setState(toLocal(fresh));
    setItems(toItemRows(fresh));
  }

  function set<K extends keyof FieldsState>(key: K, value: FieldsState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function commit(fields: Partial<BolFields>) {
    startSave(async () => {
      const result = await saveBolDraft(bol.id, fields);
      setSaveError(result.ok ? null : result.error);
    });
  }

  // ── Line items ──────────────────────────────────────────────────────────

  function setItemField<K extends keyof ItemRow>(id: string, key: K, value: ItemRow[K]) {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  function commitItems(rows: ItemRow[]) {
    setItemError(null);
    startItem(async () => {
      const result = await updateBol(bol.id, {}, toItemInputs(rows));
      if (!result.ok) setItemError(result.error);
      await refresh();
    });
  }

  function removeItem(id: string) {
    setItemError(null);
    startItem(async () => {
      const result = await removeBolLineItem(id, bol.id);
      if (!result.ok) setItemError(result.error);
      await refresh();
    });
  }

  function addItem() {
    if (!newItem.description.trim() && !newItem.qty.trim()) return;
    setItemError(null);
    startItem(async () => {
      const result = await addBolLineItem(bol.id, {
        qty: orNull(newItem.qty),
        unitType: orNull(newItem.unitType),
        description: orNull(newItem.description),
        weight: orNull(newItem.weight),
        nmfc: null,
        freightClass: null,
        hazmat: false,
      });
      if (!result.ok) setItemError(result.error);
      else setNewItem({ qty: "", unitType: "", description: "", weight: "" });
      await refresh();
    });
  }

  // ── Lifecycle actions ──────────────────────────────────────────────────

  function runAction(name: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setActionError(null);
    setBusyAction(name);
    startAction(async () => {
      const result = await fn();
      setBusyAction(null);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      await refresh();
    });
  }

  function onGenerate() {
    setActionError(null);
    setBusyAction("generate");
    startAction(async () => {
      const result = await generateBol(bol.id);
      setBusyAction(null);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      await refresh();
    });
  }

  function onDuplicate() {
    setActionError(null);
    setBusyAction("duplicate");
    startAction(async () => {
      const result = await duplicateBol(bol.id);
      setBusyAction(null);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.push(`/crm/shipments/${shipment.id}/bol/${result.id}`);
    });
  }

  function onSupersede() {
    if (!window.confirm(`Create a new draft that supersedes ${bol.bolNumber}?`)) return;
    setActionError(null);
    setBusyAction("supersede");
    startAction(async () => {
      const result = await supersedeBolDocument(bol.id);
      setBusyAction(null);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.push(`/crm/shipments/${shipment.id}/bol/${result.id}`);
    });
  }

  function onDelete() {
    if (!window.confirm(`Delete bill of lading ${bol.bolNumber}? This can't be undone from here.`)) return;
    setActionError(null);
    setBusyAction("delete");
    startAction(async () => {
      const result = await softDeleteBol(bol.id);
      setBusyAction(null);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.push(`/crm/shipments/${shipment.id}`);
    });
  }

  async function openPreview() {
    if (!bol.pdfStoragePath) return;
    setPreviewOpen(true);
    const url = await getSignedPdfUrl(bol.pdfStoragePath);
    setPreviewUrl(url);
  }

  function download() {
    if (!bol.pdfStoragePath) return;
    void openStoredPdf(bol.pdfStoragePath, `${bol.bolNumber} v${bol.version}.pdf`);
  }

  const locked = bol.status === "completed" || bol.status === "cancelled";
  const hasPdf = !!bol.pdfStoragePath;
  const busy = actionPending || itemPending;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">Bill of Lading</p>
            <p className="font-mono text-[22px] font-bold text-fg">{bol.bolNumber}</p>
            <p className="mt-1 text-[12.5px] text-fg-muted">
              From shipment{" "}
              <Link href={`/crm/shipments/${shipment.id}`} className="font-semibold text-accent underline">
                {shipment.shipmentNumber}
              </Link>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5">
              {bol.signedAt && (
                <span className="inline-flex items-center rounded-full bg-ok-bg px-2.5 py-1 text-[11px] font-semibold text-ok">
                  Signed
                </span>
              )}
              <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${docStatusTone(bol.status)}`}>
                {docStatusLabel(bol.status)}
              </span>
            </div>
            <p className="text-[11.5px] text-fg-subtle">Version {bol.version}</p>
          </div>
        </div>

        {bol.supersededBy && (
          <p className="mt-2 rounded-md border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-[12.5px] text-warn">
            Superseded by{" "}
            <Link href={`/crm/shipments/${shipment.id}/bol/${bol.supersededBy}`} className="font-semibold underline">
              a newer bill of lading
            </Link>
            .
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-subtle">
          <span>Created {formatDateTime(bol.createdAt)}</span>
          {bol.sentAt && <span>Sent {formatDateTime(bol.sentAt)}</span>}
          {bol.signedAt && <span>Signed {formatDateTime(bol.signedAt)}</span>}
          {bol.completedAt && <span>Completed {formatDateTime(bol.completedAt)}</span>}
        </div>

        <FormError message={saveError} />
        <FormError message={actionError} />

        <div className="mt-3 flex flex-wrap gap-2">
          {!locked && (
            <button
              type="button"
              onClick={() =>
                commit({
                  freightChargeTerms: orNull(state.freightChargeTerms),
                  codAmount: moneyOrNull(state.codAmount),
                  declaredValue: orNull(state.declaredValue),
                })
              }
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_EDIT}`}
            >
              Save Draft
            </button>
          )}
          {!locked && (
            <button
              type="button"
              onClick={onGenerate}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_ACTION}`}
            >
              {busyAction === "generate" ? "Generating…" : "Generate PDF"}
            </button>
          )}
          {hasPdf && (
            <button
              type="button"
              onClick={openPreview}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_EDIT}`}
            >
              Preview PDF
            </button>
          )}
          {hasPdf && (
            <button
              type="button"
              onClick={download}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_EDIT}`}
            >
              Download PDF
            </button>
          )}
          {bol.status === "generated" && (
            <button
              type="button"
              onClick={() => runAction("send", () => sendBolDocument(bol.id))}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_ACTION}`}
            >
              {busyAction === "send" ? "Sending…" : "Send"}
            </button>
          )}
          {hasPdf &&
            !locked &&
            SIGN_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setSignerRole(role)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_EDIT}`}
              >
                Sign as {titleCaseWords(role)}
              </button>
            ))}
          {(bol.status === "sent" || bol.status === "generated") && (
            <button
              type="button"
              onClick={() => runAction("complete", () => markBolCompleted(bol.id))}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_SUCCESS}`}
            >
              {busyAction === "complete" ? "Completing…" : "Complete"}
            </button>
          )}
          <button
            type="button"
            onClick={onDuplicate}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_NEUTRAL}`}
          >
            {busyAction === "duplicate" ? "Duplicating…" : "Duplicate"}
          </button>
          {hasPdf && !bol.supersededBy && (
            <button
              type="button"
              onClick={onSupersede}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_NEUTRAL}`}
            >
              {busyAction === "supersede" ? "Superseding…" : "Supersede"}
            </button>
          )}
          {!locked && (
            <button
              type="button"
              onClick={() => runAction("cancel", () => cancelBolDocument(bol.id))}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_DANGER}`}
            >
              {busyAction === "cancel" ? "Cancelling…" : "Cancel"}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_DANGER}`}
          >
            {busyAction === "delete" ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReadOnlyPartyCard
          title="Shipper"
          name={shipment.shipperName}
          address={shipment.shipperAddress}
          city={shipment.shipperCity}
          state={shipment.shipperState}
          zip={shipment.shipperZip}
          contact={shipment.shipperContact}
          phone={shipment.shipperPhone}
          editHref={`/crm/shipments/${shipment.id}`}
        />
        <ReadOnlyPartyCard
          title="Consignee"
          name={shipment.consigneeName}
          address={shipment.consigneeAddress}
          city={shipment.consigneeCity}
          state={shipment.consigneeState}
          zip={shipment.consigneeZip}
          contact={shipment.consigneeContact}
          phone={shipment.consigneePhone}
          editHref={`/crm/shipments/${shipment.id}`}
        />
        <Card>
          <SectionDivider
            label="Carrier"
            hint="Set on the shipment"
            right={
              <Link href={`/crm/shipments/${shipment.id}`} className="text-[11px] font-semibold text-accent underline underline-offset-2">
                Change
              </Link>
            }
          />
          <div className="flex flex-col gap-1 p-3 text-[13px] text-fg">
            {shipment.carrier ? (
              <>
                <p className="font-semibold">{titleCaseWords(shipment.carrier.name)}</p>
                {shipment.carrier.mcNumber && <p className="text-fg-muted">MC {shipment.carrier.mcNumber}</p>}
                {shipment.carrier.phone && <p className="text-fg-muted">{shipment.carrier.phone}</p>}
              </>
            ) : (
              <p className="text-fg-subtle">No carrier assigned yet.</p>
            )}
          </div>
        </Card>

        <div className="lg:col-span-3">
          <Card>
            <SectionDivider label="Freight charges" />
            <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3">
              <SelectRow
                label="Freight charge terms"
                value={state.freightChargeTerms}
                onChange={(v) => {
                  set("freightChargeTerms", v);
                  commit({ freightChargeTerms: orNull(v) });
                }}
              >
                <option value="">Not set</option>
                <option value="prepaid">Prepaid</option>
                <option value="collect">Collect</option>
                <option value="third_party">3rd Party</option>
              </SelectRow>
              <TextRow
                label="COD amount"
                value={state.codAmount}
                onChange={(v) => set("codAmount", v)}
                onBlur={() => commit({ codAmount: moneyOrNull(state.codAmount) })}
                placeholder="$0.00"
              />
              <TextRow
                label="Declared value"
                value={state.declaredValue}
                onChange={(v) => set("declaredValue", v)}
                onBlur={() => commit({ declaredValue: orNull(state.declaredValue) })}
              />
            </div>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card>
            <SectionDivider label="Line items" />
            <FormError message={itemError} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
                    <th className="px-3 py-1.5 text-left">Description</th>
                    <th className="px-3 py-1.5 text-left">Qty</th>
                    <th className="px-3 py-1.5 text-left">Unit</th>
                    <th className="px-3 py-1.5 text-left">Weight</th>
                    <th className="px-3 py-1.5 text-left">NMFC</th>
                    <th className="px-3 py-1.5 text-left">Class</th>
                    <th className="px-3 py-1.5 text-left">Hazmat</th>
                    <th className="px-3 py-1.5" />
                  </tr>
                </thead>
                <tbody className={ZEBRA_ROWS}>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td className="px-2.5 py-1.5">
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => setItemField(row.id, "description", e.target.value)}
                          onBlur={() => commitItems(items)}
                          className="h-8 w-full min-w-[140px] rounded-[5px] border border-fg-subtle bg-card px-2 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12px]"
                        />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <input
                          type="text"
                          value={row.qty}
                          onChange={(e) => setItemField(row.id, "qty", e.target.value)}
                          onBlur={() => commitItems(items)}
                          className="h-8 w-14 rounded-[5px] border border-fg-subtle bg-card px-2 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12px]"
                        />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <input
                          type="text"
                          value={row.unitType}
                          onChange={(e) => setItemField(row.id, "unitType", e.target.value)}
                          onBlur={() => commitItems(items)}
                          className="h-8 w-16 rounded-[5px] border border-fg-subtle bg-card px-2 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12px]"
                        />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <input
                          type="text"
                          value={row.weight}
                          onChange={(e) => setItemField(row.id, "weight", e.target.value)}
                          onBlur={() => commitItems(items)}
                          className="h-8 w-16 rounded-[5px] border border-fg-subtle bg-card px-2 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12px]"
                        />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <input
                          type="text"
                          value={row.nmfc}
                          onChange={(e) => setItemField(row.id, "nmfc", e.target.value)}
                          onBlur={() => commitItems(items)}
                          className="h-8 w-16 rounded-[5px] border border-fg-subtle bg-card px-2 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12px]"
                        />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <input
                          type="text"
                          value={row.freightClass}
                          onChange={(e) => setItemField(row.id, "freightClass", e.target.value)}
                          onBlur={() => commitItems(items)}
                          className="h-8 w-14 rounded-[5px] border border-fg-subtle bg-card px-2 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12px]"
                        />
                      </td>
                      <td className="px-2.5 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.hazmat}
                          onChange={(e) => {
                            const next = items.map((r) => (r.id === row.id ? { ...r, hazmat: e.target.checked } : r));
                            setItems(next);
                            commitItems(next);
                          }}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <button
                          type="button"
                          onClick={() => removeItem(row.id)}
                          disabled={itemPending}
                          className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${BTN_DANGER}`}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-inset">
                    <td className="px-2.5 py-1.5">
                      <input
                        type="text"
                        value={newItem.description}
                        onChange={(e) => setNewItem((prev) => ({ ...prev, description: e.target.value }))}
                        placeholder="New item"
                        className="h-8 w-full min-w-[140px] rounded-[5px] border border-dashed border-fg-subtle bg-card px-2 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12px]"
                      />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input
                        type="text"
                        value={newItem.qty}
                        onChange={(e) => setNewItem((prev) => ({ ...prev, qty: e.target.value }))}
                        className="h-8 w-14 rounded-[5px] border border-dashed border-fg-subtle bg-card px-2 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12px]"
                      />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input
                        type="text"
                        value={newItem.unitType}
                        onChange={(e) => setNewItem((prev) => ({ ...prev, unitType: e.target.value }))}
                        className="h-8 w-16 rounded-[5px] border border-dashed border-fg-subtle bg-card px-2 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12px]"
                      />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input
                        type="text"
                        value={newItem.weight}
                        onChange={(e) => setNewItem((prev) => ({ ...prev, weight: e.target.value }))}
                        className="h-8 w-16 rounded-[5px] border border-dashed border-fg-subtle bg-card px-2 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12px]"
                      />
                    </td>
                    <td className="px-2.5 py-1.5" colSpan={2} />
                    <td className="px-2.5 py-1.5">
                      <button
                        type="button"
                        onClick={addItem}
                        disabled={itemPending}
                        className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
                      >
                        Add
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {previewOpen && bol.pdfStoragePath && (
        <DocViewer
          doc={{ name: `${bol.bolNumber} v${bol.version}.pdf`, url: previewUrl, isImage: false }}
          onClose={() => {
            setPreviewOpen(false);
            setPreviewUrl(null);
          }}
        />
      )}

      {signerRole && bol.pdfStoragePath && (
        <DocumentSigner
          docType="bill_of_lading"
          docId={bol.id}
          pdfStoragePath={bol.pdfStoragePath}
          role={signerRole}
          roleLabel={titleCaseWords(signerRole)}
          onClose={() => setSignerRole(null)}
          onSigned={() => {
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function ReadOnlyPartyCard({
  title,
  name,
  address,
  city,
  state,
  zip,
  contact,
  phone,
  editHref,
}: {
  title: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  contact: string | null;
  phone: string | null;
  editHref: string;
}) {
  const cityStateZip = [[city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");
  return (
    <Card>
      <SectionDivider
        label={title}
        hint="Read-only — sourced from the shipment"
        right={
          <Link href={editHref} className="text-[11px] font-semibold text-accent underline underline-offset-2">
            Change
          </Link>
        }
      />
      <div className="flex flex-col gap-1 p-3 text-[13px] text-fg">
        <p className="font-semibold">{name ? titleCaseWords(name) : "—"}</p>
        {address && <p className="text-fg-muted">{address}</p>}
        {cityStateZip && <p className="text-fg-muted">{cityStateZip}</p>}
        {(contact || phone) && <p className="text-fg-muted">{[contact, phone].filter(Boolean).join(" · ")}</p>}
      </div>
    </Card>
  );
}

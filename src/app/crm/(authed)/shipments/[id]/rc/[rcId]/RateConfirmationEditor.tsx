"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DocViewer } from "@/components/ui/DocViewer";
import { Card, CardHead, BTN_PRIMARY, BTN_EDIT, BTN_ACTION, BTN_DANGER, BTN_NEUTRAL, BTN_SUCCESS, ZEBRA_ROWS } from "../../../../_shell/ui";
import { FormError } from "../../../../_shell/form";
import { formatMoney, formatDateTime, titleCaseWords } from "../../../../_shell/format";
import { TextRow, TextAreaRow, FormRow2 } from "../../fields";
import { DocumentSigner } from "../../DocumentSigner";
import { docStatusLabel, docStatusTone } from "../../../docStatusMeta";
import { getSignedPdfUrl, openStoredPdf } from "../../../pdfClient";
import {
  getRateConfirmation,
  saveRateConfirmationDraft,
  addRateConfirmationLine,
  updateRateConfirmationLine,
  removeRateConfirmationLine,
  generateRateConfirmation,
  sendRateConfirmation,
  markRateConfirmationAccepted,
  markRateConfirmationCompleted,
  cancelRateConfirmation,
  duplicateRateConfirmation,
  supersedeRateConfirmation,
  softDeleteRateConfirmation,
} from "../../../rate-confirmation-actions";
import type { CrmRateConfirmationDetail, CrmShipmentDetail, RateConfirmationFields } from "../../../types";

function str(v: string | null | undefined): string {
  return v ?? "";
}
function orNull(v: string): string | null {
  const t = v.trim();
  return t || null;
}
function moneyOrNull(v: string): number {
  const t = v.trim();
  if (!t) return 0;
  const n = Number(t.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

type CarrierFieldsState = {
  carrierName: string;
  carrierMc: string;
  carrierDot: string;
  carrierContact: string;
  carrierPhone: string;
  carrierEmail: string;
  paymentTerms: string;
  quickPay: string;
  notes: string;
};

function toLocal(rc: CrmRateConfirmationDetail): CarrierFieldsState {
  return {
    carrierName: str(rc.carrierName),
    carrierMc: str(rc.carrierMc),
    carrierDot: str(rc.carrierDot),
    carrierContact: str(rc.carrierContact),
    carrierPhone: str(rc.carrierPhone),
    carrierEmail: str(rc.carrierEmail),
    paymentTerms: str(rc.paymentTerms),
    quickPay: str(rc.quickPay),
    notes: str(rc.notes),
  };
}

type LineRow = { id: string; label: string; amount: string };

function toLineRows(rc: CrmRateConfirmationDetail): LineRow[] {
  return rc.lines.map((l) => ({ id: l.id, label: l.label, amount: String(l.amount) }));
}

/**
 * The Rate Confirmation editor — carrier contact fields, payment terms/quick
 * pay/notes, and carrier-pay line items, all editable, plus the full
 * generate/send/accept/complete/duplicate/supersede/delete lifecycle already
 * backed by rate-confirmation-actions.ts. totalCarrierPay is NEVER summed
 * client-side — every line mutation calls refresh() to re-pull the server's
 * recomputed total (see recomputeTotal in that file), same contract the
 * server enforces.
 */
export function RateConfirmationEditor({
  shipment,
  initialRc,
}: {
  shipment: CrmShipmentDetail;
  initialRc: CrmRateConfirmationDetail;
}) {
  const router = useRouter();
  const [rc, setRc] = useState(initialRc);
  const [state, setState] = useState<CarrierFieldsState>(() => toLocal(initialRc));
  const [lines, setLines] = useState<LineRow[]>(() => toLineRows(initialRc));
  const [newLine, setNewLine] = useState({ label: "", amount: "" });

  const [saveError, setSaveError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startSave] = useTransition();
  const [linePending, startLine] = useTransition();
  const [actionPending, startAction] = useTransition();
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [signerRole, setSignerRole] = useState<string | null>(null);

  async function refresh() {
    const fresh = await getRateConfirmation(rc.id);
    if (!fresh) return;
    setRc(fresh);
    setState(toLocal(fresh));
    setLines(toLineRows(fresh));
  }

  function set<K extends keyof CarrierFieldsState>(key: K, value: CarrierFieldsState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function commit(fields: Partial<RateConfirmationFields>) {
    startSave(async () => {
      const result = await saveRateConfirmationDraft(rc.id, fields);
      setSaveError(result.ok ? null : result.error);
    });
  }

  function saveAllFields() {
    setSaveError(null);
    startSave(async () => {
      const result = await saveRateConfirmationDraft(rc.id, {
        carrierName: orNull(state.carrierName),
        carrierMc: orNull(state.carrierMc),
        carrierDot: orNull(state.carrierDot),
        carrierContact: orNull(state.carrierContact),
        carrierPhone: orNull(state.carrierPhone),
        carrierEmail: orNull(state.carrierEmail),
        paymentTerms: orNull(state.paymentTerms),
        quickPay: orNull(state.quickPay),
        notes: orNull(state.notes),
      });
      setSaveError(result.ok ? null : result.error);
    });
  }

  // ── Lines ───────────────────────────────────────────────────────────────

  function setLineField(id: string, key: "label" | "amount", value: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [key]: value } : l)));
  }

  function commitLine(id: string, label: string, amount: string) {
    setLineError(null);
    startLine(async () => {
      const result = await updateRateConfirmationLine(id, rc.id, { label, amount: moneyOrNull(amount) });
      if (!result.ok) setLineError(result.error);
      await refresh();
    });
  }

  function removeLine(id: string) {
    setLineError(null);
    startLine(async () => {
      const result = await removeRateConfirmationLine(id, rc.id);
      if (!result.ok) setLineError(result.error);
      await refresh();
    });
  }

  function addLine() {
    if (!newLine.label.trim()) return;
    setLineError(null);
    startLine(async () => {
      const result = await addRateConfirmationLine(rc.id, {
        label: newLine.label.trim(),
        amount: moneyOrNull(newLine.amount),
      });
      if (!result.ok) setLineError(result.error);
      else setNewLine({ label: "", amount: "" });
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
      const result = await generateRateConfirmation(rc.id);
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
      const result = await duplicateRateConfirmation(rc.id);
      setBusyAction(null);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.push(`/crm/shipments/${shipment.id}/rc/${result.id}`);
    });
  }

  function onSupersede() {
    if (!window.confirm(`Create a new draft that supersedes ${rc.rcNumber}?`)) return;
    setActionError(null);
    setBusyAction("supersede");
    startAction(async () => {
      const result = await supersedeRateConfirmation(rc.id);
      setBusyAction(null);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.push(`/crm/shipments/${shipment.id}/rc/${result.id}`);
    });
  }

  function onDelete() {
    if (!window.confirm(`Delete rate confirmation ${rc.rcNumber}? This can't be undone from here.`)) return;
    setActionError(null);
    setBusyAction("delete");
    startAction(async () => {
      const result = await softDeleteRateConfirmation(rc.id);
      setBusyAction(null);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.push(`/crm/shipments/${shipment.id}`);
    });
  }

  async function openPreview() {
    if (!rc.pdfStoragePath) return;
    setPreviewOpen(true);
    const url = await getSignedPdfUrl(rc.pdfStoragePath);
    setPreviewUrl(url);
  }

  function download() {
    if (!rc.pdfStoragePath) return;
    void openStoredPdf(rc.pdfStoragePath, `${rc.rcNumber} v${rc.version}.pdf`);
  }

  const locked = rc.status === "completed" || rc.status === "cancelled";
  const hasPdf = !!rc.pdfStoragePath;
  const busy = actionPending || linePending;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">Rate Confirmation</p>
            <p className="font-mono text-[22px] font-bold text-fg">{rc.rcNumber}</p>
            <p className="mt-1 text-[12.5px] text-fg-muted">
              From shipment{" "}
              <Link href={`/crm/shipments/${shipment.id}`} className="font-semibold text-accent underline">
                {shipment.shipmentNumber}
              </Link>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${docStatusTone(rc.status)}`}>
              {docStatusLabel(rc.status)}
            </span>
            <p className="text-[11.5px] text-fg-subtle">Version {rc.version}</p>
          </div>
        </div>

        {rc.supersededBy && (
          <p className="mt-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[12.5px] text-warn">
            Superseded by{" "}
            <Link href={`/crm/shipments/${shipment.id}/rc/${rc.supersededBy}`} className="font-semibold underline">
              a newer rate confirmation
            </Link>
            .
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-subtle">
          <span>Created {formatDateTime(rc.createdAt)}</span>
          {rc.sentAt && <span>Sent {formatDateTime(rc.sentAt)}</span>}
          {rc.acceptedAt && <span>Accepted {formatDateTime(rc.acceptedAt)}</span>}
          {rc.completedAt && <span>Completed {formatDateTime(rc.completedAt)}</span>}
        </div>

        <FormError message={saveError} />
        <FormError message={actionError} />

        <div className="mt-3 flex flex-wrap gap-2">
          {!locked && (
            <button
              type="button"
              onClick={saveAllFields}
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
          {rc.status === "generated" && (
            <button
              type="button"
              onClick={() => runAction("send", () => sendRateConfirmation(rc.id))}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_ACTION}`}
            >
              {busyAction === "send" ? "Sending…" : "Send"}
            </button>
          )}
          {hasPdf && (rc.status === "sent" || rc.status === "generated") && (
            <button
              type="button"
              onClick={() => setSignerRole("carrier")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_EDIT}`}
            >
              Sign to Accept
            </button>
          )}
          {rc.status === "sent" && (
            <button
              type="button"
              onClick={() => runAction("accept", () => markRateConfirmationAccepted(rc.id))}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_SUCCESS}`}
            >
              {busyAction === "accept" ? "Marking…" : "Mark Accepted"}
            </button>
          )}
          {(rc.status === "sent" || rc.status === "accepted") && (
            <button
              type="button"
              onClick={() => runAction("complete", () => markRateConfirmationCompleted(rc.id))}
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
          {hasPdf && !rc.supersededBy && (
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
              onClick={() => runAction("cancel", () => cancelRateConfirmation(rc.id))}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="Carrier" hint="Independent of the shipment — edits here don't change the assigned carrier" />
          <div className="flex flex-col gap-3 p-4">
            <TextRow
              label="Carrier name"
              value={state.carrierName}
              onChange={(v) => set("carrierName", v)}
              onBlur={() => commit({ carrierName: orNull(state.carrierName) })}
            />
            <FormRow2>
              <TextRow
                label="MC #"
                value={state.carrierMc}
                onChange={(v) => set("carrierMc", v)}
                onBlur={() => commit({ carrierMc: orNull(state.carrierMc) })}
              />
              <TextRow
                label="DOT #"
                value={state.carrierDot}
                onChange={(v) => set("carrierDot", v)}
                onBlur={() => commit({ carrierDot: orNull(state.carrierDot) })}
              />
            </FormRow2>
            <TextRow
              label="Contact"
              value={state.carrierContact}
              onChange={(v) => set("carrierContact", v)}
              onBlur={() => commit({ carrierContact: orNull(state.carrierContact) })}
            />
            <FormRow2>
              <TextRow
                label="Phone"
                value={state.carrierPhone}
                onChange={(v) => set("carrierPhone", v)}
                onBlur={() => commit({ carrierPhone: orNull(state.carrierPhone) })}
              />
              <TextRow
                label="Email"
                value={state.carrierEmail}
                onChange={(v) => set("carrierEmail", v)}
                onBlur={() => commit({ carrierEmail: orNull(state.carrierEmail) })}
              />
            </FormRow2>
          </div>
        </Card>

        <Card>
          <CardHead title="Payment" />
          <div className="flex flex-col gap-3 p-4">
            <TextRow
              label="Payment terms"
              value={state.paymentTerms}
              onChange={(v) => set("paymentTerms", v)}
              onBlur={() => commit({ paymentTerms: orNull(state.paymentTerms) })}
              placeholder="e.g. Net 30"
            />
            <TextRow
              label="Quick pay"
              value={state.quickPay}
              onChange={(v) => set("quickPay", v)}
              onBlur={() => commit({ quickPay: orNull(state.quickPay) })}
              placeholder="e.g. 2% for pay in 24hrs"
            />
            <TextAreaRow
              label="Notes"
              value={state.notes}
              onChange={(v) => set("notes", v)}
              onBlur={() => commit({ notes: orNull(state.notes) })}
              rows={3}
            />
          </div>
        </Card>

        <div className="lg:col-span-2">
          <Card>
            <CardHead title="Carrier pay line items" hint="Total is computed server-side" />
            <FormError message={lineError} />
            <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
              {lines.map((line) => (
                <li key={line.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <input
                    type="text"
                    value={line.label}
                    onChange={(e) => setLineField(line.id, "label", e.target.value)}
                    onBlur={() => commitLine(line.id, line.label, line.amount)}
                    className="h-10 min-w-0 flex-1 rounded-md border border-fg-subtle bg-card px-3 text-[13.5px] font-medium text-fg outline-none focus:ring-2 focus:ring-accent/40"
                    placeholder="Line label"
                  />
                  <div className="relative w-36 shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-fg-subtle">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(e) => setLineField(line.id, "amount", e.target.value)}
                      onBlur={() => commitLine(line.id, line.label, line.amount)}
                      className="h-10 w-full rounded-md border border-fg-subtle bg-card pl-6 pr-3 text-[13.5px] font-medium text-fg outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    disabled={linePending}
                    className={`shrink-0 rounded-md px-3 py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${BTN_DANGER}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
              <li className="flex flex-wrap items-center gap-3 bg-inset px-4 py-3">
                <input
                  type="text"
                  value={newLine.label}
                  onChange={(e) => setNewLine((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="New line label"
                  className="h-10 min-w-0 flex-1 rounded-md border border-dashed border-fg-subtle bg-card px-3 text-[13.5px] font-medium text-fg outline-none focus:ring-2 focus:ring-accent/40"
                />
                <div className="relative w-36 shrink-0">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-fg-subtle">
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={newLine.amount}
                    onChange={(e) => setNewLine((prev) => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                    className="h-10 w-full rounded-md border border-dashed border-fg-subtle bg-card pl-6 pr-3 text-[13.5px] font-medium text-fg outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                <button
                  type="button"
                  onClick={addLine}
                  disabled={linePending || !newLine.label.trim()}
                  className={`shrink-0 rounded-md px-3.5 py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
                >
                  Add line
                </button>
              </li>
            </ul>
            <div className="flex items-center justify-between border-t border-line-strong bg-bar px-4 py-3">
              <span className="text-[12.5px] font-semibold uppercase tracking-[0.1em] text-bar-fg">Total carrier pay</span>
              <span className="font-mono text-[18px] font-bold text-bar-fg">{formatMoney(rc.totalCarrierPay)}</span>
            </div>
          </Card>
        </div>
      </div>

      {previewOpen && rc.pdfStoragePath && (
        <DocViewer
          doc={{ name: `${rc.rcNumber} v${rc.version}.pdf`, url: previewUrl, isImage: false }}
          onClose={() => {
            setPreviewOpen(false);
            setPreviewUrl(null);
          }}
        />
      )}

      {signerRole && rc.pdfStoragePath && (
        <DocumentSigner
          docType="rate_confirmation"
          docId={rc.id}
          pdfStoragePath={rc.pdfStoragePath}
          role={signerRole}
          roleLabel={titleCaseWords(signerRole)}
          defaultSignerName={state.carrierContact}
          onClose={() => setSignerRole(null)}
          onSigned={() => {
            void refresh();
          }}
        />
      )}
    </div>
  );
}

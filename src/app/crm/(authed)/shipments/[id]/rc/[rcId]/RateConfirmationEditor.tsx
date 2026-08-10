"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { DocViewer } from "@/components/ui/DocViewer";
import { Card, BTN_PRIMARY, BTN_EDIT, BTN_ACTION, BTN_DANGER, BTN_SUCCESS, ZEBRA_ROWS } from "../../../../_shell/ui";
import { FormError } from "../../../../_shell/form";
import { AsyncSearchPicker } from "../../../../_shell/AsyncSearchPicker";
import { formatMoney, formatDateTime, titleCaseWords, formatPhone } from "../../../../_shell/format";
import { TextRow, TextAreaRow, FormRow2, FormRow3, SectionDivider, SelectedEntityChip } from "../../fields";
import { docStatusLabel, docStatusTone } from "../../../docStatusMeta";
import { getSignedPdfUrl, openStoredPdf } from "../../../pdfClient";
import { listCarriers, getCarrier } from "../../../carriers-actions";
import { updateShipment } from "../../../actions";
import {
  getRateConfirmation,
  saveRateConfirmationDraft,
  addRateConfirmationLine,
  updateRateConfirmationLine,
  removeRateConfirmationLine,
  generateRateConfirmation,
  markRateConfirmationAccepted,
  markRateConfirmationCompleted,
} from "../../../rate-confirmation-actions";
import type { CrmCarrier, CrmRateConfirmationDetail, CrmShipmentDetail, RateConfirmationFields } from "../../../types";

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

/** FMCSA SAFER's public company-snapshot query — no API key, just a deep
 * link. query_param picks which field query_string is matched against. */
function saferSnapshotUrl(kind: "mc" | "dot", value: string): string {
  const param = kind === "mc" ? "MC_MX" : "USDOT";
  return `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=${param}&original_query_param=NAME&query_string=${encodeURIComponent(value)}`;
}

/**
 * Internal-only convenience for the broker — never touches the generated RC
 * PDF or any server call, just builds a SAFER deep link from whatever MC/DOT
 * the rep types (or the carrier's own MC/DOT, prefilled once). Sits in the
 * leftover space under the Carrier card's Phone/Email row.
 */
function FmcsaLookupBox({ mc, dot }: { mc: string; dot: string }) {
  const [kind, setKind] = useState<"mc" | "dot">(mc ? "mc" : "dot");
  const [value, setValue] = useState(mc || dot || "");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (touched) return;
    if (mc) {
      setKind("mc");
      setValue(mc);
    } else if (dot) {
      setKind("dot");
      setValue(dot);
    }
  }, [mc, dot, touched]);

  const trimmed = value.trim();
  const url = trimmed ? saferSnapshotUrl(kind, trimmed) : null;
  const linkClass =
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[5px] border border-accent bg-accent px-3 text-[12px] font-semibold text-white transition-colors hover:bg-accent-hover sm:h-[26px]";

  return (
    <div className="mt-1 rounded-lg border border-fg-subtle bg-inset p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-fg">FMCSA / SAFER Lookup — internal only</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <select
          value={kind}
          onChange={(e) => {
            setTouched(true);
            setKind(e.target.value as "mc" | "dot");
          }}
          className="h-8 shrink-0 rounded-[5px] border border-fg-subtle bg-card px-2 text-[12.5px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12px]"
        >
          <option value="mc">MC</option>
          <option value="dot">DOT</option>
        </select>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            setTouched(true);
            setValue(e.target.value);
          }}
          placeholder={kind === "mc" ? "MC number" : "DOT number"}
          className="h-8 min-w-0 flex-1 rounded-[5px] border border-fg-subtle bg-card px-2.5 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12.5px]"
        />
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Look up on SAFER
          </a>
        ) : (
          <span className={`${linkClass} cursor-not-allowed opacity-50`}>Look up on SAFER</span>
        )}
      </div>
    </div>
  );
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

const CARRIER_SNAPSHOT_KEYS = [
  "carrierName",
  "carrierMc",
  "carrierDot",
  "carrierContact",
  "carrierPhone",
  "carrierEmail",
] as const satisfies readonly (keyof CarrierFieldsState)[];

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
 * pay/notes, and carrier-pay line items, all editable, plus the
 * accept/complete lifecycle already backed by rate-confirmation-actions.ts
 * (send/duplicate/supersede/sign-to-accept buttons were removed from this
 * editor 2026-08-10; the server actions still exist, just unused here).
 * totalCarrierPay is NEVER summed
 * client-side — every line mutation calls refresh() to re-pull the server's
 * recomputed total (see recomputeTotal in that file), same contract the
 * server enforces.
 *
 * The carrier card also drives crm_rate_confirmations.carrier_id — a real
 * (if previously UI-less) link column, snapshotted from the shipment's
 * carrier at RC creation. Picking from the directory here mirrors that same
 * snapshot logic (carrier's own phone/email, falling back to its oldest
 * contact) client-side via the existing listCarriers/getCarrier actions —
 * no server changes. Selecting only ever fills text fields; every field
 * stays hand-editable, and Reset detaches carrier_id and blanks what it
 * filled.
 */
export function RateConfirmationEditor({
  shipment,
  initialRc,
  onClose,
  onNavigate,
}: {
  shipment: CrmShipmentDetail;
  initialRc: CrmRateConfirmationDetail;
  /** Present when rendered inside DocumentEditorModal (over the shipment
   * workspace) instead of the standalone /rc/[rcId] route — swaps the
   * "back to shipment" Link for a plain Close. */
  onClose?: () => void;
  /** Present in modal mode — the superseded-by banner switches the modal to
   * the newer doc instead of a full navigation. */
  onNavigate?: (id: string) => void;
}) {
  const [rc, setRc] = useState(initialRc);
  const [state, setState] = useState<CarrierFieldsState>(() => toLocal(initialRc));
  const [carrierId, setCarrierId] = useState<string | null>(initialRc.carrierId);
  const [carrierAutoFill, setCarrierAutoFill] = useState<Set<keyof CarrierFieldsState> | null>(null);
  const [carrierPickerOpen, setCarrierPickerOpen] = useState(false);
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

  const [truckNumber, setTruckNumber] = useState(str(shipment.truckNumber));
  const [trailerNumber, setTrailerNumber] = useState(str(shipment.trailerNumber));
  const [, startShipmentSave] = useTransition();

  function commitShipmentField(field: "truckNumber" | "trailerNumber", value: string) {
    startShipmentSave(async () => {
      await updateShipment(shipment.id, { [field]: orNull(value) });
    });
  }

  async function refresh() {
    const fresh = await getRateConfirmation(rc.id);
    if (!fresh) return;
    setRc(fresh);
    setState(toLocal(fresh));
    setCarrierId(fresh.carrierId);
    setLines(toLineRows(fresh));
  }

  function set<K extends keyof CarrierFieldsState>(key: K, value: CarrierFieldsState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function setCarrierField<K extends keyof CarrierFieldsState>(key: K, value: CarrierFieldsState[K]) {
    set(key, value);
    setCarrierAutoFill((prev) => {
      if (!prev || !prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next.size ? next : null;
    });
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
        carrierId,
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

  // ── Carrier picker ──────────────────────────────────────────────────────

  function selectCarrier(c: CrmCarrier) {
    setCarrierPickerOpen(false);
    setSaveError(null);
    startSave(async () => {
      const detail = await getCarrier(c.id);
      const primary = detail?.contacts[0] ?? null;
      const patch: Pick<CarrierFieldsState, (typeof CARRIER_SNAPSHOT_KEYS)[number]> = {
        carrierName: detail?.name ?? c.name,
        carrierMc: str(detail?.mcNumber ?? c.mcNumber),
        carrierDot: str(detail?.dotNumber ?? c.dotNumber),
        carrierContact: str(primary?.name),
        carrierPhone: str(detail?.phone ?? primary?.phone),
        carrierEmail: str(detail?.email ?? primary?.email),
      };
      setState((prev) => ({ ...prev, ...patch }));
      setCarrierId(c.id);
      setCarrierAutoFill(new Set(CARRIER_SNAPSHOT_KEYS));
      const result = await saveRateConfirmationDraft(rc.id, { carrierId: c.id, ...patch });
      setSaveError(result.ok ? null : result.error);
    });
  }

  function resetCarrier() {
    setCarrierId(null);
    setCarrierAutoFill(null);
    setState((prev) => ({
      ...prev,
      carrierName: "",
      carrierMc: "",
      carrierDot: "",
      carrierContact: "",
      carrierPhone: "",
      carrierEmail: "",
    }));
    commit({
      carrierId: null,
      carrierName: null,
      carrierMc: null,
      carrierDot: null,
      carrierContact: null,
      carrierPhone: null,
      carrierEmail: null,
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg">Rate Confirmation</p>
            <p className="font-mono text-[22px] font-bold text-fg">{rc.rcNumber}</p>
            <p className="mt-1 text-[12.5px] text-fg-muted">
              From shipment{" "}
              {onClose ? (
                <span className="font-semibold text-fg">{shipment.shipmentNumber}</span>
              ) : (
                <Link href={`/crm/shipments/${shipment.id}`} className="font-semibold text-accent underline">
                  {shipment.shipmentNumber}
                </Link>
              )}
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
            {onNavigate ? (
              <button type="button" onClick={() => onNavigate(rc.supersededBy as string)} className="font-semibold underline">
                a newer rate confirmation
              </button>
            ) : (
              <Link href={`/crm/shipments/${shipment.id}/rc/${rc.supersededBy}`} className="font-semibold underline">
                a newer rate confirmation
              </Link>
            )}
            .
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-subtle">
          <span className="inline-flex items-center rounded-full bg-ok-bg px-2.5 py-1 text-[11px] font-semibold text-ok">
            Created {formatDateTime(rc.createdAt)}
          </span>
          {rc.sentAt && <span>Sent {formatDateTime(rc.sentAt)}</span>}
          {rc.acceptedAt && <span>Accepted {formatDateTime(rc.acceptedAt)}</span>}
          {rc.completedAt && <span>Completed {formatDateTime(rc.completedAt)}</span>}
        </div>

        <FormError message={saveError} />
        <FormError message={actionError} />

        <div className="mt-3 flex flex-wrap gap-2">
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
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Card>
          <SectionDivider
            label="Carrier"
            hint="Independent of the shipment — edits here don't change the assigned carrier"
            right={
              !locked && !carrierPickerOpen ? (
                <button
                  type="button"
                  onClick={() => setCarrierPickerOpen(true)}
                  className="text-[11px] font-semibold text-accent underline underline-offset-2"
                >
                  {carrierId ? "Change" : "Pick from directory"}
                </button>
              ) : undefined
            }
          />
          <div className="flex flex-col gap-2 p-3">
            {!locked && (!carrierId || carrierPickerOpen) && (
              <AsyncSearchPicker<CrmCarrier>
                label="Search carrier directory"
                placeholder="Search by name, MC, or DOT…"
                search={listCarriers}
                getKey={(c) => c.id}
                onSelect={selectCarrier}
                renderOption={(c) => (
                  <>
                    <span className="font-medium">{titleCaseWords(c.name)}</span>
                    {c.mcNumber && <span className="ml-1.5 text-[11px] text-fg-subtle">MC {c.mcNumber}</span>}
                  </>
                )}
              />
            )}
            {carrierId && (
              <SelectedEntityChip
                title={titleCaseWords(state.carrierName || "Selected carrier")}
                detail={[state.carrierMc && `MC ${state.carrierMc}`, state.carrierPhone].filter(Boolean).join(" · ") || null}
                onChange={locked ? undefined : () => setCarrierPickerOpen(true)}
                onReset={resetCarrier}
              />
            )}
            <TextRow
              label="Carrier name"
              value={state.carrierName}
              onChange={(v) => setCarrierField("carrierName", v)}
              onBlur={() => commit({ carrierName: orNull(state.carrierName) })}
              highlight={carrierAutoFill?.has("carrierName")}
            />
            <FormRow3>
              <TextRow
                label="MC #"
                value={state.carrierMc}
                onChange={(v) => setCarrierField("carrierMc", v)}
                onBlur={() => commit({ carrierMc: orNull(state.carrierMc) })}
                highlight={carrierAutoFill?.has("carrierMc")}
              />
              <TextRow
                label="DOT #"
                value={state.carrierDot}
                onChange={(v) => setCarrierField("carrierDot", v)}
                onBlur={() => commit({ carrierDot: orNull(state.carrierDot) })}
                highlight={carrierAutoFill?.has("carrierDot")}
              />
              <TextRow
                label="Contact"
                value={state.carrierContact}
                onChange={(v) => setCarrierField("carrierContact", v)}
                onBlur={() => {
                  const formatted = titleCaseWords(state.carrierContact);
                  setCarrierField("carrierContact", formatted);
                  commit({ carrierContact: orNull(formatted) });
                }}
                highlight={carrierAutoFill?.has("carrierContact")}
              />
            </FormRow3>
            <FormRow2>
              <TextRow
                label="Phone"
                value={state.carrierPhone}
                onChange={(v) => setCarrierField("carrierPhone", v)}
                onBlur={() => {
                  const formatted = formatPhone(state.carrierPhone);
                  setCarrierField("carrierPhone", formatted);
                  commit({ carrierPhone: orNull(formatted) });
                }}
                highlight={carrierAutoFill?.has("carrierPhone")}
              />
              <TextRow
                label="Email"
                value={state.carrierEmail}
                onChange={(v) => setCarrierField("carrierEmail", v)}
                onBlur={() => commit({ carrierEmail: orNull(state.carrierEmail) })}
                highlight={carrierAutoFill?.has("carrierEmail")}
              />
            </FormRow2>
            <FormRow2>
              <TextRow
                label="Truck #"
                value={truckNumber}
                onChange={setTruckNumber}
                onBlur={() => commitShipmentField("truckNumber", truckNumber)}
              />
              <TextRow
                label="Trailer #"
                value={trailerNumber}
                onChange={setTrailerNumber}
                onBlur={() => commitShipmentField("trailerNumber", trailerNumber)}
              />
            </FormRow2>
            <FmcsaLookupBox mc={state.carrierMc} dot={state.carrierDot} />
          </div>
          </Card>

          {hasPdf && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={openPreview}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_SUCCESS}`}
              >
                View PDF
              </button>
              <button
                type="button"
                onClick={download}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_EDIT}`}
              >
                Download PDF
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Card>
            <SectionDivider label="Payment" />
            <div className="flex flex-col gap-2 p-3">
              <FormRow2>
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
              </FormRow2>
              <TextAreaRow
                label="Notes"
                value={state.notes}
                onChange={(v) => set("notes", v)}
                onBlur={() => commit({ notes: orNull(state.notes) })}
                rows={3}
              />
            </div>

            <SectionDivider label="Carrier pay line items" hint="Total is computed server-side" />
            <FormError message={lineError} />
            <ul className={`divide-y divide-line ${ZEBRA_ROWS}`}>
              {lines.map((line) => (
                <li key={line.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <input
                    type="text"
                    value={line.label}
                    onChange={(e) => setLineField(line.id, "label", e.target.value)}
                    onBlur={() => commitLine(line.id, line.label, line.amount)}
                    className="h-8 min-w-0 flex-1 rounded-[5px] border border-fg-subtle bg-card px-2.5 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12.5px]"
                    placeholder="Line label"
                  />
                  <div className="relative w-32 shrink-0">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-fg-subtle">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(e) => setLineField(line.id, "amount", e.target.value)}
                      onBlur={() => commitLine(line.id, line.label, line.amount)}
                      className="h-8 w-full rounded-[5px] border border-fg-subtle bg-card pl-5 pr-2 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12.5px]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    disabled={linePending}
                    className={`shrink-0 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${BTN_DANGER}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
              <li className="flex flex-wrap items-center gap-2 bg-inset px-3 py-2">
                <input
                  type="text"
                  value={newLine.label}
                  onChange={(e) => setNewLine((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="New line label"
                  className="h-8 min-w-0 flex-1 rounded-[5px] border border-dashed border-fg-subtle bg-card px-2.5 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12.5px]"
                />
                <div className="relative w-32 shrink-0">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-fg-subtle">
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={newLine.amount}
                    onChange={(e) => setNewLine((prev) => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                    className="h-8 w-full rounded-[5px] border border-dashed border-fg-subtle bg-card pl-5 pr-2 text-[13px] font-medium text-fg outline-none focus:ring-1 focus:ring-accent/50 sm:h-[26px] sm:text-[12.5px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={addLine}
                  disabled={linePending || !newLine.label.trim()}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
                >
                  Add line
                </button>
              </li>
            </ul>
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-fg">Total carrier pay</span>
              <span className="font-mono text-[16px] font-bold text-fg">{formatMoney(rc.totalCarrierPay)}</span>
            </div>
          </Card>

          {!locked && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onGenerate}
                disabled={busy}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_ACTION}`}
              >
                {busyAction === "generate" ? "Generating…" : "Generate PDF"}
              </button>
              <button
                type="button"
                onClick={saveAllFields}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_EDIT}`}
              >
                Save Draft
              </button>
            </div>
          )}
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
    </div>
  );
}

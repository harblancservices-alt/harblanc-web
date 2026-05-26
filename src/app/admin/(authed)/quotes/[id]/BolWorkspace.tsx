"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  PreviewModal,
  type PreviewModalState,
} from "./PreviewModal";
import {
  buildBolPreview,
  generateBolDraft,
  sendBol,
  type BolEmailPreview,
} from "../bol-actions";

/**
 * Phase REBUILD-3 — Bill of Lading workspace.
 *
 * Sibling of FinalizedQuoteWorkspace. Same visual rhythm (compact freight
 * banded sections, thin zinc borders, restrained red accents) and same
 * preview/send choreography:
 *
 *   - Preview is gated by the same preconditions the server action
 *     enforces: commodity + a shipper anchor (company or address) +
 *     a consignee anchor.
 *   - A fingerprint of every BOL-affecting field is captured when the
 *     preview build succeeds; any subsequent edit flips the modal to
 *     "stale" and Send disables until rebuilt.
 *   - Send re-uses the persisted preview_* snapshot via the server
 *     action; preview-bytes == sent-bytes by construction.
 *
 * Four rendering phases:
 *
 *   no_sent_finalized_quote — finalized quote has not been sent. Blocked.
 *   ready_to_generate       — FQ sent, no BOL draft yet. Single CTA.
 *   draft                   — Editable composer with Preview + Send.
 *   sent                    — Read-only history view with "Generate revision".
 *
 * The BOL has no intake dependency of its own — the finalized_quote
 * already snapshot the intake when it was generated, so the BOL inherits
 * its scope from the sent FQ via generateBolDraft().
 *
 * Booleans on the BOL are strict (true/false), not tri-state — by the
 * time the operator is writing the BOL the answers are knowable. The
 * action's strictBool() resolves any non-"yes" value to false, so the
 * "" empty option in our selects safely round-trips as false.
 */

// ─── Shared shapes (also exported for the loader) ────────────────────────

export type BolDraftSnapshot = {
  id: string;
  bolNumber: string;
  recipientEmail: string;

  dispatchReference: string;
  issueDate: string;

  shipper: {
    company: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zip: string;
    pickupWindow: string;
    pickupInstructions: string;
  };

  consignee: {
    company: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zip: string;
    deliveryWindow: string;
    deliveryInstructions: string;
  };

  freight: {
    commodity: string;
    quantity: string;
    handlingUnitsType: string;
    lengthIn: string;
    widthIn: string;
    heightIn: string;
    weightLbs: string;
    nmfcCode: string;
    freightClass: string;
    hazmat: boolean;
    specialHandling: string;
  };

  ops: {
    driverAssistRequired: boolean;
    tarpRequired: boolean;
    permitsRequired: boolean;
    escortRequired: boolean;
    riggingRequired: boolean;
    appointmentRequired: boolean;
    specialInstructions: string;
  };

  dispatchNotes: string;

  previewBuiltAt: string | null;
  previewHtml: string | null;
  previewSubject: string | null;
  previewTo: string | null;
};

export type BolSentSnapshot = {
  id: string;
  bolNumber: string;
  sentAt: string;
  recipientEmail: string | null;
  dispatchReference: string | null;
  issueDate: string | null;
  previewHtml: string | null;
  previewSubject: string | null;
  resentFromId: string | null;
};

export type BolState =
  | { phase: "no_sent_finalized_quote" }
  | { phase: "ready_to_generate" }
  | { phase: "draft"; draft: BolDraftSnapshot }
  | { phase: "sent"; sent: BolSentSnapshot };

// ─── Helpers ─────────────────────────────────────────────────────────────

function isNextRedirect(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const digest = (e as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function fingerprint(state: ComposerState): string {
  return JSON.stringify({
    dispatchReference: state.dispatchReference,
    issueDate: state.issueDate,
    shipper: state.shipper,
    consignee: state.consignee,
    freight: state.freight,
    ops: state.ops,
    dispatchNotes: state.dispatchNotes,
  });
}

// ─── Composer state ──────────────────────────────────────────────────────

type ComposerState = {
  dispatchReference: string;
  issueDate: string;
  shipper: BolDraftSnapshot["shipper"];
  consignee: BolDraftSnapshot["consignee"];
  freight: BolDraftSnapshot["freight"];
  ops: BolDraftSnapshot["ops"];
  dispatchNotes: string;
};

function initialComposerState(draft: BolDraftSnapshot): ComposerState {
  return {
    dispatchReference: draft.dispatchReference,
    issueDate: draft.issueDate,
    shipper: { ...draft.shipper },
    consignee: { ...draft.consignee },
    freight: { ...draft.freight },
    ops: { ...draft.ops },
    dispatchNotes: draft.dispatchNotes,
  };
}

function buildFormData(bolId: string, s: ComposerState): FormData {
  const fd = new FormData();
  fd.append("bol_id", bolId);

  fd.append("dispatch_reference", s.dispatchReference);
  if (s.issueDate) fd.append("issue_date", s.issueDate);

  // Shipper
  fd.append("shipper_company", s.shipper.company);
  fd.append("shipper_contact_name", s.shipper.contactName);
  fd.append("shipper_contact_phone", s.shipper.contactPhone);
  fd.append("shipper_contact_email", s.shipper.contactEmail);
  fd.append("shipper_address_line1", s.shipper.addressLine1);
  fd.append("shipper_address_line2", s.shipper.addressLine2);
  fd.append("shipper_city", s.shipper.city);
  fd.append("shipper_state", s.shipper.state);
  fd.append("shipper_zip", s.shipper.zip);
  fd.append("pickup_window", s.shipper.pickupWindow);
  fd.append("pickup_instructions", s.shipper.pickupInstructions);

  // Consignee
  fd.append("consignee_company", s.consignee.company);
  fd.append("consignee_contact_name", s.consignee.contactName);
  fd.append("consignee_contact_phone", s.consignee.contactPhone);
  fd.append("consignee_contact_email", s.consignee.contactEmail);
  fd.append("consignee_address_line1", s.consignee.addressLine1);
  fd.append("consignee_address_line2", s.consignee.addressLine2);
  fd.append("consignee_city", s.consignee.city);
  fd.append("consignee_state", s.consignee.state);
  fd.append("consignee_zip", s.consignee.zip);
  fd.append("delivery_window", s.consignee.deliveryWindow);
  fd.append("delivery_instructions", s.consignee.deliveryInstructions);

  // Freight
  fd.append("commodity", s.freight.commodity);
  fd.append("quantity", s.freight.quantity);
  fd.append("handling_units_type", s.freight.handlingUnitsType);
  fd.append("length_in", s.freight.lengthIn);
  fd.append("width_in", s.freight.widthIn);
  fd.append("height_in", s.freight.heightIn);
  fd.append("weight_lbs", s.freight.weightLbs);
  fd.append("nmfc_code", s.freight.nmfcCode);
  fd.append("freight_class", s.freight.freightClass);
  fd.append("hazmat", s.freight.hazmat ? "yes" : "no");
  fd.append("special_handling", s.freight.specialHandling);

  // Ops
  fd.append(
    "driver_assist_required",
    s.ops.driverAssistRequired ? "yes" : "no",
  );
  fd.append("tarp_required", s.ops.tarpRequired ? "yes" : "no");
  fd.append("permits_required", s.ops.permitsRequired ? "yes" : "no");
  fd.append("escort_required", s.ops.escortRequired ? "yes" : "no");
  fd.append("rigging_required", s.ops.riggingRequired ? "yes" : "no");
  fd.append(
    "appointment_required",
    s.ops.appointmentRequired ? "yes" : "no",
  );
  fd.append("special_instructions", s.ops.specialInstructions);

  fd.append("dispatch_notes", s.dispatchNotes);

  return fd;
}

// ─── Top-level component ─────────────────────────────────────────────────

export function BolWorkspace({
  quoteRequestId,
  state,
}: {
  quoteRequestId: string;
  state: BolState;
}) {
  switch (state.phase) {
    case "no_sent_finalized_quote":
      return (
        <BlockedTab
          headline="Finalized quote hasn't been sent yet"
          body="The Bill of Lading is execution paperwork generated from a sent finalized quote. Open the Finalized quote tab and send the rate confirmation first."
        />
      );
    case "ready_to_generate":
      return <ReadyToGenerateTab quoteRequestId={quoteRequestId} />;
    case "draft":
      return (
        <DraftComposer
          quoteRequestId={quoteRequestId}
          draft={state.draft}
        />
      );
    case "sent":
      return (
        <SentHistoryTab
          quoteRequestId={quoteRequestId}
          sent={state.sent}
        />
      );
  }
}

// ─── Phase: blocked ──────────────────────────────────────────────────────

function BlockedTab({
  headline,
  body,
}: {
  headline: string;
  body: string;
}) {
  return (
    <section className="overflow-hidden rounded border border-zinc-400 border-l-4 border-l-red-600 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-400 bg-white px-4 py-2.5 sm:px-5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-black">
          Bill of lading
        </h2>
        <p className="font-mono text-[11px] text-black">Blocked</p>
      </div>
      <div className="px-4 py-6 sm:px-5">
        <p className="text-sm font-semibold text-black">{headline}</p>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-black">
          {body}
        </p>
      </div>
    </section>
  );
}

// ─── Phase: ready_to_generate ────────────────────────────────────────────

function ReadyToGenerateTab({
  quoteRequestId,
}: {
  quoteRequestId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateBolDraft(quoteRequestId);
        if (!result.ok) {
          setError(result.reason);
          return;
        }
        router.refresh();
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        setError(
          e instanceof Error ? e.message : "Unknown error generating BOL draft",
        );
      }
    });
  }

  return (
    <section className="overflow-hidden rounded border border-zinc-400 border-l-4 border-l-red-600 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-400 bg-white px-4 py-2.5 sm:px-5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-black">
          Bill of lading
        </h2>
        <p className="font-mono text-[11px] text-black">Ready to generate</p>
      </div>
      <div className="px-4 py-6 sm:px-5">
        <p className="text-sm font-semibold text-black">
          Finalized quote sent &mdash; ready to draft the BOL.
        </p>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-black">
          Generating opens a draft prefilled from the sent finalized quote
          (shipper, consignee, freight, operational handling). Dispatch
          fills in execution-specific fields (NMFC, class, references,
          driver notes) before previewing and sending.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onGenerate}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 border border-red-700 bg-red-600 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Generating…" : "Generate BOL"}
          </button>
          {error ? (
            <p className="font-mono text-[11px] text-red-700">{error}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ─── Phase: draft (composer) ─────────────────────────────────────────────

function DraftComposer({
  quoteRequestId,
  draft,
}: {
  quoteRequestId: string;
  draft: BolDraftSnapshot;
}) {
  const [composer, setComposer] = useState<ComposerState>(() =>
    initialComposerState(draft),
  );

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewModalState>(
    draft.previewBuiltAt ? "ready" : "building",
  );
  const [previewData, setPreviewData] = useState<BolEmailPreview | null>(() =>
    draft.previewBuiltAt &&
    draft.previewHtml &&
    draft.previewSubject &&
    draft.previewTo
      ? {
          to: draft.previewTo,
          from: "",
          replyTo: "",
          subject: draft.previewSubject,
          preheader: "",
          html: draft.previewHtml,
          text: "",
        }
      : null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);

  const initialFingerprint = useMemo(
    () => fingerprint(initialComposerState(draft)),
    [draft],
  );
  const [buildFingerprint, setBuildFingerprint] = useState<string | null>(
    draft.previewBuiltAt ? initialFingerprint : null,
  );

  const [isBuildPending, startBuild] = useTransition();
  const [isSendPending, startSend] = useTransition();

  // Build precondition — mirrors the server action's preflight in
  // bol-actions.ts::buildBolPreview. Operator sees exactly why Preview
  // is gated in the status line.
  const hasCommodity = composer.freight.commodity.trim().length > 0;
  const hasShipper =
    composer.shipper.company.trim().length > 0 ||
    composer.shipper.addressLine1.trim().length > 0;
  const hasConsignee =
    composer.consignee.company.trim().length > 0 ||
    composer.consignee.addressLine1.trim().length > 0;
  const canBuild = hasCommodity && hasShipper && hasConsignee;
  const buildBlockedReason = canBuild
    ? null
    : !hasCommodity
      ? "Commodity required"
      : !hasShipper
        ? "Shipper info required"
        : "Consignee info required";

  const currentFingerprint = fingerprint(composer);
  const isStale =
    buildFingerprint !== null &&
    currentFingerprint !== buildFingerprint &&
    !isBuildPending;
  const effectivePreviewState: PreviewModalState =
    isStale && previewState === "ready" ? "stale" : previewState;

  // patch helpers
  function patchTop<K extends keyof ComposerState>(
    key: K,
    value: ComposerState[K],
  ) {
    setComposer((prev) => ({ ...prev, [key]: value }));
  }
  function patchShipper(
    field: keyof BolDraftSnapshot["shipper"],
    value: string,
  ) {
    setComposer((prev) => ({
      ...prev,
      shipper: { ...prev.shipper, [field]: value },
    }));
  }
  function patchConsignee(
    field: keyof BolDraftSnapshot["consignee"],
    value: string,
  ) {
    setComposer((prev) => ({
      ...prev,
      consignee: { ...prev.consignee, [field]: value },
    }));
  }
  function patchFreight<K extends keyof BolDraftSnapshot["freight"]>(
    field: K,
    value: BolDraftSnapshot["freight"][K],
  ) {
    setComposer((prev) => ({
      ...prev,
      freight: { ...prev.freight, [field]: value },
    }));
  }
  function patchOps<K extends keyof BolDraftSnapshot["ops"]>(
    field: K,
    value: BolDraftSnapshot["ops"][K],
  ) {
    setComposer((prev) => ({
      ...prev,
      ops: { ...prev.ops, [field]: value },
    }));
  }

  function runBuildPreview() {
    if (!canBuild) return;

    if (
      previewData &&
      effectivePreviewState === "ready" &&
      !isBuildPending
    ) {
      setPreviewOpen(true);
      return;
    }
    runRebuildPreview();
  }

  function runRebuildPreview() {
    if (!canBuild) return;

    const alreadyOpen = previewOpen;
    setPreviewOpen(true);
    setPreviewState(alreadyOpen && previewData ? "rebuilding" : "building");
    setPreviewError(null);

    const fd = buildFormData(draft.id, composer);
    const snapshotFingerprint = currentFingerprint;

    startBuild(async () => {
      try {
        const result = await buildBolPreview(fd);
        setPreviewData(result);
        setBuildFingerprint(snapshotFingerprint);
        setPreviewState("ready");
        setPreviewError(null);
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        setPreviewState("failed");
        setPreviewError(
          e instanceof Error ? e.message : "Unknown error building BOL preview",
        );
      }
    });
  }

  function runSend() {
    if (previewState !== "ready") return;
    if (
      !confirm(
        "Send Bill of Lading to the customer? The persisted preview bytes ship verbatim.",
      )
    ) {
      return;
    }
    startSend(async () => {
      try {
        await sendBol(draft.id);
        setPreviewOpen(false);
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        setPreviewState("failed");
        setPreviewError(
          e instanceof Error ? e.message : "Unknown error sending BOL",
        );
      }
    });
  }

  function closePreview() {
    if (isSendPending) return;
    setPreviewOpen(false);
  }

  void quoteRequestId;

  return (
    <section className="overflow-hidden rounded border border-zinc-400 border-l-4 border-l-red-600 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-400 bg-white px-4 py-2.5 sm:px-5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-black">
          Bill of lading
        </h2>
        <p className="font-mono text-[11px] text-black">
          {draft.bolNumber} &middot; Draft &middot; not sent
        </p>
      </div>

      {/* ── Identifiers ─────────────────────────────────────────────── */}
      <SectionBanner title="Identifiers" />
      <FieldRow label="Dispatch ref">
        <TextInput
          value={composer.dispatchReference}
          onChange={(v) => patchTop("dispatchReference", v)}
          placeholder="HS-XXXX-XXXX"
        />
      </FieldRow>
      <FieldRow label="Issue date">
        <DateInput
          value={composer.issueDate}
          onChange={(v) => patchTop("issueDate", v)}
        />
      </FieldRow>

      {/* ── Shipper ─────────────────────────────────────────────────── */}
      <SectionBanner title="Shipper" />
      <FieldRow label="Company" required>
        <TextInput
          value={composer.shipper.company}
          onChange={(v) => patchShipper("company", v)}
          autoFocus
        />
      </FieldRow>
      <FieldRow label="Contact name">
        <TextInput
          value={composer.shipper.contactName}
          onChange={(v) => patchShipper("contactName", v)}
        />
      </FieldRow>
      <FieldRow label="Contact phone">
        <TextInput
          value={composer.shipper.contactPhone}
          onChange={(v) => patchShipper("contactPhone", v)}
        />
      </FieldRow>
      <FieldRow label="Contact email">
        <TextInput
          value={composer.shipper.contactEmail}
          onChange={(v) => patchShipper("contactEmail", v)}
        />
      </FieldRow>
      <FieldRow label="Address line 1">
        <TextInput
          value={composer.shipper.addressLine1}
          onChange={(v) => patchShipper("addressLine1", v)}
        />
      </FieldRow>
      <FieldRow label="Address line 2">
        <TextInput
          value={composer.shipper.addressLine2}
          onChange={(v) => patchShipper("addressLine2", v)}
        />
      </FieldRow>
      <FieldRow label="City">
        <TextInput
          value={composer.shipper.city}
          onChange={(v) => patchShipper("city", v)}
        />
      </FieldRow>
      <FieldRow label="State">
        <TextInput
          value={composer.shipper.state}
          onChange={(v) => patchShipper("state", v)}
        />
      </FieldRow>
      <FieldRow label="ZIP">
        <TextInput
          value={composer.shipper.zip}
          onChange={(v) => patchShipper("zip", v)}
        />
      </FieldRow>
      <FieldRow label="Pickup window">
        <TextInput
          value={composer.shipper.pickupWindow}
          onChange={(v) => patchShipper("pickupWindow", v)}
          placeholder="Mon 6/9 0800–1200"
        />
      </FieldRow>
      <FieldRow label="Pickup notes" align="start">
        <textarea
          value={composer.shipper.pickupInstructions}
          onChange={(e) =>
            patchShipper("pickupInstructions", e.target.value)
          }
          rows={2}
          placeholder="Gate code, dock door, check-in protocol, etc."
          className="block w-full resize-y border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder:text-zinc-400 focus:border-red-600 focus:outline-none"
        />
      </FieldRow>

      {/* ── Consignee ──────────────────────────────────────────────── */}
      <SectionBanner title="Consignee" />
      <FieldRow label="Company" required>
        <TextInput
          value={composer.consignee.company}
          onChange={(v) => patchConsignee("company", v)}
        />
      </FieldRow>
      <FieldRow label="Contact name">
        <TextInput
          value={composer.consignee.contactName}
          onChange={(v) => patchConsignee("contactName", v)}
        />
      </FieldRow>
      <FieldRow label="Contact phone">
        <TextInput
          value={composer.consignee.contactPhone}
          onChange={(v) => patchConsignee("contactPhone", v)}
        />
      </FieldRow>
      <FieldRow label="Contact email">
        <TextInput
          value={composer.consignee.contactEmail}
          onChange={(v) => patchConsignee("contactEmail", v)}
        />
      </FieldRow>
      <FieldRow label="Address line 1">
        <TextInput
          value={composer.consignee.addressLine1}
          onChange={(v) => patchConsignee("addressLine1", v)}
        />
      </FieldRow>
      <FieldRow label="Address line 2">
        <TextInput
          value={composer.consignee.addressLine2}
          onChange={(v) => patchConsignee("addressLine2", v)}
        />
      </FieldRow>
      <FieldRow label="City">
        <TextInput
          value={composer.consignee.city}
          onChange={(v) => patchConsignee("city", v)}
        />
      </FieldRow>
      <FieldRow label="State">
        <TextInput
          value={composer.consignee.state}
          onChange={(v) => patchConsignee("state", v)}
        />
      </FieldRow>
      <FieldRow label="ZIP">
        <TextInput
          value={composer.consignee.zip}
          onChange={(v) => patchConsignee("zip", v)}
        />
      </FieldRow>
      <FieldRow label="Delivery window">
        <TextInput
          value={composer.consignee.deliveryWindow}
          onChange={(v) => patchConsignee("deliveryWindow", v)}
          placeholder="Wed 6/11 1300–1700"
        />
      </FieldRow>
      <FieldRow label="Delivery notes" align="start">
        <textarea
          value={composer.consignee.deliveryInstructions}
          onChange={(e) =>
            patchConsignee("deliveryInstructions", e.target.value)
          }
          rows={2}
          placeholder="Receiving hours, dock #, signage, etc."
          className="block w-full resize-y border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder:text-zinc-400 focus:border-red-600 focus:outline-none"
        />
      </FieldRow>

      {/* ── Freight ──────────────────────────────────────────────── */}
      <SectionBanner title="Freight" />
      <FieldRow label="Commodity" required>
        <TextInput
          value={composer.freight.commodity}
          onChange={(v) => patchFreight("commodity", v)}
        />
      </FieldRow>
      <FieldRow label="Pieces">
        <NumberInput
          value={composer.freight.quantity}
          onChange={(v) => patchFreight("quantity", v)}
          suffix="pcs"
          placeholder="1"
        />
      </FieldRow>
      <FieldRow label="Handling units">
        <SelectInput
          value={composer.freight.handlingUnitsType}
          onChange={(v) => patchFreight("handlingUnitsType", v)}
          options={[
            { value: "", label: "—" },
            { value: "Skids", label: "Skids" },
            { value: "Crates", label: "Crates" },
            { value: "Pallets", label: "Pallets" },
            { value: "Pieces", label: "Pieces" },
            { value: "Drums", label: "Drums" },
            { value: "Bundles", label: "Bundles" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Dimensions">
        <div className="grid grid-cols-[minmax(0,1fr)_12px_minmax(0,1fr)_12px_minmax(0,1fr)] items-center gap-1.5">
          <NumberInput
            value={composer.freight.lengthIn}
            onChange={(v) => patchFreight("lengthIn", v)}
            suffix="L"
            placeholder="0"
          />
          <span aria-hidden className="text-center font-mono text-sm text-black">
            ×
          </span>
          <NumberInput
            value={composer.freight.widthIn}
            onChange={(v) => patchFreight("widthIn", v)}
            suffix="W"
            placeholder="0"
          />
          <span aria-hidden className="text-center font-mono text-sm text-black">
            ×
          </span>
          <NumberInput
            value={composer.freight.heightIn}
            onChange={(v) => patchFreight("heightIn", v)}
            suffix="H"
            placeholder="0"
          />
        </div>
      </FieldRow>
      <FieldRow label="Weight">
        <NumberInput
          value={composer.freight.weightLbs}
          onChange={(v) => patchFreight("weightLbs", v)}
          suffix="lbs"
          placeholder="0"
        />
      </FieldRow>
      <FieldRow label="NMFC">
        <TextInput
          value={composer.freight.nmfcCode}
          onChange={(v) => patchFreight("nmfcCode", v)}
          placeholder="e.g. 156600-04"
        />
      </FieldRow>
      <FieldRow label="Freight class">
        <SelectInput
          value={composer.freight.freightClass}
          onChange={(v) => patchFreight("freightClass", v)}
          options={[
            { value: "", label: "—" },
            { value: "50", label: "50" },
            { value: "55", label: "55" },
            { value: "60", label: "60" },
            { value: "65", label: "65" },
            { value: "70", label: "70" },
            { value: "77.5", label: "77.5" },
            { value: "85", label: "85" },
            { value: "92.5", label: "92.5" },
            { value: "100", label: "100" },
            { value: "110", label: "110" },
            { value: "125", label: "125" },
            { value: "150", label: "150" },
            { value: "175", label: "175" },
            { value: "200", label: "200" },
            { value: "250", label: "250" },
            { value: "300", label: "300" },
            { value: "400", label: "400" },
            { value: "500", label: "500" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Hazmat">
        <BoolSelect
          value={composer.freight.hazmat}
          onChange={(v) => patchFreight("hazmat", v)}
        />
      </FieldRow>
      <FieldRow label="Special handling" align="start">
        <textarea
          value={composer.freight.specialHandling}
          onChange={(e) => patchFreight("specialHandling", e.target.value)}
          rows={2}
          placeholder="Securement, this side up, do not stack, etc."
          className="block w-full resize-y border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder:text-zinc-400 focus:border-red-600 focus:outline-none"
        />
      </FieldRow>

      {/* ── Operations ──────────────────────────────────────────────── */}
      <SectionBanner title="Operations" />
      <FieldRow label="Driver assist">
        <BoolSelect
          value={composer.ops.driverAssistRequired}
          onChange={(v) => patchOps("driverAssistRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Tarp required">
        <BoolSelect
          value={composer.ops.tarpRequired}
          onChange={(v) => patchOps("tarpRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Permits">
        <BoolSelect
          value={composer.ops.permitsRequired}
          onChange={(v) => patchOps("permitsRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Escort">
        <BoolSelect
          value={composer.ops.escortRequired}
          onChange={(v) => patchOps("escortRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Rigging">
        <BoolSelect
          value={composer.ops.riggingRequired}
          onChange={(v) => patchOps("riggingRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Appointment">
        <BoolSelect
          value={composer.ops.appointmentRequired}
          onChange={(v) => patchOps("appointmentRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Special instructions" align="start">
        <textarea
          value={composer.ops.specialInstructions}
          onChange={(e) => patchOps("specialInstructions", e.target.value)}
          rows={2}
          placeholder="Anything the driver needs to know at pickup or delivery."
          className="block w-full resize-y border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder:text-zinc-400 focus:border-red-600 focus:outline-none"
        />
      </FieldRow>

      {/* ── Dispatch notes ────────────────────────────────────────── */}
      <SectionBanner title="Dispatch notes" />
      <FieldRow label="Notes" align="start">
        <textarea
          value={composer.dispatchNotes}
          onChange={(e) => patchTop("dispatchNotes", e.target.value)}
          rows={3}
          placeholder="Anything else the BOL paperwork should carry."
          className="block w-full resize-y border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder:text-zinc-400 focus:border-red-600 focus:outline-none"
        />
      </FieldRow>

      {/* ── Action footer ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-5">
        <p
          className={
            "font-mono text-[11px] sm:mr-auto " +
            (effectivePreviewState === "failed" && previewError
              ? "text-red-700"
              : "text-black")
          }
        >
          {buildBlockedReason
            ? buildBlockedReason
            : effectivePreviewState === "failed" && previewError
              ? `Preview failed — ${previewError}`
              : effectivePreviewState === "stale" && previewData
                ? "Preview is stale — rebuild before sending"
                : effectivePreviewState === "ready" && previewData
                  ? "Preview ready"
                  : isBuildPending
                    ? "Building preview…"
                    : ""}
        </p>
        <button
          type="button"
          onClick={runBuildPreview}
          disabled={!canBuild || isBuildPending}
          className="inline-flex items-center justify-center gap-2 border border-zinc-400 bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:border-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBuildPending
            ? "Building…"
            : effectivePreviewState === "stale"
              ? "Rebuild preview"
              : effectivePreviewState === "ready" && previewData
                ? "Open preview"
                : "Preview"}
        </button>
      </div>

      <PreviewModal
        open={previewOpen}
        onClose={closePreview}
        state={effectivePreviewState}
        html={previewData?.html ?? null}
        subject={previewData?.subject ?? null}
        to={previewData?.to ?? null}
        errorMessage={previewError}
        onRebuild={runRebuildPreview}
        onSend={runSend}
        sendPending={isSendPending}
      />
    </section>
  );
}

// ─── Phase: sent (history view) ──────────────────────────────────────────

function SentHistoryTab({
  quoteRequestId,
  sent,
}: {
  quoteRequestId: string;
  sent: BolSentSnapshot;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);

  function onGenerateRevision() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateBolDraft(quoteRequestId);
        if (!result.ok) {
          setError(result.reason);
          return;
        }
        router.refresh();
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        setError(
          e instanceof Error ? e.message : "Unknown error starting revision",
        );
      }
    });
  }

  const sentAtDisplay = useMemo(() => {
    const d = new Date(sent.sentAt);
    if (Number.isNaN(d.getTime())) return sent.sentAt;
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [sent.sentAt]);

  return (
    <section className="overflow-hidden rounded border border-zinc-400 border-l-4 border-l-red-600 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-400 bg-white px-4 py-2.5 sm:px-5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-black">
          Bill of lading
        </h2>
        <p className="font-mono text-[11px] text-black">
          {sent.bolNumber} &middot; Sent
        </p>
      </div>

      <div className="grid gap-3 px-4 py-4 sm:px-5">
        <SummaryRow label="Sent at" value={sentAtDisplay} />
        <SummaryRow label="Recipient" value={sent.recipientEmail ?? "—"} />
        <SummaryRow
          label="Dispatch ref"
          value={sent.dispatchReference ?? "—"}
        />
        <SummaryRow label="Issued" value={sent.issueDate ?? "—"} />
        {sent.resentFromId ? (
          <SummaryRow label="Resent from" value={sent.resentFromId} />
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-5">
        {error ? (
          <p className="font-mono text-[11px] text-red-700 sm:mr-auto">
            {error}
          </p>
        ) : (
          <p className="font-mono text-[11px] text-black sm:mr-auto">
            A revision opens a fresh BOL draft prefilled from the sent quote.
          </p>
        )}
        {sent.previewHtml ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center justify-center gap-2 border border-zinc-400 bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:border-red-600 hover:text-red-700"
          >
            View sent BOL
          </button>
        ) : null}
        {/* Phase 3A — on-demand BOL PDF download. The GET route renders
            a fresh Straight Bill of Lading PDF from current row state
            and streams it back with inline Content-Disposition so most
            browsers open it in a viewer tab (operator can print for
            the driver's clipboard packet or save for archive). Email
            send pipeline is intentionally untouched. */}
        <a
          href={`/admin/quotes/${quoteRequestId}/bol-pdf/${sent.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 border border-zinc-400 bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:border-red-600 hover:text-red-700"
        >
          Download PDF
        </a>
        <button
          type="button"
          onClick={onGenerateRevision}
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 border border-red-700 bg-red-600 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Starting…" : "Generate revision"}
        </button>
      </div>

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        state="ready"
        html={sent.previewHtml}
        subject={sent.previewSubject}
        to={sent.recipientEmail}
        errorMessage={null}
        onRebuild={() => setPreviewOpen(false)}
      />
    </section>
  );
}

// ─── Shared chrome (mirrors QuoteRangeWorkspace / FinalizedQuoteWorkspace) ─

function SectionBanner({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-y border-zinc-400 bg-white px-4 pt-3 pb-2 sm:px-5">
      <span
        aria-hidden
        className="inline-block h-[14px] w-1 shrink-0 bg-red-600"
      />
      <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-black">
        {title}
      </p>
    </div>
  );
}

function FieldRow({
  label,
  required,
  align = "center",
  children,
}: {
  label: string;
  required?: boolean;
  align?: "center" | "start";
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        "grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-zinc-300 px-4 py-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:px-5 " +
        (align === "start" ? "items-start" : "items-center")
      }
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-[14px] w-[3px] shrink-0 bg-zinc-600"
        />
        <span className="text-xs text-black">
          {label}
          {required ? <span className="ml-1 text-red-600">*</span> : null}
        </span>
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      autoComplete="off"
      className="block w-full border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder:text-zinc-400 focus:border-red-600 focus:outline-none"
    />
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center border border-zinc-300 bg-white focus-within:border-red-600">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="min-w-0 flex-1 border-none bg-transparent py-1.5 pl-2.5 font-mono text-sm font-medium text-black tabular-nums placeholder:text-zinc-400 focus:outline-none"
      />
      {suffix ? (
        <span className="px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-700">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-sm font-medium text-black focus:border-red-600 focus:outline-none"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-black focus:border-red-600 focus:outline-none"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function BoolSelect({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <select
      value={value ? "yes" : "no"}
      onChange={(e) => onChange(e.target.value === "yes")}
      className="block w-full max-w-[180px] border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-black focus:border-red-600 focus:outline-none"
    >
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-baseline gap-3">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-700">
        {label}
      </span>
      <span className="text-sm text-black">{value}</span>
    </div>
  );
}

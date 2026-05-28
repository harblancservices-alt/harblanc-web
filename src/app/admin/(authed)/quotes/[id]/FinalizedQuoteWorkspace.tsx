"use client";

import { advanceOnEnter } from "@/lib/admin/form-utils";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { IconPlus, IconX } from "./icons";
import {
  PreviewModal,
  type PreviewModalState,
} from "./PreviewModal";
import {
  buildFinalizedQuotePreview,
  generateFinalizedQuoteDraft,
  sendFinalizedQuote,
  type FinalizedQuoteEmailPreview,
} from "../finalized-quote-actions";

/**
 * Phase REBUILD-3 — Finalized Quote Workspace.
 *
 * Sibling of QuoteRangeWorkspace. Same visual rhythm (compact freight/TMS
 * banded sections, thin zinc borders, restrained red accents) and the
 * same preview/send choreography:
 *
 *   - Preview is gated until linehaul > 0.
 *   - A fingerprint of every rate-affecting field is captured when the
 *     preview build succeeds; any subsequent edit flips the modal to
 *     "stale" and the Send button disables until rebuilt.
 *   - Send re-uses the persisted preview_* snapshot via the server
 *     action; preview-bytes == sent-bytes by construction.
 *
 * The component carries five rendering phases driven by the parent:
 *
 *   no_sent_estimate     — Quote Range has not been sent. Blocked.
 *   intake_not_submitted — Estimate sent, intake still pending. Blocked.
 *   ready_to_generate    — Intake submitted, no draft yet. Single CTA.
 *   draft                — Editable composer with Preview + Send.
 *   sent                 — Read-only history view with "Generate revision".
 *
 * The composer mirrors the field set finalized-quote-actions.ts knows
 * how to consume — the action expects accessorial_label[] /
 * accessorial_amount[] form entries, tri-state "yes"/"no"/"" for the
 * operations booleans, plain text for everything else. We serialize the
 * controlled React state into a FormData at preview time.
 */

// ─── Shared shapes (also exported for the loader) ────────────────────────

export type FinalizedAccessorialSnapshot = {
  label: string;
  amount: number;
};

export type FinalizedQuoteDraftSnapshot = {
  id: string;
  finalizedQuoteNumber: string;
  recipientEmail: string;

  expirationAt: string | null;
  paymentDueAt: string | null;

  pickup: {
    company: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zip: string;
    window: string;
    loadingHours: string;
  };

  delivery: {
    company: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zip: string;
    window: string;
    receivingHours: string;
  };

  freight: {
    commodity: string;
    lengthIn: string;
    widthIn: string;
    heightIn: string;
    exactWeightLbs: string;
    quantity: string;
    handlingType: string;
    runningCondition: string;
    securementRequirements: string;
  };

  ops: {
    forkliftAvailable: TriState;
    driverAssistRequired: TriState;
    craneRequired: TriState;
    permitsRequired: TriState;
    escortRequired: TriState;
    tarpRequired: TriState;
    specialInstructions: string;
  };

  pricing: {
    linehaul: string;
    fuelSurcharge: string;
    permitsFee: string;
    accessorials: FinalizedAccessorialSnapshot[];
  };

  // Preview snapshot — when previewBuiltAt is set the modal can hydrate
  // straight to "ready" without a server round-trip on first open.
  previewBuiltAt: string | null;
  previewHtml: string | null;
  previewSubject: string | null;
  previewTo: string | null;
};

export type FinalizedQuoteSentSnapshot = {
  id: string;
  finalizedQuoteNumber: string;
  totalAmount: number | null;
  sentAt: string;
  recipientEmail: string | null;
  expirationAt: string | null;
  paymentDueAt: string | null;
  previewHtml: string | null;
  previewSubject: string | null;
  resentFromId: string | null;
  /** Phase 2B — non-null when the customer clicked the Confirm
   *  Finalized Quote button on /quote/confirm/[token] and the server
   *  action stamped the row. The workspace renders a "Confirmed"
   *  badge + the timestamp when this is set. */
  confirmedAt: string | null;
};

export type FinalizedQuoteState =
  | { phase: "no_sent_estimate" }
  | { phase: "intake_not_submitted"; intakeStatus: "in_progress" | "missing" }
  | { phase: "ready_to_generate" }
  | { phase: "draft"; draft: FinalizedQuoteDraftSnapshot }
  | { phase: "sent"; sent: FinalizedQuoteSentSnapshot };

type TriState = "" | "yes" | "no";

// ─── Helpers ─────────────────────────────────────────────────────────────

function isNextRedirect(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const digest = (e as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function toNumber(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function newAccessorialId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function fingerprint(fields: ComposerState): string {
  return JSON.stringify({
    expiration: fields.expirationAt,
    paymentDue: fields.paymentDueAt,

    pickup: fields.pickup,
    delivery: fields.delivery,
    freight: fields.freight,
    ops: fields.ops,

    pricing: {
      linehaul: toNumber(fields.linehaul),
      fuel: toNumber(fields.fuelSurcharge),
      permits: toNumber(fields.permitsFee),
      acc: fields.accessorials.map((a) => ({
        label: a.label.trim(),
        amount: toNumber(a.amount),
      })),
    },
  });
}

// ─── Composer state (string-keyed for inputs) ────────────────────────────

type AccessorialDraft = { id: string; label: string; amount: string };

type ComposerState = {
  expirationAt: string;
  paymentDueAt: string;

  pickup: FinalizedQuoteDraftSnapshot["pickup"];
  delivery: FinalizedQuoteDraftSnapshot["delivery"];
  freight: FinalizedQuoteDraftSnapshot["freight"];
  ops: FinalizedQuoteDraftSnapshot["ops"];

  linehaul: string;
  fuelSurcharge: string;
  permitsFee: string;
  accessorials: AccessorialDraft[];
};

function initialComposerState(draft: FinalizedQuoteDraftSnapshot): ComposerState {
  return {
    expirationAt: draft.expirationAt ?? "",
    paymentDueAt: draft.paymentDueAt ?? "",
    pickup: { ...draft.pickup },
    delivery: { ...draft.delivery },
    freight: { ...draft.freight },
    ops: { ...draft.ops },
    linehaul: draft.pricing.linehaul,
    fuelSurcharge: draft.pricing.fuelSurcharge,
    permitsFee: draft.pricing.permitsFee,
    accessorials: draft.pricing.accessorials.map((a) => ({
      id: newAccessorialId(),
      label: a.label,
      amount: a.amount === 0 ? "" : String(a.amount),
    })),
  };
}

function buildFormData(
  finalizedQuoteId: string,
  s: ComposerState,
): FormData {
  const fd = new FormData();
  fd.append("finalized_quote_id", finalizedQuoteId);

  if (s.expirationAt) fd.append("expiration_at", s.expirationAt);
  if (s.paymentDueAt) fd.append("payment_due_at", s.paymentDueAt);

  // Pickup
  fd.append("pickup_company", s.pickup.company);
  fd.append("pickup_contact_name", s.pickup.contactName);
  fd.append("pickup_contact_phone", s.pickup.contactPhone);
  fd.append("pickup_contact_email", s.pickup.contactEmail);
  fd.append("pickup_address_line1", s.pickup.addressLine1);
  fd.append("pickup_address_line2", s.pickup.addressLine2);
  fd.append("pickup_city", s.pickup.city);
  fd.append("pickup_state", s.pickup.state);
  fd.append("pickup_zip", s.pickup.zip);
  fd.append("pickup_window", s.pickup.window);
  fd.append("pickup_loading_hours", s.pickup.loadingHours);

  // Delivery
  fd.append("delivery_company", s.delivery.company);
  fd.append("delivery_contact_name", s.delivery.contactName);
  fd.append("delivery_contact_phone", s.delivery.contactPhone);
  fd.append("delivery_contact_email", s.delivery.contactEmail);
  fd.append("delivery_address_line1", s.delivery.addressLine1);
  fd.append("delivery_address_line2", s.delivery.addressLine2);
  fd.append("delivery_city", s.delivery.city);
  fd.append("delivery_state", s.delivery.state);
  fd.append("delivery_zip", s.delivery.zip);
  fd.append("delivery_window", s.delivery.window);
  fd.append("delivery_receiving_hours", s.delivery.receivingHours);

  // Freight
  fd.append("commodity", s.freight.commodity);
  fd.append("length_in", s.freight.lengthIn);
  fd.append("width_in", s.freight.widthIn);
  fd.append("height_in", s.freight.heightIn);
  fd.append("exact_weight_lbs", s.freight.exactWeightLbs);
  fd.append("quantity", s.freight.quantity);
  fd.append("handling_type", s.freight.handlingType);
  fd.append("running_condition", s.freight.runningCondition);
  fd.append("securement_requirements", s.freight.securementRequirements);

  // Ops
  fd.append("forklift_available", s.ops.forkliftAvailable);
  fd.append("driver_assist_required", s.ops.driverAssistRequired);
  fd.append("crane_required", s.ops.craneRequired);
  fd.append("permits_required", s.ops.permitsRequired);
  fd.append("escort_required", s.ops.escortRequired);
  fd.append("tarp_required", s.ops.tarpRequired);
  fd.append("special_instructions", s.ops.specialInstructions);

  // Pricing
  if (s.linehaul.trim().length > 0) fd.append("linehaul", s.linehaul);
  if (s.fuelSurcharge.trim().length > 0)
    fd.append("fuel_surcharge", s.fuelSurcharge);
  if (s.permitsFee.trim().length > 0) fd.append("permits_fee", s.permitsFee);
  for (const a of s.accessorials) {
    const label = a.label.trim();
    const amount = toNumber(a.amount);
    if (label.length > 0 && amount > 0) {
      fd.append("accessorial_label", label);
      fd.append("accessorial_amount", String(amount));
    }
  }

  return fd;
}

// ─── Top-level component ─────────────────────────────────────────────────

/**
 * Build a synthetic empty FinalizedQuoteDraftSnapshot. Used when the
 * Finalized Quote tab is "blocked" (no sent range proposal yet, or
 * intake not yet submitted) so the DraftComposer can still render its
 * full form skeleton instead of a wall of text. The user sees the
 * paperwork layout, every input is non-interactive via fieldset
 * disabled, and the footer Preview / Send buttons are gated.
 *
 * No persistence target exists in the blocked state (no row to upsert
 * into), so the inputs cannot be edited. Once the prerequisite lands
 * the workspace switches to the real draft snapshot.
 */
function emptyFinalizedDraft(): FinalizedQuoteDraftSnapshot {
  return {
    id: "",
    finalizedQuoteNumber: "",
    recipientEmail: "",
    expirationAt: null,
    paymentDueAt: null,
    pickup: {
      company: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      zip: "",
      window: "",
      loadingHours: "",
    },
    delivery: {
      company: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      zip: "",
      window: "",
      receivingHours: "",
    },
    freight: {
      commodity: "",
      lengthIn: "",
      widthIn: "",
      heightIn: "",
      exactWeightLbs: "",
      quantity: "",
      handlingType: "",
      runningCondition: "",
      securementRequirements: "",
    },
    ops: {
      forkliftAvailable: "",
      driverAssistRequired: "",
      craneRequired: "",
      permitsRequired: "",
      escortRequired: "",
      tarpRequired: "",
      specialInstructions: "",
    },
    pricing: {
      linehaul: "",
      fuelSurcharge: "",
      permitsFee: "",
      accessorials: [],
    },
    previewBuiltAt: null,
    previewHtml: null,
    previewSubject: null,
    previewTo: null,
  };
}

export function FinalizedQuoteWorkspace({
  quoteRequestId,
  state,
}: {
  quoteRequestId: string;
  state: FinalizedQuoteState;
}) {
  switch (state.phase) {
    case "no_sent_estimate":
      return (
        <DraftComposer
          quoteRequestId={quoteRequestId}
          draft={emptyFinalizedDraft()}
          blocked={{
            label: "Blocked",
            reason: "No range proposal sent yet",
            detail:
              "The finalized quote prefills after the customer accepts a range proposal. Open the Quote range tab and send a proposal first.",
          }}
        />
      );
    case "intake_not_submitted":
      return (
        <DraftComposer
          quoteRequestId={quoteRequestId}
          draft={emptyFinalizedDraft()}
          blocked={{
            label: "Blocked",
            reason:
              state.intakeStatus === "in_progress"
                ? "Customer intake is still in progress"
                : "Awaiting customer intake",
            detail:
              "The finalized quote prefills from the customer\'s intake submission. It opens here as soon as the intake is submitted.",
          }}
        />
      );
    case "ready_to_generate":
      return (
        <ReadyToGenerateTab quoteRequestId={quoteRequestId} />
      );
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

// ─── Phase: blocked ───────────────────────────────────────────────────────


// ─── Phase: ready_to_generate ─────────────────────────────────────────────

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
        const result = await generateFinalizedQuoteDraft(quoteRequestId);
        if (!result.ok) {
          setError(result.reason);
          return;
        }
        router.refresh();
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        setError(
          e instanceof Error
            ? e.message
            : "Unknown error generating finalized quote draft",
        );
      }
    });
  }

  return (
    <section className="border-2 border-black border-l-4 border-l-red-700 bg-[#fafaf6]">
      <div className="flex items-center justify-between gap-3 border-b-2 border-black bg-[#f3f1e9] px-4 py-2.5 sm:px-5">
        <h2 className="font-mono text-[14px] font-bold uppercase tracking-[0.18em] text-black">
          Finalized quote
        </h2>
        <p className="font-mono text-[12px] text-black">Ready to generate</p>
      </div>
      <div className="px-4 py-6 sm:px-5">
        <p className="text-[15px] font-semibold text-black">
          Intake submitted &mdash; ready to generate the rate confirmation.
        </p>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-black">
          Generating opens a draft prefilled from the intake (pickup, delivery,
          freight, operational hints). Dispatch fills in the firm pricing,
          previews the document, and ships it to the customer.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onGenerate}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 border-0 bg-black px-5 py-2.5 font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-700"
          >
            {isPending ? "Generating…" : "Generate finalized quote"}
          </button>
          {error ? (
            <p className="font-mono text-[12px] text-red-700">{error}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ─── Phase: draft (composer) ──────────────────────────────────────────────

function DraftComposer({
  quoteRequestId,
  draft,
  blocked = null,
}: {
  quoteRequestId: string;
  draft: FinalizedQuoteDraftSnapshot;
  /**
   * When non-null, the composer renders its full form skeleton but
   * disables every input + button and stamps a "BLOCKED" indicator at
   * the top. Used for the no_sent_estimate and intake_not_submitted
   * phases so the operator can see what fields the workflow needs
   * without being able to type into a doomed draft (there is no row
   * to persist into when blocked).
   */
  blocked?: { label: string; reason: string; detail: string } | null;
}) {
  const [composer, setComposer] = useState<ComposerState>(() =>
    initialComposerState(draft),
  );

  // Modal / preview state.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewModalState>(
    draft.previewBuiltAt ? "ready" : "building",
  );
  const [previewData, setPreviewData] =
    useState<FinalizedQuoteEmailPreview | null>(() =>
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

  // Capture the fingerprint that produced the persisted preview so any
  // subsequent edit flips the modal to "stale". When the draft loads
  // without a pre-built preview we leave this null and the modal opens
  // fresh on first Preview click.
  const initialFingerprint = useMemo(
    () => fingerprint(initialComposerState(draft)),
    [draft],
  );
  const [buildFingerprint, setBuildFingerprint] = useState<string | null>(
    draft.previewBuiltAt ? initialFingerprint : null,
  );

  const [isBuildPending, startBuild] = useTransition();
  const [isSendPending, startSend] = useTransition();

  // Derived
  const linehaulNum = toNumber(composer.linehaul);
  const fuelNum = toNumber(composer.fuelSurcharge);
  const permitsNum = toNumber(composer.permitsFee);
  const accessorialsTotal = composer.accessorials.reduce(
    (sum, a) => sum + toNumber(a.amount),
    0,
  );
  const total = linehaulNum + fuelNum + permitsNum + accessorialsTotal;

  const canBuild = linehaulNum > 0;
  const buildBlockedReason = canBuild ? null : "Linehaul required";

  const currentFingerprint = fingerprint(composer);
  const isStale =
    buildFingerprint !== null &&
    currentFingerprint !== buildFingerprint &&
    !isBuildPending;
  const effectivePreviewState: PreviewModalState =
    isStale && previewState === "ready" ? "stale" : previewState;

  // ── helpers wired to setComposer ──────────────────────────────────────

  function patch<K extends keyof ComposerState>(
    key: K,
    value: ComposerState[K],
  ) {
    setComposer((prev) => ({ ...prev, [key]: value }));
  }

  function patchPickup(
    field: keyof FinalizedQuoteDraftSnapshot["pickup"],
    value: string,
  ) {
    setComposer((prev) => ({
      ...prev,
      pickup: { ...prev.pickup, [field]: value },
    }));
  }

  function patchDelivery(
    field: keyof FinalizedQuoteDraftSnapshot["delivery"],
    value: string,
  ) {
    setComposer((prev) => ({
      ...prev,
      delivery: { ...prev.delivery, [field]: value },
    }));
  }

  function patchFreight(
    field: keyof FinalizedQuoteDraftSnapshot["freight"],
    value: string,
  ) {
    setComposer((prev) => ({
      ...prev,
      freight: { ...prev.freight, [field]: value },
    }));
  }

  function patchOps(
    field: keyof FinalizedQuoteDraftSnapshot["ops"],
    value: string,
  ) {
    setComposer((prev) => ({
      ...prev,
      ops: { ...prev.ops, [field]: value },
    }));
  }

  function addAccessorial() {
    setComposer((prev) => ({
      ...prev,
      accessorials: [
        ...prev.accessorials,
        { id: newAccessorialId(), label: "", amount: "" },
      ],
    }));
  }

  function updateAccessorial(
    id: string,
    changes: Partial<AccessorialDraft>,
  ) {
    setComposer((prev) => ({
      ...prev,
      accessorials: prev.accessorials.map((a) =>
        a.id === id ? { ...a, ...changes } : a,
      ),
    }));
  }

  function removeAccessorial(id: string) {
    setComposer((prev) => ({
      ...prev,
      accessorials: prev.accessorials.filter((a) => a.id !== id),
    }));
  }

  // ── preview / send wiring ─────────────────────────────────────────────

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
        const result = await buildFinalizedQuotePreview(fd);
        setPreviewData(result);
        setBuildFingerprint(snapshotFingerprint);
        setPreviewState("ready");
        setPreviewError(null);
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        setPreviewState("failed");
        setPreviewError(
          e instanceof Error ? e.message : "Unknown error building preview",
        );
      }
    });
  }

  function runSend() {
    if (previewState !== "ready") return;
    if (
      !confirm(
        "Send finalized quote to the customer? The persisted preview bytes ship verbatim.",
      )
    ) {
      return;
    }
    startSend(async () => {
      try {
        await sendFinalizedQuote(draft.id);
        setPreviewOpen(false);
        // revalidatePath inside the action triggers a server re-render;
        // the loader returns "sent" phase on the next pass.
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        setPreviewState("failed");
        setPreviewError(
          e instanceof Error
            ? e.message
            : "Unknown error sending finalized quote",
        );
      }
    });
  }

  function closePreview() {
    if (isSendPending) return;
    setPreviewOpen(false);
  }

  void quoteRequestId; // available for future client-side use.

  // ── render ────────────────────────────────────────────────────────────

  return (
    <section className="border-2 border-black border-l-4 border-l-red-700 bg-[#fafaf6]">
      <div className="flex items-center justify-between gap-3 border-b-2 border-black bg-[#f3f1e9] px-4 py-2.5 sm:px-5">
        <h2 className="font-mono text-[14px] font-bold uppercase tracking-[0.18em] text-black">
          Finalized quote
        </h2>
        <p className="font-mono text-[12px] text-black">
          {blocked
            ? blocked.label
            : `${draft.finalizedQuoteNumber} \u00b7 Draft \u00b7 not sent`}
        </p>
      </div>

      {blocked ? (
        <div className="flex items-start gap-3 border-b border-black bg-[#fbeaea] px-4 py-3 sm:px-5">
          <span
            aria-hidden
            className="mt-0.5 inline-block h-4 w-1 shrink-0 bg-red-700"
          />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-red-700">
              {blocked.label} \u00b7 {blocked.reason}
            </p>
            <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-black">
              {blocked.detail}
            </p>
          </div>
        </div>
      ) : null}

      <fieldset
        disabled={blocked !== null}
        className="m-0 border-0 p-0 disabled:opacity-95"
      >

      {/* ── Pricing ─────────────────────────────────────────────────── */}
      <SectionBanner title="Pricing" />
      <FieldRow label="Linehaul" required>
        <CurrencyInput
          value={composer.linehaul}
          onChange={(v) => patch("linehaul", v)}
          placeholder="0.00"
          autoFocus
        />
      </FieldRow>
      <FieldRow label="Fuel surcharge">
        <CurrencyInput
          value={composer.fuelSurcharge}
          onChange={(v) => patch("fuelSurcharge", v)}
          placeholder="0.00"
        />
      </FieldRow>
      <FieldRow label="Permits fee">
        <CurrencyInput
          value={composer.permitsFee}
          onChange={(v) => patch("permitsFee", v)}
          placeholder="0.00"
        />
      </FieldRow>
      <div className="border-t border-zinc-300 px-4 py-2 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-[14px] w-[3px] shrink-0 bg-red-700"
            />
            <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-black">Accessorials</span>
          </span>
          <button
            type="button"
            onClick={addAccessorial}
            className="inline-flex items-center gap-1 border border-black bg-white px-2.5 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-black transition-colors hover:bg-[#f3f1e9]"
          >
            <IconPlus className="h-3 w-3" />
            Add line
          </button>
        </div>
        {composer.accessorials.length === 0 ? (
          <p className="mt-2 font-mono text-[12px] text-black">
            No accessorials. Add detention, lumper, tarp, etc. if applicable.
          </p>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {composer.accessorials.map((a) => (
              <li
                key={a.id}
                className="grid grid-cols-[1fr_100px_28px] items-center gap-1.5"
              >
                <input
                  type="text"
                  value={a.label}
                  onKeyDown={advanceOnEnter}
            onChange={(e) =>
                    updateAccessorial(a.id, { label: e.target.value })
                  }
                  placeholder="Detention, Lumper..."
                  className="border border-black bg-white px-2 py-1.5 text-[15px] text-black placeholder:text-zinc-700 focus:border-red-600 focus:outline-none"
                />
                <div className="flex items-center border border-black bg-white focus-within:border-red-700">
                  <span className="px-2 font-mono text-xs text-black">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={a.amount}
                    onKeyDown={advanceOnEnter}
            onChange={(e) =>
                      updateAccessorial(a.id, { amount: e.target.value })
                    }
                    placeholder="0.00"
                    className="min-w-0 flex-1 border-none bg-transparent py-1.5 pr-2 text-right font-mono text-[15px] font-medium text-black tabular-nums placeholder:text-zinc-700 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeAccessorial(a.id)}
                  aria-label={`Remove ${a.label || "accessorial"}`}
                  className="inline-flex h-7 w-7 items-center justify-center border border-zinc-300 bg-white text-black transition-colors hover:border-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Banded total — mirrors QuoteRangeWorkspace "Quoted total" card. */}
      <div className="border-t-[3px] border-double border-black bg-[#fafaf6] px-4 py-3 sm:px-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-black">
            Quoted total
          </span>
          <span className="font-mono text-3xl font-bold text-black tabular-nums">
            {formatUsd(total)}
          </span>
        </div>
        {accessorialsTotal > 0 ? (
          <p className="mt-1 text-right font-mono text-[12px] text-black">
            includes {formatUsd(accessorialsTotal)} accessorials
          </p>
        ) : null}
      </div>

      {/* ── Validity ────────────────────────────────────────────────── */}
      <SectionBanner title="Validity" />
      <FieldRow label="Expiration">
        <DateInput
          value={composer.expirationAt}
          onChange={(v) => patch("expirationAt", v)}
        />
      </FieldRow>
      <FieldRow label="Payment due">
        <DateInput
          value={composer.paymentDueAt}
          onChange={(v) => patch("paymentDueAt", v)}
        />
      </FieldRow>

      {/* ── Pickup ─────────────────────────────────────────────────── */}
      <SectionBanner title="Pickup" />
      <FieldRow label="Company">
        <TextInput
          value={composer.pickup.company}
          onChange={(v) => patchPickup("company", v)}
        />
      </FieldRow>
      <FieldRow label="Contact name">
        <TextInput
          value={composer.pickup.contactName}
          onChange={(v) => patchPickup("contactName", v)}
        />
      </FieldRow>
      <FieldRow label="Contact phone">
        <TextInput
          value={composer.pickup.contactPhone}
          onChange={(v) => patchPickup("contactPhone", v)}
        />
      </FieldRow>
      <FieldRow label="Contact email">
        <TextInput
          value={composer.pickup.contactEmail}
          onChange={(v) => patchPickup("contactEmail", v)}
        />
      </FieldRow>
      <FieldRow label="Address line 1">
        <TextInput
          value={composer.pickup.addressLine1}
          onChange={(v) => patchPickup("addressLine1", v)}
        />
      </FieldRow>
      <FieldRow label="Address line 2">
        <TextInput
          value={composer.pickup.addressLine2}
          onChange={(v) => patchPickup("addressLine2", v)}
        />
      </FieldRow>
      <FieldRow label="City">
        <TextInput
          value={composer.pickup.city}
          onChange={(v) => patchPickup("city", v)}
        />
      </FieldRow>
      <FieldRow label="State">
        <TextInput
          value={composer.pickup.state}
          onChange={(v) => patchPickup("state", v)}
        />
      </FieldRow>
      <FieldRow label="ZIP">
        <TextInput
          value={composer.pickup.zip}
          onChange={(v) => patchPickup("zip", v)}
        />
      </FieldRow>
      <FieldRow label="Window">
        <TextInput
          value={composer.pickup.window}
          onChange={(v) => patchPickup("window", v)}
          placeholder="Mon 6/9 0800–1200"
        />
      </FieldRow>
      <FieldRow label="Loading hours">
        <TextInput
          value={composer.pickup.loadingHours}
          onChange={(v) => patchPickup("loadingHours", v)}
          placeholder="Mon–Fri 0700–1500"
        />
      </FieldRow>

      {/* ── Delivery ──────────────────────────────────────────────── */}
      <SectionBanner title="Delivery" />
      <FieldRow label="Company">
        <TextInput
          value={composer.delivery.company}
          onChange={(v) => patchDelivery("company", v)}
        />
      </FieldRow>
      <FieldRow label="Contact name">
        <TextInput
          value={composer.delivery.contactName}
          onChange={(v) => patchDelivery("contactName", v)}
        />
      </FieldRow>
      <FieldRow label="Contact phone">
        <TextInput
          value={composer.delivery.contactPhone}
          onChange={(v) => patchDelivery("contactPhone", v)}
        />
      </FieldRow>
      <FieldRow label="Contact email">
        <TextInput
          value={composer.delivery.contactEmail}
          onChange={(v) => patchDelivery("contactEmail", v)}
        />
      </FieldRow>
      <FieldRow label="Address line 1">
        <TextInput
          value={composer.delivery.addressLine1}
          onChange={(v) => patchDelivery("addressLine1", v)}
        />
      </FieldRow>
      <FieldRow label="Address line 2">
        <TextInput
          value={composer.delivery.addressLine2}
          onChange={(v) => patchDelivery("addressLine2", v)}
        />
      </FieldRow>
      <FieldRow label="City">
        <TextInput
          value={composer.delivery.city}
          onChange={(v) => patchDelivery("city", v)}
        />
      </FieldRow>
      <FieldRow label="State">
        <TextInput
          value={composer.delivery.state}
          onChange={(v) => patchDelivery("state", v)}
        />
      </FieldRow>
      <FieldRow label="ZIP">
        <TextInput
          value={composer.delivery.zip}
          onChange={(v) => patchDelivery("zip", v)}
        />
      </FieldRow>
      <FieldRow label="Window">
        <TextInput
          value={composer.delivery.window}
          onChange={(v) => patchDelivery("window", v)}
          placeholder="Wed 6/11 1300–1700"
        />
      </FieldRow>
      <FieldRow label="Receiving hours">
        <TextInput
          value={composer.delivery.receivingHours}
          onChange={(v) => patchDelivery("receivingHours", v)}
          placeholder="Mon–Fri 0700–1500"
        />
      </FieldRow>

      {/* ── Freight ──────────────────────────────────────────────── */}
      <SectionBanner title="Freight" />
      <FieldRow label="Commodity">
        <TextInput
          value={composer.freight.commodity}
          onChange={(v) => patchFreight("commodity", v)}
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
          <span
            aria-hidden
            className="text-center font-mono text-[15px] text-black"
          >
            ×
          </span>
          <NumberInput
            value={composer.freight.widthIn}
            onChange={(v) => patchFreight("widthIn", v)}
            suffix="W"
            placeholder="0"
          />
          <span
            aria-hidden
            className="text-center font-mono text-[15px] text-black"
          >
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
      <FieldRow label="Exact weight">
        <NumberInput
          value={composer.freight.exactWeightLbs}
          onChange={(v) => patchFreight("exactWeightLbs", v)}
          suffix="lbs"
          placeholder="0"
        />
      </FieldRow>
      <FieldRow label="Quantity">
        <NumberInput
          value={composer.freight.quantity}
          onChange={(v) => patchFreight("quantity", v)}
          suffix="pcs"
          placeholder="1"
        />
      </FieldRow>
      <FieldRow label="Handling">
        <SelectInput
          value={composer.freight.handlingType}
          onChange={(v) => patchFreight("handlingType", v)}
          options={[
            { value: "", label: "—" },
            { value: "Crated", label: "Crated" },
            { value: "Skidded", label: "Skidded" },
            { value: "Loose", label: "Loose" },
            { value: "Banded", label: "Banded" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Running condition">
        <SelectInput
          value={composer.freight.runningCondition}
          onChange={(v) => patchFreight("runningCondition", v)}
          options={[
            { value: "", label: "—" },
            { value: "Running", label: "Running" },
            { value: "Non-running", label: "Non-running" },
            { value: "N/A", label: "N/A" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Securement" align="start">
        <textarea
          value={composer.freight.securementRequirements}
          onChange={(e) =>
            patchFreight("securementRequirements", e.target.value)
          }
          rows={2}
          placeholder="Strap pattern, edge protection, tarp spec, etc."
          className="block w-full resize-y border border-black bg-white px-2.5 py-1.5 text-[15px] text-black placeholder:text-zinc-700 focus:border-red-600 focus:outline-none"
        />
      </FieldRow>

      {/* ── Operations ──────────────────────────────────────────────── */}
      <SectionBanner title="Operations" />
      <FieldRow label="Forklift available">
        <TriStateSelect
          value={composer.ops.forkliftAvailable}
          onChange={(v) => patchOps("forkliftAvailable", v)}
        />
      </FieldRow>
      <FieldRow label="Driver assist">
        <TriStateSelect
          value={composer.ops.driverAssistRequired}
          onChange={(v) => patchOps("driverAssistRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Crane required">
        <TriStateSelect
          value={composer.ops.craneRequired}
          onChange={(v) => patchOps("craneRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Permits required">
        <TriStateSelect
          value={composer.ops.permitsRequired}
          onChange={(v) => patchOps("permitsRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Escort required">
        <TriStateSelect
          value={composer.ops.escortRequired}
          onChange={(v) => patchOps("escortRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Tarp required">
        <TriStateSelect
          value={composer.ops.tarpRequired}
          onChange={(v) => patchOps("tarpRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Special instructions" align="start">
        <textarea
          value={composer.ops.specialInstructions}
          onChange={(e) => patchOps("specialInstructions", e.target.value)}
          rows={3}
          placeholder="Dispatch notes that should appear on the rate confirmation."
          className="block w-full resize-y border border-black bg-white px-2.5 py-1.5 text-[15px] text-black placeholder:text-zinc-700 focus:border-red-600 focus:outline-none"
        />
      </FieldRow>

      {/* ── Action footer ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-5">
        <p
          className={
            "font-mono text-[12px] sm:mr-auto " +
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
          className="inline-flex items-center justify-center gap-2 border border-black bg-white px-4 py-2.5 font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-black transition-colors hover:bg-[#f3f1e9] disabled:cursor-not-allowed disabled:opacity-60"
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

      </fieldset>

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
  sent: FinalizedQuoteSentSnapshot;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);

  function onGenerateRevision() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateFinalizedQuoteDraft(quoteRequestId);
        if (!result.ok) {
          setError(result.reason);
          return;
        }
        router.refresh();
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        setError(
          e instanceof Error
            ? e.message
            : "Unknown error starting revision",
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

  // Phase 2B — render a "Confirmed" status pill next to the FQ number
  // and a Confirmed-at row in the summary when the customer has tapped
  // the email's Confirm Finalized Quote button. confirmedAt comes from
  // the FQ row's confirmed_at column, stamped by the customer-facing
  // confirmFinalizedQuote server action.
  const confirmedAtDisplay = useMemo(() => {
    if (!sent.confirmedAt) return "";
    const d = new Date(sent.confirmedAt);
    if (Number.isNaN(d.getTime())) return sent.confirmedAt;
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [sent.confirmedAt]);

  return (
    <section className="border-2 border-black border-l-4 border-l-red-700 bg-[#fafaf6]">
      <div className="flex items-center justify-between gap-3 border-b-2 border-black bg-[#f3f1e9] px-4 py-2.5 sm:px-5">
        <h2 className="font-mono text-[14px] font-bold uppercase tracking-[0.18em] text-black">
          Finalized quote
        </h2>
        <p className="flex items-center gap-2 font-mono text-[12px] text-black">
          <span>
            {sent.finalizedQuoteNumber} &middot;{" "}
            {sent.confirmedAt ? "Sent" : "Sent"}
          </span>
          {sent.confirmedAt ? (
            <span className="inline-flex items-center border border-green-700 bg-green-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-green-800">
              Confirmed
            </span>
          ) : null}
        </p>
      </div>

      <div className="grid gap-3 px-4 py-4 sm:px-5">
        <SummaryRow label="Sent at" value={sentAtDisplay} />
        {sent.confirmedAt ? (
          <SummaryRow label="Confirmed at" value={confirmedAtDisplay} />
        ) : null}
        <SummaryRow
          label="Recipient"
          value={sent.recipientEmail ?? "—"}
        />
        <SummaryRow
          label="Total amount"
          value={
            sent.totalAmount === null ? "—" : formatUsd(Number(sent.totalAmount))
          }
        />
        <SummaryRow
          label="Valid through"
          value={sent.expirationAt ?? "—"}
        />
        <SummaryRow
          label="Payment due"
          value={sent.paymentDueAt ?? "—"}
        />
        {sent.resentFromId ? (
          <SummaryRow label="Resent from" value={sent.resentFromId} />
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-5">
        {error ? (
          <p className="font-mono text-[12px] text-red-700 sm:mr-auto">
            {error}
          </p>
        ) : (
          <p className="font-mono text-[12px] text-black sm:mr-auto">
            Sending a revision opens a fresh draft prefilled from intake.
          </p>
        )}
        {sent.previewHtml ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center justify-center gap-2 border border-zinc-400 bg-white px-4 py-2.5 text-[15px] font-semibold text-black transition-colors hover:border-red-600 hover:text-red-700"
          >
            View sent document
          </button>
        ) : null}
        {/* Phase 2C — on-demand PDF download. The GET route renders a
            fresh PDF from current row state and streams it back with
            an inline Content-Disposition so most browsers open it in
            a viewer tab (where the operator can print, save, forward).
            Email send pipeline is intentionally untouched — this is a
            separate archive/print path. */}
        <a
          href={`/admin/quotes/${quoteRequestId}/finalized-quote-pdf/${sent.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 border border-zinc-400 bg-white px-4 py-2.5 text-[15px] font-semibold text-black transition-colors hover:border-red-600 hover:text-red-700"
        >
          Download PDF
        </a>
        <button
          type="button"
          onClick={onGenerateRevision}
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 border-0 bg-black px-5 py-2.5 font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-700"
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

// ─── Shared chrome (mirrors QuoteRangeWorkspace exactly) ─────────────────

function SectionBanner({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-y border-black bg-[#f3f1e9] px-4 py-2 sm:px-5">
      <span
        aria-hidden
        className="inline-block h-[14px] w-1 shrink-0 bg-red-700"
      />
      <p className="font-mono text-[14px] font-bold uppercase tracking-[0.18em] text-black">
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
        "grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-zinc-300 px-3 py-2.5 sm:grid-cols-[140px_minmax(0,1fr)] sm:px-3 " +
        (align === "start" ? "items-start" : "items-center")
      }
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-[14px] w-[3px] shrink-0 bg-red-700"
        />
        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-black">
          {label}
          {required ? <span className="ml-1 text-red-600">*</span> : null}
        </span>
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CurrencyInput({
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
    <div className="flex items-center border border-black bg-white focus-within:border-red-700">
      <span className="px-2.5 font-mono text-[15px] text-black">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onKeyDown={advanceOnEnter}
            onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className="min-w-0 flex-1 border-0 bg-transparent py-1.5 pr-2.5 font-mono text-[15px] font-medium text-black tabular-nums placeholder:text-zinc-700 focus:outline-none"
      />
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onKeyDown={advanceOnEnter}
            onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      className="block w-full border border-black bg-white px-2.5 py-1.5 text-[15px] text-black placeholder:text-zinc-700 focus:border-red-600 focus:outline-none"
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
    <div className="flex items-center border border-black bg-white focus-within:border-red-700">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onKeyDown={advanceOnEnter}
            onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="min-w-0 flex-1 border-none bg-transparent py-1.5 pl-2.5 font-mono text-[15px] font-medium text-black tabular-nums placeholder:text-zinc-700 focus:outline-none"
      />
      {suffix ? (
        <span className="px-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-black">
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
      onKeyDown={advanceOnEnter}
            onChange={(e) => onChange(e.target.value)}
      className="block w-full border border-black bg-white px-2.5 py-1.5 font-mono text-[15px] font-medium text-black focus:border-red-600 focus:outline-none"
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
      onKeyDown={advanceOnEnter}
            onChange={(e) => onChange(e.target.value)}
      className="block w-full border border-black bg-white px-2.5 py-1.5 text-[15px] font-medium text-black focus:border-red-600 focus:outline-none"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function TriStateSelect({
  value,
  onChange,
}: {
  value: TriState;
  onChange: (v: TriState) => void;
}) {
  return (
    <select
      value={value}
      onKeyDown={advanceOnEnter}
            onChange={(e) => onChange(e.target.value as TriState)}
      className="block w-full max-w-[180px] border border-black bg-white px-2.5 py-1.5 text-[15px] font-medium text-black focus:border-red-600 focus:outline-none"
    >
      <option value="">—</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
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
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black">
        {label}
      </span>
      <span className="text-[15px] text-black">{value}</span>
    </div>
  );
}

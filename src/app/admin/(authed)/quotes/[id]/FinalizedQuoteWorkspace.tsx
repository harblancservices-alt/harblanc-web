"use client";

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
        <BlockedTab
          headline="No range proposal sent yet"
          body="The finalized quote is generated after the customer accepts a range proposal and submits intake. Open the Quote range tab and send a proposal first."
        />
      );
    case "intake_not_submitted":
      return (
        <BlockedTab
          headline={
            state.intakeStatus === "in_progress"
              ? "Customer intake is still in progress"
              : "Awaiting customer intake"
          }
          body="The finalized quote prefills from the customer's intake submission. It opens here as soon as the intake is submitted."
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
          Finalized quote
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
    <section className="overflow-hidden rounded border border-zinc-400 border-l-4 border-l-red-600 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-400 bg-white px-4 py-2.5 sm:px-5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-black">
          Finalized quote
        </h2>
        <p className="font-mono text-[11px] text-black">Ready to generate</p>
      </div>
      <div className="px-4 py-6 sm:px-5">
        <p className="text-sm font-semibold text-black">
          Intake submitted &mdash; ready to generate the rate confirmation.
        </p>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-black">
          Generating opens a draft prefilled from the intake (pickup, delivery,
          freight, operational hints). Dispatch fills in the firm pricing,
          previews the document, and ships it to the customer.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onGenerate}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 border border-red-700 bg-red-600 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Generating…" : "Generate finalized quote"}
          </button>
          {error ? (
            <p className="font-mono text-[11px] text-red-700">{error}</p>
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
}: {
  quoteRequestId: string;
  draft: FinalizedQuoteDraftSnapshot;
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
    <section className="overflow-hidden rounded border border-zinc-400 border-l-4 border-l-red-600 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-400 bg-white px-4 py-2.5 sm:px-5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-black">
          Finalized quote
        </h2>
        <p className="font-mono text-[11px] text-black">
          {draft.finalizedQuoteNumber} &middot; Draft &middot; not sent
        </p>
      </div>

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
              className="inline-block h-[14px] w-[3px] shrink-0 bg-zinc-600"
            />
            <span className="text-xs text-black">Accessorials</span>
          </span>
          <button
            type="button"
            onClick={addAccessorial}
            className="inline-flex items-center gap-1 border border-zinc-400 bg-white px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-black transition-colors hover:bg-zinc-50"
          >
            <IconPlus className="h-3 w-3" />
            Add line
          </button>
        </div>
        {composer.accessorials.length === 0 ? (
          <p className="mt-2 font-mono text-[11px] text-black">
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
                  onChange={(e) =>
                    updateAccessorial(a.id, { label: e.target.value })
                  }
                  placeholder="Detention, Lumper..."
                  className="border border-zinc-300 bg-white px-2 py-1.5 text-sm text-black placeholder:text-zinc-400 focus:border-red-600 focus:outline-none"
                />
                <div className="flex items-center border border-zinc-300 bg-white focus-within:border-red-600">
                  <span className="px-2 font-mono text-xs text-black">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={a.amount}
                    onChange={(e) =>
                      updateAccessorial(a.id, { amount: e.target.value })
                    }
                    placeholder="0.00"
                    className="min-w-0 flex-1 border-none bg-transparent py-1.5 pr-2 text-right font-mono text-sm font-medium text-black tabular-nums placeholder:text-zinc-400 focus:outline-none"
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
      <div className="border-y-2 border-zinc-400 bg-zinc-50 px-4 py-3 sm:px-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-black">
            Quoted total
          </span>
          <span className="font-mono text-2xl font-bold text-black tabular-nums">
            {formatUsd(total)}
          </span>
        </div>
        {accessorialsTotal > 0 ? (
          <p className="mt-1 text-right font-mono text-[11px] text-black">
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
            className="text-center font-mono text-sm text-black"
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
            className="text-center font-mono text-sm text-black"
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
          className="block w-full resize-y border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder:text-zinc-400 focus:border-red-600 focus:outline-none"
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

  return (
    <section className="overflow-hidden rounded border border-zinc-400 border-l-4 border-l-red-600 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-400 bg-white px-4 py-2.5 sm:px-5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-black">
          Finalized quote
        </h2>
        <p className="font-mono text-[11px] text-black">
          {sent.finalizedQuoteNumber} &middot; Sent
        </p>
      </div>

      <div className="grid gap-3 px-4 py-4 sm:px-5">
        <SummaryRow label="Sent at" value={sentAtDisplay} />
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
          <p className="font-mono text-[11px] text-red-700 sm:mr-auto">
            {error}
          </p>
        ) : (
          <p className="font-mono text-[11px] text-black sm:mr-auto">
            Sending a revision opens a fresh draft prefilled from intake.
          </p>
        )}
        {sent.previewHtml ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center justify-center gap-2 border border-zinc-400 bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:border-red-600 hover:text-red-700"
          >
            View sent document
          </button>
        ) : null}
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

// ─── Shared chrome (mirrors QuoteRangeWorkspace exactly) ─────────────────

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
    <div className="flex items-center border border-zinc-300 bg-white focus-within:border-red-600">
      <span className="px-2.5 font-mono text-sm text-black">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className="min-w-0 flex-1 border-none bg-transparent py-1.5 pr-2.5 font-mono text-sm font-medium text-black tabular-nums placeholder:text-zinc-400 focus:outline-none"
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
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
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
      onChange={(e) => onChange(e.target.value as TriState)}
      className="block w-full max-w-[180px] border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-black focus:border-red-600 focus:outline-none"
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
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-700">
        {label}
      </span>
      <span className="text-sm text-black">{value}</span>
    </div>
  );
}

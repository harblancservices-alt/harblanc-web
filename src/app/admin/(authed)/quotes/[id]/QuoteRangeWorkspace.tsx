"use client";

import { advanceOnEnter } from "@/lib/admin/form-utils";

import { useId, useMemo, useState, useTransition } from "react";
import { IconPlus, IconX } from "./icons";
import {
  PreviewModal,
  type PreviewModalState,
} from "./PreviewModal";
import {
  buildEstimatePreview,
  sendEstimate,
  type EmailPreview,
} from "../actions";

/**
 * Phase REBUILD-2 P2-preview — Quote Range Workspace.
 *
 * The visual layout (three banded sub-sections, red-bar markers,
 * banded total, action footer) carries over from REBUILD-2 P1.
 * What this phase adds:
 *
 *   - Preview button is LIVE. Clicking it calls the existing
 *     `buildEstimatePreview` server action, which renders the email
 *     via `renderEstimateEmail()` and persists the bytes into
 *     dispatch_estimates.preview_*. The action returns the rendered
 *     {subject, html, text, to, from, replyTo, preheader} which we
 *     feed straight into the PreviewModal.
 *
 *   - Send Range Proposal is LIVE. It calls `sendEstimate(id)` which
 *     reads the persisted preview_* bytes back and ships them via
 *     Resend verbatim — preview-bytes == sent-bytes by construction.
 *
 *   - Stale detection. A fingerprint of every rate-affecting field
 *     (linehaul, fuel surcharge, accessorials list, expiry, payment
 *     terms, special instructions) is captured at the moment a build
 *     succeeds. If the operator changes any of those after the build,
 *     the modal flips to "stale" and Send disables until rebuilt.
 *
 * Field mapping to the existing server action — temporary bridge
 * until dispatch_estimates gains first-class columns for the new
 * shape:
 *   total (linehaul + fuel + accessorials) -> linehaul_low
 *   (no linehaul_high — this UI emits a single quote, not a range)
 *   expiry_date                            -> expiration_at
 *   payment_terms + special_instructions   -> synthesized closing_line
 * The renderer is unchanged; the modal shows the exact email the
 * customer would receive.
 */

const PAYMENT_TERMS_OPTIONS = [
  "Net 7",
  "Net 14",
  "Net 30",
  "Net 60",
  "Quick Pay",
  "Prepay",
];

type Accessorial = { id: string; label: string; amount: string };

/**
 * Default expiry is 48 hours from now. Quotes are perishable in freight
 * — capacity, fuel index, and lane density all shift inside two days.
 * Setting the default this tight keeps the operator honest about how
 * long a quoted range is actually good for; longer windows can be set
 * manually in the field.
 */
function defaultExpiry(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2); // +48 hours
  return d.toISOString().slice(0, 10);
}


function newAccessorialId(): string {
  return Math.random().toString(36).slice(2, 10);
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

/**
 * RPM ($/mile) formatter — two-decimal currency with a "/mi" suffix.
 * Used by the read-only RPM row that derives from linehaul ÷ miles.
 */
function formatRpm(n: number): string {
  return `${n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}/mi`;
}

function formatExpiryReadable(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts.map((n) => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

function buildClosingLine(
  paymentTerms: string,
  specialInstructions: string,
  expiryReadable: string,
): string {
  // Operator's note is the only content of the email's Confirmation
  // band now. The previous auto-injected phrases ("Payment terms: X",
  // "Range holds through X", "Reply to confirm or call dispatch
  // direct.") were stripped per operator request — the renderer
  // suppresses the Confirmation band entirely when this returns "".
  void paymentTerms;
  void expiryReadable;
  return specialInstructions.trim();
}

/**
 * Detect Next.js redirect signals thrown from server actions. They
 * are Error instances with a `digest` string starting with
 * "NEXT_REDIRECT" — client-side catch handlers MUST re-throw them so
 * the framework's redirect machinery runs (e.g. session expiry sends
 * the operator to /admin/login instead of swallowing the throw and
 * showing a generic "Unknown error" message).
 */
function isNextRedirect(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const digest = (e as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function fingerprint(
  linehaulLow: string,
  linehaulHigh: string,
  fuelSurcharge: string,
  accessorials: ReadonlyArray<Accessorial>,
  expiryDate: string,
  paymentTerms: string,
  specialInstructions: string,
): string {
  return JSON.stringify({
    linehaulLow: toNumber(linehaulLow),
    linehaulHigh: toNumber(linehaulHigh),
    fuel: toNumber(fuelSurcharge),
    acc: accessorials.map((a) => ({
      label: a.label.trim(),
      amount: toNumber(a.amount),
    })),
    expiry: expiryDate,
    terms: paymentTerms,
    notes: specialInstructions.trim(),
  });
}

export function QuoteRangeWorkspace({
  quoteRequestId,
  miles,
  defaults,
}: {
  quoteRequestId: string;
  /**
   * Lane mileage from quote_requests.calculated_miles. When present the
   * workspace surfaces a read-only RPM ($/mi) range beneath the
   * linehaul row so the operator sees the rate per mile they're
   * actually quoting. When null (lane couldn't be resolved) the row
   * is suppressed.
   */
  miles: number | null;
  /**
   * Persisted draft estimate fields from dispatch_estimates. Used to
   * hydrate the form on page load so values survive navigation. Null
   * when no draft exists yet -- the workspace falls back to its
   * built-in empty defaults. Only fields persisted as columns are
   * restored; fuel surcharge and accessorials are not (they only
   * exist baked into preview_html / preview_text snapshots).
   */
  defaults: {
    linehaul_low: number | null;
    linehaul_high: number | null;
    miles_estimate: number | null;
    pickup_timing_notes: string | null;
    equipment_notes: string | null;
    dispatch_notes: string | null;
    expiration_at: string | null;
    closing_line: string | null;
    // Phase REBUILD-3 — workspace state persistence. Every field below
    // is column-persisted; the workspace hydrates from these on page
    // load so navigation + refresh do not erase operator entries.
    fuel_surcharge: number | null;
    accessorials: { label: string; amount: number }[] | null;
    payment_terms: string | null;
    special_instructions: string | null;
  } | null;
}) {
  // Two linehaul inputs. The operator owns both ends of the range —
  // no automatic upside is applied. linehaulHigh is optional; when
  // blank the email renders a single price.
  //
  // Initial values hydrate from `defaults` when a saved draft row
  // exists, so range prices, miles override, notes, and expiration
  // survive navigation away and back. Fuel surcharge and accessorials
  // are not column-persisted, so they intentionally reset to empty.
  const [linehaulLow, setLinehaulLow] = useState(
    defaults?.linehaul_low != null ? String(defaults.linehaul_low) : "",
  );
  const [linehaulHigh, setLinehaulHigh] = useState(
    defaults?.linehaul_high != null ? String(defaults.linehaul_high) : "",
  );
  const [fuelSurcharge, setFuelSurcharge] = useState(
    defaults?.fuel_surcharge != null ? String(defaults.fuel_surcharge) : "",
  );
  // Accessorials are stored as a JSONB array of {label, amount}. Convert
  // each to the local Accessorial shape (string amount + stable id) so
  // controlled inputs stay happy and re-ordering is possible.
  const [accessorials, setAccessorials] = useState<Accessorial[]>(() =>
    (defaults?.accessorials ?? []).map((a) => ({
      id: newAccessorialId(),
      label: a.label,
      amount: String(a.amount),
    })),
  );
  const [expiryDate, setExpiryDate] = useState(
    defaults?.expiration_at ?? defaultExpiry(),
  );
  // Prepay is the default for owner-operator freight quotes; single
  // truck, no factoring float to absorb. Operator switches to Net N
  // only when the customer is a known account.
  const [paymentTerms, setPaymentTerms] = useState(
    defaults?.payment_terms ?? "Prepay",
  );
  const [specialInstructions, setSpecialInstructions] = useState(
    defaults?.special_instructions ?? "",
  );

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewModalState>("building");
  const [previewData, setPreviewData] = useState<EmailPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [buildFingerprint, setBuildFingerprint] = useState<string | null>(null);

  const [isBuildPending, startBuild] = useTransition();
  const [isSendPending, startSend] = useTransition();

  const accessorialsTotal = useMemo(
    () => accessorials.reduce((sum, a) => sum + toNumber(a.amount), 0),
    [accessorials],
  );

  // Quoted totals — fuel + accessorials add to both ends of the
  // linehaul range. When linehaulHigh is blank the email renders a
  // single price (totalHigh == totalLow logically; we pass null up
  // to the action so renderEstimateEmail picks the single-price form).
  const linehaulLowNum = toNumber(linehaulLow);
  const linehaulHighNum = toNumber(linehaulHigh);
  const hasHigh = linehaulHigh.trim().length > 0 && linehaulHighNum > linehaulLowNum;
  const totalLow = linehaulLowNum + toNumber(fuelSurcharge) + accessorialsTotal;
  const totalHigh = hasHigh
    ? linehaulHighNum + toNumber(fuelSurcharge) + accessorialsTotal
    : null;

  const canBuild = linehaulLowNum > 0;
  const buildBlockedReason = canBuild ? null : "Linehaul required";

  // Derived RPM range. Only the LINEHAUL is divided by miles (fuel +
  // accessorials are not per-mile rates in dispatch convention). When
  // miles is missing or zero, the row is suppressed via hasRpm.
  const hasRpm = miles != null && miles > 0 && linehaulLowNum > 0;
  const rpmLow = hasRpm ? linehaulLowNum / miles! : 0;
  const rpmHigh = hasRpm && hasHigh ? linehaulHighNum / miles! : 0;

  const currentFingerprint = fingerprint(
    linehaulLow,
    linehaulHigh,
    fuelSurcharge,
    accessorials,
    expiryDate,
    paymentTerms,
    specialInstructions,
  );

  // Derive the effective preview state during render rather than
  // syncing via setState in an effect. When the build fingerprint
  // is locked in but the current inputs have drifted, the modal
  // sees "stale" without us writing to state — the workspace's
  // canonical previewState only flips when build / send / close
  // actions explicitly assign it. Avoids cascading renders and
  // satisfies react-hooks/set-state-in-effect.
  const isStale =
    buildFingerprint !== null &&
    currentFingerprint !== buildFingerprint &&
    !isBuildPending;
  const effectivePreviewState: PreviewModalState =
    isStale && previewState === "ready" ? "stale" : previewState;

  function addAccessorial() {
    setAccessorials((prev) => [
      ...prev,
      { id: newAccessorialId(), label: "", amount: "" },
    ]);
  }

  function updateAccessorial(id: string, patch: Partial<Accessorial>) {
    setAccessorials((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }

  function removeAccessorial(id: string) {
    setAccessorials((prev) => prev.filter((a) => a.id !== id));
  }

  /**
   * Smart Preview button handler:
   *   - If the current preview is still fresh (state=ready, not stale)
   *     just reopen the modal — no wasted server call.
   *   - Otherwise build (or rebuild) the preview and open the modal.
   * onRebuild from the modal always forces a rebuild (it's an explicit
   * operator action), so we expose it as runRebuildPreview below.
   */
  function runBuildPreview() {
    if (!canBuild) return;

    // Fast path — open the existing fresh preview without re-rendering.
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

    const expiryReadable = formatExpiryReadable(expiryDate);
    const closingLine = buildClosingLine(
      paymentTerms,
      specialInstructions,
      expiryReadable,
    );

    // Send the operator's ACTUAL linehaul values (not the totals)
    // plus fuel + accessorials as separate fields. The renderer adds
    // them up for subject/preheader/total, and prints fuel +
    // accessorial line items only when present so the customer sees a
    // clean breakdown with no phantom rows.
    const fuelNum = toNumber(fuelSurcharge);
    const formData = new FormData();
    formData.append("quote_request_id", quoteRequestId);
    formData.append("linehaul_low", String(linehaulLowNum));
    if (hasHigh) {
      formData.append("linehaul_high", String(linehaulHighNum));
    }
    if (fuelNum > 0) {
      formData.append("fuel_surcharge", String(fuelNum));
    }
    for (const a of accessorials) {
      const label = a.label.trim();
      const amount = toNumber(a.amount);
      if (label.length > 0 && amount > 0) {
        formData.append("accessorial_label", label);
        formData.append("accessorial_amount", String(amount));
      }
    }
    formData.append("expiration_at", expiryDate);
    formData.append("closing_line", closingLine);

    const snapshotFingerprint = currentFingerprint;

    startBuild(async () => {
      try {
        const result = await buildEstimatePreview(formData);
        setPreviewData(result);
        setBuildFingerprint(snapshotFingerprint);
        setPreviewState("ready");
        setPreviewError(null);
      } catch (e) {
        // Re-throw Next.js redirect signals so the framework can
        // navigate (e.g. when the admin session has expired and the
        // server action redirects to login). Without this guard the
        // catch swallows the signal and the operator sees a generic
        // "Unknown error" instead of being sent to login.
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
        "Send the range proposal to the customer? The persisted preview bytes are shipped verbatim.",
      )
    ) {
      return;
    }
    startSend(async () => {
      try {
        await sendEstimate(quoteRequestId);
        setPreviewOpen(false);
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        setPreviewState("failed");
        setPreviewError(
          e instanceof Error ? e.message : "Unknown error sending estimate",
        );
      }
    });
  }

  function closePreview() {
    if (isSendPending) return;
    setPreviewOpen(false);
  }

  return (
    <section className="border-2 border-black border-l-4 border-l-red-700 bg-[#fafaf6]">
      {/* Header band - red bar marker + section label + status stamp */}
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-black bg-[#f3f1e9] px-4 py-2.5 sm:px-5">
        <span
          aria-hidden
          className="inline-block h-4 w-1 shrink-0 bg-red-700"
        />
        <h2 className="font-mono text-[14px] font-bold uppercase tracking-[0.18em] text-black">
          Quote range
        </h2>
        <span className="flex-1" />
        <span className="border border-black bg-white px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-black">
          Draft &middot; not sent
        </span>
      </div>

      {/* 01 PRICING ---------------------------------------------------- */}
      <NumberedSection ordinal="01" title="Pricing">
        <FieldRow label="Linehaul" required>
          <div className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-2">
            <CurrencyInput
              value={linehaulLow}
              onChange={setLinehaulLow}
              placeholder="0.00"
              autoFocus
            />
            <span
              aria-hidden
              className="text-center font-mono text-[15px] font-medium text-black"
            >
              &mdash;
            </span>
            <CurrencyInput
              value={linehaulHigh}
              onChange={setLinehaulHigh}
              placeholder="0.00"
            />
          </div>
        </FieldRow>

        <FieldRow label="Fuel surcharge">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2">
            <CurrencyInput
              value={fuelSurcharge}
              onChange={setFuelSurcharge}
              placeholder="0.00"
            />
            {hasRpm ? (
              <div className="flex items-baseline justify-between gap-2 border border-black bg-white px-2.5 py-1.5">
                <span className="font-mono text-[15px] font-medium text-black tabular-nums">
                  {hasHigh
                    ? `${formatRpm(rpmLow)} \u2014 ${formatRpm(rpmHigh)}`
                    : formatRpm(rpmLow)}
                </span>
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-black">
                  {miles!.toLocaleString()} mi
                </span>
              </div>
            ) : (
              <p className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-red-700">
                {miles == null || miles <= 0
                  ? "Lane miles unavailable"
                  : "Enter a linehaul to compute /mi"}
              </p>
            )}
          </div>
        </FieldRow>

        {/* Accessorials block */}
        <div className="border-t border-zinc-300 px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-[14px] w-[3px] shrink-0 bg-red-700"
              />
              <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-black">
                Accessorials
              </span>
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
          {accessorials.length === 0 ? (
            <div className="border border-dashed border-zinc-400 bg-white px-3 py-3 text-center font-mono text-[12px] text-black">
              No accessorials. Add detention, lumper, tarp, etc. if applicable.
            </div>
          ) : (
            <div className="border border-black bg-white">
              <div className="grid grid-cols-[30px_minmax(0,1fr)_110px_28px] border-b border-zinc-300 px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black">
                <span>#</span>
                <span>Accessorial</span>
                <span className="text-right">Amount</span>
                <span aria-hidden />
              </div>
              {accessorials.map((a, idx) => (
                <div
                  key={a.id}
                  className="grid grid-cols-[30px_minmax(0,1fr)_110px_28px] items-center gap-1.5 border-t border-zinc-300 px-2.5 py-1.5 first:border-t-0 sm:px-3"
                >
                  <span className="font-mono text-[12px] tabular-nums text-black">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <input
                    type="text"
                    value={a.label}
                    onKeyDown={advanceOnEnter}
            onChange={(e) =>
                      updateAccessorial(a.id, { label: e.target.value })
                    }
                    placeholder="Detention, lumper..."
                    className="border-0 bg-transparent px-1 py-1 font-mono text-[15px] text-black placeholder:text-zinc-700 focus:outline-none"
                  />
                  <div className="flex items-center border border-zinc-400 bg-white focus-within:border-red-700">
                    <span className="px-2 font-mono text-[12px] text-black">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={a.amount}
                      onKeyDown={advanceOnEnter}
            onChange={(e) =>
                        updateAccessorial(a.id, { amount: e.target.value })
                      }
                      placeholder="0.00"
                      className="min-w-0 flex-1 border-0 bg-transparent py-1 pr-1.5 text-right font-mono text-[15px] font-medium tabular-nums text-black placeholder:text-zinc-700 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAccessorial(a.id)}
                    aria-label={`Remove ${a.label || "accessorial"}`}
                    className="inline-flex h-7 w-7 items-center justify-center border border-zinc-400 bg-white text-black transition-colors hover:border-red-700 hover:text-red-700"
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </NumberedSection>

      {/* 02 TERMS ------------------------------------------------------- */}
      <NumberedSection ordinal="02" title="Terms">
        <FieldRow label="Expiry date">
          <div className="flex items-center border border-black bg-white focus-within:border-red-700">
            <input
              type="date"
              value={expiryDate}
              onKeyDown={advanceOnEnter}
            onChange={(e) => setExpiryDate(e.target.value)}
              className="block w-full border-0 bg-transparent px-2.5 py-1.5 font-mono text-[15px] font-medium text-black focus:outline-none"
            />
          </div>
        </FieldRow>
        <FieldRow label="Payment terms">
          <div className="border border-black bg-white">
            <select
              value={paymentTerms}
              onKeyDown={advanceOnEnter}
            onChange={(e) => setPaymentTerms(e.target.value)}
              className="block w-full border-0 bg-transparent px-2.5 py-1.5 font-mono text-[15px] font-medium text-black focus:outline-none"
            >
              {PAYMENT_TERMS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </FieldRow>
      </NumberedSection>

      {/* 03 NOTES ------------------------------------------------------- */}
      <NumberedSection ordinal="03" title="Notes" last>
        <FieldRow label="Special instructions" align="start">
          <textarea
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            rows={2}
            placeholder="Tarp required, permitted load, hazmat handling..."
            className="block w-full resize-y border border-black bg-white px-2.5 py-1.5 font-sans text-[15px] text-black placeholder:text-zinc-700 focus:border-red-700 focus:outline-none"
          />
        </FieldRow>
      </NumberedSection>

      {/* QUOTED TOTAL - double rule above, mono right-aligned amount ----- */}
      <div className="border-t-[3px] border-double border-black px-4 py-3 sm:px-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-[12px] font-bold uppercase tracking-[0.22em] text-black">
              {totalHigh !== null ? "Quoted range" : "Quoted total"}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-black">
              Linehaul + fuel + accessorials &middot; USD
            </p>
          </div>
          <p className="font-mono text-[28px] font-medium tabular-nums text-black sm:text-[30px]">
            {totalHigh !== null
              ? `${formatUsd(totalLow)} \u2014 ${formatUsd(totalHigh)}`
              : formatUsd(totalLow)}
          </p>
        </div>
        {accessorialsTotal > 0 ? (
          <p className="mt-1 text-right font-mono text-[12px] text-black">
            includes {formatUsd(accessorialsTotal)} accessorials
          </p>
        ) : null}
      </div>

      {/* Footer action bar - status stamp marker + Preview button ------- */}
      <div className="flex flex-col gap-2 border-t border-black px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            aria-hidden
            className={
              "inline-block h-[14px] w-1 shrink-0 " +
              (buildBlockedReason || (effectivePreviewState === "failed" && previewError)
                ? "bg-red-700"
                : effectivePreviewState === "ready"
                  ? "bg-emerald-700"
                  : "bg-black")
            }
          />
          <p
            className={
              "font-mono text-[12px] font-bold uppercase tracking-[0.14em] " +
              (effectivePreviewState === "failed" && previewError
                ? "text-red-700"
                : "text-black")
            }
          >
            {buildBlockedReason
              ? buildBlockedReason
              : effectivePreviewState === "failed" && previewError
                ? `Preview failed - ${previewError}`
                : effectivePreviewState === "stale" && previewData
                  ? "Preview is stale - rebuild before sending"
                  : effectivePreviewState === "ready" && previewData
                    ? "Preview ready"
                    : isBuildPending
                      ? "Building preview..."
                      : "Ready to build"}
          </p>
        </div>
        <button
          type="button"
          onClick={runBuildPreview}
          disabled={!canBuild || isBuildPending}
          className="inline-flex items-center justify-center gap-2 border-0 bg-black px-5 py-2.5 font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isBuildPending
            ? "Building..."
            : effectivePreviewState === "stale"
              ? "Rebuild preview \u2192"
              : effectivePreviewState === "ready" && previewData
                ? "Open preview \u2192"
                : "Build preview \u2192"}
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

function NumberedSection({
  ordinal,
  title,
  last,
  children,
}: {
  ordinal: string;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  // Each subsection is its own bordered band inside the workspace. The
  // title bar uses the sand fill so the numbered ordinal pops against
  // the cream paper bg of the surrounding section.
  return (
    <div className={"px-4 sm:px-5 " + (last ? "pb-2" : "pb-3")}>
      <div className="mt-3 border border-black bg-white">
        <div className="flex items-center gap-2 border-b border-black bg-[#f3f1e9] px-3 py-1.5">
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-red-700">
            {ordinal}
          </span>
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-black">
            {title}
          </span>
        </div>
        <div>{children}</div>
      </div>
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
  const id = useId();
  void id;
  return (
    <div
      className={
        "grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-zinc-300 px-3 py-2.5 first:border-t-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:px-3 " +
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
          {required ? <span className="ml-1 text-red-700">*</span> : null}
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
  // USD prefix cell (left-rail) so the dollar amount reads like a real
  // invoice line. Border darkens to red on focus.
  return (
    <div className="flex items-stretch border border-black bg-white focus-within:border-red-700">
      <span className="border-r border-zinc-300 px-2.5 py-1.5 font-mono text-[12px] font-medium text-black">
        USD
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onKeyDown={advanceOnEnter}
            onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className="min-w-0 flex-1 border-0 bg-transparent px-2.5 py-1.5 text-right font-mono text-[15px] font-medium text-black tabular-nums placeholder:text-zinc-700 focus:outline-none"
      />
    </div>
  );
}

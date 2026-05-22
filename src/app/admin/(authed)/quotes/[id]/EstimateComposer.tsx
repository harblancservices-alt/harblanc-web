"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveDraftEstimate,
  sendEstimate,
  buildEstimatePreview,
} from "../actions";
import { REPLY_TEMPLATES, findTemplate } from "@/lib/dispatch/templates";
import { computeRpm } from "@/lib/dispatch/distance";
import {
  EmailPreviewPanel,
  type EmailPreviewData,
} from "./EmailPreviewPanel";

/**
 * Quick Estimate Composer — preview-gated dispatch workspace.
 *
 * Phase 3C: Send Estimate is now gated by a Build Preview step.
 *
 * Flow:
 *   1. Composer fields → Build Preview
 *   2. Preview appears inline directly under the composer (rendered
 *      from the same code that ships to the customer)
 *   3. Only after preview exists does Send Estimate appear
 *   4. Any edit to a composer field after building marks the preview
 *      "stale" — Send is hidden until Rebuild Preview is clicked
 *
 * This enforces "no preview = no send" and guarantees the customer
 * gets exactly what the dispatcher just reviewed.
 */

export type EstimateDraft = {
  id: string;
  linehaulLow: number | null;
  linehaulHigh: number | null;
  milesEstimate: number | null;
  pickupTimingNotes: string | null;
  equipmentNotes: string | null;
  dispatchNotes: string | null;
  expirationAt: string | null;
  sentAt: string | null;
  sentEmailId: string | null;
};

export type EstimateComposerProps = {
  quoteRequestId: string;
  leadName: string;
  laneRecap: { pickupZip: string | null; deliveryZip: string | null };
  computedMiles: number | null;
  draft: EstimateDraft | null;
};

const inputCls =
  "block w-full bg-neutral-900 border border-neutral-800 px-3 py-2.5 text-base text-zinc-100 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none";
const labelCls =
  "block font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase";

type PreviewState =
  | { kind: "none" }
  | { kind: "building" }
  | { kind: "fresh"; data: EmailPreviewData }
  | { kind: "stale"; data: EmailPreviewData };

function defaultExpiry(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

function numToInput(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "";
  return String(n);
}

export function EstimateComposer(props: EstimateComposerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>({
    kind: "none",
  });

  const [linehaulLow, setLinehaulLow] = useState<string>(
    numToInput(props.draft?.linehaulLow ?? null),
  );
  const [linehaulHigh, setLinehaulHigh] = useState<string>(
    numToInput(props.draft?.linehaulHigh ?? null),
  );
  const [miles, setMiles] = useState<string>(
    numToInput(props.draft?.milesEstimate ?? props.computedMiles),
  );
  const [pickupTimingNotes, setPickupTimingNotes] = useState<string>(
    props.draft?.pickupTimingNotes ?? "",
  );
  const [equipmentNotes, setEquipmentNotes] = useState<string>(
    props.draft?.equipmentNotes ?? "",
  );
  const [dispatchNotes, setDispatchNotes] = useState<string>(
    props.draft?.dispatchNotes ?? "",
  );
  const [expirationAt, setExpirationAt] = useState<string>(
    props.draft?.expirationAt ?? defaultExpiry(),
  );
  const [templateId, setTemplateId] = useState<string>(REPLY_TEMPLATES[0].id);
  const [closingLine, setClosingLine] = useState<string>(
    REPLY_TEMPLATES[0].body,
  );
  const [editedClosing, setEditedClosing] = useState(false);

  /** Mark the preview stale when any composer field changes. */
  function invalidatePreview() {
    setPreviewState((s) => {
      if (s.kind === "fresh") return { kind: "stale", data: s.data };
      return s;
    });
    if (notice) setNotice(null);
  }

  // Wrapped setters so any field change invalidates the preview.
  const onChange = {
    linehaulLow: (v: string) => {
      setLinehaulLow(v);
      invalidatePreview();
    },
    linehaulHigh: (v: string) => {
      setLinehaulHigh(v);
      invalidatePreview();
    },
    miles: (v: string) => {
      setMiles(v);
      invalidatePreview();
    },
    pickupTimingNotes: (v: string) => {
      setPickupTimingNotes(v);
      invalidatePreview();
    },
    equipmentNotes: (v: string) => {
      setEquipmentNotes(v);
      invalidatePreview();
    },
    dispatchNotes: (v: string) => {
      setDispatchNotes(v);
      // dispatchNotes is internal-only, doesn't appear in email — but
      // it IS saved to the draft, so invalidate to keep preview-as-sent
      // contract honest. Cheap and consistent.
      invalidatePreview();
    },
    expirationAt: (v: string) => {
      setExpirationAt(v);
      invalidatePreview();
    },
  };

  const rpmLow = useMemo(() => {
    const r = Number(linehaulLow);
    const m = Number(miles);
    return Number.isFinite(r) && r > 0 && Number.isFinite(m) && m > 0
      ? computeRpm(r, Math.round(m))
      : null;
  }, [linehaulLow, miles]);
  const rpmHigh = useMemo(() => {
    const r = Number(linehaulHigh);
    const m = Number(miles);
    return Number.isFinite(r) && r > 0 && Number.isFinite(m) && m > 0
      ? computeRpm(r, Math.round(m))
      : null;
  }, [linehaulHigh, miles]);

  function pickTemplate(id: string) {
    const tpl = findTemplate(id);
    if (!tpl) return;
    setTemplateId(id);
    if (!editedClosing) {
      setClosingLine(tpl.body);
    }
    invalidatePreview();
  }

  function resetClosingToTemplate() {
    const tpl = findTemplate(templateId);
    if (!tpl) return;
    setClosingLine(tpl.body);
    setEditedClosing(false);
    invalidatePreview();
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append("quote_request_id", props.quoteRequestId);
    fd.append("linehaul_low", linehaulLow);
    fd.append("linehaul_high", linehaulHigh);
    fd.append("miles_estimate", miles);
    fd.append("pickup_timing_notes", pickupTimingNotes);
    fd.append("equipment_notes", equipmentNotes);
    fd.append("dispatch_notes", dispatchNotes);
    fd.append("expiration_at", expirationAt);
    if (editedClosing) {
      fd.append("closing_line", closingLine);
    } else {
      fd.append("template_id", templateId);
    }
    return fd;
  }

  function onSaveDraft() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await saveDraftEstimate(buildFormData());
        setNotice("Draft saved.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  function onBuildPreview() {
    setError(null);
    setNotice(null);
    setPreviewState({ kind: "building" });
    startTransition(async () => {
      try {
        const data = await buildEstimatePreview(buildFormData());
        setPreviewState({ kind: "fresh", data });
        router.refresh();
      } catch (e) {
        setPreviewState({ kind: "none" });
        setError(e instanceof Error ? e.message : "Preview failed.");
      }
    });
  }

  function onSend() {
    if (previewState.kind !== "fresh") return;
    setError(null);
    setNotice(null);
    if (
      !confirm(
        `Send this estimate to ${props.leadName}?\n\nThis sends the exact preview shown below.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await sendEstimate(buildFormData());
        setNotice("Estimate sent.");
        setPreviewState({ kind: "none" });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Send failed.");
      }
    });
  }

  const sentBanner =
    props.draft?.sentAt != null ? (
      <div className="flex items-start gap-3 border border-green-700/60 bg-green-950/30 p-4">
        <span
          aria-hidden
          className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-green-500"
        />
        <div>
          <p className="font-mono text-[10px] tracking-[0.22em] text-green-300 uppercase">
            Estimate sent
          </p>
          <p className="mt-1 text-sm leading-relaxed text-green-100">
            Last estimate went out to the customer. Editing below starts a
            new draft — the sent estimate stays in the timeline.
          </p>
        </div>
      </div>
    ) : null;

  const laneIncomplete =
    !props.laneRecap.pickupZip || !props.laneRecap.deliveryZip;

  return (
    <section className="space-y-5">
      <header>
        <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
          Quick estimate
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-300">
          Rate range, miles, and a closing line. Build a preview, review,
          then send. The customer gets exactly what the preview shows.
        </p>
      </header>

      {sentBanner}

      {laneIncomplete ? (
        <div className="flex items-start gap-3 border border-amber-700/60 bg-amber-950/30 p-4">
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-amber-500"
          />
          <p className="text-sm leading-relaxed text-amber-100">
            Lane ZIPs are missing on this lead. Can&rsquo;t build a preview
            without ZIPs for the lane recap.
          </p>
        </div>
      ) : null}

      {/* Rate + miles row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Rate low (USD)" required>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="50"
            value={linehaulLow}
            onChange={(e) => onChange.linehaulLow(e.target.value)}
            className={inputCls}
            placeholder="1850"
          />
        </Field>
        <Field label="Rate high (USD, optional)">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="50"
            value={linehaulHigh}
            onChange={(e) => onChange.linehaulHigh(e.target.value)}
            className={inputCls}
            placeholder="2050"
          />
        </Field>
        <Field label={`Miles${props.computedMiles ? ` · calc ${props.computedMiles}` : ""}`}>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={miles}
            onChange={(e) => onChange.miles(e.target.value)}
            className={inputCls}
            placeholder={
              props.computedMiles ? String(props.computedMiles) : "280"
            }
          />
        </Field>
      </div>

      {/* RPM preview strip */}
      <div className="flex items-center gap-4 border border-neutral-800 bg-neutral-950 px-4 py-3">
        <span className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
          RPM preview
        </span>
        <span className="font-mono text-sm text-white">
          {rpmLow !== null ? `$${rpmLow.toFixed(2)}` : "—"}
          {rpmHigh !== null ? ` – $${rpmHigh.toFixed(2)}` : ""}
          <span className="ml-1 text-neutral-500">/ mile</span>
        </span>
      </div>

      <Field label="Pickup timing notes (in email)">
        <textarea
          rows={2}
          value={pickupTimingNotes}
          onChange={(e) => onChange.pickupTimingNotes(e.target.value)}
          className={`${inputCls} resize-y`}
          placeholder='e.g. "Can pick Tuesday morning. Wednesday is tight."'
        />
      </Field>
      <Field label="Equipment notes (in email)">
        <textarea
          rows={2}
          value={equipmentNotes}
          onChange={(e) => onChange.equipmentNotes(e.target.value)}
          className={`${inputCls} resize-y`}
          placeholder='e.g. "Standard flatbed, tarps available, no chains needed for this profile."'
        />
      </Field>
      <Field label="Dispatch notes (internal — not in email)">
        <textarea
          rows={2}
          value={dispatchNotes}
          onChange={(e) => onChange.dispatchNotes(e.target.value)}
          className={`${inputCls} resize-y`}
          placeholder="Your notes — capacity, who to call, why this rate, etc."
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
        <Field label="Quote valid through">
          <input
            type="date"
            value={expirationAt}
            onChange={(e) => onChange.expirationAt(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Template picker + custom closing */}
      <div>
        <span className={labelCls}>Closing line / template</span>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {REPLY_TEMPLATES.map((t) => {
            const active = t.id === templateId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTemplate(t.id)}
                title={t.description}
                className={
                  "border px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase transition-colors " +
                  (active
                    ? "border-red-600 bg-red-950/40 text-red-200"
                    : "border-neutral-700 bg-neutral-900/40 text-neutral-300 hover:border-neutral-500 hover:text-white")
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-start gap-3">
          <textarea
            rows={3}
            value={closingLine}
            onChange={(e) => {
              setClosingLine(e.target.value);
              setEditedClosing(true);
              invalidatePreview();
            }}
            className={`${inputCls} flex-1 resize-y`}
          />
        </div>
        {editedClosing ? (
          <button
            type="button"
            onClick={resetClosingToTemplate}
            className="mt-2 font-mono text-[10px] tracking-[0.18em] text-neutral-500 uppercase hover:text-white"
          >
            Reset to template
          </button>
        ) : null}
      </div>

      {notice ? (
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.14em] text-green-400 uppercase"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 border border-red-700 bg-red-950/30 p-4"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
          />
          <p className="text-sm leading-relaxed text-red-200">{error}</p>
        </div>
      ) : null}

      {/* Action row — Save Draft + Build/Rebuild Preview. Send appears
          below the preview once it's fresh. */}
      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-neutral-800 pt-5 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={isPending}
          className="btn-outline-cut inline-flex items-center justify-center px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending && previewState.kind !== "building" ? "Working…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={onBuildPreview}
          disabled={isPending || laneIncomplete}
          className="btn-cut inline-flex items-center justify-center bg-red-600 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {previewState.kind === "building"
            ? "Building…"
            : previewState.kind === "fresh"
              ? "Rebuild preview"
              : previewState.kind === "stale"
                ? "Rebuild preview"
                : "Build preview"}
        </button>
      </div>

      {/* Preview panel — appears only after Build Preview. */}
      {previewState.kind === "fresh" || previewState.kind === "stale" ? (
        <div className="space-y-4 pt-2">
          {previewState.kind === "stale" ? (
            <div className="flex items-start gap-3 border border-amber-700/60 bg-amber-950/30 p-4">
              <span
                aria-hidden
                className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-amber-500"
              />
              <p className="text-sm leading-relaxed text-amber-100">
                You edited the composer after building this preview. Rebuild
                the preview before sending — what you see below no longer
                matches the current draft.
              </p>
            </div>
          ) : null}

          <EmailPreviewPanel preview={previewState.data} />

          {/* Gated Send — only when preview is fresh */}
          {previewState.kind === "fresh" ? (
            <div className="border border-red-700/60 bg-red-950/20 p-4 sm:p-5">
              <p className="font-mono text-[10px] tracking-[0.22em] text-red-300 uppercase">
                Ready to send
              </p>
              <p className="mt-2 text-sm leading-relaxed text-red-100">
                The email above is exactly what {props.leadName} will receive.
                Once sent, the lead status auto-advances to{" "}
                <span className="font-mono text-red-200">Engaged</span> and
                this draft becomes part of the timeline.
              </p>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={onSend}
                  disabled={isPending}
                  className="btn-cut inline-flex items-center justify-center bg-red-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Sending…" : "Send estimate"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

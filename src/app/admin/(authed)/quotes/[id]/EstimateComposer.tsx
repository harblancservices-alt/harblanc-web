"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveDraftEstimate,
  sendEstimate,
  buildEstimatePreview,
} from "../actions";
import { REPLY_TEMPLATES, findTemplate } from "@/lib/dispatch/templates";
import { computeRpm } from "@/lib/dispatch/rpm";
import {
  EmailPreviewPanel,
  type EmailPreviewData,
} from "./EmailPreviewPanel";

/**
 * Quick Estimate Composer — preview-gated, server-persisted.
 *
 * Workflow:
 *   1. Composer fields → Build Preview
 *   2. Build Preview persists the rendered email (subject/html/text/...)
 *      on the draft row AND saves the form fields. Preview is shown.
 *   3. Preview stays visible until another preview is built — even
 *      across page reloads, because it lives on the dispatch_estimates
 *      row, not in React state.
 *   4. Editing any composer field flips the `stale` flag. Preview stays
 *      visible for comparison; the Send button disables.
 *   5. Send reads the persisted preview bytes from the draft row and
 *      transmits them verbatim. preview-bytes == sent-bytes by
 *      construction. The draft row's sent_at fills in — it becomes
 *      a historical sent record. The next Build Preview creates a
 *      fresh draft (the partial unique index on sent_at IS NULL
 *      lets that happen automatically).
 *
 * Each quote keeps its full estimate history under SentEstimatesList,
 * which is fed by the same table. Cascade delete on quote_requests
 * removes every estimate when the quote is permanently deleted.
 */

export type EstimateDraftPreview = {
  subject: string;
  preheader: string;
  html: string;
  to: string;
  from: string;
  replyTo: string;
  builtAt: string;
};

export type EstimateDraft = {
  id: string;
  linehaulLow: number | null;
  linehaulHigh: number | null;
  milesEstimate: number | null;
  pickupTimingNotes: string | null;
  equipmentNotes: string | null;
  dispatchNotes: string | null;
  expirationAt: string | null;
  closingLine: string | null;
  sentAt: string | null;
  sentEmailId: string | null;
  preview: EstimateDraftPreview | null;
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

function defaultExpiry(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

function numToInput(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "";
  return String(n);
}

/**
 * Decide whether the saved closing_line on the draft matches one of
 * the canned templates. If it does, that template is the active pick.
 * Otherwise we treat the closing as a custom override.
 */
function resolveTemplateState(savedClosing: string | null): {
  templateId: string;
  closingLine: string;
  edited: boolean;
} {
  if (savedClosing && savedClosing.length > 0) {
    const match = REPLY_TEMPLATES.find((t) => t.body === savedClosing);
    if (match) {
      return { templateId: match.id, closingLine: match.body, edited: false };
    }
    return {
      templateId: REPLY_TEMPLATES[0].id,
      closingLine: savedClosing,
      edited: true,
    };
  }
  return {
    templateId: REPLY_TEMPLATES[0].id,
    closingLine: REPLY_TEMPLATES[0].body,
    edited: false,
  };
}

export function EstimateComposer(props: EstimateComposerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The preview snapshot displayed under the form. Sourced from the
  // server on first render. Replaced on Build Preview. Never cleared
  // by field edits — only the `stale` flag flips.
  const [preview, setPreview] = useState<EmailPreviewData | null>(() =>
    props.draft?.preview
      ? {
          subject: props.draft.preview.subject,
          preheader: props.draft.preview.preheader,
          html: props.draft.preview.html,
          to: props.draft.preview.to,
          from: props.draft.preview.from,
          replyTo: props.draft.preview.replyTo,
        }
      : null,
  );
  const [stale, setStale] = useState<boolean>(false);
  const [building, setBuilding] = useState<boolean>(false);

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
  const initialTemplate = resolveTemplateState(props.draft?.closingLine ?? null);
  const [templateId, setTemplateId] = useState<string>(initialTemplate.templateId);
  const [closingLine, setClosingLine] = useState<string>(initialTemplate.closingLine);
  const [editedClosing, setEditedClosing] = useState<boolean>(initialTemplate.edited);

  /** Any field edit marks the preview stale (if one exists). */
  function markStale() {
    if (preview && !stale) setStale(true);
    if (notice) setNotice(null);
  }

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
    markStale();
  }

  function resetClosingToTemplate() {
    const tpl = findTemplate(templateId);
    if (!tpl) return;
    setClosingLine(tpl.body);
    setEditedClosing(false);
    markStale();
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
    setBuilding(true);
    startTransition(async () => {
      try {
        const data = await buildEstimatePreview(buildFormData());
        setPreview({
          to: data.to,
          from: data.from,
          replyTo: data.replyTo,
          subject: data.subject,
          preheader: data.preheader,
          html: data.html,
        });
        setStale(false);
        setBuilding(false);
        router.refresh();
      } catch (e) {
        setBuilding(false);
        setError(e instanceof Error ? e.message : "Preview failed.");
      }
    });
  }

  function onSend() {
    if (!preview || stale) return;
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
        await sendEstimate(props.quoteRequestId);
        setNotice("Estimate sent.");
        // Local optimistic clear — server refresh repopulates the
        // composer with an empty draft and adds the sent record to
        // the history list below.
        setPreview(null);
        setStale(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Send failed.");
      }
    });
  }

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
            onChange={(e) => {
              setLinehaulLow(e.target.value);
              markStale();
            }}
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
            onChange={(e) => {
              setLinehaulHigh(e.target.value);
              markStale();
            }}
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
            onChange={(e) => {
              setMiles(e.target.value);
              markStale();
            }}
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
          onChange={(e) => {
            setPickupTimingNotes(e.target.value);
            markStale();
          }}
          className={`${inputCls} resize-y`}
          placeholder='e.g. "Can pick Tuesday morning. Wednesday is tight."'
        />
      </Field>
      <Field label="Equipment notes (in email)">
        <textarea
          rows={2}
          value={equipmentNotes}
          onChange={(e) => {
            setEquipmentNotes(e.target.value);
            markStale();
          }}
          className={`${inputCls} resize-y`}
          placeholder='e.g. "Standard flatbed, tarps available, no chains needed for this profile."'
        />
      </Field>
      <Field label="Dispatch notes (internal — not in email)">
        <textarea
          rows={2}
          value={dispatchNotes}
          onChange={(e) => {
            setDispatchNotes(e.target.value);
            // Internal note doesn't appear in the email body, but it IS
            // saved on the draft row, so flipping stale keeps the
            // "preview matches saved draft" contract honest.
            markStale();
          }}
          className={`${inputCls} resize-y`}
          placeholder="Your notes — capacity, who to call, why this rate, etc."
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
        <Field label="Quote valid through">
          <input
            type="date"
            value={expirationAt}
            onChange={(e) => {
              setExpirationAt(e.target.value);
              markStale();
            }}
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
              markStale();
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
          {isPending && !building ? "Working…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={onBuildPreview}
          disabled={isPending || laneIncomplete}
          className="btn-cut inline-flex items-center justify-center bg-red-600 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {building
            ? "Building…"
            : preview
              ? "Rebuild preview"
              : "Build preview"}
        </button>
      </div>

      {/* Preview panel — visible whenever a preview exists, fresh or stale. */}
      {preview ? (
        <div className="space-y-4 pt-2">
          {stale ? (
            <div className="flex items-start gap-3 border border-amber-700/60 bg-amber-950/30 p-4">
              <span
                aria-hidden
                className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-amber-500"
              />
              <p className="text-sm leading-relaxed text-amber-100">
                Preview is stale — rebuild before sending. The composer
                fields have changed since this preview was built; Send is
                disabled until you rebuild.
              </p>
            </div>
          ) : null}

          <EmailPreviewPanel preview={preview} />

          <div
            className={
              "border p-4 sm:p-5 " +
              (stale
                ? "border-neutral-800 bg-neutral-950"
                : "border-red-700/60 bg-red-950/20")
            }
          >
            <p
              className={
                "font-mono text-[10px] tracking-[0.22em] uppercase " +
                (stale ? "text-neutral-500" : "text-red-300")
              }
            >
              {stale ? "Send disabled" : "Ready to send"}
            </p>
            <p
              className={
                "mt-2 text-sm leading-relaxed " +
                (stale ? "text-neutral-400" : "text-red-100")
              }
            >
              {stale ? (
                <>
                  Rebuild the preview to enable Send. The preview above
                  still reflects the last build — keep or change it before
                  you send.
                </>
              ) : (
                <>
                  The email above is exactly what {props.leadName} will
                  receive. Once sent, the lead status auto-advances and
                  this draft becomes the next record in Sent Estimates.
                </>
              )}
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onSend}
                disabled={isPending || stale}
                className="btn-cut inline-flex items-center justify-center bg-red-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending && !building ? "Sending…" : "Send estimate"}
              </button>
            </div>
          </div>
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

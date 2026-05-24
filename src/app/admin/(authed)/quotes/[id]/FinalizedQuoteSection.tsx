"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateFull, relativeTime } from "@/lib/admin/format";
import { generateFinalizedQuoteDraft } from "../finalized-quote-actions";
import {
  FinalizedQuoteComposer,
  type FinalizedQuoteDraft,
} from "./FinalizedQuoteComposer";
import {
  SentFinalizedQuotesList,
  type SentFinalizedQuoteRow,
} from "./SentFinalizedQuotesList";
// SubmittedIntakePanel render removed in Phase J2 — intake panel now
// lives in Workspace only. Type still imported because the prop on
// FinalizedQuoteSectionProps is preserved for callsite stability.
import { type SubmittedIntakeData } from "./SubmittedIntakePanel";
// Phase P1C: payment summary + history + manual recording form,
// rendered as a subsection below the active finalized-quote workflow.
import { PaymentSection, type PaymentTarget } from "./PaymentSection";

/**
 * Finalized Quote orchestration shell.
 *
 * The Finalized Quote / Rate Confirmation is only available AFTER the
 * customer accepts the range estimate AND submits the shipment intake.
 * This component gates that state machine and routes the operator to
 * the right next action.
 *
 * Phase FLOW-FIX-2: previously the four pre-draft states branched between
 * three button-less InfoCards (no_estimate_sent / no_intake /
 * intake_in_progress) and the single GenerateDraftCard
 * (intake_submitted_no_draft). The operator reported the "Generate
 * Finalized Quote button" as silent — because in three of the four
 * pre-draft states there was no button at all, just a static card. The
 * card title read like an action target, so clicks went nowhere.
 *
 * Fix: every pre-draft state now renders the SAME GenerateDraftCard.
 * The card is state-aware (eyebrow, headline, body, submitted-at line)
 * and the click handler runs a client-side blocker check before
 * attempting the server action — so an upstream-gated click surfaces
 * the exact blocker text instead of failing silently. The server-side
 * gate is unchanged; this is purely a UI surfacing.
 */

export type FinalizedQuoteWorkflowState =
  | { kind: "no_estimate_sent" }
  | { kind: "no_intake" }
  | { kind: "intake_in_progress" }
  | { kind: "intake_submitted_no_draft"; submittedAt: string }
  | { kind: "draft"; draft: FinalizedQuoteDraft; intakeSubmittedAt: string };

export type FinalizedQuoteSectionProps = {
  quoteRequestId: string;
  leadName: string;
  state: FinalizedQuoteWorkflowState;
  sentHistory: SentFinalizedQuoteRow[];
  isTrashed: boolean;
  submittedIntake: SubmittedIntakeData | null;
  /** Phase P1C: latest sent finalized quote + its payments, or null
   *  if no FQ has been sent yet. When null, the PaymentSection is hidden. */
  paymentTarget: PaymentTarget | null;
};

export function FinalizedQuoteSection(props: FinalizedQuoteSectionProps) {
  // Phase J2: submittedIntake prop preserved on the type for callsite
  // stability but no longer destructured/rendered here. The intake panel
  // lives on the Workspace tab only.
  const { quoteRequestId, leadName, state, sentHistory, isTrashed, paymentTarget } = props;

  // Phase FLOW-FIX-2 diagnostic: tiny mono caption showing the live
  // workflow state. Operator can read this back to dispatch debugging
  // when "the button does nothing" — answers "which gate am I behind?".
  // Keeps the cardinal numbers small so it doesn't compete with the
  // composer below.
  const stateLabel = state.kind;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold tracking-[0.12em] text-red-600 uppercase">
          Finalized quote
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-700">
          Formal rate confirmation with exact pricing. Generated after the
          customer accepts the range estimate and submits intake.
        </p>
        <p className="mt-2 font-mono text-xs text-zinc-500">
          Workflow state · <span className="text-zinc-700">{stateLabel}</span>
        </p>
      </header>

      {/* Phase J2: intake summary panel removed — it duplicated the one
          on the Workspace tab. The composer below still prefills from
          intake data via the server data loader, so removing the panel
          doesn't change what the operator can see or do; it just removes
          the redundant on-screen copy when switching to this tab. */}

      {isTrashed ? (
        <TrashGate />
      ) : state.kind === "draft" ? (
        <FinalizedQuoteComposer
          key={state.draft.id}
          quoteRequestId={quoteRequestId}
          leadName={leadName}
          draft={state.draft}
        />
      ) : (
        <GenerateDraftCard
          quoteRequestId={quoteRequestId}
          stateKind={state.kind}
          submittedAt={
            state.kind === "intake_submitted_no_draft" ? state.submittedAt : null
          }
        />
      )}

      {/* Phase P1C: payments subsection. Only renders once a finalized
          quote has been sent (and a payment target row exists), and
          when the lead isn't trashed. Operationally subordinate to the
          active workflow above but visually distinct from history. */}
      {!isTrashed && paymentTarget ? (
        <PaymentSection
          quoteRequestId={quoteRequestId}
          target={paymentTarget}
        />
      ) : null}

      {/* Phase L: explicit "history" heading so the historical record
          reads as separate from the active workflow above. */}
      <section className="space-y-5">
        <h2 className="border-b border-zinc-200 pb-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-900">
          Finalized quote history
        </h2>
        <SentFinalizedQuotesList rows={sentHistory} />
      </section>
    </div>
  );
}

function TrashGate() {
  return (
    <section className="border border-zinc-200 bg-zinc-50 p-8 text-center">
      <p className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase">
        Request is in trash
      </p>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600">
        Restore the request from trash to work on the finalized quote.
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  GenerateDraftCard — single unified card for all pre-draft states.
//
//  Phase FLOW-FIX-2: previously three of the four pre-draft states only
//  rendered a passive InfoCard with no button. Operators reported the
//  "Generate Finalized Quote button" as silent because in those states
//  there was nothing clickable at all. This card now always renders the
//  button. State-specific copy explains what (if anything) is blocking
//  the server action; a client-side blocker check short-circuits the
//  click and surfaces the blocker in the same error-box the server-side
//  reasons land in.
// ─────────────────────────────────────────────────────────────────────────

type PreDraftKind =
  | "no_estimate_sent"
  | "no_intake"
  | "intake_in_progress"
  | "intake_submitted_no_draft";

type CardCopy = {
  eyebrow: string;
  eyebrowColorClass: string;
  headline: string;
  body: string;
  /** Non-null = upstream-blocked. Click short-circuits with this string. */
  clientBlocker: string | null;
};

function copyFor(stateKind: PreDraftKind, submittedAt: string | null): CardCopy {
  switch (stateKind) {
    case "no_estimate_sent":
      return {
        eyebrow: "Step 1 of 3 — send a range proposal",
        eyebrowColorClass: "text-amber-800",
        headline: "Range proposal hasn't been sent",
        body:
          "The finalized quote is generated AFTER the customer accepts a range estimate and submits shipment intake. Switch to the Workspace tab and send a Quick Estimate first. The button below stays present so you always know where the next step lives — clicking it now will explain the same blocker.",
        clientBlocker:
          "Send a range proposal before generating the finalized quote. Switch to the Workspace tab → build a Quick Estimate preview → Send. The Generate Finalized Quote button will then unblock here.",
      };
    case "no_intake":
      return {
        eyebrow: "Step 2 of 3 — waiting on customer intake",
        eyebrowColorClass: "text-amber-800",
        headline: "Customer hasn't started intake yet",
        body:
          "The range estimate has been sent. The customer hasn't opened the acceptance link yet — once they do and submit the shipment intake form, this button will unblock automatically. Refresh after the customer submits or wait for the next page load.",
        clientBlocker:
          "Customer intake must be submitted before generating the finalized quote. The customer hasn't opened the acceptance link yet.",
      };
    case "intake_in_progress":
      return {
        eyebrow: "Step 2 of 3 — customer is still completing intake",
        eyebrowColorClass: "text-amber-800",
        headline: "Customer intake is in progress",
        body:
          "The customer accepted the estimate and opened the intake form but hasn't submitted it yet. Dispatch needs the full operational scope (addresses, dimensions, exact weight, handling) before the finalized quote can be generated. Refresh after the customer submits — or wait.",
        clientBlocker:
          "Customer intake must be submitted before generating the finalized quote. The customer opened the intake form but hasn't submitted it yet.",
      };
    case "intake_submitted_no_draft":
      return {
        eyebrow: "Ready to finalize",
        eyebrowColorClass: "text-green-800",
        headline: "Shipment intake submitted",
        body:
          (submittedAt
            ? "The customer submitted the full operational scope. "
            : "") +
          "Generating the finalized quote prefills the rate confirmation from intake data — adjust pickup/delivery details, set exact pricing, and build the preview before sending.",
        clientBlocker: null,
      };
  }
}

function GenerateDraftCard({
  quoteRequestId,
  stateKind,
  submittedAt,
}: {
  quoteRequestId: string;
  stateKind: PreDraftKind;
  submittedAt: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const copy = copyFor(stateKind, submittedAt);
  const isBlocked = copy.clientBlocker !== null;

  function onGenerate() {
    setError(null);
    setStatus(null);

    // Phase FLOW-FIX-2: short-circuit the server round-trip when we
    // already know the upstream gate will reject. The server action
    // ALSO enforces the gate (defense-in-depth); this just keeps the
    // operator from waiting on a network hop to learn what they
    // already could have known.
    if (copy.clientBlocker) {
      setError(copy.clientBlocker);
      return;
    }

    setStatus("Generating finalized quote…");
    startTransition(async () => {
      try {
        const result = await generateFinalizedQuoteDraft(quoteRequestId);
        if (result.ok) {
          setStatus("Finalized quote draft created. Opening composer…");
          router.refresh();
        } else {
          setStatus(null);
          setError(result.reason);
        }
      } catch (e) {
        // Phase FLOW-FIX: classify any thrown failure so the button is
        // never silent. NEXT_REDIRECT → session expired hint; sanitized
        // production message → stage-tagged Vercel-log pointer; anything
        // else verbatim.
        setStatus(null);
        const msg = e instanceof Error ? e.message : String(e);
        const digest = (e as { digest?: unknown } | undefined)?.digest;
        const digestStr = typeof digest === "string" ? digest : "";
        if (digestStr.startsWith("NEXT_REDIRECT")) {
          setError("Session expired — please log in again, then retry.");
        } else if (
          /An error occurred in the Server Components render/.test(msg) ||
          msg === "" ||
          msg === "An unexpected response was received from the server."
        ) {
          setError(
            "Could not generate the finalized quote. The server logged a stage-tagged error — check Vercel logs for `[generateFinalizedQuoteDraft]`.",
          );
        } else {
          setError(msg || "Could not generate the finalized quote.");
        }
      }
    });
  }

  return (
    <section
      className={
        "border border-zinc-200 border-t-2 bg-zinc-100 p-5 sm:p-6 " +
        (isBlocked ? "border-t-amber-500" : "border-t-red-600")
      }
    >
      <p
        className={
          "font-mono text-xs tracking-[0.12em] uppercase " + copy.eyebrowColorClass
        }
      >
        {copy.eyebrow}
      </p>
      <h3 className="mt-2 text-xl font-display tracking-tight text-zinc-900 sm:text-2xl">
        {copy.headline}
      </h3>
      {submittedAt ? (
        <p
          className="mt-1 font-mono text-xs text-zinc-600"
          title={formatDateFull(submittedAt)}
        >
          Submitted {relativeTime(submittedAt)}{" "}
          <span aria-hidden className="mx-1 text-zinc-600">
            ·
          </span>{" "}
          {formatDateFull(submittedAt)}
        </p>
      ) : null}
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-700">
        {copy.body}
      </p>

      {/* Phase FLOW-FIX-2: status + error rendered as separate stripes
          so the operator sees immediate feedback on every click. status
          is the optimistic "Generating finalized quote…" / "Finalized
          quote draft created. Opening composer…" line; error is the
          red-bordered final result when something fails or the upstream
          gate is closed. They are mutually exclusive in practice but
          the layout keeps both visible just in case. */}
      {status ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 font-mono text-xs tracking-[0.12em] text-green-800 uppercase"
        >
          {status}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="mt-4 flex items-start gap-3 border border-red-300 bg-red-50 p-4">
          <span aria-hidden className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600" />
          <p className="text-sm leading-relaxed text-red-800">{error}</p>
        </div>
      ) : null}

      <div className="mt-5">
        <button
          type="button"
          onClick={onGenerate}
          disabled={isPending}
          aria-disabled={isPending}
          className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-6 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "Generating…" : "Generate Finalized Quote"}
        </button>
      </div>
    </section>
  );
}

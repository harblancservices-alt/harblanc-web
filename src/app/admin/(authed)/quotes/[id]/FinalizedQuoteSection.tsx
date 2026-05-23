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

/**
 * Finalized Quote orchestration shell.
 *
 * The Finalized Quote / Rate Confirmation is only available AFTER the
 * customer accepts the range estimate AND submits the shipment intake.
 * This component gates that state machine and routes the operator to
 * the right next action.
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
};

export function FinalizedQuoteSection(props: FinalizedQuoteSectionProps) {
  // Phase J2: submittedIntake prop preserved on the type for callsite
  // stability but no longer destructured/rendered here. The intake panel
  // lives on the Workspace tab only.
  const { quoteRequestId, leadName, state, sentHistory, isTrashed } = props;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-red-500 uppercase">
          Finalized quote
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-300">
          Formal rate confirmation with exact pricing. Generated after the
          customer accepts the range estimate and submits intake.
        </p>
      </header>

      {/* Phase J2: intake summary panel removed — it duplicated the one
          on the Workspace tab. The composer below still prefills from
          intake data via the server data loader, so removing the panel
          doesn't change what the operator can see or do; it just removes
          the redundant on-screen copy when switching to this tab. */}

      {isTrashed ? (
        <TrashGate />
      ) : state.kind === "no_estimate_sent" ? (
        <InfoCard
          headline="Send a range proposal first"
          body="Finalized quotes are generated after the customer accepts a range estimate. Build and send an estimate from the Workspace tab."
        />
      ) : state.kind === "no_intake" ? (
        <InfoCard
          headline="Waiting on customer intake"
          body="The estimate has been sent. The customer has not opened the acceptance link yet. Once they accept and submit shipment details, generate the finalized quote here."
        />
      ) : state.kind === "intake_in_progress" ? (
        <InfoCard
          headline="Customer is still completing intake"
          body="The customer started the shipment intake but hasn't submitted it. Wait for submission before generating the finalized quote — dispatch needs the full operational scope."
        />
      ) : state.kind === "intake_submitted_no_draft" ? (
        <GenerateDraftCard
          quoteRequestId={quoteRequestId}
          submittedAt={state.submittedAt}
        />
      ) : (
        <FinalizedQuoteComposer
          key={state.draft.id}
          quoteRequestId={quoteRequestId}
          leadName={leadName}
          draft={state.draft}
        />
      )}

      {/* Phase L: explicit "history" heading so the historical record
          reads as separate from the active workflow above. */}
      <section className="space-y-5">
        <h2 className="border-b border-neutral-800 pb-2.5 text-sm font-semibold uppercase tracking-[0.18em] text-white">
          Finalized quote history
        </h2>
        <SentFinalizedQuotesList rows={sentHistory} />
      </section>
    </div>
  );
}

function TrashGate() {
  return (
    <section className="border border-neutral-800 bg-neutral-950 p-8 text-center">
      <p className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
        Request is in trash
      </p>
      <p className="mt-3 text-sm leading-relaxed text-neutral-400">
        Restore the request from trash to work on the finalized quote.
      </p>
    </section>
  );
}

function InfoCard({ headline, body }: { headline: string; body: string }) {
  return (
    <section className="border border-neutral-800 bg-neutral-900/40 p-5 sm:p-6">
      <p className="font-mono text-[10px] tracking-[0.22em] text-amber-400 uppercase">
        {headline}
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-300">
        {body}
      </p>
    </section>
  );
}

function GenerateDraftCard({
  quoteRequestId,
  submittedAt,
}: {
  quoteRequestId: string;
  submittedAt: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateFinalizedQuoteDraft(quoteRequestId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.reason);
      }
    });
  }

  return (
    <section className="border border-neutral-800 border-t-2 border-t-red-600 bg-neutral-900/40 p-5 sm:p-6">
      <p className="font-mono text-[10px] tracking-[0.22em] text-green-400 uppercase">
        Ready to finalize
      </p>
      <h3 className="mt-2 text-xl font-display tracking-tight text-white sm:text-2xl">
        Shipment intake submitted
      </h3>
      <p
        className="mt-1 font-mono text-[10px] text-neutral-500"
        title={formatDateFull(submittedAt)}
      >
        Submitted {relativeTime(submittedAt)}{" "}
        <span aria-hidden className="mx-1 text-neutral-700">
          ·
        </span>{" "}
        {formatDateFull(submittedAt)}
      </p>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-300">
        The customer has submitted the full operational scope. Generating
        the finalized quote prefills the rate confirmation from intake data —
        adjust pickup/delivery details, set exact pricing, and build the
        preview before sending.
      </p>

      {error ? (
        <div role="alert" className="mt-4 flex items-start gap-3 border border-red-700 bg-red-950/30 p-4">
          <span aria-hidden className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600" />
          <p className="text-sm leading-relaxed text-red-200">{error}</p>
        </div>
      ) : null}

      <div className="mt-5">
        <button
          type="button"
          onClick={onGenerate}
          disabled={isPending}
          className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "Generating..." : "Generate finalized quote"}
        </button>
      </div>
    </section>
  );
}

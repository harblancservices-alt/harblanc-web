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
import {
  SubmittedIntakePanel,
  type SubmittedIntakeData,
} from "./SubmittedIntakePanel";

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
  const { quoteRequestId, leadName, state, sentHistory, isTrashed, submittedIntake } = props;

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
          Finalized quote / rate confirmation
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-300">
          The formal, contract-adjacent agreement document. Generated after the
          customer accepts the range estimate and submits the shipment intake.
          Exact pricing, dispatch-confirmed scope. Distinct from the range
          proposal and from the bill of lading.
        </p>
      </header>

      {/* Intake summary — visible alongside the state-machine UI once the
          customer has submitted shipment details, so dispatch reviews the
          finalized operational scope before generating the rate confirmation. */}
      {!isTrashed && submittedIntake ? (
        <SubmittedIntakePanel intake={submittedIntake} />
      ) : null}

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

      <SentFinalizedQuotesList rows={sentHistory} />
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateFull, relativeTime } from "@/lib/admin/format";
import { generateBolDraft } from "../bol-actions";
import {
  BillOfLadingComposer,
  type BolDraft,
} from "./BillOfLadingComposer";
import {
  SentBolsList,
  type SentBolRow,
} from "./SentBolsList";

/**
 * Bill of Lading orchestration shell.
 *
 * The BOL is downstream from the commercial agreement. It only enters
 * play AFTER the finalized quote has been sent. This shell gates the
 * state machine:
 *
 *   ┌── No sent finalized quote        → tell them to send an FQ first
 *   ├── FQ sent, no BOL draft yet      → "Generate BOL" CTA
 *   └── BOL draft exists               → render the composer
 *
 * Once any BOL has been sent it appears in the SentBolsList history
 * below regardless of the current state — re-issues live alongside
 * the original record.
 */

export type BolWorkflowState =
  | { kind: "no_finalized_quote_sent" }
  | { kind: "finalized_quote_sent_no_draft"; finalizedQuoteSentAt: string }
  | { kind: "draft"; draft: BolDraft; finalizedQuoteSentAt: string };

export type BillOfLadingSectionProps = {
  quoteRequestId: string;
  leadName: string;
  state: BolWorkflowState;
  sentHistory: SentBolRow[];
  isTrashed: boolean;
};

export function BillOfLadingSection(props: BillOfLadingSectionProps) {
  const { quoteRequestId, leadName, state, sentHistory, isTrashed } = props;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold tracking-[0.12em] text-red-600 uppercase">
          Bill of lading
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-700">
          Shipment execution paperwork. Rides with the freight and gets
          signed by shipper, driver, and consignee. Generated downstream
          from the finalized quote.
        </p>
      </header>

      {isTrashed ? (
        <TrashGate />
      ) : state.kind === "no_finalized_quote_sent" ? (
        <InfoCard
          headline="Send a finalized quote first"
          body="The BOL is generated after the rate confirmation has been issued. Send a finalized quote from the Finalized Quote tab, confirm payment / deposit status with the customer, then return here to generate the BOL."
        />
      ) : state.kind === "finalized_quote_sent_no_draft" ? (
        <GenerateDraftCard
          quoteRequestId={quoteRequestId}
          finalizedQuoteSentAt={state.finalizedQuoteSentAt}
        />
      ) : (
        <BillOfLadingComposer
          key={state.draft.id}
          quoteRequestId={quoteRequestId}
          leadName={leadName}
          draft={state.draft}
        />
      )}

      {/* Phase M: explicit "history" heading so the historical record
          reads as separate from the active workflow above. Mirrors the
          Finalized Quote tab's Phase L structure. */}
      <section className="space-y-5">
        <h2 className="border-b border-zinc-200 pb-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-900">
          BOL history
        </h2>
        <SentBolsList rows={sentHistory} />
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
        Restore the request from trash to work on the bill of lading.
      </p>
    </section>
  );
}

function InfoCard({ headline, body }: { headline: string; body: string }) {
  return (
    <section className="border border-zinc-200 bg-zinc-100 p-5 sm:p-6">
      <p className="font-mono text-xs tracking-[0.12em] text-amber-800 uppercase">
        {headline}
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-700">
        {body}
      </p>
    </section>
  );
}

function GenerateDraftCard({
  quoteRequestId,
  finalizedQuoteSentAt,
}: {
  quoteRequestId: string;
  finalizedQuoteSentAt: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateBolDraft(quoteRequestId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.reason);
      }
    });
  }

  return (
    <section className="border border-zinc-200 border-t-2 border-t-red-600 bg-zinc-100 p-5 sm:p-6">
      <p className="font-mono text-xs tracking-[0.12em] text-green-800 uppercase">
        Ready for execution paperwork
      </p>
      <h3 className="mt-2 text-xl font-display tracking-tight text-zinc-900 sm:text-2xl">
        Finalized quote sent
      </h3>
      <p
        className="mt-1 font-mono text-xs text-zinc-600"
        title={formatDateFull(finalizedQuoteSentAt)}
      >
        Sent {relativeTime(finalizedQuoteSentAt)}{" "}
        <span aria-hidden className="mx-1 text-zinc-600">
          ·
        </span>{" "}
        {formatDateFull(finalizedQuoteSentAt)}
      </p>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-700">
        Generate the BOL when the shipment is operationally approved and
        payment / deposit status is acceptable. Fields prefill from the
        finalized quote; adjust for execution details (NMFC code, freight
        class, pickup / delivery instructions, hazmat) before building the
        preview.
      </p>

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
          className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-6 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "Generating..." : "Generate BOL"}
        </button>
      </div>
    </section>
  );
}

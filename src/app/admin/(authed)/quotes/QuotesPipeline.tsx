import Link from "next/link";
import { PIPELINE_STAGES, type PipelineCard } from "@/lib/dispatch/pipeline";

/**
 * Quote pipeline funnel — the 6-stage board moved from the dashboard to the
 * top of the Quotes page. Renders the active (non-expired) pipeline cards
 * grouped by stage. Server component (links only, no client state).
 */

type CardTone = "red" | "orange" | "green" | "neutral";

const CARD_CLASS: Record<CardTone, string> = {
  red: "border-bad/40 bg-bad-bg hover:bg-bad-bg/70",
  orange: "border-warn/40 bg-warn-bg hover:bg-warn-bg/70",
  green: "border-ok/40 bg-ok-bg hover:bg-ok-bg/70",
  neutral: "border-line bg-card hover:bg-inset",
};

// Card priority colour, matching the Quotes page's red/amber urgency:
//   green  = money stage (finalized sent / paid)
//   red    = never opened — act on it
//   orange = estimate out 24h+ and needs a follow-up
//   neutral = everything else
function cardTone(q: PipelineCard): CardTone {
  if (q.stage === "awaiting_payment" || q.stage === "booked") return "green";
  if (q.status === "expired") return "red";
  if (q.status === "unseen") return "red";
  if (q.status === "followup") return "orange";
  return "neutral";
}

export function QuotesPipeline({
  cards,
}: {
  cards: ReadonlyArray<PipelineCard>;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">
          Pipeline
        </span>
        <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
          · {cards.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {PIPELINE_STAGES.map((stage) => (
          <PipelineColumn
            key={stage.key}
            label={stage.label}
            cards={cards.filter((q) => q.stage === stage.key)}
          />
        ))}
      </div>
    </section>
  );
}

function PipelineColumn({
  label,
  cards,
}: {
  label: string;
  cards: ReadonlyArray<PipelineCard>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-inset shadow-e1">
      <div className="flex items-center justify-between bg-bar px-2.5 py-1.5">
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-bar-fg">
          {label}
        </span>
        <span className="font-mono text-[10.5px] tabular-nums text-bar-fg/70">
          {cards.length}
        </span>
      </div>
      {cards.length === 0 ? (
        <div className="m-1.5 rounded-md border border-dashed border-line-strong px-3 py-5 text-center font-mono text-[11px] text-ink-3">
          Empty
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 p-1.5">
          {cards.map((q) => (
            <QuoteRequestCardItem key={q.leadId} q={q} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuoteRequestCardItem({ q }: { q: PipelineCard }) {
  return (
    <Link
      href={"/admin/quotes/" + q.leadId}
      prefetch={false}
      className={
        "block rounded-md border p-2.5 shadow-e1 transition-all hover:shadow-e2 " +
        CARD_CLASS[cardTone(q)]
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-[14px] font-semibold text-fg">
          {q.name}
        </span>
        {q.status === "expired" ? (
          <span className="shrink-0 rounded bg-bad-bg px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-bad">
            Expired
          </span>
        ) : q.status === "unseen" ? (
          <span className="shrink-0 rounded bg-bad-bg px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-bad">
            New
          </span>
        ) : q.status === "followup" ? (
          <span className="shrink-0 rounded bg-warn-bg px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-warn">
            Follow up
          </span>
        ) : null}
      </div>

      <LanePoint zip={q.originZip} place={q.originPlace} />
      <div className="my-1.5 flex items-center gap-2 text-fg-subtle">
        <span aria-hidden className="text-[12px] leading-none">
          ↓
        </span>
        <span aria-hidden className="h-px flex-1 bg-line" />
        <span className="shrink-0 rounded-full bg-inset px-2 py-[1px] font-mono text-[11px] font-semibold tabular-nums text-ink-2">
          {q.miles != null ? Math.round(q.miles).toLocaleString() + " mi" : "— mi"}
        </span>
      </div>
      <LanePoint zip={q.destZip} place={q.destPlace} />

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line/60 pt-2.5">
        <span className="inline-flex items-baseline gap-1.5 rounded-full bg-amber-500 px-2.5 py-[3px] font-mono tabular-nums">
          <span className="text-[12px] font-semibold text-white">
            {q.dateLabel}
          </span>
          <span className="text-[11.5px] font-medium text-white/85">
            · {q.ageLabel}
          </span>
        </span>
        {(q.stage === "awaiting_payment" || q.stage === "booked") &&
        q.priceDisplay ? (
          <span className="shrink-0 font-mono text-[14px] font-bold tabular-nums text-fg">
            {q.priceDisplay}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function LanePoint({ zip, place }: { zip: string; place: string }) {
  return (
    <div className="truncate text-[13px] font-medium">
      <span className="font-mono text-steel">{zip}</span>
      {place ? <span className="text-fg-muted"> · {place}</span> : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { softDeleteQuotes } from "./quotes/actions";

/**
 * Quote-requests board (client) — the opportunity cards plus a bulk
 * select / delete toolbar for cleanup. Selection is local state; deleting
 * posts the chosen ids to the existing `softDeleteQuotes` server action,
 * which moves them to trash (recoverable for 30 days) and revalidates the
 * dashboard so the cards drop off.
 */

export type QuoteStatus = "unseen" | "followup" | "ok";

export type QuoteRequestCard = {
  leadId: string;
  name: string;
  ageLabel: string;
  status: QuoteStatus;
  originZip: string;
  originPlace: string;
  destZip: string;
  destPlace: string;
  miles: number | null;
};

const CARD_CLASS: Record<QuoteStatus, string> = {
  unseen: "border-red-400 bg-red-50",
  followup: "border-amber-400 bg-amber-50",
  ok: "border-line bg-card",
};

export function QuoteRequestsBoard({
  cards,
}: {
  cards: ReadonlyArray<QuoteRequestCard>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = cards.length > 0 && selected.size === cards.length;
  const anySelected = selected.size > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === cards.length
        ? new Set()
        : new Set(cards.map((c) => c.leadId)),
    );
  }

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-fg-muted">
          Quote requests
        </span>
        <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
          · {cards.length}
        </span>

        {cards.length > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleAll}
              className="rounded-md border border-line bg-card px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:bg-elevated"
            >
              {allSelected ? "Clear" : "Select all"}
            </button>

            {anySelected ? (
              <form
                action={softDeleteQuotes}
                onSubmit={(e) => {
                  if (
                    !window.confirm(
                      `Delete ${selected.size} quote${selected.size === 1 ? "" : "s"}? They move to trash and can be restored for 30 days.`,
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                {[...selected].map((id) => (
                  <input key={id} type="hidden" name="ids" value={id} />
                ))}
                <button
                  type="submit"
                  className="rounded-md border border-red-700 bg-red-600 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700"
                >
                  Delete {selected.size}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-card px-4 py-6 text-center font-mono text-[12px] text-fg-subtle">
          No open quote requests right now.
        </div>
      ) : (
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {cards.map((q) => (
            <Card
              key={q.leadId}
              q={q}
              selected={selected.has(q.leadId)}
              onToggle={() => toggle(q.leadId)}
              onOpen={() => router.push("/admin/quotes/" + q.leadId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({
  q,
  selected,
  onToggle,
  onOpen,
}: {
  q: QuoteRequestCard;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={
        "cursor-pointer rounded-xl border p-3.5 shadow-sm transition-colors hover:brightness-[0.98] " +
        CARD_CLASS[q.status] +
        (selected ? " ring-2 ring-red-500" : "")
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${q.name}`}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
          className="h-4 w-4 shrink-0 cursor-pointer accent-red-600"
        />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">
          {q.name}
        </span>
        {q.status === "unseen" ? (
          <span className="shrink-0 rounded-md bg-red-600 px-2 py-[2px] font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-white">
            New
          </span>
        ) : q.status === "followup" ? (
          <span className="shrink-0 rounded-md bg-amber-500 px-2 py-[2px] font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-white">
            Follow up
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-subtle">
            {q.ageLabel}
          </span>
        )}
      </div>

      <LanePoint zip={q.originZip} place={q.originPlace} />
      <div className="my-1 flex items-center gap-2 text-fg-subtle">
        <span aria-hidden className="text-[12px] leading-none">
          ↓
        </span>
        <span aria-hidden className="h-px flex-1 bg-line" />
        <span className="shrink-0 font-mono text-[12px] font-medium tabular-nums text-fg-muted">
          {q.miles != null
            ? Math.round(q.miles).toLocaleString() + " mi"
            : "— mi"}
        </span>
      </div>
      <LanePoint zip={q.destZip} place={q.destPlace} />
    </div>
  );
}

function LanePoint({ zip, place }: { zip: string; place: string }) {
  return (
    <div className="truncate text-[13px] font-medium">
      <span className="font-mono text-blue-700">{zip}</span>
      {place ? <span className="text-fg-muted"> · {place}</span> : null}
    </div>
  );
}

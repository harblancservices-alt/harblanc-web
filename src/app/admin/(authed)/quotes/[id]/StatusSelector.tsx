"use client";

import { useState, useTransition } from "react";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_CLASSES_LIGHT,
  suggestedNext,
  type LeadStatus,
} from "@/lib/dispatch/status";
import { updateLeadStatus } from "../actions";

/**
 * Status selector — change the lead's funnel state.
 *
 * Two interaction patterns at once:
 *   - One-tap "next state" button (suggestedNext) on the left
 *   - Full dropdown to jump anywhere on the right
 *
 * Both call updateLeadStatus, which logs to the dispatch_events
 * timeline and revalidates the page.
 */
export function StatusSelector({
  quoteRequestId,
  status,
}: {
  quoteRequestId: string;
  status: LeadStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeTo(next: LeadStatus) {
    setError(null);
    startTransition(async () => {
      try {
        await updateLeadStatus(quoteRequestId, next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Status change failed.");
      }
    });
  }

  const next = suggestedNext(status);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
      {next ? (
        <button
          type="button"
          onClick={() => changeTo(next)}
          disabled={isPending}
          className={
            "btn-cut inline-flex w-full items-center justify-center px-4 py-3 text-xs font-semibold tracking-[0.12em] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto " +
            "bg-red-600 text-white hover:bg-red-500"
          }
          title={`Move to ${LEAD_STATUS_LABELS[next]}`}
        >
          {isPending ? "…" : `→ ${LEAD_STATUS_LABELS[next]}`}
        </button>
      ) : null}

      <label className="flex w-full items-center gap-2 sm:w-auto">
        <span className="sr-only">Set lead status</span>
        <select
          value={status}
          onChange={(e) => changeTo(e.target.value as LeadStatus)}
          disabled={isPending}
          className={
            "w-full border bg-white px-3 py-3 text-xs font-semibold tracking-[0.12em] uppercase text-zinc-900 focus:border-red-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto " +
            LEAD_STATUS_CLASSES_LIGHT[status].split(" ").filter((c) => c.startsWith("border-")).join(" ")
          }
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s} className="bg-white text-zinc-900">
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p
          role="alert"
          className="text-xs font-semibold tracking-[0.12em] text-red-600 uppercase"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

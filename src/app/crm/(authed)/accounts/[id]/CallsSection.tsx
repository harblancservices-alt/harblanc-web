"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN_DANGER, Card, CardHead, ZEBRA_ROWS } from "../../_shell/ui";
import { formatDateTime } from "../../_shell/format";
import { callOutcomeLabel, callOutcomeTone } from "../../calls/outcomes";
import { deleteCall } from "../../calls/actions";

export type CrmCallLogItem = {
  id: string;
  outcome: string | null;
  contactName: string | null;
  durationSeconds: number | null;
  summary: string | null;
  notes: string | null;
  followupRequired: boolean;
  reminderAt: string | null;
  occurredAt: string;
  author: string | null;
};

/**
 * The raw call log on the company profile — every crm_calls row (log via the
 * masthead's "Log call" button), newest-first, each deletable. Distinct from
 * ActivityTimeline: the timeline is an APPEND-ONLY audit feed of everything
 * that happened (calls included, as a summary line), while this is the
 * editable operational log a call actually lives in — deleting here removes
 * the crm_calls row but leaves that historical timeline entry alone.
 */
export function CallsSection({
  accountId,
  calls,
}: {
  accountId: string;
  calls: CrmCallLogItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();

  function remove(call: CrmCallLogItem) {
    if (!window.confirm("Delete this call log entry? This can't be undone from here.")) {
      return;
    }
    setBusyId(call.id);
    startTransition(async () => {
      const res = await deleteCall(call.id, accountId);
      setBusyId(null);
      if (res.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHead title="Calls" hint={calls.length ? `${calls.length} logged` : undefined} />

      {calls.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-fg-muted">
          No calls logged yet. Use "Log call" above to record one.
        </p>
      ) : (
        <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
          {calls.map((c) => (
            <li key={c.id} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${callOutcomeTone(c.outcome)}`}
                    >
                      {callOutcomeLabel(c.outcome)}
                    </span>
                    {c.followupRequired && (
                      <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
                        Follow-up
                      </span>
                    )}
                  </div>
                  {c.summary && (
                    <p className="mt-1 text-[13.5px] font-medium text-fg">{c.summary}</p>
                  )}
                  {c.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg-muted">
                      {c.notes}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-subtle">
                    <span>{formatDateTime(c.occurredAt)}</span>
                    {c.contactName && (
                      <>
                        <span>·</span>
                        <span>{c.contactName}</span>
                      </>
                    )}
                    {c.durationSeconds !== null && (
                      <>
                        <span>·</span>
                        <span>{Math.round(c.durationSeconds / 60)}m</span>
                      </>
                    )}
                    {c.author && (
                      <>
                        <span>·</span>
                        <span>{c.author}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(c)}
                  disabled={pending}
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[12px] font-semibold transition-colors ${BTN_DANGER}`}
                >
                  {busyId === c.id ? "…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHead, Badge, type BadgeTone } from "../../_shell/ui";
import { Modal } from "../../_shell/Modal";
import { saveOtrNotes, setOtrStatus, releaseOtrEntry, type OtrStatus } from "./actions";
import { TaskOfferButton } from "../../tasks/TaskOfferButton";

export type OtrEntryData = {
  id: string;
  companyName: string;
  city: string | null;
  state: string | null;
  industry: string | null;
  notes: string | null;
  salesRelevance: "high" | "medium" | "low" | null;
  status: OtrStatus;
  releasedAccountId: string | null;
};

const STATUS_LABEL: Record<OtrStatus, string> = {
  new: "New",
  researching: "Researching",
  ready_for_approval: "Ready for Approval",
  released: "Released",
  rejected: "Rejected",
};
const STATUS_TONE: Record<OtrStatus, BadgeTone> = {
  new: "neutral",
  researching: "accent",
  ready_for_approval: "warning",
  released: "success",
  rejected: "danger",
};
const STATUS_DESCRIPTION: Record<OtrStatus, string> = {
  new: "Not yet started.",
  researching: "Being researched — no document, just what Brent said and what turns up.",
  ready_for_approval: "Research done — ready for a release decision.",
  released: "Released to Prospects — a company now exists, waiting to be claimed.",
  rejected: "Filed, not deleted — can be reopened.",
};

const BTN_ADMIN = "border border-admin bg-admin text-white hover:bg-admin-hover disabled:opacity-60";

export function OtrEntryCard({ otr }: { otr: OtrEntryData }) {
  const router = useRouter();
  const [notes, setNotes] = useState(otr.notes ?? "");
  const [relevance, setRelevance] = useState<"high" | "medium" | "low" | null>(otr.salesRelevance);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [pending, startTransition] = useTransition();
  const editable = otr.status !== "released" && otr.status !== "rejected";

  function saveNotes() {
    startTransition(async () => {
      await saveOtrNotes(otr.id, notes, relevance);
      router.refresh();
    });
  }

  function changeRelevance(level: "high" | "medium" | "low") {
    setRelevance(level);
    startTransition(async () => {
      await saveOtrNotes(otr.id, notes, level);
      router.refresh();
    });
  }

  function transition(status: Exclude<OtrStatus, "released">) {
    startTransition(async () => {
      await setOtrStatus(otr.id, status);
      router.refresh();
    });
  }

  function release() {
    startTransition(async () => {
      await releaseOtrEntry(otr.id);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHead
        title={otr.companyName}
        hint={[otr.industry, [otr.city, otr.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || undefined}
        right={<Badge tone={STATUS_TONE[otr.status]}>{STATUS_LABEL[otr.status]}</Badge>}
      />
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[11.5px] text-fg-muted">{STATUS_DESCRIPTION[otr.status]}</p>

        {otr.status === "released" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-admin/45 bg-admin-soft px-4 py-3">
            <p className="text-[13.5px] text-fg">Released to Prospects — waiting to be claimed.</p>
            <div className="flex shrink-0 items-center gap-2">
              {otr.releasedAccountId && (
                <TaskOfferButton
                  label="+ Add follow-up task"
                  defaults={{
                    title: `Follow up with ${otr.companyName}`,
                    task_type: "Follow-up call",
                    account_id: otr.releasedAccountId,
                  }}
                />
              )}
              {otr.releasedAccountId && (
                <Link href={`/crm/accounts/${otr.releasedAccountId}`} className="text-[13px] font-semibold text-admin hover:underline">
                  View company →
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Research notes</span>
              {editable ? (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={saveNotes}
                  placeholder="What did Brent say? What did you find out?"
                  className="h-20 w-full resize-none rounded-md border border-line-strong bg-inset p-2.5 text-[13px] text-fg outline-none focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/20"
                />
              ) : (
                <p className="text-[13.5px] text-fg-muted">{otr.notes || "—"}</p>
              )}
            </label>

            {editable && (
              <div>
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Sales relevance</span>
                <div className="flex flex-wrap gap-1.5">
                  {(["high", "medium", "low"] as const).map((level) => {
                    const isActive = relevance === level;
                    const tone = level === "high" ? "border-ok bg-ok text-white" : level === "medium" ? "border-warn bg-warn text-white" : "border-fg-subtle bg-fg-subtle text-white";
                    return (
                      <button
                        key={level}
                        type="button"
                        disabled={pending}
                        onClick={() => changeRelevance(level)}
                        className={`h-8 rounded-md border px-3 text-[12px] font-bold capitalize transition-colors ${
                          isActive ? tone : "border-line-strong bg-card text-fg-muted hover:bg-inset"
                        }`}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              {otr.status === "new" && (
                <button type="button" disabled={pending} onClick={() => transition("researching")} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_ADMIN}`}>
                  Start Research
                </button>
              )}
              {otr.status === "researching" && (
                <button type="button" disabled={pending} onClick={() => transition("ready_for_approval")} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_ADMIN}`}>
                  Mark Ready for Approval
                </button>
              )}
              {otr.status === "ready_for_approval" && (
                <>
                  <button type="button" disabled={pending} onClick={release} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_ADMIN}`}>
                    Release to Prospects
                  </button>
                  <button type="button" disabled={pending} onClick={() => transition("researching")} className="inline-flex h-8 items-center rounded-md border border-line-strong bg-card px-3 text-[12.5px] font-bold text-fg-muted transition-colors hover:bg-inset">
                    Keep Researching
                  </button>
                </>
              )}
              {otr.status === "rejected" ? (
                <button type="button" disabled={pending} onClick={() => transition("researching")} className="inline-flex h-8 items-center rounded-md border border-line-strong bg-card px-3 text-[12.5px] font-bold text-fg-muted transition-colors hover:bg-inset">
                  Reopen
                </button>
              ) : (
                <button type="button" disabled={pending} onClick={() => setConfirmingReject(true)} className="inline-flex h-8 items-center rounded-md border border-bad/30 bg-bad-bg px-3 text-[12.5px] font-bold text-bad transition-colors hover:bg-bad/10">
                  Reject
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <Modal open={confirmingReject} onClose={() => setConfirmingReject(false)} title="Reject this entry?">
        <p className="mb-4 text-[13.5px] text-fg-muted">
          {otr.companyName} won&rsquo;t be researched further and won&rsquo;t be released to Prospects. Filed, not deleted — it can be reopened later.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmingReject(false)} className="inline-flex h-9 items-center rounded-md border border-line-strong bg-card px-3.5 text-[13px] font-semibold text-fg-muted hover:bg-inset">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              transition("rejected");
              setConfirmingReject(false);
            }}
            className="inline-flex h-9 items-center rounded-md border border-bad/30 bg-bad-bg px-3.5 text-[13px] font-semibold text-bad hover:bg-bad/10"
          >
            Reject
          </button>
        </div>
      </Modal>
    </Card>
  );
}

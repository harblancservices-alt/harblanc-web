"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Badge, type BadgeTone } from "../../_shell/ui";
import { Modal } from "../../_shell/Modal";
import { saveBolNotes, setBolStatus, type BolStatus } from "./actions";

export type BolEntryData = {
  id: string;
  bolNumber: string | null;
  carrier: string | null;
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  billTo: string | null;
  commodity: string | null;
  weight: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  reference: string | null;
  notes: string | null;
  status: BolStatus;
};

const STATUS_LABEL: Record<BolStatus, string> = {
  new: "New",
  researching: "Researching",
  ready_for_approval: "Ready for Approval",
  released: "Released",
  rejected: "Rejected",
};
const STATUS_TONE: Record<BolStatus, BadgeTone> = {
  new: "neutral",
  researching: "accent",
  ready_for_approval: "warning",
  released: "success",
  rejected: "danger",
};
const STATUS_DESCRIPTION: Record<BolStatus, string> = {
  new: "Not yet started.",
  researching: "Being researched against the paperwork.",
  ready_for_approval: "Research done — ready for a release decision.",
  released: "Finalized — this profile is complete.",
  rejected: "Filed, not deleted — can be reopened.",
};

const BTN_ADMIN = "border border-admin bg-admin text-white hover:bg-admin-hover disabled:opacity-60";

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</p>
      <p className="text-[13.5px] text-fg">{value}</p>
    </div>
  );
}

export function BolEntryCard({ bol }: { bol: BolEntryData }) {
  const router = useRouter();
  const [notes, setNotes] = useState(bol.notes ?? "");
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [pending, startTransition] = useTransition();
  const editable = bol.status !== "released" && bol.status !== "rejected";

  function saveNotes() {
    startTransition(async () => {
      await saveBolNotes(bol.id, notes);
      router.refresh();
    });
  }

  function transition(status: BolStatus) {
    startTransition(async () => {
      await setBolStatus(bol.id, status);
      router.refresh();
    });
  }

  const title = bol.bolNumber ? `BOL ${bol.bolNumber}` : bol.shipperName || "Untitled BOL";
  const hint = [bol.carrier, [bol.shipperName, bol.consigneeName].filter(Boolean).join(" → ")]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <CardHead title={title} hint={hint || undefined} right={<Badge tone={STATUS_TONE[bol.status]}>{STATUS_LABEL[bol.status]}</Badge>} />
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[11.5px] text-fg-muted">{STATUS_DESCRIPTION[bol.status]}</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line-strong bg-inset p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Shipper</p>
            <p className="text-[13.5px] font-semibold text-fg">{bol.shipperName || "—"}</p>
            {bol.shipperAddress && <p className="mt-0.5 text-[12.5px] text-fg-muted">{bol.shipperAddress}</p>}
          </div>
          <div className="rounded-md border border-line-strong bg-inset p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Consignee</p>
            <p className="text-[13.5px] font-semibold text-fg">{bol.consigneeName || "—"}</p>
            {bol.consigneeAddress && <p className="mt-0.5 text-[12.5px] text-fg-muted">{bol.consigneeAddress}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Field label="Commodity" value={bol.commodity} />
          <Field label="Weight" value={bol.weight} />
          <Field label="Pickup" value={bol.pickupDate} />
          <Field label="Delivery" value={bol.deliveryDate} />
          <Field label="Bill to" value={bol.billTo} />
          <Field label="Reference" value={bol.reference} />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Research notes</span>
          {editable ? (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="What did the research turn up?"
              className="h-20 w-full resize-none rounded-md border border-line-strong bg-inset p-2.5 text-[13px] text-fg outline-none focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/20"
            />
          ) : (
            <p className="text-[13.5px] text-fg-muted">{bol.notes || "—"}</p>
          )}
        </label>

        {editable && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {bol.status === "new" && (
              <button type="button" disabled={pending} onClick={() => transition("researching")} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_ADMIN}`}>
                Start Research
              </button>
            )}
            {bol.status === "researching" && (
              <button type="button" disabled={pending} onClick={() => transition("ready_for_approval")} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_ADMIN}`}>
                Mark Ready for Approval
              </button>
            )}
            {bol.status === "ready_for_approval" && (
              <>
                <button type="button" disabled={pending} onClick={() => transition("released")} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_ADMIN}`}>
                  Release
                </button>
                <button type="button" disabled={pending} onClick={() => transition("researching")} className="inline-flex h-8 items-center rounded-md border border-line-strong bg-card px-3 text-[12.5px] font-bold text-fg-muted transition-colors hover:bg-inset">
                  Keep Researching
                </button>
              </>
            )}
            <button type="button" disabled={pending} onClick={() => setConfirmingReject(true)} className="inline-flex h-8 items-center rounded-md border border-bad/30 bg-bad-bg px-3 text-[12.5px] font-bold text-bad transition-colors hover:bg-bad/10">
              Reject
            </button>
          </div>
        )}

        {bol.status === "rejected" && (
          <div className="flex justify-end border-t border-line pt-3">
            <button type="button" disabled={pending} onClick={() => transition("researching")} className="inline-flex h-8 items-center rounded-md border border-line-strong bg-card px-3 text-[12.5px] font-bold text-fg-muted transition-colors hover:bg-inset">
              Reopen
            </button>
          </div>
        )}
      </div>

      <Modal open={confirmingReject} onClose={() => setConfirmingReject(false)} title="Reject this entry?">
        <p className="mb-4 text-[13.5px] text-fg-muted">
          {title} won&rsquo;t be researched further. Filed, not deleted — it can be reopened later.
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

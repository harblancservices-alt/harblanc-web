"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDateTime } from "../_shell/format";
import { digitsForTel } from "../_shell/contactFields";
import { releaseAiLead, discardAiLead } from "./actions";
import { formatPhone } from "@/lib/domain/phone";
import { BTN_DANGER, BTN_EDIT, BTN_SUCCESS } from "../_shell/ui";

export type AiReviewLead = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  phone: string | null;
  industry: string | null;
  commodities: string | null;
  source: string | null;
  contactCount: number;
  notePreview: string | null;
  createdAt: string;
};

function normalizeHref(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Human label for a lead's origin, so the queue reads clearly when it mixes
 * pipelines. Source is free-typed provenance text (the column is plain
 * nullable text with no constraint — production values include things like
 * "Cold Call"), so anything unrecognised is title-cased and shown as-is
 * rather than collapsed to "Unknown source". The ai_agent/field_capture
 * special cases are kept only so the 11 historical rows carrying those values
 * still read as words; both pipelines were retired 2026-08-25. */
function sourceLabel(source: string | null): string {
  if (!source?.trim()) return "Unknown source";
  if (source === "field_capture") return "Field Capture";
  if (source === "ai_agent") return "AI Agent";
  if (source === "bol") return "BOL Center";
  if (source === "otr") return "OTR";
  if (source === "manual") return "Manual";
  return source;
}

/**
 * One pending-review AI lead. A rich preview (full address, contact info,
 * fleet/commodity facts, and the pinned research note) plus the three review
 * actions: open the full editable profile, release to the team, or discard.
 */
export function ReviewCard({ lead }: { lead: AiReviewLead }) {
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<"release" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function release() {
    setError(null);
    setBusyAction("release");
    startTransition(async () => {
      const res = await releaseAiLead(lead.id);
      setBusyAction(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function discard() {
    if (!window.confirm(`Discard ${lead.name}? This can't be undone.`)) return;
    setError(null);
    setBusyAction("discard");
    startTransition(async () => {
      const res = await discardAiLead(lead.id);
      setBusyAction(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const location = [lead.city, lead.state].filter(Boolean).join(", ");
  const fullAddress = [lead.address, location, lead.zip].filter(Boolean).join(", ");
  const website = normalizeHref(lead.website);

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-fg">{lead.name}</span>
            <span className="rounded-full bg-steel-bg px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-steel">
              Pending review
            </span>
            <span className="rounded-full bg-slate-bg px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate">
              {sourceLabel(lead.source)}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-fg-subtle">
            Added {formatDateTime(lead.createdAt)}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
        {fullAddress && <Line label="Address">{fullAddress}</Line>}
        {website && (
          <Line label="Website">
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {lead.website}
            </a>
          </Line>
        )}
        {lead.phone && (
          <Line label="Phone">
            <a
              href={`tel:${digitsForTel(lead.phone)}`}
              className="font-mono text-accent hover:underline"
            >
              {formatPhone(lead.phone)}
            </a>
          </Line>
        )}
        {lead.industry && <Line label="Industry">{lead.industry}</Line>}
        {lead.commodities && <Line label="Commodities">{lead.commodities}</Line>}
        <Line label="Contacts">
          {lead.contactCount} {lead.contactCount === 1 ? "contact" : "contacts"}
        </Line>
      </dl>

      {lead.notePreview && (
        <p className="mt-3 whitespace-pre-wrap bg-inset px-3 py-2 text-[12.5px] leading-relaxed text-fg-muted">
          {lead.notePreview}
        </p>
      )}

      {error && <p className="mt-2 text-[12.5px] text-bad">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/crm/accounts/${lead.id}`}
          prefetch={false}
          className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
        >
          Open profile
        </Link>
        <button
          type="button"
          onClick={release}
          disabled={pending}
          className={`inline-flex items-center rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_SUCCESS}`}
        >
          {busyAction === "release" ? "Releasing…" : "Release to team"}
        </button>
        <button
          type="button"
          onClick={discard}
          disabled={pending}
          className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_DANGER}`}
        >
          {busyAction === "discard" ? "Discarding…" : "Discard"}
        </button>
      </div>
    </li>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-fg-subtle">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}

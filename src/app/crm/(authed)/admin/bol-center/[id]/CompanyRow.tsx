"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "../../../_shell/ui";
import { Field } from "../../../_shell/form";
import { titleCaseWords } from "../../../_shell/format";
import { SectionCard } from "./SectionCard";
import { DEPTH_EDIT, DEPTH_SUCCESS, DEPTH_NEUTRAL } from "./buttonDepth";
import {
  resolveAndProspectCompany,
  createAndProspectCompany,
  linkCompany,
  addToProspects,
  searchCompanyMatches,
  getCandidateMeta,
  type CompanySide,
  type CompanyCandidate,
  type CandidateMeta,
} from "../actions";
import type { ScoredMatch } from "../matching";
import { MatchCandidateList } from "./MatchCandidateList";
import { ContactRow, type BolContact } from "./ContactRow";
import { LocationMatchSection } from "./LocationMatchSection";
import { TaskOfferButton } from "../../../tasks/TaskOfferButton";

const SIDE_LABEL: Record<CompanySide, string> = {
  shipper: "Shipper",
  consignee: "Consignee",
  bill_to: "Bill To",
};

/**
 * One party (shipper / consignee / bill_to) as a work-queue row — the
 * Company group's unit. Three real states: resolved (View Company), possible
 * matches (the real matcher's ranked candidates, reviewed by a human before
 * linking), or no match (an inline editable create form). Contacts and the
 * dock location for this side nest directly inside, closed once resolved.
 */
export function CompanyRow({
  bolId,
  side,
  queryName,
  queryAddress,
  matchedAccount,
  contacts,
  showLocation,
  matchedLocationId,
}: {
  bolId: string;
  side: CompanySide;
  queryName: string;
  queryAddress: string | null;
  matchedAccount: { id: string; name: string; lifecycleStatus: string } | null;
  contacts: BolContact[];
  /** Bill To has no dock location slot — only shipper/consignee do. */
  showLocation: boolean;
  matchedLocationId: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [candidates, setCandidates] = useState<ScoredMatch<CompanyCandidate>[] | null>(null);
  const [meta, setMeta] = useState<Record<string, CandidateMeta>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [justProspected, setJustProspected] = useState<{ accountId: string; name: string } | null>(null);

  const label = SIDE_LABEL[side];
  const hasName = queryName.trim().length > 0;

  useEffect(() => {
    if (matchedAccount || !hasName) return;
    let cancelled = false;
    void searchCompanyMatches(queryName, queryAddress).then((res) => {
      if (cancelled) return;
      setCandidates(res);
      if (res.length > 0) {
        void getCandidateMeta(res.map((c) => c.row.id)).then((rows) => {
          if (!cancelled) setMeta(Object.fromEntries(rows.map((r) => [r.accountId, r])));
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [matchedAccount, hasName, queryName, queryAddress]);

  function quickProspect() {
    setError(null);
    startTransition(async () => {
      const res = await resolveAndProspectCompany(bolId, side);
      if (res.ok) {
        setJustProspected({ accountId: res.accountId, name: titleCaseWords(queryName) });
        router.refresh();
      } else setError(res.error);
    });
  }

  function useCandidate(row: CompanyCandidate) {
    setError(null);
    startTransition(async () => {
      const res = await linkCompany(bolId, side, row.id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function onAddToProspects() {
    if (!matchedAccount) return;
    setError(null);
    startTransition(async () => {
      const res = await addToProspects(matchedAccount.id);
      if (res.ok) {
        setJustProspected({ accountId: matchedAccount.id, name: titleCaseWords(queryName) });
        router.refresh();
      } else setError(res.error);
    });
  }

  function submitCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await createAndProspectCompany(bolId, side, fd);
      if (res.ok) {
        setCreateOpen(false);
        setJustProspected({ accountId: res.accountId, name: titleCaseWords(String(fd.get("name") ?? queryName)) });
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="border-b border-line p-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-fg">{label} — Company</p>
        {matchedAccount && (
          <Badge tone={matchedAccount.lifecycleStatus === "prospect" ? "success" : "neutral"}>{matchedAccount.lifecycleStatus}</Badge>
        )}
      </div>

      {error && <p className="mt-1.5 text-[12.5px] text-bad">{error}</p>}

      {!hasName ? (
        <p className="mt-1.5 text-[13px] text-fg-muted">No {label.toLowerCase()} name was extracted from this BOL.</p>
      ) : matchedAccount ? (
        <>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="truncate text-[14px] font-semibold text-fg">{matchedAccount.name}</p>
            <div className="flex shrink-0 items-center gap-2">
              {matchedAccount.lifecycleStatus !== "prospect" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={onAddToProspects}
                  className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${DEPTH_SUCCESS}`}
                >
                  {pending ? "…" : "Add to Prospects"}
                </button>
              )}
              <Link href={`/crm/accounts/${matchedAccount.id}`} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${DEPTH_EDIT}`}>
                View Company →
              </Link>
            </div>
          </div>

          {justProspected && (
            <div className="mt-2">
              <TaskOfferButton
                label="+ Add follow-up task"
                defaults={{ title: `Follow up with ${justProspected.name}`, task_type: "Follow-up call", account_id: justProspected.accountId }}
              />
            </div>
          )}

          {showLocation && (
            <div className="mt-3 border-t border-line pt-3">
              <LocationMatchSection bolId={bolId} side={side as "shipper" | "consignee"} accountId={matchedAccount.id} queryAddress={queryAddress} matchedLocationId={matchedLocationId} />
            </div>
          )}

          {contacts.length > 0 && (
            <div className="mt-3">
              <SectionCard title="Contacts">
                <div className="flex flex-col gap-2 p-3">
                  {contacts.map((c) => (
                    <ContactRow key={c.id} contact={c} accountId={matchedAccount.id} />
                  ))}
                </div>
              </SectionCard>
            </div>
          )}
        </>
      ) : (
        <div className="mt-1.5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-fg">{titleCaseWords(queryName)}</p>
              <p className="mt-0.5 truncate text-[11.5px] text-fg-muted">{queryAddress || "No address extracted"}</p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={quickProspect}
              className={`inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-[11.5px] font-semibold transition-colors ${DEPTH_NEUTRAL}`}
            >
              {pending ? "…" : "Quick add to Prospects"}
            </button>
          </div>

          {candidates === null ? (
            <p className="text-[12.5px] text-fg-subtle">Checking existing companies…</p>
          ) : candidates.length > 0 ? (
            <>
              <MatchCandidateList
                candidates={candidates}
                pending={pending}
                onUse={useCandidate}
                renderTitle={(row) => row.name}
                renderSubtitle={(row) => [row.address, row.city, row.state].filter(Boolean).join(", ") || "No address on file"}
                renderMeta={(row) => {
                  const m = meta[row.id];
                  if (!m) return null;
                  return (
                    <span className="text-[11px] text-fg-subtle">
                      {m.priorLoadCount} prior load{m.priorLoadCount === 1 ? "" : "s"} · {m.currentOwnerName ? `Owned by ${m.currentOwnerName}` : "Unassigned"}
                    </span>
                  );
                }}
              />
              {!createOpen && (
                <button type="button" onClick={() => setCreateOpen(true)} className="w-fit text-[12px] font-semibold text-accent hover:underline">
                  None of these — create new
                </button>
              )}
            </>
          ) : null}

          {(candidates?.length === 0 || createOpen) && (
            <form onSubmit={submitCreate} className="flex flex-col gap-2 rounded-md border border-line-strong p-3">
              <p className="text-[11.5px] font-semibold text-fg-muted">No CRM match — create a new prospect from these fields.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Company name" name="name" defaultValue={titleCaseWords(queryName)} required />
                <Field label="Address" name="address" defaultValue={queryAddress ?? ""} />
              </div>
              <button
                type="submit"
                disabled={pending}
                className={`inline-flex h-8 w-fit items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${DEPTH_SUCCESS}`}
              >
                {pending ? "Adding…" : "Add to Prospects"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

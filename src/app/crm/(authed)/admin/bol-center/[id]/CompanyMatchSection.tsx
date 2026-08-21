"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHead, Badge, BTN_PRIMARY, BTN_EDIT, BTN_SUCCESS } from "../../../_shell/ui";
import { Modal } from "../../../_shell/Modal";
import { Field, SubmitButton, FormError } from "../../../_shell/form";
import { titleCaseWords } from "../../../_shell/format";
import { MATCH_TIER_LABEL, type ScoredMatch } from "../matching";
import {
  searchCompanyMatches,
  linkCompany,
  createCompanyFromBol,
  updateExistingCompanyFromBol,
  addToProspects,
  type CompanyCandidate,
  type CompanySide,
} from "../actions";

export function CompanyMatchSection({
  bolId,
  side,
  queryName,
  queryAddress,
  matchedAccount,
}: {
  bolId: string;
  side: CompanySide;
  queryName: string;
  queryAddress: string | null;
  matchedAccount: { id: string; name: string; lifecycleStatus: string } | null;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<ScoredMatch<CompanyCandidate>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (matchedAccount || !queryName.trim()) return;
    let cancelled = false;
    void searchCompanyMatches(queryName, queryAddress).then((res) => {
      if (!cancelled) setCandidates(res);
    });
    return () => {
      cancelled = true;
    };
  }, [matchedAccount, queryName, queryAddress]);

  function useExisting(accountId: string) {
    setError(null);
    setBusyId(accountId);
    startTransition(async () => {
      const res = await linkCompany(bolId, side, accountId);
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function updateAndUse(accountId: string) {
    setError(null);
    setBusyId(accountId);
    startTransition(async () => {
      const res = await updateExistingCompanyFromBol(bolId, side, accountId);
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function onCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await createCompanyFromBol(bolId, side, formData);
      if (res.ok) {
        setCreateOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  function onAddToProspects() {
    if (!matchedAccount) return;
    setError(null);
    startTransition(async () => {
      const res = await addToProspects(matchedAccount.id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const label = side === "shipper" ? "Shipper" : side === "consignee" ? "Consignee" : "Bill To";

  return (
    <Card>
      <CardHead title={`${label} — Company Matching`} hint={queryName ? titleCaseWords(queryName) : "No name extracted"} />
      <div className="flex flex-col gap-3 p-4">
        {error && <p className="text-[12.5px] text-bad">{error}</p>}

        {!queryName.trim() ? (
          <p className="text-[13px] text-fg-muted">No {label.toLowerCase()} name was extracted from this BOL.</p>
        ) : matchedAccount ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line-strong bg-inset px-4 py-3">
            <div>
              <p className="text-[13.5px] font-semibold text-fg">{titleCaseWords(matchedAccount.name)}</p>
              <p className="text-[11.5px] text-fg-muted">Lifecycle: {matchedAccount.lifecycleStatus}</p>
            </div>
            <div className="flex items-center gap-2">
              {matchedAccount.lifecycleStatus !== "prospect" && (
                <button type="button" disabled={pending} onClick={onAddToProspects} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_SUCCESS}`}>
                  Add to Prospects
                </button>
              )}
              <Link href={`/crm/accounts/${matchedAccount.id}`} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_EDIT}`}>
                View company →
              </Link>
            </div>
          </div>
        ) : (
          <>
            {candidates === null ? (
              <p className="text-[12.5px] text-fg-subtle">Searching existing companies…</p>
            ) : candidates.length === 0 ? (
              <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-line-strong bg-inset px-4 py-4">
                <p className="text-[13.5px] font-semibold text-fg">No likely match</p>
                <p className="text-[12.5px] text-fg-muted">
                  No existing company scored high enough to suggest — every real candidate was checked and none cleared the bar. This is a new company.
                </p>
                <button type="button" onClick={() => setCreateOpen(true)} className={`inline-flex h-9 items-center rounded-md px-4 text-[13px] font-bold transition-colors ${BTN_PRIMARY}`}>
                  Create New Company
                </button>
              </div>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {candidates.map((m) => (
                    <li key={m.row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line-strong px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13.5px] font-semibold text-fg">{titleCaseWords(m.row.name)}</p>
                          <Badge tone={m.tier === "exact" ? "success" : m.tier === "likely" ? "accent" : "neutral"}>{MATCH_TIER_LABEL[m.tier]}</Badge>
                        </div>
                        <p className="text-[11.5px] text-fg-muted">
                          {[m.row.city, m.row.state].filter(Boolean).join(", ") || "—"} · similarity {(m.score * 100).toFixed(0)}%
                          {m.sameCityState ? " · same city/state" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button type="button" disabled={pending || busyId === m.row.id} onClick={() => useExisting(m.row.id)} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}>
                          Use Existing
                        </button>
                        <button type="button" disabled={pending || busyId === m.row.id} onClick={() => updateAndUse(m.row.id)} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_EDIT}`}>
                          Update &amp; Use
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div>
                  <button type="button" onClick={() => setCreateOpen(true)} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_PRIMARY}`}>
                    None of these — Create New Company
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} busy={pending} title={`Create company from ${label.toLowerCase()}`}>
        <FormError message={error} />
        <form onSubmit={onCreateSubmit} className="flex flex-col gap-2">
          <input type="hidden" name="source" value="bol" />
          <Field label="Company name" name="name" defaultValue={queryName ? titleCaseWords(queryName) : ""} required autoFocus />
          <Field label="Address" name="address" defaultValue={queryAddress} />
          <SubmitButton pending={pending}>Create company</SubmitButton>
        </form>
      </Modal>
    </Card>
  );
}

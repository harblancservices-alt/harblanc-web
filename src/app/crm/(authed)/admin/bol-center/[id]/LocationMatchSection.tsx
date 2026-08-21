"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Badge, BTN_PRIMARY } from "../../../_shell/ui";
import { Modal } from "../../../_shell/Modal";
import { Field, SubmitButton, FormError } from "../../../_shell/form";
import { MATCH_TIER_LABEL, type ScoredMatch } from "../matching";
import { searchLocationMatches, linkLocation, createLocationFromBol, type LocationCandidate, type LocationSide } from "../actions";

export function LocationMatchSection({
  bolId,
  side,
  accountId,
  queryAddress,
  matchedLocationId,
}: {
  bolId: string;
  side: LocationSide;
  accountId: string | null;
  queryAddress: string | null;
  matchedLocationId: string | null;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<ScoredMatch<LocationCandidate>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const label = side === "shipper" ? "Shipper" : "Consignee";

  useEffect(() => {
    if (!accountId || matchedLocationId || !queryAddress?.trim()) return;
    let cancelled = false;
    void searchLocationMatches(accountId, queryAddress).then((res) => {
      if (!cancelled) setCandidates(res);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, matchedLocationId, queryAddress]);

  function useExisting(locationId: string) {
    setError(null);
    startTransition(async () => {
      const res = await linkLocation(bolId, side, locationId);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function onCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accountId) return;
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await createLocationFromBol(bolId, side, accountId, formData);
      if (res.ok) {
        setCreateOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <Card>
      <CardHead title={`${label} — Location`} />
      <div className="flex flex-col gap-3 p-4">
        {error && <p className="text-[12.5px] text-bad">{error}</p>}

        {!accountId ? (
          <p className="text-[13px] text-fg-muted">Resolve the {label.toLowerCase()} company above first.</p>
        ) : matchedLocationId ? (
          <p className="text-[13px] text-fg-muted">Location linked.</p>
        ) : !queryAddress?.trim() ? (
          <p className="text-[13px] text-fg-muted">No address was extracted for this side.</p>
        ) : (
          <>
            {candidates === null ? (
              <p className="text-[12.5px] text-fg-subtle">Checking this company&rsquo;s locations…</p>
            ) : candidates.length === 0 ? (
              <p className="text-[13px] text-fg-muted">No existing location on this company looks like a match.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {candidates.map((m) => (
                  <li key={m.row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line-strong px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13.5px] font-semibold text-fg">{m.row.label || m.row.address || "Location"}</p>
                        <Badge tone={m.tier === "exact" ? "success" : m.tier === "likely" ? "accent" : "neutral"}>{MATCH_TIER_LABEL[m.tier]}</Badge>
                      </div>
                      <p className="text-[11.5px] text-fg-muted">{[m.row.address, m.row.city, m.row.state].filter(Boolean).join(", ") || "—"}</p>
                    </div>
                    <button type="button" disabled={pending} onClick={() => useExisting(m.row.id)} className={`inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}>
                      Use Existing
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <button type="button" onClick={() => setCreateOpen(true)} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_PRIMARY}`}>
                Add New Location
              </button>
            </div>
          </>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} busy={pending} title={`Add ${label.toLowerCase()} location`}>
        <FormError message={error} />
        <form onSubmit={onCreateSubmit} className="flex flex-col gap-2">
          <Field label="Label" name="label" placeholder="e.g. Main dock" />
          <Field label="Address" name="address" defaultValue={queryAddress} />
          <SubmitButton pending={pending}>Add location</SubmitButton>
        </form>
      </Modal>
    </Card>
  );
}

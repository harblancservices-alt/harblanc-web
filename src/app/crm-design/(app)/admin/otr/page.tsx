"use client";

import { useMemo, useState } from "react";
import { useStore, useTeamMemberById } from "../../../_lib/store";
import { Badge, Button, Card, CardHead, EmptyState, INPUT, PAGE_WIDTH, PageHeader, SegmentedControl, TEXT, TextLink } from "../../../_design/ui";
import { Tabs } from "../../../_design/Tabs";
import { IconMic, IconSearch } from "../../../_design/icons";
import { OTR_STATUS_DESCRIPTION, OTR_STATUS_LABEL, OTR_STATUS_ORDER, OTR_STATUS_TONE } from "../../../_lib/otrStatus";
import { firstName, relativeTime } from "../../../_lib/format";
import type { OtrEntry, OtrStatus } from "../../../_lib/types";

type FilterKey = "all" | OtrStatus;

/**
 * OTR ("Dispatch <company name>") — admin-only review of verbal prospects
 * Brent names to the assistant, researched with NO source document.
 * Deliberately kept leaner than BOL Center's tabbed workspace (no
 * extraction, no contacts, no document viewer) so the two funnels never
 * read as the same thing — see types.ts's OtrEntry doc comment and
 * DESIGN_DECISIONS.md. Release is the only way an entry reaches
 * /crm-design/prospects.
 */
export default function OtrPage() {
  const { otrEntries } = useStore();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<OtrStatus, number> = { new: 0, researching: 0, ready_for_approval: 0, released: 0, rejected: 0 };
    for (const o of otrEntries) c[o.status]++;
    return c;
  }, [otrEntries]);

  const needsAttention = counts.new + counts.ready_for_approval;

  const filtered = useMemo(() => {
    let rows = otrEntries;
    if (filter !== "all") rows = rows.filter((o) => o.status === filter);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((o) => o.companyName.toLowerCase().includes(needle) || o.city.toLowerCase().includes(needle));
    }
    return [...rows].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [otrEntries, filter, q]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="OTR"
        subtitle={`${otrEntries.length} verbal prospects · ${needsAttention} need attention · document-less companies Brent names to the assistant, researched straight into the CRM`}
      />

      <Card className="p-3">
        <label className="relative flex items-center">
          <IconSearch width={15} height={15} className="pointer-events-none absolute left-3 text-[var(--cd-text-subtle)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by company or city…"
            className={`${INPUT} pl-8`}
          />
        </label>
      </Card>

      <Tabs
        tone="admin"
        tabs={[
          { key: "all", label: "All", count: otrEntries.length },
          ...OTR_STATUS_ORDER.map((s) => ({ key: s, label: OTR_STATUS_LABEL[s], count: counts[s] })),
        ]}
        active={filter}
        onChange={(k) => setFilter(k as FilterKey)}
      />

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<IconMic />} title="No OTR entries match" body="Try a different search or status filter." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((o) => (
            <OtrCard key={o.id} otr={o} />
          ))}
        </div>
      )}
    </div>
  );
}

function OtrCard({ otr }: { otr: OtrEntry }) {
  const { setOtrStatus, saveOtrResearchNotes, setOtrSalesRelevance, releaseOtrToProspects } = useStore();
  const requester = useTeamMemberById(otr.requestedByUserId);
  const [notes, setNotes] = useState(otr.research.notes);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const editable = otr.status !== "released" && otr.status !== "rejected";

  return (
    <Card>
      <CardHead
        title={otr.companyName}
        hint={`${otr.industry} · ${otr.city}, ${otr.state}`}
        right={<Badge tone={OTR_STATUS_TONE[otr.status]}>{OTR_STATUS_LABEL[otr.status]}</Badge>}
      />
      <div className="flex flex-col gap-3 p-4">
        <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>
          {OTR_STATUS_DESCRIPTION[otr.status]} · Dispatched by {firstName(requester?.name ?? "Someone")} · {relativeTime(otr.requestedAt)}
        </p>

        {otr.status === "released" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--cd-radius-md)] border border-[var(--cd-admin)]/25 bg-[var(--cd-admin-soft)] px-4 py-3">
            <p className={`${TEXT.body} text-[var(--cd-text)]`}>
              Released {otr.release ? relativeTime(otr.release.releasedAt) : ""} — now on the Prospects tab.
            </p>
            {otr.release?.companyId && <TextLink href={`/crm-design/companies/${otr.release.companyId}`}>View Company →</TextLink>}
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className={`${TEXT.label} text-[var(--cd-text-muted)]`}>Research notes</span>
              {editable ? (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => saveOtrResearchNotes(otr.id, notes)}
                  placeholder="What did Brent say? What did you find out?"
                  className="h-20 w-full resize-none rounded-[var(--cd-radius-sm)] border border-[var(--cd-border-strong)] bg-[var(--cd-surface-2)] p-2.5 text-[13px] text-[var(--cd-text)] outline-none focus:border-[var(--cd-accent)] focus:bg-[var(--cd-surface)] focus:ring-2 focus:ring-[var(--cd-accent-soft)]"
                />
              ) : (
                <p className={`${TEXT.body} text-[var(--cd-text-muted)]`}>{otr.research.notes || "—"}</p>
              )}
            </label>

            {(otr.research.observedFreight.length > 0 || otr.research.observedLanes.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {otr.research.observedFreight.map((f) => <Badge key={f} tone="neutral">{f}</Badge>)}
                {otr.research.observedLanes.map((l) => <Badge key={l} tone="neutral">{l}</Badge>)}
              </div>
            )}

            {editable && (
              <div>
                <span className={`mb-1.5 block ${TEXT.label} text-[var(--cd-text-muted)]`}>Sales relevance</span>
                <SegmentedControl
                  mode="field"
                  options={[
                    { key: "high", label: "High", tone: "success" },
                    { key: "medium", label: "Medium", tone: "warning" },
                    { key: "low", label: "Low", tone: "neutral" },
                  ]}
                  active={otr.research.salesRelevance ?? ""}
                  onChange={(level) => setOtrSalesRelevance(otr.id, level as "high" | "medium" | "low")}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--cd-border)] pt-3">
              {otr.status === "new" && (
                <Button variant="admin" size="sm" onClick={() => setOtrStatus(otr.id, "researching")}>
                  Start Research
                </Button>
              )}
              {otr.status === "researching" && (
                <Button variant="admin" size="sm" onClick={() => setOtrStatus(otr.id, "ready_for_approval")}>
                  Mark Ready for Approval
                </Button>
              )}
              {otr.status === "ready_for_approval" && (
                <>
                  <Button variant="admin" size="sm" onClick={() => releaseOtrToProspects(otr.id)}>
                    Release to Prospects
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setOtrStatus(otr.id, "researching")}>
                    Keep Researching
                  </Button>
                </>
              )}
              {otr.status === "rejected" ? (
                <Button variant="secondary" size="sm" onClick={() => setOtrStatus(otr.id, "researching")}>
                  Reopen
                </Button>
              ) : !confirmingReject ? (
                <Button variant="danger" size="sm" onClick={() => setConfirmingReject(true)}>
                  Reject
                </Button>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-[var(--cd-radius-sm)] border border-[var(--cd-danger)]/30 bg-[var(--cd-danger-soft)] py-1 pl-2.5 pr-1.5">
                  <span className="text-[12px] font-semibold text-[var(--cd-danger)]">Reject this entry?</span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setOtrStatus(otr.id, "rejected");
                      setConfirmingReject(false);
                    }}
                  >
                    Reject
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingReject(false)}>
                    Cancel
                  </Button>
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

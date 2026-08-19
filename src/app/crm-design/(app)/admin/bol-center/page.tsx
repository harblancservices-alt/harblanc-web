"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore, useTeamMemberById } from "../../../_lib/store";
import { Badge, Button, Card, EmptyState, INPUT, LIST_HEAD_ROW, PAGE_WIDTH, PageHeader, ROW_HOVER, TEXT, ZEBRA } from "../../../_design/ui";
import { Tabs } from "../../../_design/Tabs";
import { IconCheck, IconInbox, IconPlus, IconSearch } from "../../../_design/icons";
import { BOL_STATUS_LABEL, BOL_STATUS_ORDER, BOL_STATUS_TONE } from "../../../_lib/bolStatus";
import { firstName, relativeTime } from "../../../_lib/format";
import { UploadBolDrawer } from "../../../_shared/UploadBolDrawer";
import type { BolRecord, BolStatus } from "../../../_lib/types";

type FilterKey = "all" | BolStatus;

/**
 * BOL Center Inbox — the intake queue for every uploaded BOL, admin-only.
 * Deliberately styled as a document-processing workspace (status funnel +
 * dense table), not a generic CRM list: this is the screen that has to stay
 * legible at 400 rows, which none of the sales-facing lists in this
 * prototype need to handle. See CRM_PROTOTYPE_MAP.md for how this connects
 * to the detail workspace, and DESIGN_DECISIONS.md for why this exists as
 * an admin-only layer BETWEEN raw uploads and anything Sales can see.
 */
export default function BolCenterInboxPage() {
  const { bolRecords } = useStore();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const counts = useMemo(() => {
    const c: Record<BolStatus, number> = { new: 0, needs_review: 0, ai_extracted: 0, researching: 0, ready_for_approval: 0, approved: 0, rejected: 0, archived: 0 };
    for (const b of bolRecords) c[b.status]++;
    return c;
  }, [bolRecords]);

  const needsAttention = counts.new + counts.needs_review + counts.ready_for_approval;

  const filtered = useMemo(() => {
    let rows = bolRecords;
    if (filter !== "all") rows = rows.filter((b) => b.status === filter);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter(
        (b) =>
          b.docNumber.toLowerCase().includes(needle) ||
          b.fileName.toLowerCase().includes(needle) ||
          b.customerMatch.candidateName.toLowerCase().includes(needle) ||
          b.extraction.customerName.value.toLowerCase().includes(needle),
      );
    }
    return [...rows].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }, [bolRecords, filter, q]);

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader
        title="BOL Center"
        subtitle={`${bolRecords.length} BOLs in the queue · ${needsAttention} need attention · a controlled intake layer between raw uploads and Sales`}
        actions={
          <Button variant="admin" onClick={() => setUploadOpen(true)}>
            <IconPlus width={15} height={15} /> Upload BOL
          </Button>
        }
      />

      <Card className="mb-4 p-3">
        <label className="relative flex items-center">
          <IconSearch width={15} height={15} className="pointer-events-none absolute left-3 text-[var(--cd-text-subtle)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by doc #, file name, or company…"
            className={`${INPUT} pl-8`}
          />
        </label>
      </Card>

      <div className="mb-4">
        <Tabs
          tone="admin"
          tabs={[
            { key: "all", label: "All", count: bolRecords.length },
            ...BOL_STATUS_ORDER.map((s) => ({ key: s, label: BOL_STATUS_LABEL[s], count: counts[s] })),
          ]}
          active={filter}
          onChange={(k) => setFilter(k as FilterKey)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<IconInbox />} title="No BOLs match" body="Try a different search or status filter." />
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className={LIST_HEAD_ROW}>
                  <th className="px-4 py-2.5">Doc #</th>
                  <th className="px-4 py-2.5">Company</th>
                  <th className="px-4 py-2.5">Pickup</th>
                  <th className="px-4 py-2.5">Delivery</th>
                  <th className="px-4 py-2.5">Uploaded</th>
                  <th className="px-4 py-2.5">Reviewer</th>
                  <th className="px-4 py-2.5">Confidence</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className={ZEBRA}>
                {filtered.map((b) => (
                  <BolRow key={b.id} bol={b} />
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2.5 lg:hidden">
            {filtered.map((b) => (
              <BolCard key={b.id} bol={b} />
            ))}
          </div>
        </>
      )}

      <UploadBolDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}

function companyLabel(bol: BolRecord): { text: string; isNew: boolean } {
  if (bol.customerMatch.status === "matched") return { text: bol.extraction.customerName.value, isNew: false };
  if (bol.customerMatch.candidateName) return { text: bol.customerMatch.candidateName, isNew: true };
  return { text: "—", isNew: false };
}

function ConfidenceReadout({ bol }: { bol: BolRecord }) {
  if (bol.docNumber === "—") return <span className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>Not extracted</span>;
  const fields = Object.values(bol.extraction);
  const reviewCount = fields.filter((f) => f.confidence === "review").length;
  if (reviewCount === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--cd-success)]">
        <IconCheck width={12} height={12} /> High
      </span>
    );
  }
  return <span className="text-[12px] font-semibold text-[var(--cd-warning)]">? {reviewCount} to review</span>;
}

function BolRow({ bol }: { bol: BolRecord }) {
  const reviewer = useTeamMemberById(bol.assignedReviewerId);
  const company = companyLabel(bol);
  return (
    <tr className={ROW_HOVER}>
      <td className="px-4 py-3">
        <Link href={`/crm-design/admin/bol-center/${bol.id}`} className="font-semibold text-[var(--cd-text)] hover:text-[var(--cd-admin)]">
          {bol.docNumber}
        </Link>
        <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>{bol.fileName}</p>
      </td>
      <td className="px-4 py-3">
        <span className="font-medium text-[var(--cd-text)]">{company.text}</span>
        {company.isNew && (
          <Badge tone="accent">
            <span className="ml-1">New</span>
          </Badge>
        )}
      </td>
      <td className="px-4 py-3 text-[var(--cd-text-muted)]">
        {bol.extraction.pickupCity.value ? `${bol.extraction.pickupCity.value}, ${bol.extraction.pickupState.value}` : "—"}
      </td>
      <td className="px-4 py-3 text-[var(--cd-text-muted)]">
        {bol.extraction.deliveryCity.value ? `${bol.extraction.deliveryCity.value}, ${bol.extraction.deliveryState.value}` : "—"}
      </td>
      <td className="px-4 py-3 text-[var(--cd-text-muted)]">{relativeTime(bol.uploadedAt)}</td>
      <td className="px-4 py-3 text-[var(--cd-text-muted)]">{reviewer ? firstName(reviewer.name) : "Unassigned"}</td>
      <td className="px-4 py-3">
        <ConfidenceReadout bol={bol} />
      </td>
      <td className="px-4 py-3">
        <Badge tone={BOL_STATUS_TONE[bol.status]}>{BOL_STATUS_LABEL[bol.status]}</Badge>
      </td>
    </tr>
  );
}

function BolCard({ bol }: { bol: BolRecord }) {
  const reviewer = useTeamMemberById(bol.assignedReviewerId);
  const company = companyLabel(bol);
  return (
    <Link href={`/crm-design/admin/bol-center/${bol.id}`}>
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold text-[var(--cd-text)]">{bol.docNumber}</p>
            <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>{company.text}{company.isNew ? " · New" : ""}</p>
          </div>
          <Badge tone={BOL_STATUS_TONE[bol.status]}>{BOL_STATUS_LABEL[bol.status]}</Badge>
        </div>
        <div className={`mt-2.5 flex items-center justify-between border-t border-[var(--cd-border)] pt-2.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>
          <span>{reviewer ? firstName(reviewer.name) : "Unassigned"}</span>
          <ConfidenceReadout bol={bol} />
          <span>{relativeTime(bol.uploadedAt)}</span>
        </div>
      </Card>
    </Link>
  );
}

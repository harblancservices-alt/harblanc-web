"use client";

import Link from "next/link";
import { useStore } from "../../_lib/store";
import { Card, CardHead, TEXT } from "../../_design/ui";

/**
 * Admin Overview — fixes the real CRM's factual copy bug where this page
 * claimed Documents held "every Rate Confirmation and Bill of Lading
 * generated across every shipment" when the tab actually only ever showed
 * 2 fixed blank templates (CRM_MASTER_AUDIT.md §3, P0 #2). Every claim
 * below is accurate to what its linked tab actually shows.
 */
export default function AdminOverviewPage() {
  const { team, companies, documents, tasks, bolRecords } = useStore();
  const activeTeam = team.filter((m) => m.isActive).length;
  const openTasks = tasks.filter((t) => t.status === "open").length;
  const bolNeedsAttention = bolRecords.filter((b) => b.status === "new" || b.status === "needs_review" || b.status === "ready_for_approval").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatLink href="/crm-design/admin/bol-center" label="BOL Center — needs attention" value={String(bolNeedsAttention)} />
        <StatLink href="/crm-design/admin/accounts" label="Team accounts" value={`${activeTeam} active`} />
        <StatLink href="/crm-design/admin/documents" label="Master templates" value="2" />
        <StatLink href="/crm-design/admin/activity" label="Open tasks org-wide" value={String(openTasks)} />
      </div>

      <Card>
        <CardHead title="Admin Account" hint="Owner/admin-only elevated area" />
        <div className={`space-y-2 px-5 py-4 ${TEXT.body} leading-relaxed text-[var(--cd-text-muted)]`}>
          <p>
            {team.length} total team {team.length === 1 ? "account" : "accounts"} on this org. Use{" "}
            <span className="font-semibold text-[var(--cd-text)]">BOL Center</span> to process uploaded BOL photos
            into reviewed, research-backed customer intelligence before anything reaches Sales,{" "}
            <span className="font-semibold text-[var(--cd-text)]">Accounts</span> to review a teammate&rsquo;s access
            level and suspend or reassign their book of business, <span className="font-semibold text-[var(--cd-text)]">Activity Log</span>{" "}
            to see exactly who changed what and when across the team — every row links straight to the
            affected record — <span className="font-semibold text-[var(--cd-text)]">Documents</span> to browse the
            org&rsquo;s two blank master templates (Rate Confirmation, Bill of Lading — a separate system from BOL
            Center&rsquo;s uploaded shipment photos), and{" "}
            <span className="font-semibold text-[var(--cd-text)]">Organization</span> to edit the brokerage
            letterhead every generated document reads from.
          </p>
          <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>
            {companies.length} companies across the org, {bolRecords.length} BOLs in the intake queue, {documents.length} documents generated to date.
          </p>
        </div>
      </Card>
    </div>
  );
}

function StatLink({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link href={href}>
      <Card className="p-4 transition-shadow hover:shadow-[var(--cd-shadow-lg)]">
        <p className={`${TEXT.label} text-[var(--cd-text-muted)]`}>{label}</p>
        <p className="mt-1.5 font-mono text-[24px] font-bold leading-none text-[var(--cd-text)]">{value}</p>
      </Card>
    </Link>
  );
}

"use client";

import type { ReactNode } from "react";
import { ClickableListItem } from "../_shell/ClickableRow";
import { stageLabel, stageTone } from "./lifecycle";
import { lastContactStatus, titleCaseWords, upperCaseState } from "../_shell/format";
import { CompanyRowActions } from "./CompanyRowActions";
import type { CompanyOption } from "../contacts/CompanyCombobox";
import type { CrmTag } from "./tags";

export type CompanyCardData = {
  id: string;
  name: string;
  stage: string | null;
  city: string | null;
  state: string | null;
  primaryTag: CrmTag | null;
  contactCount: number;
  lastContactMs: number | null;
  phone: string | null;
};

/**
 * One company card in the Companies grid — Brent's spec: name, stage pill
 * (same LIFECYCLE_TONE system as the detail page), city/state, primary tag,
 * last-contact date, contact count, and row actions. Every card is the SAME
 * structure regardless of how much data it has so the grid reads as uniform
 * rows — the parent grid's `auto-rows-fr` (see page.tsx) then stretches every
 * card in a row to match its tallest neighbor.
 *
 * 2026-08-09: the tap-to-call button was replaced with CompanyRowActions
 * (Notes / Add contact / Loads-if-active-customer) — see that file.
 * `companyOptions` is the org roster its Add-contact dialog needs.
 *
 * `renderActions` overrides the row-actions block entirely — the Active
 * Customers hub passes its own (Add notes/Add load/Add task, see
 * customers/ActiveCustomerRowActions.tsx) instead of the Companies-list
 * default (Notes/Add contact/Loads).
 */
export function CompanyListCard({
  company,
  companyOptions,
  renderActions,
}: {
  company: CompanyCardData;
  companyOptions: CompanyOption[];
  renderActions?: (company: CompanyCardData, variant: "table" | "card") => ReactNode;
}) {
  const location = [titleCaseWords(company.city), upperCaseState(company.state)].filter(Boolean).join(", ");
  const lastContact = lastContactStatus(company.lastContactMs);

  return (
    <ClickableListItem
      href={`/crm/accounts/${company.id}`}
      className="flex h-full min-h-[172px] flex-col justify-between rounded-lg border border-line-strong bg-card p-4 shadow-e1 hover:border-accent/40"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[14.5px] font-bold text-fg">{titleCaseWords(company.name)}</p>
          <span
            className={`shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${stageTone(company.stage)}`}
          >
            {stageLabel(company.stage)}
          </span>
        </div>

        <p className="text-[12.5px] text-fg-muted">{location || "—"}</p>

        {company.primaryTag && (
          <span className="inline-flex w-fit items-center gap-1 rounded-md border border-line-strong bg-inset py-0.5 pl-1.5 pr-2 text-[11px] font-medium text-fg">
            <span className="h-1.5 w-1.5 shrink-0" style={{ background: company.primaryTag.color || "var(--fg-subtle)" }} />
            {company.primaryTag.label}
          </span>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-subtle">
          <span>
            {company.contactCount} contact{company.contactCount === 1 ? "" : "s"}
          </span>
          <span>
            {lastContact.freshness === "never" ? "Never contacted" : `Last contact: ${lastContact.text}`}
          </span>
        </div>
      </div>

      {renderActions ? renderActions(company, "card") : <CompanyRowActions company={company} companies={companyOptions} variant="card" />}
    </ClickableListItem>
  );
}

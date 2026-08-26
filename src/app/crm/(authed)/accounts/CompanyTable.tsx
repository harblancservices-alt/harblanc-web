"use client";

import { ClickableRow } from "../_shell/ClickableRow";
import { LIST_HEAD_ROW, ZEBRA_ROWS, Badge } from "../_shell/ui";
import { stageLabel, stageBadgeTone } from "./lifecycle";
import { lastContactStatus, titleCaseWords, upperCaseState } from "../_shell/format";
import { temperatureOf } from "@/lib/crm/temperature";
import { TemperatureDot } from "../_shell/TemperatureDot";
import { CompanyRowActions } from "./CompanyRowActions";
import { ActiveCustomerRowActions, type ActiveCustomerActionsData } from "../customers/ActiveCustomerRowActions";
import type { CompanyOption } from "../contacts/CompanyCombobox";
import type { CompanyCardData } from "./CompanyListCard";

/**
 * Desktop (lg+) table rendering of the Companies list — same CompanyCardData
 * the mobile CompanyListCard grid already consumes.
 *
 * 2026-08-20: rebuilt to match /crm-design's Companies table exactly (Brent's
 * full-visual-migration directive) — a clean, borderless zebra-striped table
 * (LIST_HEAD_ROW header band, ZEBRA_ROWS stripes, ClickableRow's built-in
 * hover) instead of the previous Excel/spreadsheet-style ruled grid with a
 * visible border on every cell (GRID_TABLE/GRID_HEAD_CELL/GRID_CELL — that
 * whole visual language is gone from this table). Stage now renders through
 * the shared `Badge` component (rounded-full pill) instead of a hand-rolled
 * rounded-md chip. The extra Tag/Contacts/Actions columns beyond the
 * prototype's simpler 5-column table (Company/Stage/Location/Assigned/Last
 * contact) are real, working CRM functionality the mock data has no
 * equivalent for — kept rather than deleted; see CompanyRowActions/
 * ActiveCustomerRowActions for what "Actions" actually does.
 *
 * Reused as-is by the Active Customers page (customers/page.tsx), which is
 * deliberately the same table, just pre-filtered to lifecycle_status=customer.
 */
export function CompanyTable({
  companies,
  companyOptions,
  now,
  activeCustomerActions,
}: {
  companies: CompanyCardData[];
  companyOptions: CompanyOption[];
  /** Server clock — never Date.now() during render (React Compiler purity
   * rule). One instant for every temperature on the page. */
  now: number;
  activeCustomerActions?: ActiveCustomerActionsData;
}) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className="px-4 py-2.5 text-left">Company</th>
          <th className="px-4 py-2.5 text-left">Stage</th>
          <th className="px-4 py-2.5 text-left">City/State</th>
          <th className="px-4 py-2.5 text-left">Tag</th>
          <th className="px-4 py-2.5 text-right">Contacts</th>
          <th className="px-4 py-2.5 text-left">Last contact</th>
          <th className="px-4 py-2.5 text-right">Actions</th>
        </tr>
      </thead>
      <tbody className={ZEBRA_ROWS}>
        {companies.map((c) => (
          <CompanyTableRow key={c.id} company={c} companyOptions={companyOptions} activeCustomerActions={activeCustomerActions} now={now} />
        ))}
      </tbody>
    </table>
  );
}

function CompanyTableRow({
  company,
  companyOptions,
  now,
  activeCustomerActions,
}: {
  company: CompanyCardData;
  companyOptions: CompanyOption[];
  now: number;
  activeCustomerActions?: ActiveCustomerActionsData;
}) {
  const location = [titleCaseWords(company.city), upperCaseState(company.state)].filter(Boolean).join(", ");
  const lastContact = lastContactStatus(company.lastContactMs);
  const temp = temperatureOf({ stage: company.stage, lastContactMs: company.lastContactMs, now });

  return (
    <ClickableRow href={`/crm/accounts/${company.id}`}>
      <td className="px-4 py-3 truncate font-semibold text-fg">{titleCaseWords(company.name)}</td>
      <td className="px-4 py-3">
        <Badge tone={stageBadgeTone(company.stage)}>{stageLabel(company.stage)}</Badge>
      </td>
      <td className="px-4 py-3 truncate text-fg-muted">{location || "—"}</td>
      <td className="px-4 py-3 truncate">
        {company.primaryTag ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-line-strong bg-inset py-0.5 pl-1.5 pr-2 text-[11px] font-medium text-fg">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: company.primaryTag.color || "var(--fg-subtle)" }}
            />
            {company.primaryTag.label}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-fg-muted">{company.contactCount}</td>
      <td className="px-4 py-3 truncate text-fg-muted">
        <span className="flex items-center gap-1.5">
          <TemperatureDot temp={temp} />
          {lastContact.freshness === "never" ? "Never" : lastContact.text}
        </span>
      </td>
      <td className="px-4 py-3">
        {activeCustomerActions ? (
          <ActiveCustomerRowActions
            company={company}
            contacts={activeCustomerActions.contactsByAccount[company.id] ?? []}
            reps={activeCustomerActions.reps}
            canAssignOthers={activeCustomerActions.canAssignOthers}
            currentUser={activeCustomerActions.currentUser}
            variant="table"
          />
        ) : (
          <CompanyRowActions company={company} companies={companyOptions} variant="table" />
        )}
      </td>
    </ClickableRow>
  );
}

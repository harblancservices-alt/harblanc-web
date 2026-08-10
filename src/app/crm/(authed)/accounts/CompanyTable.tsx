"use client";

import { ClickableRow } from "../_shell/ClickableRow";
import { LIST_HEAD_ROW, ZEBRA_ROWS, GRID_TABLE, GRID_HEAD_CELL, GRID_CELL } from "../_shell/ui";
import { stageLabel, stageTone } from "./lifecycle";
import { lastContactStatus, titleCaseWords, upperCaseState } from "../_shell/format";
import { CompanyRowActions } from "./CompanyRowActions";
import type { CompanyOption } from "../contacts/CompanyCombobox";
import type { CompanyCardData } from "./CompanyListCard";

/**
 * Desktop (md+) table rendering of the Companies list — same CompanyCardData
 * the mobile CompanyListCard grid already consumes, laid out as an
 * Excel/spreadsheet-style ruled grid (Brent's approved mockup): real
 * horizontal + vertical grid lines via GRID_TABLE/GRID_HEAD_CELL/GRID_CELL,
 * tight row height, zebra stripes underneath, hover highlight + clickable
 * rows via ClickableRow. Mobile keeps CompanyListCard untouched; toggled by
 * `hidden`/`md:hidden` wrapper classes at the call site (page.tsx). Reused
 * as-is by the Active Customers page (customers/page.tsx), which is
 * deliberately the same grid, just pre-filtered to lifecycle_status=customer.
 *
 * 2026-08-09: the Actions column's tap-to-call button was replaced with
 * CompanyRowActions (Notes / Add contact / Loads-if-active-customer) — see
 * that file. `companies` is the org roster CompanyRowActions' Add-contact
 * dialog needs for its company combobox.
 */
export function CompanyTable({ companies, companyOptions }: { companies: CompanyCardData[]; companyOptions: CompanyOption[] }) {
  return (
    <table className={GRID_TABLE}>
      <colgroup>
        <col className="w-[20%]" />
        <col className="w-[9%]" />
        <col className="w-[13%]" />
        <col className="w-[12%]" />
        <col className="w-[8%]" />
        <col className="w-[12%]" />
        <col className="w-[26%]" />
      </colgroup>
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className={GRID_HEAD_CELL}>Company</th>
          <th className={GRID_HEAD_CELL}>Stage</th>
          <th className={GRID_HEAD_CELL}>City/State</th>
          <th className={GRID_HEAD_CELL}>Tag</th>
          <th className={`${GRID_HEAD_CELL} text-right`}>Contacts</th>
          <th className={GRID_HEAD_CELL}>Last contact</th>
          <th className={`${GRID_HEAD_CELL} text-right`}>Actions</th>
        </tr>
      </thead>
      <tbody className={ZEBRA_ROWS}>
        {companies.map((c) => (
          <CompanyTableRow key={c.id} company={c} companyOptions={companyOptions} />
        ))}
      </tbody>
    </table>
  );
}

function CompanyTableRow({ company, companyOptions }: { company: CompanyCardData; companyOptions: CompanyOption[] }) {
  const location = [titleCaseWords(company.city), upperCaseState(company.state)].filter(Boolean).join(", ");
  const lastContact = lastContactStatus(company.lastContactMs);

  return (
    <ClickableRow href={`/crm/accounts/${company.id}`}>
      <td className={`${GRID_CELL} truncate font-semibold text-fg`}>{titleCaseWords(company.name)}</td>
      <td className={GRID_CELL}>
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${stageTone(company.stage)}`}
        >
          {stageLabel(company.stage)}
        </span>
      </td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>{location || "—"}</td>
      <td className={`${GRID_CELL} truncate`}>
        {company.primaryTag ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-md border border-line-strong bg-inset py-0.5 pl-1.5 pr-2 text-[11px] font-medium text-fg">
            <span
              className="h-1.5 w-1.5 shrink-0"
              style={{ background: company.primaryTag.color || "var(--fg-subtle)" }}
            />
            {company.primaryTag.label}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className={`${GRID_CELL} text-right tabular-nums text-fg-muted`}>{company.contactCount}</td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>
        {lastContact.freshness === "never" ? "Never" : lastContact.text}
      </td>
      <td className={GRID_CELL}>
        <CompanyRowActions company={company} companies={companyOptions} variant="table" />
      </td>
    </ClickableRow>
  );
}

"use client";

import { ClickableRow } from "../_shell/ClickableRow";
import { BTN_ACTION, LIST_HEAD_ROW, ZEBRA_ROWS } from "../_shell/ui";
import { IconPhone } from "../_shell/icons";
import { stageLabel, stageTone } from "./lifecycle";
import { lastContactStatus, titleCaseWords, upperCaseState } from "../_shell/format";
import { digitsForTel } from "../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import type { CompanyCardData } from "./CompanyListCard";

/**
 * Desktop (md+) table rendering of the Companies list — same CompanyCardData
 * the mobile CompanyListCard grid already consumes, just laid out as
 * left-to-right rows with a real column-header row instead of cards. Mobile
 * keeps CompanyListCard untouched; the two are toggled by `hidden`/`md:hidden`
 * wrapper classes at the call site (page.tsx).
 */
export function CompanyTable({ companies }: { companies: CompanyCardData[] }) {
  return (
    <table className="w-full table-fixed border-collapse text-[13px]">
      <colgroup>
        <col className="w-[22%]" />
        <col className="w-[10%]" />
        <col className="w-[15%]" />
        <col className="w-[14%]" />
        <col className="w-[9%]" />
        <col className="w-[13%]" />
        <col className="w-[17%]" />
      </colgroup>
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className="px-5 py-2 text-left">Company</th>
          <th className="px-5 py-2 text-left">Stage</th>
          <th className="px-5 py-2 text-left">City/State</th>
          <th className="px-5 py-2 text-left">Tag</th>
          <th className="px-5 py-2 text-right">Contacts</th>
          <th className="px-5 py-2 text-left">Last contact</th>
          <th className="px-5 py-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody className={ZEBRA_ROWS}>
        {companies.map((c) => (
          <CompanyTableRow key={c.id} company={c} />
        ))}
      </tbody>
    </table>
  );
}

function CompanyTableRow({ company }: { company: CompanyCardData }) {
  const location = [titleCaseWords(company.city), upperCaseState(company.state)].filter(Boolean).join(", ");
  const lastContact = lastContactStatus(company.lastContactMs);

  return (
    <ClickableRow href={`/crm/accounts/${company.id}`}>
      <td className="truncate px-5 py-2.5 font-semibold text-fg">{titleCaseWords(company.name)}</td>
      <td className="px-5 py-2.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 text-[10.5px] font-semibold ${stageTone(company.stage)}`}
        >
          {stageLabel(company.stage)}
        </span>
      </td>
      <td className="truncate px-5 py-2.5 text-fg-muted">{location || "—"}</td>
      <td className="truncate px-5 py-2.5">
        {company.primaryTag ? (
          <span className="inline-flex w-fit items-center gap-1 border border-line-strong bg-inset py-0.5 pl-1.5 pr-2 text-[11px] font-medium text-fg">
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
      <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">{company.contactCount}</td>
      <td className="truncate px-5 py-2.5 text-fg-muted">
        {lastContact.freshness === "never" ? "Never" : lastContact.text}
      </td>
      <td className="px-5 py-2.5 text-right">
        {company.phone ? (
          <a
            href={`tel:${digitsForTel(company.phone)}`}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-colors ${BTN_ACTION}`}
          >
            <IconPhone width={12} height={12} />
            {formatPhone(company.phone)}
          </a>
        ) : (
          <span className="text-[12px] text-fg-subtle">—</span>
        )}
      </td>
    </ClickableRow>
  );
}

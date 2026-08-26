"use client";

import Link from "next/link";
import { BTN_ACTION } from "../_shell/ui";
import { IconNote, IconPlus, IconTruck } from "../_shell/icons";
import { normalizeStage } from "./lifecycle";
import { titleCaseWords } from "../_shell/format";
import { AddContactDialog } from "../contacts/AddContactDialog";
import type { CompanyOption } from "../contacts/CompanyCombobox";
import type { CompanyCardData } from "./CompanyListCard";

/**
 * Companies list row actions — replaces the old tap-to-call phone button
 * (moved into the company profile itself; every company already has its full
 * contact info one click away there). Three actions, all scoped to this row's
 * company:
 *   - Notes: jumps straight to the profile's Notes card (id="notes" on
 *     accounts/[id]/page.tsx) rather than duplicating a notes composer here.
 *   - Add contact: reuses the same AddContactDialog the global Contacts
 *     directory uses, pre-attached to this company via `initialCompany`.
 *   - Loads: only once a company has actually graduated to Active Customer
 *     (normalizeStage — same helper the stage pill uses) — links to that
 *     customer's shipments, pre-filtered by `?account=`.
 * `variant` swaps sizing only: "table" for the compact desktop grid cell,
 * "card" for the taller mobile card's full-width button stack.
 */
export function CompanyRowActions({
  company,
  companies,
  variant,
}: {
  company: CompanyCardData;
  companies: CompanyOption[];
  variant: "table" | "card";
}) {
  const isActiveCustomer = normalizeStage(company.stage) === "active";
  const initialCompany = { text: titleCaseWords(company.name), selectedId: company.id };

  const itemClass =
    variant === "table"
      ? `inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_ACTION}`
      : `inline-flex h-11 min-w-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors ${BTN_ACTION}`;
  const iconSize = variant === "table" ? 12 : 13;

  return (
    <div className={variant === "table" ? "flex items-center justify-end gap-1.5" : "mt-3 flex items-center gap-1.5"}>
      <Link href={`/crm/accounts/${company.id}#notes`} className={itemClass}>
        <IconNote width={iconSize} height={iconSize} />
        Notes
      </Link>

      <AddContactDialog
        companies={companies}
        initialCompany={initialCompany}
        trigger={(open) => (
          <button type="button" onClick={open} className={itemClass}>
            <IconPlus width={iconSize} height={iconSize} />
            Add contact
          </button>
        )}
      />

      {isActiveCustomer && (
        <Link href={`/crm/shipments?account=${company.id}`} className={itemClass}>
          <IconTruck width={iconSize} height={iconSize} />
          Loads
        </Link>
      )}
    </div>
  );
}

"use client";

import { AddContactDialog } from "./contacts/AddContactDialog";
import type { CompanyOption } from "./contacts/CompanyCombobox";

/**
 * The ADD CONTACT half of a No-Contacts-Yet Next Best Action row
 * (CRM_URGENCY_AUDIT.md follow-up: the old "RESEARCH" label here was bare
 * navigation to the company profile — this reuses the same AddContactDialog
 * CompanyRowActions.tsx already opens inline from the Companies list, so the
 * gap this row flags can actually be closed in one click instead of just
 * being pointed at). `companies` is the Dashboard's own already-fetched
 * roster (companyOptions), passed straight through as plain, serializable
 * data — NextBestActionSection stays a Server Component, this Client
 * Component never crosses that boundary as a function prop.
 */
export function NbaAddContactAction({
  accountId,
  accountName,
  companies,
  label,
  className,
}: {
  accountId: string;
  accountName: string;
  companies: CompanyOption[];
  label: string;
  className: string;
}) {
  return (
    <AddContactDialog
      companies={companies}
      initialCompany={{ text: accountName, selectedId: accountId }}
      trigger={(open) => (
        <button type="button" onClick={open} className={className}>
          {label}
        </button>
      )}
    />
  );
}

"use client";

import Link from "next/link";
import { AddContactDialog } from "./contacts/AddContactDialog";
import type { CompanyOption } from "./contacts/CompanyCombobox";
import { BTN_ACTION } from "./_shell/ui";

/**
 * One row in the "No Contacts Yet" widget — a company with zero non-deleted
 * contacts. Its own client component (not plain server markup) because the
 * ADD action opens AddContactDialog pre-attached to this company via
 * `initialCompany` — a dialog trigger is a function prop, which a Server
 * Component can never hand to a Client Component (the RSC-boundary crash
 * this page has hit before), so this row owns the dialog itself and page.tsx
 * only ever passes it plain company data.
 */
export function NoContactsYetRow({
  id,
  name,
  companies,
}: {
  id: string;
  name: string;
  companies: CompanyOption[];
}) {
  return (
    <li className="flex items-center justify-between gap-2 px-4 py-2.5">
      <Link href={`/crm/accounts/${id}`} prefetch={false} className="truncate text-[13.5px] font-semibold text-fg hover:underline">
        {name}
      </Link>
      <AddContactDialog
        companies={companies}
        initialCompany={{ text: name, selectedId: id }}
        trigger={(open) => (
          <button
            type="button"
            onClick={open}
            className={`inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[11.5px] font-bold transition-colors ${BTN_ACTION}`}
          >
            ADD
          </button>
        )}
      />
    </li>
  );
}

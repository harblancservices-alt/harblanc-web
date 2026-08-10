import { Card, CardHead } from "./_shell/ui";
import { NoContactsYetRow } from "./NoContactsYetRow";
import type { CompanyOption } from "./contacts/CompanyCombobox";

export type NoContactCompany = { id: string; name: string };

/**
 * NO CONTACTS YET — companies with zero non-deleted crm_contacts rows; a
 * dead end for outreach until someone's identified. Sits below Needs
 * Research in the dashboard's middle column. `companies` here is the full
 * roster the ADD action's dialog needs for its combobox — not the (usually
 * much shorter) `items` being listed.
 */
export function NoContactsYetList({
  items,
  companies,
}: {
  items: NoContactCompany[];
  companies: CompanyOption[];
}) {
  return (
    <Card>
      <CardHead title="No Contacts Yet" hint={items.length ? `${items.length} companies` : "All companies covered"} />
      {items.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-fg-muted">Every company has at least one contact.</p>
      ) : (
        <ul className="divide-y divide-line-strong">
          {items.map((c) => (
            <NoContactsYetRow key={c.id} id={c.id} name={c.name} companies={companies} />
          ))}
        </ul>
      )}
    </Card>
  );
}

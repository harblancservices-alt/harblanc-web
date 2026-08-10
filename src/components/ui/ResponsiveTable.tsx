import type { ReactNode } from "react";

/**
 * Documents/enforces the table↔card split convention already proven
 * independently in `TripsListView.tsx`, `ApplicationsDarkTable.tsx` (admin)
 * and the CRM's Accounts/Contacts/Carriers/Shipments list pages: a `<table>`
 * that's `hidden` below `lg` paired with a card list that's `hidden` at
 * `lg` and up, both reading the same row-data array — so the data layer
 * stays completely shared and only the last-mile render forks.
 *
 * Purely a layout wrapper — no styling opinions of its own (each app keeps
 * its own table/card visual language), so it's safe to use from either the
 * CRM or admin. Not wired into any existing table; those already do this
 * split by hand and are left alone. Use this for new tables going forward
 * instead of re-deriving the two wrapper divs each time.
 */
export function ResponsiveTable({
  table,
  cards,
}: {
  /** The desktop `<table>` (or its wrapping card/scroll container). */
  table: ReactNode;
  /** The mobile card-list rendering of the same rows. */
  cards: ReactNode;
}) {
  return (
    <>
      <div className="hidden lg:block">{table}</div>
      <div className="lg:hidden">{cards}</div>
    </>
  );
}

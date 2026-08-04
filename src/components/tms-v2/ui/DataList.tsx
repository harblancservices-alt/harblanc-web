import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The one list primitive for /tms-v2 (v2-architecture.md §2, house rule
 * #5). One data model in, renders as a sortable-header/zebra table on
 * desktop or a stacked card on mobile via a CSS breakpoint — not two
 * separately-maintained render paths, which was V1's pattern on Trips,
 * Load Board, and Brokers alike.
 *
 * Scope note: pagination, bulk-select, and server-persisted saved filters
 * are part of this primitive's eventual contract (§2), but no /tms-v2
 * screen needs them yet in this foundation phase — every current route is
 * a placeholder. Adding that machinery now with no real caller would be
 * exactly the kind of speculative ceremony the architecture doc warns
 * against elsewhere; it lands with the first live list screen that
 * actually has >1 page of rows to page through.
 */
export type DataListColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Omit this column from the mobile card render (still shown in the
   * desktop table) — for secondary columns that would crowd a phone card. */
  hideOnMobile?: boolean;
};

type DataListProps<T> = {
  columns: DataListColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Row navigates to this href when present — rendered as a real <Link>,
   * not a client-side onClick, so rows stay server-renderable. */
  getHref?: (row: T) => string | undefined;
  emptyMessage?: string;
};

export function DataList<T>({
  columns,
  rows,
  rowKey,
  getHref,
  emptyMessage = "Nothing here yet.",
}: DataListProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-[13px] text-fg-muted">{emptyMessage}</div>
    );
  }

  return (
    <div>
      {/* Desktop: sortable-header-shaped, zebra table. */}
      <table className="hidden w-full md:table">
        <thead>
          <tr className="border-b border-line-strong text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 text-[12px] font-medium text-fg-muted ${col.align === "right" ? "text-right" : "text-left"}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const href = getHref?.(row);
            return (
              <tr
                key={rowKey(row)}
                className={`border-b border-line ${i % 2 === 1 ? "bg-elevated/50" : ""}`}
              >
                {columns.map((col) => {
                  const cell = col.render(row);
                  const alignClass = col.align === "right" ? "text-right" : "text-left";
                  return (
                    <td key={col.key} className="p-0">
                      {href ? (
                        <Link
                          href={href}
                          className={`block px-3 py-2.5 text-[14px] text-fg hover:bg-elevated ${alignClass}`}
                        >
                          {cell}
                        </Link>
                      ) : (
                        <div className={`px-3 py-2.5 text-[14px] text-fg ${alignClass}`}>{cell}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile: stacked cards, same data model. */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const href = getHref?.(row);
          const body = (
            <div className="rounded-lg border border-line bg-card p-3">
              {columns
                .filter((col) => !col.hideOnMobile)
                .map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-3 py-1 text-[14px]">
                    <span className="text-fg-muted">{col.header}</span>
                    <span className="text-fg">{col.render(row)}</span>
                  </div>
                ))}
            </div>
          );
          return href ? (
            <Link key={rowKey(row)} href={href}>
              {body}
            </Link>
          ) : (
            <div key={rowKey(row)}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}

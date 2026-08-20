"use client";

import { ClickableRow } from "../../_shell/ClickableRow";
import { LIST_HEAD_ROW, ZEBRA_ROWS, Badge, type BadgeTone } from "../../_shell/ui";
import { titleCaseWords, formatDate } from "../../_shell/format";
import type { BolStatus } from "./actions";

export type BolRow = {
  id: string;
  bolNumber: string | null;
  carrier: string | null;
  shipperName: string | null;
  consigneeName: string | null;
  status: BolStatus;
  createdAt: string;
  companiesResolved: number;
  companiesTotal: number;
  contactCount: number;
};

const STATUS_LABEL: Record<BolStatus, string> = {
  new: "New",
  needs_review: "Needs Review",
  ready: "Ready",
  processed: "Processed",
  ignored: "Ignored",
};
const STATUS_TONE: Record<BolStatus, BadgeTone> = {
  new: "neutral",
  needs_review: "warning",
  ready: "accent",
  processed: "success",
  ignored: "danger",
};
/** Still needs attention vs functionally closed out. */
const OPEN_STATUSES = new Set<BolStatus>(["new", "needs_review", "ready"]);

export function BolTable({ rows }: { rows: BolRow[] }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className="w-2 px-2 py-2.5" aria-label="Open" />
          <th className="px-4 py-2.5 text-left">BOL #</th>
          <th className="px-4 py-2.5 text-left">Shipper</th>
          <th className="px-4 py-2.5 text-left">Consignee</th>
          <th className="px-4 py-2.5 text-left">Companies</th>
          <th className="px-4 py-2.5 text-left">Contacts</th>
          <th className="px-4 py-2.5 text-left">Status</th>
          <th className="px-4 py-2.5 text-left">Received</th>
        </tr>
      </thead>
      <tbody className={ZEBRA_ROWS}>
        {rows.map((r) => (
          <BolTableRow key={r.id} row={r} />
        ))}
      </tbody>
    </table>
  );
}

function BolTableRow({ row }: { row: BolRow }) {
  const open = OPEN_STATUSES.has(row.status);
  return (
    <ClickableRow href={`/crm/admin/bol-center/${row.id}`}>
      <td className="px-2 py-3">
        <span
          className={`block h-2 w-2 rounded-full ${open ? "bg-accent" : "bg-fg-subtle/40"}`}
          title={open ? "Open" : "Closed"}
        />
      </td>
      <td className="px-4 py-3 truncate font-semibold text-fg">{row.bolNumber || "—"}</td>
      <td className="px-4 py-3 truncate text-fg-muted">{row.shipperName ? titleCaseWords(row.shipperName) : "—"}</td>
      <td className="px-4 py-3 truncate text-fg-muted">{row.consigneeName ? titleCaseWords(row.consigneeName) : "—"}</td>
      <td className="px-4 py-3 tabular-nums text-fg-muted">
        {row.companiesTotal > 0 ? `${row.companiesResolved}/${row.companiesTotal} matched` : "—"}
      </td>
      <td className="px-4 py-3 tabular-nums text-fg-muted">{row.contactCount}</td>
      <td className="px-4 py-3">
        <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
      </td>
      <td className="px-4 py-3 truncate text-fg-muted">{formatDate(row.createdAt)}</td>
    </ClickableRow>
  );
}

/**
 * V2 "Fleet Ops" className helpers for tables and form fields. These are plain
 * Tailwind class strings (built on the V2 tokens) so any page can adopt the
 * shared look without a wrapper component. Presentational only.
 *
 * Table usage:
 *   <table className={table.root}>
 *     <thead className={table.thead}>
 *       <tr><th className={table.th}>Load</th><th className={table.thNum}>Rate</th></tr>
 *     </thead>
 *     <tbody>
 *       <tr className={table.row}>
 *         <td className={table.tdFirst}>#1042</td>
 *         <td className={table.tdNum}>$2,400</td>
 *       </tr>
 *     </tbody>
 *   </table>
 *
 * Field usage:
 *   <label className={field.label}>Broker</label>
 *   <input className={field.input} />
 */

export const table = {
  /** Full-width, collapsed borders, ink body text. */
  root: "w-full border-collapse text-[13px] text-ink",
  /** Inset header band. */
  thead: "bg-inset",
  /** 11px uppercase label cell, 2px bottom border on the header row. */
  th: "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3 border-b-2 border-line-strong",
  /** Numeric header — right-aligned. */
  thNum: "px-3 py-2 text-right text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3 border-b-2 border-line-strong",
  /** Body row: subtle zebra + hairline + ~44px height. */
  row: "h-11 border-b border-line odd:bg-card even:bg-inset hover:bg-inset",
  /** Standard body cell. */
  td: "px-3 py-2 align-middle",
  /** Bold first column. */
  tdFirst: "px-3 py-2 align-middle font-bold text-ink",
  /** Right-aligned tabular numerics. */
  tdNum: "px-3 py-2 align-middle text-right tabular-nums",
} as const;

export const field = {
  /** 11px caps label. */
  label: "block text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-1",
  /** 40px input, line-strong border, 2px accent focus ring. */
  input:
    "w-full h-10 rounded-md border border-line-strong bg-card px-3 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40",
  /** Same treatment for <select>. */
  select:
    "w-full h-10 rounded-md border border-line-strong bg-card px-3 text-[14px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/40",
  /** Multiline variant (auto height). */
  textarea:
    "w-full min-h-[80px] rounded-md border border-line-strong bg-card px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40",
} as const;

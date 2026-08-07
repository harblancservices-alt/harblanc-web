/**
 * Client-safe CSV export/import helpers — shared by the Loads board and
 * Expenses ledger (Phase 6, lower-priority item). Same conventions
 * legacy's per-page CSV code already used (BOM + CRLF so Excel opens the
 * UTF-8 correctly, RFC4180-ish quoting), pulled into one place instead of
 * copy-pasted per page.
 */

export function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function downloadCsv(filename: string, header: string[], rows: string[][]): void {
  const lines = [header, ...rows].map((row) => row.map(csvEscape).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Minimal RFC4180-ish line splitter — handles quoted fields with embedded
 * commas/escaped quotes. Ported from legacy's ExpensesView.tsx (embedded
 * newlines inside a quoted field aren't supported — fine for vendor/
 * description-level data). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

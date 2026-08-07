"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { splitCsvLine } from "@/lib/csv";
import { importExpenses, type ImportExpenseRow } from "@/actions/tms-v2/expenses";
import { RECURRING_FREQUENCIES } from "@/lib/domain/expenses";

function isFrequency(v: string): boolean {
  return (RECURRING_FREQUENCIES as readonly string[]).includes(v);
}

/** Ported from legacy's ExpensesView.tsx parseImportCsv() — same header
 * aliases, same "vendor + amount are the only required columns" rule. */
function parseImportCsv(text: string): ImportExpenseRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;

  const vendorIdx = idx("vendor", "name");
  const categoryIdx = idx("category");
  const descriptionIdx = idx("description", "notes");
  const amountIdx = idx("amount");
  const methodIdx = idx("payment method", "paymentmethod", "card");
  const frequencyIdx = idx("frequency");
  const startDateIdx = idx("start date", "startdate", "next charge");

  if (vendorIdx < 0 || amountIdx < 0) return [];

  const rows: ImportExpenseRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const vendor = (cells[vendorIdx] ?? "").trim();
    const amount = Number((cells[amountIdx] ?? "").replace(/[$,\s]/g, ""));
    if (!vendor || !Number.isFinite(amount)) continue;
    const frequencyRaw = (cells[frequencyIdx] ?? "monthly").trim().toLowerCase();
    rows.push({
      vendor,
      category: categoryIdx >= 0 ? (cells[categoryIdx] ?? "").trim() || null : null,
      description: descriptionIdx >= 0 ? (cells[descriptionIdx] ?? "").trim() || null : null,
      amount: Math.round(amount * 100) / 100,
      paymentMethod: methodIdx >= 0 ? (cells[methodIdx] ?? "").trim() || null : null,
      frequency: isFrequency(frequencyRaw) ? frequencyRaw : "monthly",
      startDate:
        startDateIdx >= 0 && /^\d{4}-\d{2}-\d{2}$/.test((cells[startDateIdx] ?? "").trim())
          ? (cells[startDateIdx] ?? "").trim()
          : null,
    });
  }
  return rows;
}

export function ImportExpensesButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFile(file: File) {
    setBusy(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rows = parseImportCsv(String(reader.result ?? ""));
        if (rows.length === 0) throw new Error("No valid rows found in that file (need at least Vendor + Amount columns).");
        const res = await importExpenses(rows);
        if (res.ok) {
          router.refresh();
        } else {
          setError(res.reason);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read that CSV file.");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      setError("Could not read that CSV file.");
      setBusy(false);
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={busy} aria-busy={busy}>
        {busy ? "Importing…" : "Import CSV"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      {error ? (
        <p role="alert" className="max-w-[220px] text-right text-[12px] font-medium text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

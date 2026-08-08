"use client";

import { useState } from "react";
import { formatPhone, formatPhoneInput } from "@/lib/domain/phone";

/**
 * Data-driven field grid for the revenue composers (Estimate/Finalized
 * Quote/BOL) — these forms carry 10-40 fields each (pickup/delivery
 * contact+address, commodity/dims, handling flags). One declarative spec
 * array per composer instead of hand-written JSX per field keeps each
 * composer file readable. `name` attributes match V1's FormData keys
 * exactly (snake_case) so the legacy action's own parser reads them
 * unchanged — no translation layer between this form and V1's business
 * logic.
 */

/** The one "tel" field renders through this — controlled + auto-formatting
 * (lib/domain/phone.ts), while every other field type in this grid stays
 * plain `defaultValue`/uncontrolled. */
function TelField({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  const [value, setValue] = useState(() => formatPhone(defaultValue) || defaultValue);
  return (
    <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
      {label}
      <input
        name={name}
        type="tel"
        value={value}
        onChange={(e) => setValue(formatPhoneInput(e.target.value))}
        autoComplete="off"
        className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
      />
    </label>
  );
}

export type FieldSpec =
  | { name: string; label: string; type: "text" | "number" | "date" | "tel" | "email" }
  | { name: string; label: string; type: "textarea" }
  | { name: string; label: string; type: "tribool" }
  | { name: string; label: string; type: "checkbox" };

function triboolDefault(v: unknown): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "";
}

export function FieldGrid({ fields, defaults }: { fields: FieldSpec[]; defaults: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        const raw = defaults[f.name];
        if (f.type === "textarea") {
          return (
            <label key={f.name} className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted sm:col-span-2">
              {f.label}
              <textarea
                name={f.name}
                rows={2}
                defaultValue={typeof raw === "string" ? raw : ""}
                className="rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
              />
            </label>
          );
        }
        if (f.type === "tribool") {
          return (
            <label key={f.name} className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
              {f.label}
              <select
                name={f.name}
                defaultValue={triboolDefault(raw)}
                className="h-9 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg focus:border-fg focus:outline-none"
              >
                <option value="">Unknown</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          );
        }
        if (f.type === "checkbox") {
          return (
            <label key={f.name} className="flex items-center gap-2 text-[13px] font-medium text-fg">
              <input type="checkbox" name={f.name} defaultChecked={!!raw} className="h-4 w-4" />
              {f.label}
            </label>
          );
        }
        if (f.type === "tel") {
          return <TelField key={f.name} name={f.name} label={f.label} defaultValue={raw == null ? "" : String(raw)} />;
        }
        return (
          <label key={f.name} className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            {f.label}
            <input
              name={f.name}
              type={f.type}
              step={f.type === "number" ? "any" : undefined}
              defaultValue={raw == null ? "" : String(raw)}
              className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
            />
          </label>
        );
      })}
    </div>
  );
}

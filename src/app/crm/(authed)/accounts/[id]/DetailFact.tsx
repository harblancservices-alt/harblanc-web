import type { ReactNode } from "react";
import { IconAiAgent } from "../../_shell/icons";

/**
 * Shared read-only fact tile for the Details tab's expansion groups (Company
 * profile, Freight profile, Commercial, Context) — the same label-over-value
 * shape DetailsSection.tsx's basic grid uses, factored out here so the four
 * new group sections don't each carry their own copy.
 */
export function DetailFact({
  label,
  value,
  mono,
  fromAi,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  /** Light "from research" marker — set when this field's current value was
   * last written by confirming an AI suggestion (crm_accounts.ai_confirmed_fields). */
  fromAi?: boolean;
}) {
  const empty = value === null || value === undefined || value === "" || value === "—";
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
        {fromAi && !empty && (
          <span
            title="Confirmed from AI research"
            className="inline-flex items-center gap-0.5 bg-warn-bg px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warn"
          >
            <IconAiAgent width={9} height={9} />
            AI
          </span>
        )}
      </p>
      <p
        className={`mt-1 break-words text-[14px] ${empty ? "text-fg-subtle" : "text-fg"} ${mono && !empty ? "font-mono" : ""}`}
      >
        {empty ? "—" : value}
      </p>
    </div>
  );
}

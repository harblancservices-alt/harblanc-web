import { Card, CardHead } from "../../_shell/ui";

function titleCaseKey(key: string): string {
  return key
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * RIGHT column — "Custom Fields": crm_accounts.custom (jsonb, always '{}' in
 * practice — nothing in the CRM writes to it yet). Renders whatever keys are
 * actually present; the card itself is omitted entirely when empty, per
 * Brent's instruction, rather than shown with placeholder rows.
 */
export function CustomFieldsCard({ custom }: { custom: Record<string, unknown> | null }) {
  const entries = Object.entries(custom ?? {});
  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHead title="Custom fields" />
      <div className="flex flex-col gap-4 p-5">
        {entries.map(([key, value]) => (
          <div key={key} className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{titleCaseKey(key)}</p>
            <p className="mt-1 break-words text-[14px] text-fg">{renderValue(value)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

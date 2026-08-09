import { Card, CardHead } from "../../_shell/ui";
import { ContextNotesDialog } from "./ContextNotesDialog";

function parseCommodities(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * commodities is one free-text field, but in practice it often carries a
 * handful of short tags followed by a longer researched description. Walks
 * the comma-split fragments and keeps them as chips only while each one
 * still reads like a short tag (no sentence punctuation, under ~28 chars);
 * the first fragment that doesn't qualify — plus everything after it,
 * rejoined with ", " — becomes one clean paragraph instead.
 */
function splitCommodities(value: string | null): { chips: string[]; prose: string | null } {
  const parts = parseCommodities(value);
  const chips: string[] = [];
  let proseStart = -1;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length <= 28 && !/[.!?]|—/.test(part)) {
      chips.push(part);
    } else {
      proseStart = i;
      break;
    }
  }
  const prose = proseStart === -1 ? null : parts.slice(proseStart).join(", ");
  return { chips, prose };
}

/**
 * CALL ANGLE — why we're calling this company: what they ship (commodities,
 * edited via the full company Edit dialog in Details) plus the pitch/notes
 * (context_notes, edited inline here via ContextNotesDialog, which owns its
 * own trigger since this is a Server Component — see its docstring). When
 * both are empty, shows a single "Add call angle" affordance instead of a
 * blank card.
 */
export function CallAngleSection({
  accountId,
  commodities,
  contextNotes,
}: {
  accountId: string;
  commodities: string | null;
  contextNotes: string | null;
}) {
  const { chips, prose } = splitCommodities(commodities);
  const hasCommodities = chips.length > 0 || !!prose;
  const isEmpty = !hasCommodities && !contextNotes;

  return (
    <Card>
      <CardHead title="Call angle" right={<ContextNotesDialog accountId={accountId} defaultValue={contextNotes} />} />
      {isEmpty ? (
        <p className="px-5 py-6 text-center text-[13.5px] text-fg-muted">
          No call angle yet — add what they ship or why we're calling.
        </p>
      ) : (
        <div className="flex flex-col gap-4 p-5">
          {hasCommodities && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                What they ship
              </p>
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center border border-line-strong bg-inset px-3 py-1 text-[12.5px] font-medium text-fg"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {prose && (
                <p className={`text-[13.5px] leading-relaxed text-fg ${chips.length ? "mt-2" : ""}`}>{prose}</p>
              )}
            </div>
          )}
          {contextNotes && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                The pitch
              </p>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">{contextNotes}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

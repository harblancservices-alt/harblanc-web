"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { titleCaseWords } from "../_shell/format";
import { SourcePill } from "../_shell/SourcePill";
import { ContactDialog } from "../accounts/[id]/ContactDialog";
import { fillCompanyGap } from "../accounts/[id]/details-actions";
import { GAP_REASON, type CompletenessGap, type GapKind } from "./completeness";

/**
 * GAPS TO FILL — structure A, "company first".
 *
 * Brent picked A from the four: the COMPANY is the object and the gaps are
 * what it is missing. One row per company, not one row per gap — a company
 * missing three things is one decision ("do I work these people?"), not
 * three.
 *
 * ── A'S NAMED WEAKNESS, AND THE TWO FIXES ─────────────────────────────
 *
 * The sheet says it plainly: "nothing tells you which company to do first.
 * Three rows, equal weight." Fixed without importing B's two-tier layout,
 * which would have brought B's own weakness (the same company appearing
 * twice):
 *
 *   ORDER   a company with a blocking gap sorts above one without. Ties
 *           break on how many things are missing, then on name so the list
 *           does not reshuffle between renders.
 *   MARKER  the blocking chip is drawn in the red accent; the optional ones
 *           stay outlined blue. One chip differs, not a whole second tier.
 *
 * ── WHAT "BLOCKING" MEANS, PRECISELY ──────────────────────────────────
 *
 * It is NOT a stage gate and this component does not say it is. No badge
 * reads "BLOCKS QUALIFIED", because nothing in this app refuses a stage
 * change for a missing field. What is true — and what the red marks — is
 * that Qualified hands an agent "Make first contact", and you cannot make
 * first contact with a company that has nobody on file. See
 * completeness.ts's `blocking` note.
 *
 * ── STILL DERIVED, STILL DISAPPEARING ─────────────────────────────────
 *
 * Every row comes from gapsForCompany at read time. Nothing is stored,
 * nothing is reaped, and a chip vanishes the moment its field is filled —
 * the optimistic hide plus router.refresh means a half-succeeded save
 * brings the chip back rather than leaving it gone on a lie.
 *
 * ── EACH CHIP IS THE FIX ──────────────────────────────────────────────
 *
 * Typing happens in the chip's place: it becomes an input, you type, enter,
 * the chip goes. "Find a contact" is the exception and opens the real
 * add-contact dialog — a person is a name, a title, a number and an email,
 * and one text box would produce bad records faster.
 */

/** What the inline editor asks for, per kind. Absent means this kind is not
 * inline-fixable and opens a dialog instead. */
const INLINE: Partial<Record<GapKind, { placeholder: string; label: string }>> = {
  industry: { placeholder: "e.g. Scaffolding, Pumps, Fence rental", label: "Industry" },
  address: { placeholder: "Street address", label: "Address" },
};

const CHIP =
  "rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-colors";
const CHIP_OPTIONAL = `${CHIP} border-accent/45 bg-card text-accent hover:border-accent hover:bg-accent-bg`;
// The one distinction. Red means "you cannot start" here, the same way it
// means late on a task — not a second tier, one chip in a different colour.
const CHIP_BLOCKING = `${CHIP} border-bad/50 bg-bad-bg text-bad hover:border-bad`;

export function CompletenessList({
  gaps,
  total,
}: {
  gaps: CompletenessGap[];
  /** Gaps across the whole book, which may exceed what is shown. */
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /** Chips hidden the instant they save, before the server round-trip. */
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visible = gaps.filter((g) => !filled.has(g.id));
  if (visible.length === 0) return null;

  // ── Group by company, then order by urgency (fix 1). ──
  const byCompany = new Map<
    string,
    { name: string; source: string | null; gaps: CompletenessGap[] }
  >();
  for (const g of visible) {
    const entry =
      byCompany.get(g.companyId) ?? { name: g.companyName, source: g.source, gaps: [] };
    entry.gaps.push(g);
    byCompany.set(g.companyId, entry);
  }
  const rows = [...byCompany.entries()].sort(([, a], [, b]) => {
    const aBlocked = a.gaps.some((g) => g.blocking);
    const bBlocked = b.gaps.some((g) => g.blocking);
    if (aBlocked !== bBlocked) return aBlocked ? -1 : 1;
    if (a.gaps.length !== b.gaps.length) return b.gaps.length - a.gaps.length;
    return a.name.localeCompare(b.name);
  });

  function save(gap: CompletenessGap) {
    const v = value.trim();
    if (!v) return;
    setError(null);
    startTransition(async () => {
      const res = await fillCompanyGap(gap.companyId, gap.kind, v);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFilled((prev) => new Set(prev).add(gap.id));
      setEditing(null);
      setValue("");
      router.refresh();
    });
  }

  return (
    <div>
      {total > visible.length && (
        <p className="px-4 pt-2 text-[11.5px] text-fg-subtle">
          Showing {visible.length} of {total}
        </p>
      )}

      {error && (
        <p className="mx-4 mt-2 rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
          {error}
        </p>
      )}

      <ul>
        {rows.map(([companyId, entry]) => (
          <li key={companyId} className="border-t border-line px-4 py-3 first:border-t-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/crm/accounts/${companyId}`}
                prefetch={false}
                className="min-w-0 truncate text-[13px] font-extrabold text-fg hover:text-accent hover:underline"
              >
                {titleCaseWords(entry.name)}
              </Link>
              <SourcePill source={entry.source} short />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {entry.gaps.map((gap) => {
                const inline = INLINE[gap.kind];
                const cls = gap.blocking ? CHIP_BLOCKING : CHIP_OPTIONAL;

                // The one gap that is a real form, not a field.
                if (!inline) {
                  return (
                    <ContactDialog
                      key={gap.id}
                      accountId={gap.companyId}
                      // This list is where the missing-company bug bit: several
                      // companies stacked, chips that look alike, and a dialog
                      // that named none of them.
                      companyName={titleCaseWords(entry.name)}
                      mode="create"
                      trigger={(open) => (
                        <button
                          type="button"
                          onClick={open}
                          title={
                            gap.blocking
                              ? "Nothing can happen here until somebody is on file to call"
                              : GAP_REASON[gap.kind]
                          }
                          className={cls}
                        >
                          {gap.label}
                        </button>
                      )}
                    />
                  );
                }

                if (editing !== gap.id) {
                  return (
                    <button
                      key={gap.id}
                      type="button"
                      onClick={() => {
                        setEditing(gap.id);
                        setValue("");
                        setError(null);
                      }}
                      title={GAP_REASON[gap.kind]}
                      className={cls}
                    >
                      {gap.label}
                    </button>
                  );
                }

                // The chip becomes the field, in place.
                return (
                  <form
                    key={gap.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      save(gap);
                    }}
                    className="inline-flex items-center gap-1"
                  >
                    <input
                      autoFocus
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setEditing(null);
                          setValue("");
                        }
                      }}
                      onBlur={() => {
                        if (!value.trim()) setEditing(null);
                      }}
                      placeholder={inline.placeholder}
                      aria-label={`${inline.label} for ${entry.name}`}
                      disabled={pending}
                      className="w-[210px] rounded-md border border-accent bg-card px-2.5 py-1 text-[12px] text-fg outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={pending || !value.trim()}
                      className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50"
                    >
                      {pending ? "…" : "Save"}
                    </button>
                  </form>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

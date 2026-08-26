"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { titleCaseWords } from "../_shell/format";
import { ContactDialog } from "../accounts/[id]/ContactDialog";
import { fillCompanyGap } from "../accounts/[id]/details-actions";
import { GAP_REASON, type CompletenessGap, type GapKind } from "./completeness";

/**
 * Completeness gaps — grouped by company, and FIXABLE WHERE THEY SIT.
 *
 * Brent, 2026-08-26: "give the gaps record a real look and function."
 *
 * FUNCTION. A gap used to be a link: it told you something was missing and
 * sent you to the company profile to fix it, which meant leaving the
 * dashboard, finding the field, saving, and coming back. Now the input opens
 * in the row. Type it, save, the row goes — that disappearance is the whole
 * reward, so it happens immediately rather than waiting on a page reload.
 *
 * "FIND A CONTACT" IS THE EXCEPTION and opens the real add-contact dialog,
 * pre-filled with the company. A person is a name, a title, a number and an
 * email; cramming that into one inline field would produce bad records
 * faster, which is the opposite of the point.
 *
 * GROUPED BY COMPANY. Five rows covering two companies read as five
 * unrelated chores; two blocks read as "these two companies need filling
 * in", which is what it actually is. It also roughly halves the height.
 *
 * WHAT DELIBERATELY DID NOT CHANGE, because it was already right: gaps are
 * DERIVED and never stored (completeness.ts), so there is nothing to reap
 * and they self-heal; there is no checkbox and no Done button, because
 * there is nothing to complete — the row leaves when the field is filled;
 * and they stay out of the overdue and due-today counts, which only ever
 * mean real tasks.
 *
 * The optimistic hide plus router.refresh() is deliberate: the refresh
 * re-derives the gaps from the server, so if a save half-succeeded the row
 * comes back rather than staying gone on a lie.
 */

/** What the inline editor asks for, per kind. `null` means this kind is not
 * inline-fixable and opens a dialog instead. */
const INLINE: Partial<Record<GapKind, { placeholder: string; label: string }>> = {
  industry: { placeholder: "e.g. Scaffolding, Pumps, Fence rental", label: "Industry" },
  address: { placeholder: "Street address", label: "Address" },
};

export function CompletenessList({
  gaps,
  total,
  compact = false,
}: {
  gaps: CompletenessGap[];
  /** Gaps across the whole book, which may exceed what is shown. */
  total: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /** Rows hidden the instant they save, before the server round-trip lands. */
  const [fixed, setFixed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visible = gaps.filter((g) => !fixed.has(g.id));
  if (visible.length === 0) return null;

  // Grouped, preserving the order companies first appear in.
  const byCompany = new Map<string, { name: string; gaps: CompletenessGap[] }>();
  for (const g of visible) {
    const entry = byCompany.get(g.companyId) ?? { name: g.companyName, gaps: [] };
    entry.gaps.push(g);
    byCompany.set(g.companyId, entry);
  }

  function open(gap: CompletenessGap) {
    setEditing(gap.id);
    setValue("");
    setError(null);
  }

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
      setFixed((prev) => new Set(prev).add(gap.id));
      setEditing(null);
      setValue("");
      router.refresh();
    });
  }

  return (
    <div className={compact ? "" : ""}>
      {/* No second heading: the card this sits in already says "Gaps". The
          count moves up here so the panel is one header, not two. */}
      {total > visible.length && (
        <p className="px-4 pb-1 pt-2 text-[11.5px] text-fg-subtle">
          Showing {visible.length} of {total}
        </p>
      )}

      {error && (
        <p className="mx-3 mb-2 rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-2 p-3">
        {[...byCompany.entries()].map(([companyId, entry]) => (
          <li
            key={companyId}
            className="rounded-lg border border-line-strong bg-card p-3 shadow-e1"
          >
            <Link
              href={`/crm/accounts/${companyId}`}
              prefetch={false}
              className="block truncate text-[13px] font-bold text-fg hover:text-accent hover:underline"
            >
              {titleCaseWords(entry.name)}
            </Link>
            <p className="mt-0.5 text-[11.5px] text-fg-subtle">
              {entry.gaps.length} {entry.gaps.length === 1 ? "thing" : "things"} missing
            </p>

            <div className="mt-2 flex flex-col gap-1.5">
              {entry.gaps.map((gap) => {
                const inline = INLINE[gap.kind];
                const isOpen = editing === gap.id;

                // The one gap that is a real form, not a field.
                if (!inline) {
                  return (
                    <ContactDialog
                      key={gap.id}
                      accountId={gap.companyId}
                      mode="create"
                      trigger={(openDialog) => (
                        <button
                          type="button"
                          onClick={openDialog}
                          className="flex items-baseline gap-2 rounded-md border border-line px-2.5 py-1.5 text-left transition-colors hover:border-accent hover:bg-accent-bg"
                        >
                          <span className="text-[12.5px] font-semibold text-fg">{gap.label}</span>
                          <span className="truncate text-[11.5px] text-fg-subtle">
                            {GAP_REASON[gap.kind]}
                          </span>
                        </button>
                      )}
                    />
                  );
                }

                if (!isOpen) {
                  return (
                    <button
                      key={gap.id}
                      type="button"
                      onClick={() => open(gap)}
                      className="flex items-baseline gap-2 rounded-md border border-line px-2.5 py-1.5 text-left transition-colors hover:border-accent hover:bg-accent-bg"
                    >
                      <span className="text-[12.5px] font-semibold text-fg">{gap.label}</span>
                      <span className="truncate text-[11.5px] text-fg-subtle">
                        {GAP_REASON[gap.kind]}
                      </span>
                    </button>
                  );
                }

                return (
                  <form
                    key={gap.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      save(gap);
                    }}
                    className="flex items-center gap-1.5 rounded-md border border-accent bg-accent-bg px-2 py-1.5"
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
                      placeholder={inline.placeholder}
                      aria-label={`${inline.label} for ${entry.name}`}
                      disabled={pending}
                      className="min-w-0 flex-1 rounded border border-line-strong bg-card px-2 py-1 text-[12.5px] text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={pending || !value.trim()}
                      className="shrink-0 rounded bg-accent px-2 py-1 text-[11.5px] font-bold text-white disabled:opacity-50"
                    >
                      {pending ? "…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setValue("");
                      }}
                      className="shrink-0 rounded px-1.5 py-1 text-[11.5px] font-semibold text-fg-muted hover:text-fg"
                    >
                      Cancel
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

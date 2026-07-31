"use client";

import { useState } from "react";
import { LABEL, CONTROL } from "../_shell/form";

export type CompanyOption = { id: string; name: string };

export type CompanySelection = { text: string; selectedId: string | null };

/**
 * Company picker for the contact quick-add: one text input that both
 * autocompletes existing companies (click a match to attach) and, when the
 * typed name doesn't match anything, offers to create a brand-new company
 * from just that name. `companies` is the org's full roster (id/name only),
 * fetched server-side in contacts/page.tsx and passed down as plain data —
 * filtering happens here, client-side, as the admin types.
 *
 * Selection rule: typing always clears `selectedId` (so an edit after
 * picking a match re-opens it to a fresh choice); only clicking a dropdown
 * row sets it. On submit, AddContactDialog treats a non-empty, unselected
 * `text` as "create a new company with this name" — the "+ Create new
 * company" row is there for discoverability/confirmation, not because
 * clicking it does anything `text` alone wouldn't already mean.
 */
export function CompanyCombobox({
  companies,
  selection,
  onChange,
  allowCreate = true,
}: {
  companies: CompanyOption[];
  selection: CompanySelection;
  onChange: (next: CompanySelection) => void;
  /** False for pickers that must resolve to an EXISTING company (e.g. the
   * dashboard's quick "Log a call" — a call needs a real account, so it
   * shouldn't silently spin up a bare one the way the contact quick-add
   * does). Defaults true to match every existing call site. */
  allowCreate?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const trimmed = selection.text.trim();
  const matches = trimmed
    ? companies
        .filter((c) => c.name.toLowerCase().includes(trimmed.toLowerCase()))
        .slice(0, 8)
    : [];
  const exactMatch = companies.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  const showCreate = allowCreate && trimmed.length > 0 && !exactMatch;
  const showDropdown = open && (matches.length > 0 || showCreate);

  return (
    <div className="relative flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Company</span>
        <input
          type="text"
          value={selection.text}
          onChange={(e) => {
            onChange({ text: e.target.value, selectedId: null });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder="Search or type a new company name…"
          autoComplete="off"
          className={`h-11 ${CONTROL}`}
        />
      </label>

      {selection.selectedId ? (
        <p className="text-[12px] text-fg-subtle">Attaching to an existing company.</p>
      ) : trimmed && allowCreate ? (
        <p className="text-[12px] text-fg-subtle">
          No match selected — saving will create &ldquo;{trimmed}&rdquo; as a new company.
        </p>
      ) : trimmed ? (
        <p className="text-[12px] text-fg-subtle">
          No matching company — pick one from the list below.
        </p>
      ) : (
        <p className="text-[12px] text-fg-subtle">
          {allowCreate
            ? "Optional — leave blank to save with no company."
            : "Search for the company to log this call against."}
        </p>
      )}

      {showDropdown && (
        <ul className="absolute left-0 top-[4.6rem] z-10 max-h-56 w-full overflow-y-auto rounded-lg border border-line-strong bg-card py-1 shadow-e3">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange({ text: c.name, selectedId: c.id });
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-[13.5px] text-fg transition-colors hover:bg-inset"
              >
                {c.name}
              </button>
            </li>
          ))}
          {showCreate && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange({ text: trimmed, selectedId: null });
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-[13.5px] font-semibold text-accent transition-colors hover:bg-inset"
              >
                + Create new company: &ldquo;{trimmed}&rdquo;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

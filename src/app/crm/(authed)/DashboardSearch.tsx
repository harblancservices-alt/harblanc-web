"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconCompanies, IconContacts } from "./_shell/icons";
import { CONTROL, CONTROL_SIZE } from "./_shell/compactForm";

export type SearchCompanyOption = { id: string; name: string };
export type SearchContactOption = { id: string; name: string; companyName: string | null };

/**
 * The dashboard header's search box — one input covering both companies and
 * contacts. `companies`/`contacts` are the org's full rosters, already
 * fetched server-side for the quick-action dialogs — filtering happens here,
 * client-side, as the rep types, matching CompanyCombobox's pattern rather
 * than round-tripping a server action per keystroke. Picking a result
 * navigates straight to that record's profile. Closes on outside click,
 * Escape, or a pick.
 */
export function DashboardSearch({
  companies,
  contacts,
}: {
  companies: SearchCompanyOption[];
  contacts: SearchContactOption[];
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const q = value.trim().toLowerCase();
  const companyMatches = q ? companies.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6) : [];
  const contactMatches = q ? contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6) : [];
  const hasResults = companyMatches.length > 0 || contactMatches.length > 0;
  const showPanel = open && q.length > 0;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search companies or contacts…"
        aria-label="Search companies or contacts"
        className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
      />

      {showPanel && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[70vh] overflow-y-auto rounded-[5px] border border-line-strong bg-card shadow-e3">
          {!hasResults ? (
            <p className="px-4 py-4 text-[13px] text-fg-muted">No matches for &quot;{value.trim()}&quot;</p>
          ) : (
            <>
              {companyMatches.length > 0 && (
                <div>
                  <p className="border-b border-line-strong bg-inset px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                    Companies
                  </p>
                  <ul className="divide-y divide-line-strong">
                    {companyMatches.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/crm/accounts/${c.id}`}
                          prefetch={false}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-fg/[0.04]"
                        >
                          <IconCompanies width={15} height={15} className="shrink-0 text-fg-subtle" />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg">
                            {c.name}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {contactMatches.length > 0 && (
                <div>
                  <p className="border-b border-line-strong bg-inset px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                    Contacts
                  </p>
                  <ul className="divide-y divide-line-strong">
                    {contactMatches.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/crm/contacts/${c.id}`}
                          prefetch={false}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-fg/[0.04]"
                        >
                          <IconContacts width={15} height={15} className="shrink-0 text-fg-subtle" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold text-fg">
                              {c.name}
                            </span>
                            {c.companyName && (
                              <span className="block truncate text-[12px] text-fg-subtle">
                                {c.companyName}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

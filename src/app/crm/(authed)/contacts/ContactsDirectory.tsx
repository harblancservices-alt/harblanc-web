"use client";

import { useMemo, useState } from "react";
import { Card, EmptyState, ZEBRA_ROWS } from "../_shell/ui";
import { CONTROL } from "../_shell/form";
import { PILL, PILL_ACTIVE, PILL_INACTIVE, PILL_SIZE } from "../_shell/compactForm";
import { IconContacts, IconSearch } from "../_shell/icons";
import { timestampMs } from "../_shell/format";
import { normalizeMood } from "../_shell/mood";
import { ContactListCard, type ContactCardData } from "./ContactListCard";
import { AddContactDialog } from "./AddContactDialog";
import type { CompanyOption } from "./CompanyCombobox";

/** Sort options for the directory. "recent" = most recently contacted first
 * (never-contacted sink to the bottom), which is the "who have I not touched
 * in a while" read; "az" is the default because it's the one that pairs with
 * the letter rail. */
type SortKey = "az" | "recent" | "company";

/** The three mood chips Brent asked for. crm_contacts.current_mood carries
 * seven values; only these three are surfaced as filters (the other four —
 * interested / not_interested / call_back / no — are still shown as the
 * avatar dot on each row, they just aren't chips). */
type MoodChip = "hot" | "warm" | "cold";

const MOOD_CHIPS: { key: MoodChip; label: string }[] = [
  { key: "hot", label: "Hot" },
  { key: "warm", label: "Warm" },
  { key: "cold", label: "Cold" },
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Bucket letter for a name — A–Z, or "#" for anything that doesn't start
 * with a latin letter (digits, punctuation, the odd junk row). */
function letterOf(name: string): string {
  const ch = name.trim().charAt(0).toUpperCase();
  return ch >= "A" && ch <= "Z" ? ch : "#";
}

const NO_COMPANY = "No company";

/** Precomputed per-contact search/sort keys, built once per contacts prop. */
type Indexed = {
  c: ContactCardData;
  /** Lowercased name + title + company + email + phone, for substring match. */
  text: string;
  /** Digits of the phone, so "5551234" matches "(555) 123-4…" as typed. */
  digits: string;
  letter: string;
  company: string;
  lastMs: number | null;
  mood: string | null;
};

function buildIndex(contacts: ContactCardData[]): Indexed[] {
  return contacts.map((c) => ({
    c,
    text: [c.name, c.title, c.companyName, c.email, c.phone]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    digits: (c.phone ?? "").replace(/\D/g, ""),
    letter: letterOf(c.name),
    company: c.companyName ?? NO_COMPANY,
    lastMs: timestampMs(c.lastContactedAt),
    mood: normalizeMood(c.currentMood),
  }));
}

function compare(a: Indexed, b: Indexed, sort: SortKey): number {
  if (sort === "recent") {
    // Never-contacted always sinks below anyone with a real timestamp.
    if (a.lastMs === null && b.lastMs === null) return a.c.name.localeCompare(b.c.name);
    if (a.lastMs === null) return 1;
    if (b.lastMs === null) return -1;
    if (a.lastMs !== b.lastMs) return b.lastMs - a.lastMs;
    return a.c.name.localeCompare(b.c.name);
  }
  if (sort === "company") {
    // "No company" sorts last rather than alphabetically under "N".
    const aNone = a.company === NO_COMPANY;
    const bNone = b.company === NO_COMPANY;
    if (aNone !== bNone) return aNone ? 1 : -1;
    const byCompany = a.company.localeCompare(b.company);
    if (byCompany !== 0) return byCompany;
  }
  return a.c.name.localeCompare(b.c.name);
}

type Group = { key: string; label: string; rows: ContactCardData[] };

/**
 * Section header band — the SectionCard pattern from the BOL detail page
 * (3px left accent bar + bg-inset title band + border-line-strong), rebuilt
 * locally here for one specific reason: it has to be STICKY, and both that
 * component and _shell/ui.tsx's Card wrap their content in `overflow-hidden`,
 * which turns the card into a scrollport and silently kills `position:
 * sticky` on anything inside it. So the header is its own element sitting
 * ABOVE the list (not inside it), the list carries the rounding/clipping,
 * and the two are held together by the `<section>` that scopes the sticky
 * range. Existing tokens only — no new colors, radii, or shadows.
 */
function SectionBand({ label, count }: { label: string; count: number }) {
  return (
    <div className="sticky top-0 z-10 flex items-stretch overflow-hidden rounded-t-lg border border-b-0 border-line-strong shadow-e2">
      <span aria-hidden className="w-[3px] shrink-0 bg-accent" />
      <div className="flex flex-1 items-center justify-between gap-3 border-b border-line-strong bg-inset px-4 py-2">
        <h2 className="truncate text-[13px] font-bold tracking-tight text-fg">{label}</h2>
        <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-fg-muted">{count}</span>
      </div>
    </div>
  );
}

/**
 * The global Contacts directory — 2026-08-22 rebuild (Brent approved the
 * mockup). Everything on this screen is client-side over a list the server
 * already handed down whole (~61 rows today, capped at 1000), so search is
 * filter-as-you-type with zero round trips and the chips/sort/grouping
 * recombine instantly. The server component stays a pure data loader and
 * passes ONLY serializable props across the RSC boundary — no callbacks, no
 * component props — because this area has crashed on exactly that before.
 *
 * Desktop-only additions (the A–Z jump rail) are breakpoint-gated at `lg`;
 * the row shape, toolbar, and chips are identical on mobile, where the
 * locked design system already works.
 */
export function ContactsDirectory({
  contacts,
  companies,
  initialQuery,
  initialDecisionMakers,
}: {
  contacts: ContactCardData[];
  /** Only used for the empty-state "Add contact" affordance. */
  companies: CompanyOption[];
  /** Seed from `?q=` so an old shared/bookmarked search URL still lands on
   * the same result set; the URL is not written to afterwards (typing is
   * local state, not navigation). */
  initialQuery: string;
  /** Seed from `?dm=1` — the dashboard's "Decision Makers" tile deep-links
   * here. Same definition as that tile: crm_contacts.is_decision_maker. */
  initialDecisionMakers: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [decisionMakers, setDecisionMakers] = useState(initialDecisionMakers);
  const [hasPhone, setHasPhone] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [moods, setMoods] = useState<MoodChip[]>([]);
  const [byCompany, setByCompany] = useState(false);
  const [sort, setSort] = useState<SortKey>("az");

  const index = useMemo(() => buildIndex(contacts), [contacts]);

  const anyFilter = query.trim().length > 0 || decisionMakers || hasPhone || hasEmail || moods.length > 0;

  function clearAll() {
    setQuery("");
    setDecisionMakers(false);
    setHasPhone(false);
    setHasEmail(false);
    setMoods([]);
  }

  function toggleMood(key: MoodChip) {
    setMoods((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]));
  }

  const filtered = useMemo(() => {
    const raw = query.trim().toLowerCase();
    const digits = raw.replace(/\D/g, "");
    return index.filter((i) => {
      if (decisionMakers && !i.c.isDecisionMaker) return false;
      if (hasPhone && !i.c.phone) return false;
      if (hasEmail && !i.c.email) return false;
      // Mood chips OR against each other, AND against every other filter.
      if (moods.length > 0 && !(i.mood && moods.includes(i.mood as MoodChip))) return false;
      if (!raw) return true;
      if (i.text.includes(raw)) return true;
      // A typed number matches regardless of how the number is punctuated.
      return digits.length >= 3 && i.digits.includes(digits);
    });
  }, [index, query, decisionMakers, hasPhone, hasEmail, moods]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => compare(a, b, sort)), [filtered, sort]);

  /** Letter headers + the jump rail only make sense while the list is
   * actually in name order and not regrouped under companies. */
  const letterMode = sort === "az" && !byCompany;

  const groups = useMemo<Group[]>(() => {
    if (byCompany) {
      const map = new Map<string, ContactCardData[]>();
      for (const i of sorted) {
        const bucket = map.get(i.company);
        if (bucket) bucket.push(i.c);
        else map.set(i.company, [i.c]);
      }
      return [...map.entries()]
        .sort(([a], [b]) => {
          if (a === NO_COMPANY) return 1;
          if (b === NO_COMPANY) return -1;
          return a.localeCompare(b);
        })
        .map(([key, rows]) => ({ key, label: key, rows }));
    }
    if (letterMode) {
      const map = new Map<string, ContactCardData[]>();
      for (const i of sorted) {
        const bucket = map.get(i.letter);
        if (bucket) bucket.push(i.c);
        else map.set(i.letter, [i.c]);
      }
      return [...map.entries()]
        .sort(([a], [b]) => {
          if (a === "#") return 1;
          if (b === "#") return -1;
          return a.localeCompare(b);
        })
        .map(([key, rows]) => ({ key, label: key, rows }));
    }
    return [{ key: "all", label: "", rows: sorted.map((i) => i.c) }];
  }, [sorted, byCompany, letterMode]);

  /** Which rail letters are live for the CURRENT result set. */
  const activeLetters = useMemo(() => {
    const set = new Set<string>();
    for (const i of sorted) set.add(i.letter);
    return set;
  }, [sorted]);

  function jumpTo(letter: string) {
    document.getElementById(`contacts-letter-${letter}`)?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2.5 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex min-w-0 flex-1 items-center">
            <IconSearch width={16} height={16} className="pointer-events-none absolute left-3 text-fg-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, company, title, phone, email…"
              aria-label="Search contacts"
              className={`h-10 w-full pl-9 ${CONTROL}`}
            />
          </label>
          <label className="flex shrink-0 items-center gap-2">
            <span className="text-[11.5px] font-bold uppercase tracking-[0.07em] text-fg">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort contacts"
              className={`h-10 ${CONTROL}`}
            >
              <option value="az">A–Z</option>
              <option value="recent">Last contacted</option>
              <option value="company">Company</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={clearAll}
            className={`${PILL} ${PILL_SIZE} ${anyFilter ? PILL_INACTIVE : PILL_ACTIVE}`}
            aria-pressed={!anyFilter}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setDecisionMakers((v) => !v)}
            className={`${PILL} ${PILL_SIZE} ${decisionMakers ? PILL_ACTIVE : PILL_INACTIVE}`}
            aria-pressed={decisionMakers}
          >
            Decision Makers
          </button>
          <button
            type="button"
            onClick={() => setHasPhone((v) => !v)}
            className={`${PILL} ${PILL_SIZE} ${hasPhone ? PILL_ACTIVE : PILL_INACTIVE}`}
            aria-pressed={hasPhone}
          >
            Has Phone
          </button>
          <button
            type="button"
            onClick={() => setHasEmail((v) => !v)}
            className={`${PILL} ${PILL_SIZE} ${hasEmail ? PILL_ACTIVE : PILL_INACTIVE}`}
            aria-pressed={hasEmail}
          >
            Has Email
          </button>
          {MOOD_CHIPS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => toggleMood(m.key)}
              className={`${PILL} ${PILL_SIZE} ${moods.includes(m.key) ? PILL_ACTIVE : PILL_INACTIVE}`}
              aria-pressed={moods.includes(m.key)}
            >
              {m.label}
            </button>
          ))}
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-line-strong sm:block" />
          <button
            type="button"
            onClick={() => setByCompany((v) => !v)}
            className={`${PILL} ${PILL_SIZE} ${byCompany ? PILL_ACTIVE : PILL_INACTIVE}`}
            aria-pressed={byCompany}
          >
            By Company
          </button>
        </div>

        <p className="text-[12px] font-medium text-fg-muted">
          Showing {sorted.length} of {contacts.length} contact{contacts.length === 1 ? "" : "s"}
          {byCompany ? ` across ${groups.length} compan${groups.length === 1 ? "y" : "ies"}` : ""}.
        </p>
      </Card>

      {sorted.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconContacts />}
            title={contacts.length === 0 ? "No contacts yet" : "No contacts match"}
            body={
              contacts.length === 0
                ? "Add your first contact above, or from any company profile."
                : "Try a different search, or clear the filters to see every contact."
            }
            action={
              contacts.length === 0 ? (
                <AddContactDialog companies={companies} />
              ) : (
                <button
                  type="button"
                  onClick={clearAll}
                  className={`${PILL} ${PILL_SIZE} ${PILL_INACTIVE}`}
                >
                  Clear filters
                </button>
              )
            }
          />
        </Card>
      ) : (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-4">
            {groups.map((g) => (
              <section key={g.key} id={letterMode ? `contacts-letter-${g.key}` : undefined}>
                {g.label && <SectionBand label={g.label} count={g.rows.length} />}
                <ul
                  className={`overflow-hidden border border-line-strong bg-card shadow-e2 ${
                    g.label ? "rounded-b-lg border-t-0" : "rounded-lg"
                  } divide-y divide-line ${ZEBRA_ROWS}`}
                >
                  {g.rows.map((c) => (
                    <ContactListCard key={c.id} contact={c} />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* A–Z jump rail — desktop only. Hidden entirely unless the list is
              actually in letter order, since there'd be nothing to jump to. */}
          {letterMode && (
            <nav
              aria-label="Jump to letter"
              className="sticky top-2 hidden h-fit shrink-0 flex-col items-center rounded-lg border border-line-strong bg-card px-1 py-1.5 shadow-e2 lg:flex"
            >
              {LETTERS.map((l) => {
                const live = activeLetters.has(l);
                return (
                  <button
                    key={l}
                    type="button"
                    disabled={!live}
                    onClick={() => jumpTo(l)}
                    aria-label={`Jump to ${l}`}
                    className={`flex h-[18px] w-5 items-center justify-center rounded text-[10.5px] font-bold leading-none transition-colors ${
                      live
                        ? "text-accent hover:bg-accent hover:text-white"
                        : "cursor-not-allowed text-fg-subtle"
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
              {activeLetters.has("#") && (
                <button
                  type="button"
                  onClick={() => jumpTo("#")}
                  aria-label="Jump to other"
                  className="flex h-[18px] w-5 items-center justify-center rounded text-[10.5px] font-bold leading-none text-accent transition-colors hover:bg-accent hover:text-white"
                >
                  #
                </button>
              )}
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

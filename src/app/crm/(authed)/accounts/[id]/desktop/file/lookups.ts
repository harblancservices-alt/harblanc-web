/**
 * THE LOOKUPS, ALREADY FILLED IN.
 *
 * A PLAIN module — no React, no DB. Six buttons that open somebody else's
 * site with this company's name and city already typed into it.
 *
 * ── WHY THIS IS THE FEATURE AND NOT A CONVENIENCE ─────────────────────
 *
 * Knowing WHERE to look is most of the friction in researching a company,
 * and it is the entire thing a new hire does not have. Telling somebody to
 * "look them up" assumes they know that FMCSA answers whether a company
 * runs its own trucks, that a state registry settles what the legal entity
 * is, and that Maps is the fastest route to a yard's real phone number.
 * Charia started today. She does not know any of that, and a row of labelled
 * buttons teaches it in the only way that survives a busy afternoon.
 *
 * Every one opens in a new tab. Losing the record you were filling in
 * because a search replaced it would be its own small disaster.
 */

export type Lookup = {
  key: string;
  /** What the button says. Plain words — never "SOS" or "SAFER". */
  label: string;
  /** Leading glyph. Text, not an icon font, and never the only signal. */
  glyph: string;
  href: string;
  /** Tooltip: what this one is actually FOR. See the note above. */
  hint: string;
};

/** Registries worth offering, by state. Deliberately tiny — a link to the
 * wrong state's registry is worse than no link, so a state we have no entry
 * for simply gets no button. */
const REGISTRY: Record<string, { label: string; href: string }> = {
  TX: { label: "TX registry", href: "https://mycpa.cpa.state.tx.us/coa/" },
  OK: { label: "OK registry", href: "https://www.sos.ok.gov/corp/corpInquiryFind.aspx" },
  LA: { label: "LA registry", href: "https://coraweb.sos.la.gov/CommercialSearch/CommercialSearch.aspx" },
  NM: { label: "NM registry", href: "https://portal.sos.state.nm.us/BFS/online/CorporationBusinessSearch" },
  AR: { label: "AR registry", href: "https://www.sos.arkansas.gov/corps/search_all.php" },
};

/**
 * The buttons for one company.
 *
 * The company's own site is offered only when we HAVE it — a "Website"
 * button that runs a search would be a fourth search dressed as a
 * destination.
 */
export function lookupsFor(company: {
  name: string;
  city: string | null;
  state: string | null;
  website: string | null;
}): Lookup[] {
  const place = [company.city, company.state].filter(Boolean).join(" ");
  // Quoted, so a multi-word company name is searched as a phrase rather
  // than as a bag of words that matches every steel yard in Texas.
  const query = `"${company.name}"${place ? ` ${place}` : ""}`;
  const q = encodeURIComponent(query);

  const out: Lookup[] = [
    {
      key: "google",
      label: "Google",
      glyph: "🔍",
      href: `https://www.google.com/search?q=${q}`,
      hint: "What they make or sell, and who they are",
    },
    {
      key: "maps",
      label: "Maps",
      glyph: "📍",
      href: `https://www.google.com/maps/search/${q}`,
      hint: "The yard itself, and usually the phone number that actually answers",
    },
  ];

  if ((company.website ?? "").trim()) {
    const raw = (company.website ?? "").trim();
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    out.push({
      key: "site",
      label: "Their website",
      glyph: "🌐",
      href,
      hint: "Their own site — what they ship, and who to ask for",
    });
  }

  out.push({
    key: "fmcsa",
    label: "FMCSA",
    glyph: "🚛",
    href: `https://safer.fmcsa.dot.gov/keywordx.asp?searchstring=${encodeURIComponent(
      company.name,
    )}&SEARCHTYPE=`,
    // The single most useful thing on this row, and the least obvious.
    hint: "Whether they run their own trucks — if they do, they may not need us",
  });

  const registry = REGISTRY[(company.state ?? "").toUpperCase()];
  if (registry) {
    out.push({
      key: "registry",
      label: registry.label,
      glyph: "🏛",
      href: registry.href,
      hint: "The legal entity, and whether this is one company or several",
    });
  }

  return out;
}

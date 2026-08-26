import { sourceBucket, sourceLabel, type SourceBucket } from "../admin/companies/companyRow";

/**
 * Where a company came from, as a quiet coloured pill — ONE component, every
 * screen that shows a source.
 *
 * Brent, 2026-08-26: "give the type a pill with colors." Before this there
 * were THREE renderings of the same column: plain text on the work pool,
 * plain text on Admin → Companies, and a short uppercase badge on the
 * company card with its own vocabulary ("BOL", "Manual", "Prospect"). Same
 * company, three appearances. This is the one.
 *
 * THE PALETTE IS DELIBERATELY MUTED. These sit on rows that already carry a
 * temperature dot, a priority dot, a stage pill and red-means-late; a row of
 * saturated blocks would fight all of it. Every tone is an existing
 * `-bg`/text token pair — a soft fill with darker text of the same hue —
 * and no new hex value was introduced.
 *
 * NO RED, EVER. `bad` means late or destructive everywhere else in this app.
 * A source is not a problem, so none of them may borrow that colour.
 *
 * UNKNOWN AND FREE TEXT GET NO FILL AT ALL — an outline pill, which is
 * quieter than any of the four and says "this is not one of the known
 * kinds" by shape rather than by yet another colour. The value still shows
 * verbatim (truncated by sourceLabel, full string on hover), because
 * collapsing "Cold Call" or a person's name into "Other" would hide exactly
 * the junk that needs cleaning.
 *
 * DUPLICATE IS NOT IN HERE. It is a separate marker beside this one: it
 * means something different, it genuinely wants attention, and it carries a
 * warning tone this component is not allowed to use.
 */
const TONE: Record<SourceBucket, string> = {
  otr: "border-accent/30 bg-accent-bg text-accent",
  bol: "border-steel/30 bg-steel-bg text-steel",
  manual: "border-slate/30 bg-slate-bg text-slate",
  ai_agent: "border-ok/30 bg-ok-bg text-ok",
  // Both no-fill, on purpose — see the note above.
  other: "border-line-strong text-fg-muted",
  unknown: "border-line-strong text-fg-subtle",
};

/** Abbreviations for tight columns. The SAME vocabulary, shortened — not a
 * second set of names. The full label is always in the title. */
const SHORT: Record<SourceBucket, string> = {
  otr: "OTR",
  bol: "BOL",
  manual: "Manual",
  ai_agent: "AI",
  other: "Other",
  unknown: "—",
};

export function SourcePill({
  source,
  short = false,
}: {
  /** crm_accounts.source, raw. Never pre-bucketed by the caller. */
  source: string | null;
  /** Abbreviated label, for the 216px pipeline card where "Bill of lading"
   * would crowd out the company name. */
  short?: boolean;
}) {
  const bucket = sourceBucket(source);
  const full = sourceLabel(source);
  // The raw value on hover for free text; the full label for everything
  // else, which is what makes `short` safe to use.
  const title = bucket === "other" ? (source ?? undefined) : full;

  return (
    <span
      title={title}
      // SQUARER AND BORDERED, so it is not mistaken for a STAGE pill.
      // Stage pills are round, unbordered, muted fills — and they already
      // occupy every tone available here (New Lead is slate, exactly like
      // "Entered by hand"). Colour alone therefore cannot separate the two
      // families, so shape does: source is a bordered rectangle, stage is a
      // plain round pill. Column headers do the rest.
      className={`inline-flex shrink-0 items-center rounded-[4px] border px-1.5 py-0.5 text-[11px] font-semibold ${TONE[bucket]}`}
    >
      {short ? SHORT[bucket] : full}
    </span>
  );
}

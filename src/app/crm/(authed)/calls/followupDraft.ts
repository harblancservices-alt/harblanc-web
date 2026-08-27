/**
 * THE FOLLOW-UP DRAFT — what the call composer proposes, and never decides.
 *
 * Two jobs, both of them suggestions a rep overwrites in one tap:
 *
 *   A DATE FOUND IN THE NOTE. "Call back Friday" offers Friday as a chip,
 *   rendered ALREADY SELECTED so the rep can see what it picked. It is
 *   never applied silently and never applied without being shown — the same
 *   rule the BOL confirm work holds, and the reason this is safe to have at
 *   all. If detection is wrong, changing it costs one tap; if it were
 *   invisible, a wrong date would become a missed customer.
 *
 *   A TITLE. Drafted from what the rep typed plus the outcome they picked,
 *   so the task says "Send a quote — flatbed rates Mesquite to Houston"
 *   rather than "Follow up with Fritz Industries". Editable, always.
 *
 * ── WHAT IT DELIBERATELY DOES NOT READ ────────────────────────────────
 *
 * No equipment, no commodity, no rate, no volume. Those are the fields a
 * wrong guess actually costs something on, and a plausible-but-wrong
 * "flatbed" in a task is worse than no guess at all. Dates are different:
 * they are unambiguous when they match, and the chip shows its work. More
 * can be added once Brent trusts this much.
 */

export type DetectedDate = {
  /** What the chip says — the rep's own word where there was one. */
  label: string;
  /** YYYY-MM-DD, in the org's timezone. */
  date: string;
  /** The exact text this came from, so the title can strip it. */
  matched: string;
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

/** Central, matching every other date in this CRM. */
function ymdInCentral(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

/** The org's current weekday index, 0=Sunday. */
function centralDow(now: Date): number {
  const name = now
    .toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "long" })
    .toLowerCase();
  return WEEKDAYS.indexOf(name as (typeof WEEKDAYS)[number]);
}

/**
 * The first reliable date in a note, or null.
 *
 * Order matters: the earliest match in the text wins, because a rep writes
 * the operative date where they mean it and a later mention is usually
 * context ("2-3 a week from September. Call back Friday" means Friday).
 */
export function detectDate(note: string, now: Date = new Date()): DetectedDate | null {
  const text = (note ?? "").toLowerCase();
  if (!text.trim()) return null;

  const hits: { index: number; label: string; date: string; matched: string }[] = [];

  const push = (index: number, label: string, d: Date, matched: string) => {
    if (index >= 0) hits.push({ index, label, date: ymdInCentral(d), matched });
  };

  // tomorrow
  const tm = text.indexOf("tomorrow");
  if (tm >= 0) push(tm, "Tomorrow", addDays(now, 1), "tomorrow");

  // next week — Monday of the following week, which is what people mean
  const nw = text.indexOf("next week");
  if (nw >= 0) {
    const dow = centralDow(now);
    push(nw, "Next week", addDays(now, 8 - (dow === 0 ? 7 : dow)), "next week");
  }

  // weekday names — the NEXT one, never today, since "call back Friday"
  // said on a Friday means the coming Friday.
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const full = WEEKDAYS[i];
    const re = new RegExp(`\\b${full.slice(0, 3)}(${full.slice(3)})?\\b`);
    const m = re.exec(text);
    if (!m) continue;
    const dow = centralDow(now);
    let delta = i - dow;
    if (delta <= 0) delta += 7;
    push(m.index, full[0].toUpperCase() + full.slice(1), addDays(now, delta), m[0]);
  }

  // Month name + day: "sept 5", "september 5th"
  for (let i = 0; i < MONTHS.length; i++) {
    const mo = MONTHS[i];
    // Longest form first, so "september" is not consumed as "sep" leaving a
    // stray "tember" — and include the 4-letter "sept" people actually type.
    const re = new RegExp(
      `\\b(${mo}|${mo.slice(0, 4)}|${mo.slice(0, 3)})\\.?\\s+(\\d{1,2})(st|nd|rd|th)?\\b`,
    );
    const m = re.exec(text);
    if (!m) continue;
    const day = Number.parseInt(m[2], 10);
    if (day < 1 || day > 31) continue;
    const year = now.getUTCFullYear();
    const candidate = new Date(Date.UTC(year, i, day, 12));
    // A month already past this year means they mean next year.
    const rolled = candidate.getTime() < now.getTime() - 86_400_000
      ? new Date(Date.UTC(year + 1, i, day, 12))
      : candidate;
    push(m.index, `${mo[0].toUpperCase() + mo.slice(1, 3)} ${day}`, rolled, m[0]);
  }

  // Numeric: 9/5 or 9/5/26 or 9/5/2026
  const num = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text);
  if (num) {
    const month = Number.parseInt(num[1], 10);
    const day = Number.parseInt(num[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const rawYear = num[3] ? Number.parseInt(num[3], 10) : now.getUTCFullYear();
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      const d = new Date(Date.UTC(year, month - 1, day, 12));
      push(num.index, `${month}/${day}`, d, num[0]);
    }
  }

  if (hits.length === 0) return null;
  hits.sort((a, b) => a.index - b.index);
  const best = hits[0];
  return { label: best.label, date: best.date, matched: best.matched };
}

/** The verb each result implies. Absent means this outcome does not warrant
 * a follow-up at all — "Not interested" should not propose one. */
const TITLE_VERB: Record<string, string> = {
  quote_requested: "Send a quote",
  interested: "Follow up",
  not_right_now: "Check back",
  already_covered: "Check back",
  booked: "Confirm the booking",
  // Connection-only outcomes that still deserve another try.
  voicemail: "Try again",
  no_answer: "Try again",
  busy: "Try again",
  gatekeeper: "Try again",
  decision_maker_unavailable: "Try the decision maker",
};

/** Outcomes that should NOT offer a follow-up. */
export function warrantsFollowup(outcome: string | null): boolean {
  if (!outcome) return false;
  if (outcome === "not_interested" || outcome === "wrong_number") return false;
  return outcome in TITLE_VERB || outcome === "reached";
}

/**
 * A title drafted from the note and the outcome.
 *
 * The subject is the rep's own words, not a paraphrase: the first clause of
 * the note with the date phrase and a leading "they want / needs / asked
 * for" removed, capped so a task title stays a title. If there is nothing
 * usable, the verb stands alone rather than padding it with invented detail.
 */
export function draftFollowupTitle(
  note: string,
  outcome: string | null,
  detected: DetectedDate | null,
): string {
  const verb = (outcome && TITLE_VERB[outcome]) || "Follow up";
  let text = (note ?? "").trim();
  if (!text) return verb;

  if (detected) {
    // Remove the sentence carrying the date, so the title does not repeat
    // what the due date already says.
    text = text
      .split(/(?<=[.!?])\s+/)
      .filter((s) => !s.toLowerCase().includes(detected.matched))
      .join(" ")
      .trim();
  }

  const firstClause = text.split(/[.;\n]/)[0]?.trim() ?? "";
  const subject = firstClause
    .replace(/^(they\s+)?(want|wants|wanted|need|needs|needed|ask|asks|asked)(\s+for)?\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .trim();

  if (!subject) return verb;
  const capped = subject.length > 60 ? `${subject.slice(0, 57).trimEnd()}…` : subject;
  return `${verb} — ${capped}`;
}

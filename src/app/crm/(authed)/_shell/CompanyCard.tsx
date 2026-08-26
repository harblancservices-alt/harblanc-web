import Link from "next/link";
import { titleCaseWords, upperCaseState, lastContactStatus, formatPhone } from "./format";
import { LIFECYCLE_TONE } from "../accounts/lifecycle";
import { temperatureOf } from "@/lib/crm/temperature";
import { TemperatureDot } from "./TemperatureDot";
import {
  cardStage,
  contactLine,
  sourceBadge,
  stageWithAgeLabel,
  NEVER_CONTACTED_LABEL,
  NO_CONTACT_LABEL,
  type CompanyCardData,
} from "./companyCardModel";

/**
 * The rich company card — ONE component, used by the pipeline board and the
 * agent dashboard.
 *
 * Brent, 2026-08-26: "needs to be a real profile card that gives decent
 * info." Both surfaces previously showed a name, a place and a freshness
 * word, and both showed them slightly differently. They now render this.
 *
 * ONE DESTINATION. The whole card is a single link to the company profile and
 * nothing inside it is separately clickable — no tel: link on the phone, no
 * link on the contact. That is deliberate: a card with three destinations
 * makes you aim, and aiming at a card you are also trying to DRAG is worse
 * still. The phone number is here to be read and dialled by a human, not
 * tapped.
 *
 * The pipeline's "Move to…" control is the one exception, and it lives
 * OUTSIDE this component as a sibling rather than inside the link — see
 * PipelineBoard. Nesting a <select> inside an <a> is invalid HTML and would
 * make the whole card a trap; keeping it a sibling preserves both Brent's
 * one-destination rule and the only non-drag way to move a card, which
 * keyboard and touch users depend on.
 *
 * EVERY ABSENCE HAS WORDS. No contact, no phone, no last contact and no known
 * stage age each render a sentence rather than a blank line — a gap you can
 * read is a gap somebody can close, and a blank one just looks broken.
 */
export function CompanyCard({
  card,
  now,
  compact = false,
  flag = null,
  hideStage = false,
}: {
  card: CompanyCardData;
  /** Epoch ms, from the server — never Date.now() during render. */
  now: number;
  /** Pipeline columns are 264px; the dashboard list is full width. Compact
   * tightens the padding only — no fact is dropped, because a card that
   * shows less on one screen than another is the drift this component
   * exists to prevent. */
  compact?: boolean;
  /**
   * The dashboard's "why is this on my list" flag (agentWork.ts::companyFlag).
   *
   * ONLY "quiet" RENDERS. That helper also returns "new" for a company nobody
   * has ever contacted — but this card already says "Never contacted" in the
   * line below, in colour, so drawing a second badge saying the same thing
   * would be exactly the duplicated signal Brent asked us to stop doing on
   * the task card. "quiet" is different information: contacted, but longer
   * ago than this stage tolerates. That earns a badge.
   */
  flag?: "new" | "quiet" | null;
  /**
   * Drop the stage pill.
   *
   * For the pipeline board, where the card already sits in a column headed
   * with that exact stage — printing it again on the card is the same
   * duplicated-signal mistake as the old triple overdue indicator. Everywhere
   * else (the dashboard, any list not grouped by stage) the stage is one of
   * the most useful things on the card and stays.
   */
  hideStage?: boolean;
}) {
  const place = [titleCaseWords(card.city), upperCaseState(card.state)].filter(Boolean).join(", ");
  const badge = sourceBadge(card.source);
  const stage = cardStage(card);
  const contact = contactLine(card);
  const phone = (card.contactPhone ?? "").trim();
  const contactStatus = lastContactStatus(card.lastContactMs, new Date(now));
  const temp = temperatureOf({ stage: card.stage, lastContactMs: card.lastContactMs, now });

  return (
    <Link
      href={`/crm/accounts/${card.id}`}
      prefetch={false}
      draggable={false}
      className={`block rounded-[6px] border border-line bg-card shadow-e1 transition-colors hover:border-accent hover:bg-accent-bg ${
        compact ? "p-2.5" : "p-3"
      }`}
    >
      {/* Identity */}
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[13.5px] font-bold text-fg">
          {titleCaseWords(card.name)}
        </span>
        {badge && (
          <span className="shrink-0 rounded-[3px] border border-line-strong px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
            {badge}
          </span>
        )}
      </div>

      {place && <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">{place}</p>}

      {/* Where it is, and for how long */}
      {!hideStage && (
        <div className="mt-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${LIFECYCLE_TONE[stage]}`}
          >
            {stageWithAgeLabel(card, now)}
          </span>
        </div>
      )}

      {/* Who to call.
          
          ONE NEGATIVE LINE, NOT THREE (Brent, 2026-08-26). The card used to
          say "No location on file", "Nobody to call there yet" AND "Never
          contacted" — three stacked absences, which on a BOL-sourced company
          with nothing on it was most of the card, and worse at the 216px
          pipeline column width.
          
          Now: a missing location is simply not drawn, and the two remaining
          negatives collapse into each other. If there is nobody to call, that
          one line stands for both — you cannot have a last-contact date with
          a person who is not on file, and where a company-level call exists
          the temperature line below still shows it. */}
      <div className="mt-2 border-t border-line pt-2">
        {contact ? (
          <>
            <p className="truncate text-[12px] font-semibold text-fg">{contact}</p>
            {phone && <p className="truncate text-[11.5px] text-fg-muted">{formatPhone(phone)}</p>}
          </>
        ) : (
          <p className="text-[11.5px] italic text-fg-subtle">{NO_CONTACT_LABEL}</p>
        )}
      </div>

      {/* State of play */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* Temperature — one dot, the same one the contacts table and the
            call log use. Silent for stages with no clock. */}
        <TemperatureDot temp={temp} />
        {/* Silent when there is nothing to say AND nobody to say it about —
            "Never contacted" under "Nobody to call there yet" is the same
            fact twice. A company-level call with no contact on file still
            shows, because that is real history. */}
        {!(card.lastContactMs === null && !contact) && (
          <span
            className={`text-[11.5px] font-bold ${
              contactStatus.freshness === "fresh"
                ? "text-ok"
                : contactStatus.freshness === "aging"
                  ? "text-warn"
                  : contactStatus.freshness === "cold"
                    ? "text-bad"
                    : "text-fg-subtle"
            }`}
          >
            {card.lastContactMs === null ? NEVER_CONTACTED_LABEL : contactStatus.text}
          </span>
        )}
        {flag === "quiet" && (
          <span className="rounded-[3px] border border-warn/60 px-1.5 py-px text-[10.5px] font-semibold text-warn">
            quiet
          </span>
        )}
        {/* Silent at zero rather than showing a 0 badge — "no open tasks" is
            the normal state and does not need saying on every card. */}
        {card.openTasks > 0 && (
          <span className="text-[11.5px] text-fg-muted">
            {card.openTasks} open {card.openTasks === 1 ? "task" : "tasks"}
          </span>
        )}
      </div>
    </Link>
  );
}

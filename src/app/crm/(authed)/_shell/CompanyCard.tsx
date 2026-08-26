import Link from "next/link";
import { titleCaseWords, upperCaseState, lastContactStatus, formatPhone } from "./format";
import { LIFECYCLE_TONE } from "../accounts/lifecycle";
import {
  cardStage,
  contactLine,
  sourceBadge,
  stageWithAgeLabel,
  NEVER_CONTACTED_LABEL,
  NO_CONTACT_LABEL,
  NO_PHONE_LABEL,
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
}) {
  const place = [titleCaseWords(card.city), upperCaseState(card.state)].filter(Boolean).join(", ");
  const badge = sourceBadge(card.source);
  const stage = cardStage(card);
  const contact = contactLine(card);
  const phone = (card.contactPhone ?? "").trim();
  const contactStatus = lastContactStatus(card.lastContactMs, new Date(now));

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

      <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">
        {place || "No location on file"}
      </p>

      {/* Where it is, and for how long */}
      <div className="mt-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${LIFECYCLE_TONE[stage]}`}
        >
          {stageWithAgeLabel(card, now)}
        </span>
      </div>

      {/* Who to call */}
      <div className="mt-2 border-t border-line pt-2">
        {contact ? (
          <>
            <p className="truncate text-[12px] font-semibold text-fg">{contact}</p>
            <p className="truncate text-[11.5px] text-fg-muted">
              {phone ? formatPhone(phone) : NO_PHONE_LABEL}
            </p>
          </>
        ) : (
          <p className="text-[11.5px] italic text-fg-subtle">{NO_CONTACT_LABEL}</p>
        )}
      </div>

      {/* State of play */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
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

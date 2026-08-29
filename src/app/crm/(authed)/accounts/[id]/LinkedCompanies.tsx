import { M_CARD } from "./mobile/ui";
import type { LinkedCompany } from "./bolLinks";

/**
 * "LINKED COMPANY" — the other end of a shared bill of lading.
 *
 * Brent: "a button that is 'linked company' and it opens a NEW tab with the
 * new company profile and lands on overview for the profile."
 *
 * ── NAMED, NOT GENERIC ────────────────────────────────────────────────
 *
 * The control says the company's name and what it was on the shared load —
 * "TVA Ackerman · possible receiver" — rather than the words "Linked
 * company". A link should say where it goes before it is followed, and the
 * role is the half that makes it worth following: an agent working Siemens
 * Energy learns that TVA Ackerman is who Siemens ships TO, which is a
 * reason to open it. "Linked company" alone would be a mystery box, and on
 * a phone a mystery box costs a page load to resolve.
 *
 * ── NEW TAB, LANDING ON OVERVIEW ──────────────────────────────────────
 *
 * Both were asked for specifically, and both are right: you are looking at
 * one company BECAUSE of a document, and following the link should not
 * cost you the thing you were reading. `/crm/accounts/<id>` opens on
 * Overview already — it is the default tab — so the href is the plain
 * profile URL rather than one carrying a tab parameter that would go stale
 * the day the tab keys change.
 *
 * rel="noopener noreferrer" with target="_blank": noopener because a new
 * tab opened this way otherwise gets a handle back to this one via
 * window.opener, and noreferrer alongside it because there is no reason to
 * announce the referring profile.
 *
 * ── NOTHING WHEN THERE IS NOTHING ─────────────────────────────────────
 *
 * The common case is no link at all — Snapshot #1's BOL named one company,
 * because the delivery address was withheld until the day of and the broker
 * is not a company. Only 4 of the entries on file name two or more live
 * companies. So this renders NULL rather than a disabled button or an
 * empty-state card: a control that can never do anything is worse than no
 * control, and an "everything is fine" empty state on 90-odd profiles is
 * just noise on all of them.
 */

const ROLE_WORD: Record<LinkedCompany["role"], string> = {
  shipper: "possible shipper",
  receiver: "possible receiver",
  broker: "possible broker",
};

export function LinkedCompanies({
  companies,
  variant = "desktop",
}: {
  companies: LinkedCompany[];
  /** Desktop sits inside "What we know" under the parsed fields; mobile is
   * a card near the top of the profile, since the phone has no What we
   * know panel to hang it off. */
  variant?: "desktop" | "mobile";
}) {
  if (companies.length === 0) return null;

  return (
    <div
      className={
        variant === "desktop"
          ? "border-t border-line px-4 py-3"
          : /* Brings its own card so that an empty list renders NOTHING —
               heading, card and all. A card wrapped around it by the caller
               would leave an empty box on the ~85 profiles with no link. */
            `${M_CARD} px-[13px] py-3`
      }
    >
      {/* Brent's own words for the control, pluralised. Deliberately NOT
          "Also on this BOL": when a company has several entries the links
          can come off different documents, and each row names its own BOL
          underneath anyway. */}
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
        {companies.length > 1 ? "Linked companies" : "Linked company"}
      </p>

      <div className="mt-1.5 flex flex-col gap-1.5">
        {companies.map((c) => (
          <a
            key={c.id}
            href={`/crm/accounts/${c.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${c.name} in a new tab`}
            className="group flex items-center gap-2 rounded-lg border border-line bg-inset px-3 py-2 transition-colors hover:border-accent hover:bg-accent-bg"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-fg group-hover:text-accent">
                {c.name}
              </span>
              <span className="block truncate text-[11.5px] text-fg-subtle">
                {ROLE_WORD[c.role]}
                {c.bolNumber ? ` · BOL #${c.bolNumber}` : ""}
              </span>
            </span>

            {/* The new-tab mark. Says what the click will do before it does
                it, which matters more here than usual — an agent mid-call
                should not be surprised by a context switch. */}
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0 fill-none stroke-fg-subtle stroke-2 group-hover:stroke-accent"
            >
              <path d="M14 4h6v6" />
              <path d="M20 4 10 14" />
              <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ))}
      </div>
    </div>
  );
}

"use client";

/**
 * FOLDER TABS FOR A DARK GROUND — the company file's section switcher,
 * living in the dark header band.
 *
 * Brent: "can you give the tabs this look ON the top center bar in the
 * dark?" — active tab a white card with dark text, inactive tabs sitting
 * flush in the band with light grey text, no chip borders, the active one
 * reading as a folder in front of the others.
 *
 * ── WHY THIS IS NOT SegmentedTabs ─────────────────────────────────────
 *
 * SegmentedTabs is built for a LIGHT surface — its inactive chip is an
 * accent-blue outline on --card, and its active chip is a filled pill. That
 * is the wrong shape and the wrong palette here, and SIX other tab rows in
 * the CRM share it (Admin, Operations, Companies, Contacts, Activity,
 * Workspace). Restyling it to serve one dark header would change every one
 * of them. So this is a small dedicated component and that one is untouched.
 *
 * The two are deliberately different objects, not two skins of one: a
 * segmented control picks a filter on a light card; these are folder tabs
 * that switch a whole page section from inside the page's chrome.
 *
 * ── THE SHAPE ─────────────────────────────────────────────────────────
 *
 * Rounded on the TOP corners only, and the row sits flush to the bottom of
 * the header so the active tab's white runs into the surface beneath with
 * no seam. That is the entire folder illusion — square the bottom corners
 * or leave a gap and it collapses into a row of buttons.
 *
 * Inactive tabs are --graphite-2, one step up from the --graphite band, so
 * they read as tabs behind the front one rather than as flat text on the
 * header. Sampled off Brent's mockup: band #151a24, inactive #272c35,
 * active #ffffff — which is --graphite, --graphite-2 and --card to within
 * a few points, so no new value was introduced.
 *
 * ── COUNTS ARE INLINE, NOT CHIPS ──────────────────────────────────────
 *
 * "Contacts · 3", one text run, exactly as drawn. A separate count element
 * (which is what SegmentedTabs renders) would need its own colour on two
 * different grounds and would fight the folder shape. Only the two tabs
 * that ARE a quantity carry one.
 */

export type HeaderTabItem<K extends string> = {
  key: K;
  label: string;
  /** Rendered as "· N" after the label. Omit where the tab is not a count
   * of anything — Overview and What we know are not. */
  count?: number;
};

export function HeaderTabs<K extends string>({
  items,
  active,
  onSelect,
  ariaLabel,
}: {
  items: readonly HeaderTabItem<K>[];
  active: K;
  onSelect: (key: K) => void;
  ariaLabel: string;
}) {
  return (
    // -mb-px pulls the row onto the boundary so the active tab's white and
    // the surface below share an edge instead of stacking two.
    /* CENTRED (Brent). Centred in the FULL band, and the usual "optical vs
       mathematical" question does not arise here: the tabs sit on their own
       row beneath the name and the stat blocks, so there is nothing else on
       the row to be heavier than them. There is no gap to be optically
       centred within — the row is the gap. */
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="-mb-px flex items-end justify-center gap-1.5"
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(item.key)}
            className={`rounded-t-[6px] px-4 text-[12.5px] font-bold transition-colors ${
              isActive
                ? // Taller as well as lighter: the front folder stands
                  // slightly proud of the ones behind it.
                  "bg-card py-2.5 text-fg"
                : "bg-graphite-2 py-2 text-white/65 hover:bg-graphite-2 hover:text-white"
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={isActive ? "text-fg-subtle" : "text-white/45"}>
                {" · "}
                <span className="crm-num">{item.count}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

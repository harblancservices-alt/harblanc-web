/**
 * Shared class tokens for the MOBILE company profile (2026-08-23 rebuild).
 *
 * Page-scoped on purpose — same reasoning as desktop/ui.ts and the BOL
 * Center's buttonDepth.ts: these describe one screen's chrome, not a new
 * sitewide hierarchy level, so they must not leak into _shell/ui.tsx where
 * every other CRM page would inherit them.
 *
 * Everything below is `.crm-light` tokens only (no raw hex, no faint
 * `text-fg-subtle` body copy — the CRM's "no faint grey text" rule), and
 * every value is sized for a 390px phone: 12px page gutters, 366px of usable
 * width, 44px primary tap targets.
 */

/** The standard section card. `overflow-hidden` clips the rounded corners of
 * flush rows — never put a `position: sticky` child inside one (that bug has
 * already cost this codebase a day). */
export const M_CARD = "overflow-hidden rounded-xl border border-line-strong bg-card shadow-e2";

/** Lighter card for the collapsible "More" sections. */
export const M_CARD_FLAT = "overflow-hidden rounded-xl border border-line-strong bg-card shadow-e1";

/** Section caption sitting ABOVE a card (outside it), e.g. "CONTACT". */
export const M_CAP = "text-[10.5px] font-extrabold uppercase tracking-[0.11em] text-fg-muted";

/** Section heading INSIDE a card — matches CommoditiesCard's existing idiom
 * (a small tinted icon square + an uppercase label). */
export const M_H3 = "text-[11px] font-extrabold uppercase tracking-[0.1em] text-fg";

/** The 25px tinted icon square next to an in-card heading. */
export const M_SQ = "flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded-[7px]";

/** A flush row inside a card (contact line, location, etc). Deliberately
 * carries NO top border — callers add `M_DIVIDE` to every row after the
 * first, so nothing has to fight `border-t` with `border-t-0` (two utilities
 * of equal specificity, where the winner depends on stylesheet order). */
export const M_ROW = "flex items-center gap-[11px] px-[13px] py-[11px]";

/** Top hairline between stacked rows. */
export const M_DIVIDE = "border-t border-line";

/** The 34px accent-tinted leading icon on a contact row. */
export const M_ROW_ICON =
  "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-accent/10 text-accent";

/** Uppercase field key on a contact row ("MAIN LINE", "EMAIL"). */
export const M_KEY = "block text-[10px] font-extrabold uppercase tracking-[0.09em] text-fg-muted";

/** The value line on a contact row. `M_VAL_SM` is the same line one step
 * down — a full company email address runs ~31 characters with no break
 * opportunity, and 13px is what keeps it on ONE line at 390px instead of
 * splitting "co / m". Kept as a separate complete token rather than
 * `${M_VAL} text-[13px]`: two font-size utilities on one element is a
 * coin-flip decided by stylesheet order, not by which one you wrote last. */
export const M_VAL = "mt-px block text-[14.5px] font-bold leading-[1.3] text-fg";
export const M_VAL_SM = "mt-px block text-[13px] font-bold leading-[1.3] tracking-[-0.01em] text-fg";

/** Secondary line under a value (city/state, dock notes). */
export const M_SUB = "mt-0.5 block text-[12px] font-semibold text-fg-muted";

/** Round 36px call/text button — solid for the primary number, outline for
 * the rest. */
export const M_ROUND =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent/45 bg-card text-accent transition-colors hover:bg-accent/10";
export const M_ROUND_SOLID =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-white shadow-e1 transition-colors hover:bg-accent-hover";

/** The three 44px header actions. */
export const M_BTN =
  "inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-[11px] border px-2 text-[13px] font-extrabold transition-colors disabled:opacity-60";
export const M_BTN_PRIMARY = "border-accent bg-accent text-white shadow-e1 hover:bg-accent-hover";
export const M_BTN_OUTLINE = "border-line-strong bg-card text-fg hover:bg-inset";
export const M_BTN_GHOST = "border-line-strong bg-inset text-fg hover:bg-elevated";

/** Small (33px) secondary button — row actions, banner actions. */
export const M_BTN_SM =
  "inline-flex h-[33px] min-w-0 items-center justify-center gap-1 rounded-[9px] border px-3 text-[12px] font-extrabold transition-colors disabled:opacity-60";

/** A plain accent text button ("+ Add person", "Change stage ›"). */
export const M_LINK =
  "shrink-0 whitespace-nowrap bg-transparent text-[12.5px] font-extrabold text-accent transition-colors hover:text-accent-hover disabled:opacity-60";

/** Pill in the header chip row. */
export const M_PILL =
  "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-extrabold";

/** Chip used for links / commodities / tags. */
export const M_CHIP =
  "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line-strong bg-inset px-2.5 py-1.5 text-[12px] font-bold text-fg";
export const M_CHIP_LINK =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent/45 bg-card px-3 py-1.5 text-[12px] font-bold text-accent transition-colors hover:bg-accent/10";

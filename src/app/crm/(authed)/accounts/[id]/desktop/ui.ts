/**
 * Shared class fragments for the DESKTOP (lg:) company-profile layout —
 * Brent's 2026-08-22 "hybrid skin" rebuild of the design handoff
 * (.design-handoff/company_profile_README.md + the .dc.html prototype).
 *
 * HYBRID means: the handoff's LAYOUT and STRUCTURE, rendered in the CRM's
 * existing `.crm-light` token system. Every value below maps a handoff hex
 * onto a token that already exists — nothing new is introduced:
 *
 *   handoff #ffffff card / #dde3ec border  -> bg-card / border-line-strong
 *   handoff #eef1f6 page background        -> bg-canvas
 *   handoff #f2f5fa chip / #fafbfd inset   -> bg-inset
 *   handoff #2352c9 blue accent + links    -> --accent (the CRM's steel blue)
 *   handoff #1a7f4e green status           -> --ok / --ok-bg
 *   handoff #a05a12 amber status           -> --warn / --warn-bg
 *   handoff #6b46a8 purple "AI-generated"  -> --admin / --admin-soft
 *   handoff #1b2c54 avatar navy            -> --accent (CompanyAvatar's own fill)
 *   handoff #8593a6 muted micro-labels     -> text-fg (true black — the CRM's
 *                                             standing "no faint grey" rule
 *                                             overrides the handoff here)
 *
 * The ONE genuinely new thing is `crm-num` (globals.css) — IBM Plex Mono on
 * phone numbers and timestamps only.
 *
 * Plain module, no "use client" — imported from both server and client
 * components in this folder.
 */

/** Every card in the desktop layout. Handoff: white, 1px #dde3ec, 10px. */
export const D_CARD = "rounded-lg border border-line-strong bg-card shadow-e2";

/** 10px uppercase micro-label (Phone / Address / Links / firmographic keys). */
export const D_MICRO = "text-[10px] font-bold uppercase tracking-[0.08em] text-fg";

/** 11px uppercase card-section caption (CONTACTS · 2, AT A GLANCE, TAGS). */
export const D_CAP = "text-[11px] font-bold uppercase tracking-[0.08em] text-fg";

/** 14px/700 section heading inside the workspace panel. */
export const D_H3 = "text-[14px] font-bold text-fg";

/** The small right-aligned "+ Add" / "View all" text link in a card header. */
export const D_LINK = "text-[11.5px] font-bold text-accent transition-colors hover:text-accent-hover";

/** Filled primary action (handoff: #2352c9 filled). */
export const D_BTN_FILLED =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-accent bg-accent font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60";

/** Outlined secondary action (handoff: white / #c3d0ea border / blue text). */
export const D_BTN_OUTLINE =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-accent/40 bg-card font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-60";

/** Neutral grey pill (commodities, "N on file" counts). */
export const D_PILL =
  "inline-flex items-center rounded-full border border-line-strong bg-inset px-2.5 py-0.5 text-[11px] font-semibold text-fg";

/** Phone numbers + timestamps. See globals.css `.crm-light .crm-num`. */
export const D_MONO = "crm-num";

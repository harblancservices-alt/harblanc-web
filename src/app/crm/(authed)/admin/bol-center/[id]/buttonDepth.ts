/**
 * Page-scoped "tactile" button treatment for the BOL detail page's
 * visual-hierarchy pass (Brent, approved 2026-08-21) — NOT the shared
 * BTN_* constants in _shell/ui.tsx (used across every CRM page; editing
 * those would restyle buttons everywhere, out of scope here per explicit
 * instruction). Each constant below is a single, fully self-contained
 * class string — not composed on top of a BTN_* import — so there's no
 * risk of two utilities silently fighting over the same CSS property
 * (border-width, box-shadow) depending on Tailwind's generated stylesheet
 * order. Same semantic colors as each BTN_* counterpart in _shell/ui.tsx,
 * plus: a soft elevation shadow (the real shadow-e1 token) combined with an
 * inset bottom-edge line in the darker existing shade for solid buttons, or
 * a doubled border-line-strong + a semantic-color ring for outline buttons.
 * Every value referenced (--shadow-e1, --accent-hover, --line-strong,
 * --accent/--ok/--warn/--bad) is an existing .crm-light token — nothing new.
 *
 * DEPTH_SUCCESS's bottom edge uses --line-strong (neutral), not a darker
 * green: .crm-light defines --ok/--ok-bg only, no darker "ok-hover" token
 * exists anywhere in globals.css (unlike --accent/--accent-hover). Flagged
 * to Brent; proceeding with the neutral edge as the lowest-risk, zero-new-
 * token option rather than inventing a color or reusing --accent-deep
 * (wrong hue — that token belongs to a different theme scope entirely).
 */

export const DEPTH_PRIMARY =
  "border border-accent bg-accent text-white shadow-[var(--shadow-e1),inset_0_-2px_0_0_var(--accent-hover)] hover:bg-accent-hover disabled:opacity-60 disabled:shadow-none";

export const DEPTH_SUCCESS =
  "border border-ok bg-ok text-white shadow-[var(--shadow-e1),inset_0_-2px_0_0_var(--line-strong)] hover:bg-ok/90 disabled:opacity-60 disabled:shadow-none";

export const DEPTH_EDIT =
  "border-2 border-line-strong bg-card text-accent ring-1 ring-accent/30 shadow-e1 hover:bg-accent/10 disabled:opacity-60";

export const DEPTH_WARNING =
  "border-2 border-line-strong bg-card text-warn ring-1 ring-warn/30 shadow-e1 hover:bg-warn/10 disabled:opacity-60";

export const DEPTH_DANGER =
  "border-2 border-line-strong bg-bad-bg text-bad ring-1 ring-bad/30 shadow-e1 hover:bg-bad/10 disabled:opacity-60";

export const DEPTH_NEUTRAL =
  "border-2 border-line-strong bg-card text-fg-muted ring-1 ring-fg-subtle/20 shadow-e1 hover:bg-inset hover:text-fg disabled:opacity-60";

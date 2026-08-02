/**
 * High-contrast field label — the shared `field.label` in
 * @/components/ui/styles.ts uses text-ink-3 (a light, FIXED grey tuned for
 * dense analytical tables), which read as faint/washed-out on this page's
 * forms per owner feedback. This page's labels use the same size/weight/
 * tracking but the PRIMARY text-fg tier (near-black in the admin's light
 * theme, and — being a themed token rather than a fixed one — still
 * readable if the operator ever switches to the admin's dark theme).
 */
export const LABEL = "block text-[11px] font-bold uppercase tracking-[0.06em] text-fg mb-1";

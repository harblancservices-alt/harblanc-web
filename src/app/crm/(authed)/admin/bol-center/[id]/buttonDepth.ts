/**
 * The BOL detail page's "tactile" button treatment (Brent, approved
 * 2026-08-21). These constants now live in `_shell/ui.tsx` alongside the
 * BTN_* family — promoted there when the task card's Style-C rebuild adopted
 * the same treatment, so the two surfaces can't drift apart. The strings are
 * byte-identical to what this file used to define inline, so this page
 * renders exactly as before.
 *
 * Still re-exported from here rather than updating this page's imports:
 * these are the names its JSX already uses, and a re-export keeps that
 * page's diff at zero. (Safe — this is a plain module, not a "use server"
 * file, where re-exporting is the documented footgun.)
 */
export {
  DEPTH_PRIMARY,
  DEPTH_SUCCESS,
  DEPTH_EDIT,
  DEPTH_WARNING,
  DEPTH_DANGER,
  DEPTH_NEUTRAL,
} from "../../../_shell/ui";

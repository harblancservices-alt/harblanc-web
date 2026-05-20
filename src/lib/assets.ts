// Single source of truth for every image on the site.
// Set a path to "/some/file.jpg" to enable; leave as null to use the typographic
// fallback in the corresponding component.
//
// File location convention: put assets under public/brand/ so they live at
// /brand/<filename> at runtime. See ASSET_GUIDE.md for full specs.

export type AssetPath = string | null;

export const assets = {
  // ---- Brand ----
  // Horizontal lockup, used in navbar and footer.
  logoPrimary: null as AssetPath,
  // Optional white/inverted version for very dark backgrounds.
  logoInverted: null as AssetPath,
  // Icon-only mark for tight spaces. Falls back to logoPrimary if null.
  logoCompact: null as AssetPath,

  // ---- Hero ----
  // 1920x1080 (16:9). Appears as the right column of the hero.
  // When null, the hero renders a typographic dispatch card instead.
  heroImage: null as AssetPath,
  // CSS object-position. Examples: "center 40%", "right center", "50% 25%".
  heroImagePosition: "center center",

  // ---- About / company ----
  // 1600x1200 (4:3). Shows next to the company prose. Hidden when null.
  aboutImage: null as AssetPath,
  aboutImagePosition: "center center",

  // ---- Per-service photos ----
  // 1200x900 (4:3) each. Any subset can be set; the others fall back to the
  // typographic manifest row.
  serviceImages: {
    hotshot: null as AssetPath,
    expedited: null as AssetPath,
    equipment: null as AssetPath,
    general: null as AssetPath,
  } as Record<string, AssetPath>,

  // ---- Social / meta ----
  // 1200x630 (1.91:1). Used for OpenGraph/Twitter link previews.
  ogImage: null as AssetPath,
} as const;

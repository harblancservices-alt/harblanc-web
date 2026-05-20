// Single source of truth for every image and video on the site.
// Set a path to "/some/file.ext" to enable; leave as null to use the
// typographic fallback in the corresponding component.
//
// File location convention: put assets under public/brand/. See
// ASSET_GUIDE.md for full specs.
//
// ─────────────────────────────────────────────────────────────────────
// Hero / about / service photos are nulled in production until owned
// (licensed) assets are added. Components fall back to typographic
// layouts. Logos under /brand/* are real brand assets.
// ─────────────────────────────────────────────────────────────────────

export type AssetPath = string | null;

export const assets = {
  // ---- Brand ----
  // Horizontal lockup for navbar/footer (readable at small sizes)
  logoPrimary: "/brand/logo-horizontal.png" as AssetPath,
  logoInverted: "/brand/logo-horizontal.png" as AssetPath,
  // Square badge mark — for tight square contexts (favicon source, etc.)
  logoCompact: "/brand/logo-mark.png" as AssetPath,

  // ---- Hero ----
  // Video takes precedence over heroImage when both are set.
  // null = typographic fallback rendered in <Hero/>.
  heroVideo: "/brand/hero.mp4" as AssetPath,
  heroVideoPoster: null as AssetPath,
  heroImage: null as AssetPath,
  heroImagePosition: "center 55%",

  // ---- About / company ----
  aboutImage: null as AssetPath,
  aboutImagePosition: "center center",

  // ---- Per-service photos ----
  serviceImages: {
    hotshot: null as AssetPath,
    expedited: null as AssetPath,
    equipment: null as AssetPath,
    general: null as AssetPath,
  } as Record<string, AssetPath>,

  // ---- Social / meta ----
  ogImage: null as AssetPath,
} as const;

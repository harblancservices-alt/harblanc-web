# Asset Guide

Where to put real photos and logo files so they show up on the site. The site renders correctly with zero assets supplied — every slot has a fallback. Drop the files in, point `src/lib/assets.ts` at them, and the site upgrades automatically.

## TL;DR

1. Put files in `public/brand/`.
2. Open `src/lib/assets.ts` and replace the corresponding `null` with the path.
3. Save. The dev server picks it up; refresh the browser.

No component code needs to change.

## Where files live

Anything under `public/` is served from the site root. So a file at `public/brand/hero.jpg` is reachable at `/brand/hero.jpg`.

Suggested folder structure:

```
public/
  brand/
    logo.svg                # primary horizontal lockup
    logo-inverted.svg       # inverted (white) version for dark backgrounds
    logo-mark.svg           # icon-only mark
    hero.jpg                # 1920x1080, 16:9
    about.jpg               # 1600x1200, 4:3
    services/
      hotshot.jpg           # 1200x900, 4:3
      expedited.jpg
      equipment.jpg
      general.jpg
    og.jpg                  # 1200x630, 1.91:1
```

You can use other filenames — `assets.ts` is the source of truth, not the filenames.

## Wiring it up

Open `src/lib/assets.ts`. It looks like this:

```ts
export const assets = {
  logoPrimary: null,
  logoInverted: null,
  logoCompact: null,
  heroImage: null,
  heroImagePosition: "center center",
  aboutImage: null,
  aboutImagePosition: "center center",
  serviceImages: {
    hotshot: null,
    expedited: null,
    equipment: null,
    general: null,
  },
  ogImage: null,
};
```

Replace any `null` with a path string. Example after wiring real files:

```ts
export const assets = {
  logoPrimary: "/brand/logo.svg",
  logoInverted: "/brand/logo-inverted.svg",
  logoCompact: "/brand/logo-mark.svg",
  heroImage: "/brand/hero.jpg",
  heroImagePosition: "center 40%",
  aboutImage: "/brand/about.jpg",
  aboutImagePosition: "center center",
  serviceImages: {
    hotshot: "/brand/services/hotshot.jpg",
    expedited: "/brand/services/expedited.jpg",
    equipment: "/brand/services/equipment.jpg",
    general: "/brand/services/general.jpg",
  },
  ogImage: "/brand/og.jpg",
};
```

Anything left as `null` keeps using the typographic fallback.

## Specs

| Asset | Size (recommended) | Aspect | Notes |
|---|---|---|---|
| `logoPrimary` | SVG preferred; PNG >= 1200x400 | flexible | Used in navbar and footer. |
| `logoInverted` | same | same | Optional. Used when `logoPrimary` doesn't read on dark backgrounds. |
| `logoCompact` | SVG; PNG >= 512x512 | 1:1 | Optional. Reserved for icon-only contexts. |
| `heroImage` | 1920x1080 | 16:9 | Right column of the hero. `object-fit: cover`. |
| `aboutImage` | 1600x1200 | 4:3 | Sits beside the company prose. |
| `serviceImages.*` | 1200x900 each | 4:3 | Any subset of the four. |
| `ogImage` | 1200x630 | 1.91:1 | Twitter / Facebook / iMessage / Slack share preview. |

## Optional vs required

- **Required:** nothing. The site renders at full quality with zero assets.
- **Strongly recommended for launch:** `logoPrimary` (or `logoInverted`), `heroImage`, `ogImage`.
- **Nice to have, can land later:** `aboutImage`, `serviceImages` (any subset), `logoCompact`.

## Focal points

For photos where the subject isn't dead-center, set `object-position` in `assets.ts`:

```ts
heroImagePosition: "center 30%",   // shifts visible region upward
aboutImagePosition: "right center", // anchors the right edge
```

CSS `object-position` syntax: `<horizontal> <vertical>`. Use percentages (`50% 25%`) or keywords (`center`, `top`, `bottom`, `left`, `right`).

## File formats

- **Logos:** SVG ideal. PNG with transparency is the next best option.
- **Photos:** JPG at 80–85% quality, or WebP. Avoid PNG for photos — it quadruples filesize for no benefit.

## Browser tab icon (favicon)

Favicons aren't routed through `assets.ts` — Next.js auto-detects them from the filesystem. To replace:

- `src/app/icon.png` — 512x512, browser favicon.
- `src/app/apple-icon.png` — 180x180, iOS home screen icon.

Drop in new PNGs at those exact paths and they take effect on next build.

## Removing an asset

Set the path back to `null` in `assets.ts`. The site reverts to the typographic fallback.

## Files to keep OUT of `public/brand/`

- Design source files (`.psd`, `.ai`, `.fig`) — keep them off-repo or in a separate `design-source/` folder.
- Customer-supplied photos with privacy concerns (visible license plates, drivers' faces) — review before adding.

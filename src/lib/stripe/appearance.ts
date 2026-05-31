import type { Appearance } from "@stripe/stripe-js";

/**
 * HARBLANC freight-document appearance config for Stripe Elements.
 *
 * Stripe Elements (the PaymentElement component) renders inside a
 * Stripe-controlled iframe but accepts a small JSON-shaped appearance
 * object that controls the visual style. The card-data DOM never
 * touches our origin so PCI scope stays trivial, but the form
 * reads as freight paperwork instead of Stripe's default light SaaS.
 *
 * Token sources match globals.css / the customer pages:
 *   ink              #0a0a0a / black
 *   paper / bg-card  #141414 (matches the confirm card background)
 *   accent           #b91c1c (red-700)
 *   muted text       #a1a1aa (zinc-400) on dark bg
 *   border           #27272a (zinc-800)
 *
 * Mono font goes through Stripe's CSS-stack option; we list our
 * preferred families and Stripe falls back through them.
 */
export const harblancStripeAppearance: Appearance = {
  theme: "night",
  variables: {
    fontFamily:
      '"Public Sans", "IBM Plex Sans", system-ui, -apple-system, sans-serif',
    fontSizeBase: "15px",
    fontSizeSm: "13px",
    fontWeightNormal: "400",
    fontWeightMedium: "600",
    fontWeightBold: "700",

    colorPrimary: "#ffffff",
    colorBackground: "#0a0a0a",
    colorText: "#ffffff",
    colorTextSecondary: "#ffffff",
    colorTextPlaceholder: "#a0a0a0",
    colorDanger: "#ef4444",
    colorSuccess: "#16a34a",
    colorIcon: "#ffffff",
    colorIconHover: "#ffffff",

    borderRadius: "0px",
    spacingUnit: "4px",
    spacingGridRow: "10px",
    spacingGridColumn: "10px",
  },
  rules: {
    ".Label": {
      fontFamily:
        '"Public Sans", "IBM Plex Sans", system-ui, sans-serif',
      fontSize: "11px",
      fontWeight: "700",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "#ffffff",
      marginBottom: "6px",
    },
    ".Input": {
      backgroundColor: "#141414",
      border: "1px solid #27272a",
      color: "#ffffff",
      padding: "12px 12px",
    },
    ".Input:focus": {
      borderColor: "#ffffff",
      boxShadow: "none",
      outline: "none",
    },
    ".Input--invalid": {
      borderColor: "#ef4444",
      color: "#fecaca",
    },
    ".Tab": {
      backgroundColor: "#141414",
      border: "1px solid #27272a",
      color: "#ffffff",
    },
    ".Tab:hover": {
      backgroundColor: "#141414",
      borderColor: "#52525b",
      color: "#ffffff",
    },
    ".Tab--selected": {
      backgroundColor: "#141414",
      borderColor: "#ffffff",
      color: "#ffffff",
    },
    ".Tab--selected:hover": {
      backgroundColor: "#141414",
      borderColor: "#ffffff",
      color: "#ffffff",
    },
    ".Tab--selected:focus": {
      backgroundColor: "#141414",
      borderColor: "#ffffff",
      color: "#ffffff",
      boxShadow: "none",
      outline: "none",
    },
    ".TabIcon--selected": {
      color: "#ffffff",
      fill: "#ffffff",
    },
    ".TabLabel--selected": {
      color: "#ffffff",
    },
    ".Block": {
      backgroundColor: "#141414",
      border: "1px solid #27272a",
    },
    ".Error": {
      color: "#fecaca",
      fontSize: "12px",
    },
  },
};

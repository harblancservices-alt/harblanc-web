// Centralized business data. Components must NOT hardcode any of this.
export const company = {
  legalName: "HARBLANC SERVICES LLC",
  shortName: "Harblanc Services",
  domain: "harblancservices.com",
  established: 2024,

  // Authority / credentials
  dot: "USDOT 3918509",
  dotNumber: "3918509",
  mc: "MC 1467901",
  mcNumber: "1467901",
  authorityText: "Licensed & Insured",
  dispatchModel: "Owner-operated",
  serviceArea: "Lower 48 States",

  // Contact (placeholders — replace before launch)
  dispatchEmail: "dispatch@harblancservices.com",
  dispatchPhone: "(XXX) XXX-XXXX",

  tagline: "Direct freight hauling. Hotshot to heavy equipment.",
  shortPitch:
    "Owner-operated motor carrier. Direct dispatch. Honest pricing. No middlemen, no markups, no broker games.",
} as const;

// NOTE: the previous in-lib `services` array was removed during the audit
// pass — the homepage defines its own `serviceModules` array inline
// (src/app/page.tsx). Keep service-level data in that single source until
// a second consumer appears.

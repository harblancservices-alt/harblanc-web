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

export const services = [
  {
    slug: "hotshot",
    title: "Hotshot Hauling",
    blurb:
      "Time-critical loads on flatbeds, gooseneck, and dovetail trailers. Direct dispatch, fast turnaround.",
  },
  {
    slug: "expedited",
    title: "Expedited Freight",
    blurb:
      "When the load can't wait. Tight pickup windows, hard delivery deadlines, single point of contact start to finish.",
  },
  {
    slug: "equipment",
    title: "Equipment Hauling",
    blurb:
      "Construction equipment, machinery, agricultural gear, and oversized loads. Permits and routing handled.",
  },
  {
    slug: "general",
    title: "General Freight",
    blurb:
      "Standard freight at a fair rate. Reliable scheduling, clean handling, paperwork done right.",
  },
] as const;

export type ServiceSlug = (typeof services)[number]["slug"];

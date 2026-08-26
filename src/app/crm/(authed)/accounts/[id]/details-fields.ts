/**
 * Single source of truth for every Details-tab field the AI confirm-to-fill
 * flow can suggest. Both the AI→field mapper (ai-suggestions-actions.ts,
 * building the prompt/tool schema) and the suggestion review UI
 * (the AI suggestions panel, deleted 2026-08-26) keyed off this
 * registry — a field_key that isn't listed here can never be suggested and
 * can never be confirmed, so a malformed AI response can't write to an
 * arbitrary column.
 *
 * `column` is the literal crm_accounts column the field confirms into.
 * Deliberately scoped to firmographic/freight-profile FACTS the AI can
 * reasonably infer from research notes — identity fields (name, address),
 * operational decisions (lifecycle stage, assigned rep, lead source) and
 * repeatable rows (Locations & docks) are edited by a human directly and are
 * NOT part of this registry.
 */

export type DetailsFieldKind =
  | "text"
  | "url"
  | "number"
  | "rating"
  | "textarea"
  | "multiselect"
  | "lanes";

export type DetailsFieldGroup = "company" | "freight" | "commercial" | "context";

export type DetailsFieldDef = {
  key: string;
  label: string;
  group: DetailsFieldGroup;
  kind: DetailsFieldKind;
  column: string;
  options?: readonly string[];
};

/** No "Other" entry — MultiSelectChips' own "+ Add" pill covers anything not
 * listed here, so the preset list only needs to carry real presets. */
export const EQUIPMENT_OPTIONS = [
  "Dry Van",
  "Reefer",
  "Flatbed",
  "Step Deck",
  "Hotshot",
  "Power Only",
  "Conestoga",
  "RGN / Lowboy",
  "Box Truck",
  "Tanker",
  "Double Drop",
] as const;

/** Flatbed/hotshot commodity presets for the profile's inline "+ Add
 * commodity" picker (CommoditiesCard.tsx) — common loads first, everything
 * else not listed here still goes through the picker's "…or type your own"
 * input. Deliberately separate from EQUIPMENT_OPTIONS (that's what hauls it,
 * not what it is). */
export const COMMODITY_PRESETS = [
  "Steel",
  "Pipe",
  "Rebar",
  "Beams / I-beams",
  "Steel coils",
  "Sheet metal",
  "Lumber / Wood",
  "Plywood",
  "Generators",
  "Transformers",
  "Valves",
  "Fittings",
  "Machinery",
  "Equipment / Attachments",
  "Tractors",
  "Pallets",
  "Crates",
  "Building materials",
  "HVAC units",
  "Tanks",
  "Concrete barriers",
  "Bricks / Block",
  "Roofing materials",
  "Cable / Wire spools",
] as const;

export const SPECIAL_REQUIREMENT_OPTIONS = [
  "Tarps",
  "Straps",
  "Chains",
  "Load bars",
  "Liftgate",
  "Pallet jack",
  "Team drivers",
  "Hazmat",
  "TWIC",
  "Temp control",
  "Appointment required",
  "Inside delivery",
  "Blanket wrap",
  "Oversize / Permits",
] as const;

export const DETAILS_FIELDS: readonly DetailsFieldDef[] = [
  // Company
  { key: "dba", label: "DBA", group: "company", kind: "text", column: "dba" },
  { key: "linkedin_url", label: "LinkedIn", group: "company", kind: "url", column: "linkedin_url" },
  { key: "year_founded", label: "Year founded", group: "company", kind: "number", column: "year_founded" },
  { key: "ownership_type", label: "Ownership", group: "company", kind: "text", column: "ownership_type" },
  { key: "industry", label: "Industry", group: "company", kind: "text", column: "industry" },
  { key: "company_size", label: "Employees / size", group: "company", kind: "text", column: "company_size" },
  { key: "website", label: "Website", group: "company", kind: "url", column: "website" },

  // Freight profile
  {
    key: "equipment_needed",
    label: "Equipment needed",
    group: "freight",
    kind: "multiselect",
    column: "equipment_needed",
    options: EQUIPMENT_OPTIONS,
  },
  { key: "lanes", label: "Typical lanes", group: "freight", kind: "lanes", column: "lanes" },
  { key: "volume_frequency", label: "Volume & frequency", group: "freight", kind: "text", column: "volume_frequency" },
  { key: "weight_range", label: "Weight range", group: "freight", kind: "text", column: "weight_range" },
  {
    key: "special_requirements",
    label: "Special requirements",
    group: "freight",
    kind: "multiselect",
    column: "special_requirements",
    options: SPECIAL_REQUIREMENT_OPTIONS,
  },

  // Commercial
  { key: "fit_rating", label: "Priority / fit rating", group: "commercial", kind: "rating", column: "fit_rating" },
  { key: "payment_terms", label: "Payment / credit terms", group: "commercial", kind: "text", column: "payment_terms" },
  {
    key: "current_carrier",
    label: "Incumbent carrier / competitor",
    group: "commercial",
    kind: "text",
    column: "current_carrier",
  },

  // Context
  { key: "context_notes", label: "Notes", group: "context", kind: "textarea", column: "context_notes" },
];

export const DETAILS_FIELD_BY_KEY: ReadonlyMap<string, DetailsFieldDef> = new Map(
  DETAILS_FIELDS.map((f) => [f.key, f]),
);

export const DETAILS_GROUP_LABEL: Record<DetailsFieldGroup, string> = {
  company: "Company",
  freight: "Freight profile",
  commercial: "Commercial",
  context: "Context",
};

/** Render a stored/suggested field value as plain text for display and for
 * the generic inline "Edit" textbox — every kind round-trips through a
 * string this way so the suggestion review panel doesn't need one widget per
 * field kind. */
export function formatFieldValue(def: DetailsFieldDef, value: unknown): string {
  if (value === null || value === undefined) return "";
  switch (def.kind) {
    case "multiselect":
      return Array.isArray(value) ? value.filter((v) => typeof v === "string").join(", ") : String(value);
    case "lanes":
      return Array.isArray(value)
        ? value
            .filter((v): v is { origin?: string; destination?: string } => typeof v === "object" && v !== null)
            .map((l) => `${l.origin || "?"} → ${l.destination || "?"}`)
            .join("; ")
        : String(value);
    case "rating":
      return String(value);
    default:
      return String(value);
  }
}

/** Parse a plain-text edit (from the generic inline "Edit" textbox) back into
 * the shape `column` expects. Mirrors formatFieldValue's encoding. */
export function parseFieldValue(def: DetailsFieldDef, text: string): unknown {
  const trimmed = text.trim();
  switch (def.kind) {
    case "number": {
      const n = Number.parseInt(trimmed, 10);
      return Number.isFinite(n) ? n : null;
    }
    case "rating": {
      const n = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(n)) return null;
      return Math.min(5, Math.max(1, n));
    }
    case "multiselect":
      return trimmed
        ? trimmed
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : [];
    case "lanes":
      return trimmed
        ? trimmed
            .split(";")
            .map((seg) => seg.trim())
            .filter(Boolean)
            .map((seg) => {
              const [origin, destination] = seg.split("→").map((s) => s.trim());
              return { origin: origin || "", destination: destination || "" };
            })
            .filter((l) => l.origin || l.destination)
        : [];
    default:
      return trimmed || null;
  }
}

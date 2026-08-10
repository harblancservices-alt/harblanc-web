/** Preset equipment types for a shipment's "Equipment" field — shown on the
 * RC PDF and edited from ShipmentWorkspace. A plain text column
 * (crm_shipments.equipment) with no DB check constraint, same reasoning as
 * lifecycle's "quoted" stage — so a legacy free-typed value that predates
 * this list still round-trips fine, it's just not one of the presets. */
export const EQUIPMENT_TYPES = [
  "Flatbed Hotshot",
  "Flatbed",
  "Car Hauler",
  "Junk Haul",
  "Cargo Van",
] as const;

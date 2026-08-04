/**
 * The one place /tms-v2 reads `dispatch_settings` (mpg/diesel price/
 * factoring %). /admin copy-pastes this fetch per page (v2-architecture.md
 * research); /tms-v2 fixes that here — every money-computing query in
 * lib/data/* calls this once via the DataSource, not per call site.
 */

import { resolveDataSource } from "@/lib/demo/resolve";
import type { FuelSettings } from "@/lib/domain/money";

export async function getFuelSettings(): Promise<FuelSettings> {
  const ds = await resolveDataSource();
  return ds.getFuelSettings();
}

import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { getServiceTypesOverview } from "@/lib/data/maintenance";
import { MaintenanceHero } from "./MaintenanceHero";
import { ServiceCard } from "./ServiceCard";
import { LogServiceButton } from "./LogServiceButton";

// Odometer/status can change between visits (a service logged moments ago
// should show up immediately) — read live, matching the rest of /tms-v2's
// money-and-status-affecting pages (Today, Load Detail).
export const dynamic = "force-dynamic";

/**
 * Maintenance home — rebuilt around Brent's per-service model (2026-08-08):
 * every service is tracked by its TYPE (Engine Oil & Filter, Tire
 * Rotation, Brakes, ...), each with its own history and its own logging,
 * instead of one combined reminders-grid + flat repair log. A "type" is
 * `repair_entries`/`repair_reminders.part_group` — no schema change; see
 * lib/data/maintenance.ts's "Service types" section header for the full
 * merge rule (real reminders + real entry history + lib/dispatch/
 * service-types.ts's curated baseline list, deduplicated).
 *
 * Single continuous scroll, mobile-scoped: dark odometer hero, one card per
 * type (worst-status first), one red "+ Log a service" button at the
 * bottom (the ONLY action here — a type's own history/logging lives on its
 * profile page, type/[slug]/page.tsx, reached by tapping its card).
 */
export default async function MaintenancePage() {
  const { currentOdo, types } = await getServiceTypesOverview();
  const partGroups = [...new Set(types.map((t) => t.label))];

  return (
    <PageScroll>
      <div className="flex flex-col gap-4">
        <MaintenanceHero currentOdo={currentOdo} />

        <div className="flex flex-col gap-2.5">
          {types.map((t) => (
            <ServiceCard key={t.slug} type={t} />
          ))}
        </div>

        <LogServiceButton currentOdo={currentOdo} partGroups={partGroups} />
      </div>
    </PageScroll>
  );
}

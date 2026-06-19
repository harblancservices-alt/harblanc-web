import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { lookupZip, zipDistanceMiles } from "@/lib/dispatch/distance";
import { BackhaulView, type BackhaulBroker } from "./BackhaulView";

export const metadata: Metadata = {
  title: "Backhaul",
  robots: { index: false, follow: false },
};

/**
 * Dispatch → Backhaul. Enter where you're sitting empty (or tap "Use my
 * location"); surface ONLY brokers who have hauled outbound freight within
 * BACKHAUL_RADIUS_MI of that spot, rank them by how many such loads, flag who
 * has an email on file, and email the picks an availability blast.
 */

type BrokerRow = { id: string; name: string | null; email: string | null };
type LoadRow = {
  broker_id: string | null;
  origin: string | null;
  origin_zip: string | null;
  status: string;
};
type ContactRow = { broker_id: string | null; email: string | null };
type PostedLaneRow = { broker_id: string | null; origin_zip: string | null };

/** How far out (great-circle miles) an origin counts as a backhaul lead. */
const BACKHAUL_RADIUS_MI = 250;

export default async function BackhaulPage({
  searchParams,
}: {
  searchParams: Promise<{ zip?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const zip = (sp.zip ?? "").trim();
  const date = (sp.date ?? "").trim();

  const resolved = /^\d{5}/.test(zip) ? lookupZip(zip) : null;
  const emptyState = resolved?.state?.toUpperCase() ?? null;
  const locationLabel = resolved
    ? `${resolved.city}, ${resolved.state}`
    : zip || null;

  let brokers: BackhaulBroker[] = [];
  if (emptyState) {
    const sb = createServiceRoleClient();
    const [
      { data: brokerRows },
      { data: loadRows },
      { data: contactRows },
      { data: laneRows },
    ] = await Promise.all([
      sb
        .from("brokers")
        .select("id, name, email")
        .is("deleted_at", null)
        .returns<BrokerRow[]>(),
      sb
        .from("loads")
        .select("broker_id, origin, origin_zip, status")
        .is("deleted_at", null)
        .returns<LoadRow[]>(),
      // Only backhaul-flagged contacts contribute the broker's backhaul email.
      // General contacts (e.g. a caller-ID-only dispatcher) are ignored.
      sb
        .from("broker_contacts")
        .select("broker_id, email")
        .eq("is_backhaul", true)
        .is("deleted_at", null)
        .returns<ContactRow[]>(),
      sb
        .from("broker_lanes")
        .select("broker_id, origin_zip")
        .is("deleted_at", null)
        .returns<PostedLaneRow[]>(),
    ]);

    // First email on file per broker from its dispatcher contacts — used as a
    // fallback now that dispatcher emails live on contacts, not broker.email.
    const contactEmail = new Map<string, string>();
    for (const c of contactRows ?? []) {
      const e = c.email?.trim();
      if (c.broker_id && e && !contactEmail.has(c.broker_id)) {
        contactEmail.set(c.broker_id, e);
      }
    }

    // Count each broker's loads that ORIGINATED within the backhaul radius of
    // where the truck is empty — a broker with real outbound freight near you.
    const fromHere = new Map<string, number>();
    for (const l of loadRows ?? []) {
      if (!l.broker_id || !l.origin_zip) continue;
      const miles = zipDistanceMiles(zip, l.origin_zip);
      if (miles !== null && miles <= BACKHAUL_RADIUS_MI) {
        fromHere.set(l.broker_id, (fromHere.get(l.broker_id) ?? 0) + 1);
      }
    }

    // Posted lanes captured off load boards count the same as booked loads.
    for (const l of laneRows ?? []) {
      if (!l.broker_id || !l.origin_zip) continue;
      const miles = zipDistanceMiles(zip, l.origin_zip);
      if (miles !== null && miles <= BACKHAUL_RADIUS_MI) {
        fromHere.set(l.broker_id, (fromHere.get(l.broker_id) ?? 0) + 1);
      }
    }

    brokers = (brokerRows ?? [])
      .map((b) => {
        const count = fromHere.get(b.id) ?? 0;
        const email = b.email?.trim() || contactEmail.get(b.id) || null;
        const warmth: BackhaulBroker["warmth"] = count >= 2 ? "hot" : "warm";
        return {
          id: b.id,
          name: b.name?.trim() || "Unnamed broker",
          email,
          loadsFromHere: count,
          warmth,
        };
      })
      // Only brokers with outbound freight near you; most history first, then
      // brokers with an email on file, then by name.
      .filter((b) => b.loadsFromHere > 0)
      .sort((a, b) => {
        if (b.loadsFromHere !== a.loadsFromHere)
          return b.loadsFromHere - a.loadsFromHere;
        if (!!b.email !== !!a.email) return b.email ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  }

  return (
    <BackhaulView
      brokers={brokers}
      emptyState={emptyState}
      locationLabel={locationLabel}
      zip={zip}
      date={date}
      radiusMi={BACKHAUL_RADIUS_MI}
    />
  );
}

import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { lookupZip } from "@/lib/dispatch/distance";
import { BackhaulView, type BackhaulBroker } from "./BackhaulView";

export const metadata: Metadata = {
  title: "Backhaul",
  robots: { index: false, follow: false },
};

/**
 * Dispatch → Backhaul. Enter where you're sitting empty; rank your brokers by
 * how much freight you've actually hauled OUT of that state, flag who has an
 * email on file, and email the picks an availability blast.
 */

type BrokerRow = { id: string; name: string | null; email: string | null };
type LoadRow = {
  broker_id: string | null;
  origin: string | null;
  origin_zip: string | null;
  status: string;
};

/** Best-effort 2-letter state for a load origin. */
function originState(originZip: string | null, origin: string | null): string | null {
  if (originZip) {
    const z = lookupZip(originZip);
    if (z?.state) return z.state.toUpperCase();
  }
  const m = /,\s*([A-Za-z]{2})\b/.exec(origin ?? "");
  return m ? m[1].toUpperCase() : null;
}

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
    const [{ data: brokerRows }, { data: loadRows }] = await Promise.all([
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
    ]);

    // Count loads each broker has hauled out of the empty state.
    const fromHere = new Map<string, number>();
    for (const l of loadRows ?? []) {
      if (!l.broker_id) continue;
      if (originState(l.origin_zip, l.origin) === emptyState) {
        fromHere.set(l.broker_id, (fromHere.get(l.broker_id) ?? 0) + 1);
      }
    }

    brokers = (brokerRows ?? [])
      .map((b) => {
        const count = fromHere.get(b.id) ?? 0;
        const email = b.email?.trim() || null;
        const warmth: BackhaulBroker["warmth"] =
          count >= 2 ? "hot" : count === 1 ? "warm" : "cold";
        return {
          id: b.id,
          name: b.name?.trim() || "Unnamed broker",
          email,
          loadsFromHere: count,
          warmth,
        };
      })
      // Rank: most history first, then brokers with an email, then the rest.
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
    />
  );
}

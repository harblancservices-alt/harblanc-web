import type { Metadata } from "next";
import { lookupZip } from "@/lib/dispatch/distance";
import { haversineMiles } from "@/lib/reach/geo";
import {
  loadReachContacts,
  loadReachMarkets,
  loadReachSettings,
  loadReachTemplates,
} from "./queries";
import {
  buildRecipients,
  buildTownParen,
  detectPosture,
  matchMarket,
  type ReachAnchor,
} from "./logic";
import { ReachView } from "./ReachView";

export const metadata: Metadata = {
  title: "Backhaul Reach",
  robots: { index: false, follow: false },
};

/**
 * Dispatch → Backhaul Reach. Near-zero-typing broker outreach: auto-detects
 * whether the truck is Available (last drop) or Planning (in-transit
 * destination), names the freight MARKET brokers recognize, and self-builds the
 * recipient list. Market + manual location drive off search params (so the
 * recipient list recomputes server-side); posture + leverage are picked in the
 * client and only swap wording.
 */
export default async function ReachPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; zip?: string }>;
}) {
  const sp = await searchParams;

  const [
    { markets, available: marketsAvailable },
    settings,
    { templates, available: templatesAvailable },
    { contacts, available: contactsAvailable },
  ] = await Promise.all([
    loadReachMarkets(),
    loadReachSettings(),
    loadReachTemplates(),
    loadReachContacts(),
  ]);

  // Anchor: a manual ZIP overrides load-derived posture (operator says where
  // he's sitting); otherwise detect from loads.
  const zip = (sp.zip ?? "").trim();
  let anchor: ReachAnchor;
  if (/^\d{5}/.test(zip)) {
    const hit = lookupZip(zip);
    const match =
      hit ? matchMarket(hit.lat, hit.lon, markets) : null;
    anchor = {
      posture: "available",
      town: hit?.city ?? "",
      townLabel: hit ? `${hit.city}, ${hit.state}` : zip,
      state: (hit?.state ?? "").trim().toUpperCase(),
      lat: hit?.lat ?? null,
      lon: hit?.lon ?? null,
      zip,
      reason: "Set where you're sitting",
      match,
      loadNumber: null,
    };
  } else {
    anchor = await detectPosture(markets);
  }

  // Effective market: explicit ?market wins, else the anchor's matched market,
  // else the first market.
  const marketParam = (sp.market ?? "").trim();
  const effectiveMarket =
    markets.find((m) => m.id === marketParam) ??
    anchor.match?.market ??
    markets[0] ??
    null;

  // The precision parenthetical only makes sense when the anchor town actually
  // sits inside the effective market (else we'd label a town 300 mi away).
  let townParen = "";
  let townLabel = "";
  if (
    effectiveMarket &&
    effectiveMarket.centerLat != null &&
    effectiveMarket.centerLon != null &&
    anchor.lat != null &&
    anchor.lon != null
  ) {
    const d = haversineMiles(
      anchor.lat,
      anchor.lon,
      effectiveMarket.centerLat,
      effectiveMarket.centerLon,
    );
    if (d <= effectiveMarket.radiusMi) {
      townParen = buildTownParen(
        effectiveMarket,
        anchor.lat,
        anchor.lon,
        settings.showExactTown,
      );
      townLabel = anchor.townLabel;
    }
  }

  const { recipients, heldBack } = effectiveMarket
    ? await buildRecipients(effectiveMarket)
    : { recipients: [], heldBack: [] };

  return (
    <ReachView
      markets={markets}
      effectiveMarket={effectiveMarket}
      marketsAvailable={marketsAvailable}
      templates={templates}
      templatesAvailable={templatesAvailable}
      settings={settings}
      townParen={townParen}
      townLabel={townLabel}
      anchorZip={anchor.zip}
      anchorLoadNumber={anchor.loadNumber}
      anchorReason={anchor.reason}
      recipients={recipients}
      heldBack={heldBack}
      contacts={contacts}
      contactsAvailable={contactsAvailable}
    />
  );
}

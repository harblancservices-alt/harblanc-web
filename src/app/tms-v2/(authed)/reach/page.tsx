import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { loadReachMarkets, loadReachSettings, loadReachTemplates } from "@/app/admin/(authed)/dispatch/reach/queries";
import { detectPosture, buildRecipients, buildTownParen } from "@/app/admin/(authed)/dispatch/reach/logic";
import { listReachContacts } from "@/lib/data/reach-contacts";
import { listBrokerDirectory } from "@/lib/data/broker-directory";
import { MarketPicker } from "./MarketPicker";
import { ReachComposer } from "./ReachComposer";
import { ReachSettingsForm } from "./ReachSettingsForm";
import { ContactsSection } from "./ContactsSection";

// Load state, market suppression windows, and template edits can all change
// between visits — read live, matching Today's/Load Detail's own choice.
export const dynamic = "force-dynamic";

/**
 * Reach — near-zero-typing bulk backhaul outreach. Ported from V1's mature
 * design (posture auto-detection, market matching, warmth-scored recipient
 * build with held-back suppression, a posture×leverage template system) per
 * the phase brief: "Reach's entire design... should be ported close to
 * as-is — it's a mature, well-thought-out tool, not a candidate for
 * redesign-from-scratch." The logic is reused unchanged (queries.ts,
 * logic.ts, actions.ts, send-actions.ts); only the UI shell is new — one
 * continuous flow instead of V1's tabbed ReachView, matching tms-v2's own
 * house style.
 */
export default async function ReachPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const marketIdParam = typeof sp.marketId === "string" ? sp.marketId : null;

  const [{ markets }, settings, { templates }, contacts, brokersPage] = await Promise.all([
    loadReachMarkets(),
    loadReachSettings(),
    loadReachTemplates(),
    listReachContacts(),
    listBrokerDirectory({ pageSize: 200 }),
  ]);
  const anchor = await detectPosture(markets);

  const selectedMarket = marketIdParam
    ? (markets.find((m) => m.id === marketIdParam) ?? null)
    : (anchor.match?.market ?? null);

  const [recipientBuild, townParen] = selectedMarket
    ? await Promise.all([
        buildRecipients(selectedMarket),
        Promise.resolve(buildTownParen(selectedMarket, anchor.lat, anchor.lon, settings.showExactTown)),
      ])
    : [{ recipients: [], heldBack: [] }, ""];

  return (
    <PageScroll
      header={
        <PageHeader
          title="Reach"
          description="Near-zero-typing bulk backhaul outreach — auto-detects your posture, matches a market, and self-builds a warmth-scored recipient list."
        />
      }
    >
      <div className="flex flex-col gap-4">
        <MarketPicker markets={markets} selectedId={selectedMarket?.id ?? null} anchor={anchor} />

        {selectedMarket ? (
          <ReachComposer
            market={selectedMarket}
            townParen={townParen}
            initialPosture={anchor.posture}
            settings={settings}
            templates={templates}
            recipients={recipientBuild.recipients}
            heldBack={recipientBuild.heldBack}
          />
        ) : (
          <p className="text-[13px] text-fg-muted">Pick a market above to build a recipient list.</p>
        )}

        <ReachSettingsForm settings={settings} />

        <ContactsSection contacts={contacts} brokers={brokersPage.rows.map((b) => ({ id: b.id, name: b.name }))} />
      </div>
    </PageScroll>
  );
}

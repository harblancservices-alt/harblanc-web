import { Card, CardHead } from "./_shell/ui";
import { StaleReconnectRow, type StaleReconnectCompany } from "./StaleReconnectRow";

/**
 * GOING STALE — RECONNECT — the dashboard's right column, bottom widget.
 * Amber-accented (CardHead stays neutral; the day badge on each row carries
 * the amber tone) list of companies gone quiet, longest-since-contact first
 * — same staleness rule as the Stale counter tile (see buildStaleAccounts in
 * page.tsx), just rendered as a full list here instead of a number.
 */
export function GoingStaleList({ companies }: { companies: StaleReconnectCompany[] }) {
  return (
    <Card>
      <CardHead title="Going Stale — Reconnect" hint={companies.length ? `${companies.length} gone quiet` : "All clear"} />
      {companies.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-fg-muted">Nothing's gone quiet. Every account is being worked.</p>
      ) : (
        <ul className="divide-y divide-line-strong">
          {companies.map((c) => (
            <StaleReconnectRow key={c.id} company={c} />
          ))}
        </ul>
      )}
    </Card>
  );
}

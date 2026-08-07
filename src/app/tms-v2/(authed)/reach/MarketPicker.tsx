"use client";

import { useRouter } from "next/navigation";
import type { ReachMarket } from "@/app/admin/(authed)/dispatch/reach/types";
import type { ReachAnchor } from "@/app/admin/(authed)/dispatch/reach/logic";

/** Market override — the auto-detected market (from the truck's current/last
 * load) is the default; this lets the operator pick a different one. Plain
 * URL-state navigation (?marketId=), matching tms-v2's server-renderable-
 * row discipline elsewhere. */
export function MarketPicker({
  markets,
  selectedId,
  anchor,
}: {
  markets: ReachMarket[];
  selectedId: string | null;
  anchor: ReachAnchor;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line bg-elevated p-3">
      <p className="text-[13px] text-fg-muted">
        {anchor.reason}
        {anchor.townLabel ? ` — ${anchor.townLabel}` : ""}
        {anchor.loadNumber ? ` (load #${anchor.loadNumber})` : ""}
      </p>
      <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
        Market
        <select
          value={selectedId ?? ""}
          onChange={(e) => router.push(e.target.value ? `/tms-v2/reach?marketId=${e.target.value}` : "/tms-v2/reach")}
          className="h-9 w-full max-w-sm rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg focus:border-fg focus:outline-none"
        >
          <option value="">— Pick a market —</option>
          {markets.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

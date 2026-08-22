"use server";

import { requireCrmUser } from "@/lib/crm/auth";
import { estimateLaneMiles } from "@/lib/dispatch/distance";
import { normalizeZip, type LaneMilesLookup } from "./laneLookup";

/**
 * ZIP → ZIP driving-miles estimate for the Operations Quote Calculator.
 *
 * The ONLY server round trip the calculator makes — the pricing itself is a
 * pure function running in the browser. This exists solely because
 * estimateLaneMiles() sits on top of the `zipcodes` dataset (~40k rows of
 * JSON, bundled as a module), which is server-side only by design; calling
 * it through an action keeps that dataset out of the client bundle while
 * still letting the rep type two ZIPs and get miles back.
 *
 * estimateLaneMiles is pure and framework-free: no DB, no service-role
 * client, no dispatch-session coupling — nothing that would cross the
 * CRM/dispatch boundary. requireCrmUser() gates it anyway, because a Server
 * Action is a public POST endpoint whether or not the UI in front of it is
 * behind a login, and the repo's convention is that every action re-verifies
 * its own caller rather than trusting the page that rendered the button.
 *
 * The miles it returns are an ESTIMATE (great-circle × 1.18), not a routed
 * distance, which is exactly why the Miles field it populates stays fully
 * editable: an unknown ZIP, a Canadian postal code, or a lane the rep knows
 * runs long all fall back to typing the number in by hand.
 *
 * Never throws. Every failure — bad input, an unknown ZIP, an unexpected
 * error inside the dataset — comes back as { ok: false, error } for the UI
 * to show as a hint next to the still-usable manual Miles field.
 */
export async function lookupLaneMiles(input: {
  originZip: string;
  destZip: string;
}): Promise<LaneMilesLookup> {
  await requireCrmUser();

  const origin = normalizeZip(input.originZip);
  const destination = normalizeZip(input.destZip);

  if (origin.length !== 5 || destination.length !== 5) {
    return { ok: false, error: "Enter a 5-digit ZIP for both ends of the lane, or type the miles in directly." };
  }

  try {
    const result = estimateLaneMiles(origin, destination);
    if (!result.ok) {
      // result.reason names the offending ZIP; rewritten here so the rep
      // gets told what to DO rather than what the dataset returned.
      return {
        ok: false,
        error: `Couldn't find ${origin === destination ? "that ZIP" : "one of those ZIPs"} — check them, or type the miles in directly.`,
      };
    }
    return {
      ok: true,
      miles: result.miles,
      originCity: result.origin.city,
      originState: result.origin.state,
      destinationCity: result.destination.city,
      destinationState: result.destination.state,
    };
  } catch {
    return { ok: false, error: "Couldn't estimate the miles. Type them in directly to keep going." };
  }
}

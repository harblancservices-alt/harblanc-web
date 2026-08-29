import { bolRole, type RoleMatch } from "./desktop/file/bolRole";
import type { BolRole } from "./provenance";

/**
 * THE OTHER COMPANIES OFF THE SAME BILL OF LADING.
 *
 * Brent, 2026-08-29: "i want to make a connection to the other company
 * parsed from that BOL … a button that is 'linked company' and it opens a
 * NEW tab with the new company profile and lands on overview."
 *
 * A BOL names the two ends of one load. If both ends became companies here,
 * they are related in the only sense that matters to an agent: these two
 * ship to each other, and whoever is working one has a reason to look at
 * the other.
 *
 * ── DERIVED, NOT STORED. AND WHY THAT IS THE RIGHT CALL *FOR NOW* ─────
 *
 * `crm_bol_entries` already holds both ends of every load in one row —
 * matched_shipper_account_id, matched_consignee_account_id,
 * matched_bill_to_account_id. The relationship is not something we have to
 * record; it is something the row already says. Checked against live data
 * before deciding: 4 entries name 2+ live companies (three of them name
 * three), and every one of those pairings falls straight out of the row.
 *
 * So nothing is stored. A stored copy would be a second source of truth
 * that drifts the moment an entry is re-matched, a company is merged, or a
 * match is corrected — and it would have to be kept in step by hand, which
 * is exactly the kind of bookkeeping that goes wrong quietly.
 *
 * ── WHEN THAT STOPS BEING TRUE ────────────────────────────────────────
 *
 * This IS a company relationship, and BOL co-occurrence is only one source
 * of one. A parent/subsidiary, "same buyer, different plant", or a link an
 * agent draws by hand are all the same idea and none of them are derivable
 * from a document.
 *
 * The moment a SECOND source appears, the right shape is a
 * crm_account_relationships table (a, b, kind, source, created_by) and this
 * function becomes one contributor to it rather than the whole story.
 *
 * That migration is cheap FROM here and expensive TO here: a derived list
 * can be unioned into a stored one without touching any existing row,
 * whereas a stored copy written today has to be reconciled against the
 * entries before it can be trusted. Deriving now is not deferring the
 * structure — it is the cheaper half of it. Nothing above the return type
 * of this function knows where the links came from, so the swap is local.
 *
 * Not built today because there is exactly one source and Brent asked for a
 * button.
 */

export type LinkedCompany = {
  id: string;
  name: string;
  /** Role on the SHARED document, not the company's stored bol_role. The
   * same company can be the shipper on one BOL and the receiver on
   * another; what an agent needs here is what it was on THIS one. */
  role: BolRole;
  /** Named on the button so the link says where it goes. */
  bolNumber: string | null;
};

/** The document's word → the word an agent uses. See provenance.ts. */
const TO_ACCOUNT_ROLE: Record<ReturnType<typeof bolRole>, BolRole> = {
  shipper: "shipper",
  consignee: "receiver",
  bill_to: "broker",
};

type EntryRow = RoleMatch & { bol_number: string | null };

/**
 * Every OTHER live company named on any of this company's BOL entries.
 *
 * `liveNameById` carries only companies that are live right now — the
 * caller builds it from a query that filters `deleted_at`. That is what
 * handles the deleted-or-merged case: a link to a company that no longer
 * exists simply is not in the map, so it is not in the result, and no
 * caller has to special-case a dead id. M8 Logistics went that way an hour
 * ago and this is the path that keeps it gone.
 *
 * Deduped by company: two companies that appear together on three BOLs are
 * one relationship, not three buttons. First occurrence wins, so a caller
 * that sorts newest-first gets the most recent shared load named.
 */
export function linkedCompanies(
  entries: EntryRow[],
  accountId: string,
  liveNameById: Map<string, string>,
): LinkedCompany[] {
  const out: LinkedCompany[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const others = [
      entry.matched_shipper_account_id,
      entry.matched_consignee_account_id,
      entry.matched_bill_to_account_id,
    ];

    for (const otherId of others) {
      // Not set on this document, or it is the company we are already on.
      if (!otherId || otherId === accountId) continue;
      if (seen.has(otherId)) continue;

      const name = liveNameById.get(otherId);
      if (!name) continue; // deleted, merged, or outside this org

      seen.add(otherId);
      out.push({
        id: otherId,
        name,
        role: TO_ACCOUNT_ROLE[bolRole(entry, otherId)],
        bolNumber: (entry.bol_number ?? "").trim() || null,
      });
    }
  }

  return out;
}

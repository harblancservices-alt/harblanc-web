/**
 * WHICH END OF A LOAD A COMPANY IS ON.
 *
 * Panel 04 used to show BOLs matched to the company as the SHIPPER and
 * nothing else. The reasoning was sound as far as it went — a consignee
 * received the freight, it did not tender it — but the conclusion was too
 * strong: ten companies were matched as the consignee (7) or the bill-to
 * (3) and were shown "No bill of lading on file", with the paperwork that
 * created the record invisible on it.
 *
 * The fix is to show the entry whichever end the company sits on and SAY
 * which, rather than to hide three quarters of the matches. That makes this
 * function load-bearing: the same scan appears on two companies' profiles
 * meaning opposite things, and the label is the only thing separating them.
 *
 * Extracted from page.tsx so the precedence below can be pinned by tests —
 * a server component's inline ternary cannot be.
 */

export type BolRole = "shipper" | "consignee" | "bill_to";

export type RoleMatch = {
  matched_shipper_account_id: string | null;
  matched_consignee_account_id: string | null;
  matched_bill_to_account_id: string | null;
};

/**
 * PRECEDENCE: shipper, then consignee, then bill-to.
 *
 * Ordered by how strong a claim each is on a lane. Being the shipper is the
 * relationship a broker sells into; receiving is weaker; merely paying for
 * the load is weakest — a broker like M8 Logistics is the bill-to on freight
 * it never touched.
 *
 * A company matched TWICE on one BOL (shipping between its own sites) reads
 * as the shipper, which is the more useful of the two truths.
 *
 * Returns "bill_to" as the fallback rather than null: this is only ever
 * called on rows the query already matched to the company by one of these
 * three columns, so "none of them" cannot happen. Callers that cannot
 * guarantee that should check membership first.
 */
export function bolRole(row: RoleMatch, accountId: string): BolRole {
  if (row.matched_shipper_account_id === accountId) return "shipper";
  if (row.matched_consignee_account_id === accountId) return "consignee";
  return "bill_to";
}

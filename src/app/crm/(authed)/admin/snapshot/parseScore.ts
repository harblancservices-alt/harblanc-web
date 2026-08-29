/**
 * HOW GOOD WAS THIS PARSE — 0 to 100.
 *
 * Brent: "score the parse from 0-100, 100 being the best quality high level
 * parse and 0 being unreadable, didn't parse."
 *
 * ── WHAT THE NUMBER MEANS ─────────────────────────────────────────────
 *
 * "How much usable freight intelligence came off this photograph."
 *
 * NOT "did the parser behave correctly". Those come apart, and the split
 * matters: a flawless read of a document that names no receiver still
 * leaves you without a receiver. The score answers the question actually
 * being asked when somebody looks at the list — is this one worth opening,
 * or does it need re-shooting — so it scores the RESULT.
 *
 * The consequence is worth stating plainly, because it will come up: a
 * document can be photographed perfectly, parsed perfectly, and still score
 * in the sixties, because that is all the paper had on it. That is the
 * honest answer. A score that read 100 for extracting everything from a
 * half-empty BOL would be measuring the software's self-esteem.
 *
 * ── THE WEIGHTS, WHICH ARE THE WHOLE SPEC ─────────────────────────────
 *
 *   DOCUMENT IDENTITY                                             15
 *     BOL number                                                  10
 *     Reference / PO / PRO                                         5
 *
 *   SHIPPER                                                       17
 *     Name                                                        10
 *     Address                                                      7   (half if it is a place with no street)
 *
 *   RECEIVER                                                      18
 *     Name                                                        10
 *     Address                                                      8   (half if it is a place with no street)
 *
 *   THE LOAD                                                      15
 *     Commodity                                                    5
 *     Weight                                                       4
 *     Pickup date                                                  3
 *     Delivery date                                                3
 *
 *   COMPANIES PRODUCED                                            20
 *     Two or more                                                 20
 *     One                                                         12
 *     None                                                         0
 *
 *   SOMEBODY TO CALL                                              15
 *     A phone AND a name against it                               15
 *     A phone with nobody's name                                   8
 *     No phone at all                                              0
 *                                                                ────
 *                                                                 100
 *
 *   CONFLICTING NUMBERS, none confirmed                           -5
 *
 * ── WHY THOSE WEIGHTS ─────────────────────────────────────────────────
 *
 * The two ends of the load are worth 35 together, and the companies they
 * produce another 20, because that is what a BOL is FOR here: it exists to
 * tell us who ships and who receives. Everything else on the page is
 * supporting detail. A parse that misses a party has missed the point of
 * reading the document, and the arithmetic says so twice — once for the
 * field and once for the company that field would have created. That is
 * deliberate double-counting, not an oversight.
 *
 * "Somebody to call" is 15 rather than more because a number without a name
 * is still dialable — the same reasoning as the non-blocking contact_name
 * gap in completeness.ts. It is a partial result, so it scores partially.
 *
 * ── WHAT A GIVEN SCORE MEANS ──────────────────────────────────────────
 *
 *   90+   Both parties named and placed, companies created, a named
 *         contact, and the load detail. Nothing left to chase.
 *   70-89 One real hole — usually no named contact, or a party with a
 *         town but no street. Workable as is.
 *   50-69 A party missing outright, or only one company came out of it.
 *         Worth opening; may be worth re-shooting the other page.
 *   1-49  Fragments. Something was read, but not enough to work with.
 *   0     Nothing. Unreadable photo, or not a BOL.
 */

export type ParseScoreInput = {
  bolNumber: string | null;
  reference: string | null;
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  commodity: string | null;
  weight: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  /** LIVE companies this parse produced. Brokers and carriers are not
   * companies here (Brent's rule), so they never count toward this. */
  companiesCreated: number;
  /** Distinct phone numbers pulled off the document. */
  phoneCount: number;
  /** True when at least one contact created from this parse has a name. */
  hasNamedContact: boolean;
  /** Two numbers that disagree with neither confirmed — the Solar Link
   * case, where a Missouri area code sat against a Texas address. */
  hasPhoneConflict: boolean;
};

/** One line of the arithmetic, so a score can always be shown its working. */
export type ScoreLine = { label: string; points: number; outOf: number };

function has(v: string | null): boolean {
  return !!v && !!v.trim();
}

/**
 * Does this address carry a street, or is it only a town?
 *
 * A digit is the test. Every real US street line has a number in it, and no
 * bare "Houston, TX, US" does. It is a heuristic and it is allowed to be:
 * getting this wrong moves a score by four points, and the alternative is
 * address parsing, which would be a far larger source of wrong answers than
 * the thing it replaced.
 *
 * A ZIP alone would fool it. That is a real limitation and an acceptable
 * one — an address with a ZIP and no street is rare enough on a BOL, and
 * still more locatable than a town on its own.
 */
function hasStreet(address: string | null): boolean {
  return has(address) && /\d/.test(address!);
}

/** Full marks with a street, half without, nothing when absent. */
function addressPoints(address: string | null, outOf: number): number {
  if (!has(address)) return 0;
  return hasStreet(address) ? outOf : Math.round(outOf / 2);
}

/**
 * The score, and the arithmetic that produced it.
 *
 * Clamped to 0-100: the conflict penalty cannot push a nearly-empty parse
 * below zero, because "worse than nothing" is not a thing a photo can be.
 */
export function parseScore(input: ParseScoreInput): { score: number; lines: ScoreLine[] } {
  const lines: ScoreLine[] = [
    { label: "BOL number", points: has(input.bolNumber) ? 10 : 0, outOf: 10 },
    { label: "Reference / PO", points: has(input.reference) ? 5 : 0, outOf: 5 },
    { label: "Shipper name", points: has(input.shipperName) ? 10 : 0, outOf: 10 },
    { label: "Shipper address", points: addressPoints(input.shipperAddress, 7), outOf: 7 },
    { label: "Receiver name", points: has(input.consigneeName) ? 10 : 0, outOf: 10 },
    { label: "Receiver address", points: addressPoints(input.consigneeAddress, 8), outOf: 8 },
    { label: "Commodity", points: has(input.commodity) ? 5 : 0, outOf: 5 },
    { label: "Weight", points: has(input.weight) ? 4 : 0, outOf: 4 },
    { label: "Pickup date", points: has(input.pickupDate) ? 3 : 0, outOf: 3 },
    { label: "Delivery date", points: has(input.deliveryDate) ? 3 : 0, outOf: 3 },
    {
      label: "Companies produced",
      points: input.companiesCreated >= 2 ? 20 : input.companiesCreated === 1 ? 12 : 0,
      outOf: 20,
    },
    {
      label: "Somebody to call",
      points: input.phoneCount === 0 ? 0 : input.hasNamedContact ? 15 : 8,
      outOf: 15,
    },
  ];

  if (input.hasPhoneConflict) {
    lines.push({ label: "Conflicting numbers, unconfirmed", points: -5, outOf: 0 });
  }

  const raw = lines.reduce((sum, l) => sum + l.points, 0);
  return { score: Math.max(0, Math.min(100, raw)), lines };
}

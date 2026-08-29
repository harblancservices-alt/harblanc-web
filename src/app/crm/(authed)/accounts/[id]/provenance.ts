/**
 * WHERE A COMPANY CAME FROM, AND WHAT IT WAS WHEN IT GOT HERE.
 *
 * Brent, 2026-08-29: "maybe we need to show source on the top of every
 * company profile — near the sales agent assign area. the source should be
 * 'possible shipper' 'bol' and then 'possible receiver' 'bol' and then
 * possible broker if thought to be a broker."
 *
 * ── TWO FACTS, NOT ONE ────────────────────────────────────────────────
 *
 * `source` says WHERE the record came from — otr, manual, bol. That
 * vocabulary is fixed and nothing here changes it.
 *
 * `bol_role` says WHAT the company was on the paperwork it came from —
 * shipper, receiver, broker. That is a different fact, and it is the one
 * that changes behaviour: a broker is an intermediary, not a prospect.
 *
 * ── WHY EVERY ROLE READS "POSSIBLE" ───────────────────────────────────
 *
 * These are unverified reads off a photographed document. "Possible
 * shipper" is honest; "Shipper" is a claim nobody has stood behind yet.
 * The wording is also an instruction to the agent: confirm before you
 * assume. That matters more than it sounds — the first BOL processed this
 * way printed a Missouri phone number against a Texas address, and an
 * agent who trusted the record instead of the caveat would have called it.
 *
 * ── BROKER IS A JUDGEMENT, NOT A BOX ON THE FORM ──────────────────────
 *
 * Nothing on a bill of lading says "broker". M8 Logistics was identifiable
 * as one because it sat in BILL FREIGHT TO *and* its own site sells
 * brokerage. The BILL FREIGHT TO box alone does not prove it — a shipper
 * that pays its own freight sits there too. So the role is stored on the
 * company rather than derived from the document every time, and it is
 * editable: a company wrongly marked broker is one an agent will skip,
 * which is a worse failure than an unlabelled one.
 */

export type BolRole = "shipper" | "receiver" | "broker";

export const BOL_ROLES: readonly BolRole[] = ["shipper", "receiver", "broker"] as const;

export function isBolRole(v: unknown): v is BolRole {
  return typeof v === "string" && (BOL_ROLES as readonly string[]).includes(v);
}

/**
 * TONE, which is about behaviour rather than decoration.
 *
 * "broker" is the only role that tells an agent to do something DIFFERENT
 * — don't pitch them. "shipper" and "receiver" are both ordinary leads and
 * share a tone, because inventing a visual difference between two things
 * an agent treats identically would be noise.
 */
export type PillTone = "lead" | "broker" | "neutral";

export type ProvenancePill = {
  /** React key, and what the tests assert on. */
  key: string;
  text: string;
  tone: PillTone;
  /** Long-form, shown as a title attribute — the pill itself stays short. */
  hint: string;
};

const ROLE_TEXT: Record<BolRole, string> = {
  shipper: "Possible shipper",
  receiver: "Possible receiver",
  broker: "Possible broker",
};

const ROLE_HINT: Record<BolRole, string> = {
  shipper:
    "Named as the shipper on a bill of lading. Read off the document and not yet confirmed with them.",
  receiver:
    "Named as the receiver (consignee) on a bill of lading. Read off the document and not yet confirmed with them.",
  broker:
    "Looks like a broker or freight intermediary rather than a shipper — check before pitching. Read off the document and not yet confirmed.",
};

/**
 * SOURCE WORDING.
 *
 * Brent wrote the source pill as "bol". Spelled out here because the pill
 * sits next to a company name rather than in a data table, and "bol" beside
 * "Possible shipper" reads as a code where "From a BOL" reads as a sentence.
 *
 * otr → "From OTR", their own word for the over-the-road side the records
 * were imported from. Deliberately not "Past customer": a company can be in
 * that import without having ever shipped with us, and the pill is not the
 * place to make a claim the data does not carry.
 *
 * manual → "Added by hand", which is the whole of what is known.
 *
 * NULL source gets NO pill. 6 companies have one, and a pill reading
 * "Unknown" would be chrome that tells an agent nothing.
 */
const SOURCE_TEXT: Record<string, string> = {
  bol: "From a BOL",
  otr: "From OTR",
  manual: "Added by hand",
};

const SOURCE_HINT: Record<string, string> = {
  bol: "Created from a scanned or photographed bill of lading.",
  otr: "Imported from the OTR side of the business.",
  manual: "Typed in by somebody here.",
};

/**
 * The pills for one company, in reading order: what they are, then where
 * they came from. Role first because it is the one that changes what the
 * agent does.
 *
 * Returns [] when there is nothing true to say, and the caller renders
 * nothing rather than an empty row.
 */
export function provenancePills(input: {
  source: string | null;
  bolRole: string | null;
}): ProvenancePill[] {
  const pills: ProvenancePill[] = [];

  if (isBolRole(input.bolRole)) {
    pills.push({
      key: `role:${input.bolRole}`,
      text: ROLE_TEXT[input.bolRole],
      tone: input.bolRole === "broker" ? "broker" : "lead",
      hint: ROLE_HINT[input.bolRole],
    });
  }

  const src = (input.source ?? "").trim();
  if (src && SOURCE_TEXT[src]) {
    pills.push({
      key: `source:${src}`,
      text: SOURCE_TEXT[src],
      tone: "neutral",
      hint: SOURCE_HINT[src] ?? "",
    });
  }

  return pills;
}

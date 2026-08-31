import { Micro } from "./chrome";

/**
 * WHAT WE ACTUALLY KNOW — the left half, on a company with no document.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * The tab is called "What we know" and, on the 84 companies with no bill of
 * lading, it showed almost nothing we know: the whole left half rendered a
 * sentence explaining that a document was missing, while the company's
 * industry, address, phone and description sat on a different tab.
 *
 * So this is the record, read in the order an agent needs it before a call:
 * what they make, where they are, how to reach them, who we know there, and
 * what the calls have already established.
 *
 * ── AN ABSENCE IS SAID OUT LOUD, IN RED ───────────────────────────────
 *
 * "Nobody on file" is the single most important thing this panel can tell
 * you — it is true of 38 of the 67 New Leads — so it is stated at full
 * weight in --bad rather than left as a blank row or whispered in grey. A
 * row with nothing in it reads as "we checked and there is nothing"; a red
 * line reads as "go and find this", which is the truth.
 */

export type RecordFacts = {
  industry: string | null;
  /** context_notes with the "[Fit n/10]" marker stripped — that number is
   * drawn as a chip, so leaving it in the prose says it twice. */
  description: string | null;
  /** 0-10, when somebody wrote one into the description. 38 companies have. */
  fit: number | null;
  place: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  contacts: { id: string; name: string | null; title: string | null; phone: string | null }[];
  /** What the calls established: who moves their freight, what they ship. */
  currentCarrier: string | null;
  commodities: string | null;
  callCount: number;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 border-t border-line py-2.5 first:border-t-0">
      <span className="w-[104px] shrink-0 text-[10.5px] font-bold uppercase tracking-[0.07em] text-fg">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-fg">{children}</div>
    </div>
  );
}

/** The absence, stated. See the note at the top of this file. */
function Missing({ children }: { children: React.ReactNode }) {
  return <span className="font-bold text-bad">{children}</span>;
}

export function RecordColumn({ facts }: { facts: RecordFacts }) {
  const fitWord =
    facts.fit == null ? null : facts.fit >= 8 ? "Good fit" : facts.fit >= 5 ? "Worth a look" : "Long shot";

  return (
    <div className="px-4 py-3">
      <Row label="What they do">
        {facts.industry ? (
          <>
            <span className="text-[15px] font-bold">{facts.industry}</span>
            {fitWord && (
              /* The number AND the word. "8/10" alone means nothing to
                 somebody who has never seen the scale. */
              <span className="ml-2 rounded bg-ok px-2 py-0.5 text-[11.5px] font-bold text-white">
                {fitWord} · {facts.fit}/10
              </span>
            )}
          </>
        ) : (
          <Missing>Nobody has said yet</Missing>
        )}
        {facts.description && (
          <span className="mt-1 block whitespace-pre-wrap text-[12.5px] text-fg-muted">
            {facts.description}
          </span>
        )}
      </Row>

      <Row label="Where">
        {facts.address ?? facts.place ?? <Missing>No address on file</Missing>}
      </Row>

      <Row label="Reach them">
        {facts.phone || facts.website || facts.email ? (
          <>
            {facts.phone && <span className="font-bold">{facts.phone}</span>}
            {facts.phone && (facts.website || facts.email) && " · "}
            {facts.website}
            {facts.email && <span className="mt-0.5 block text-fg-muted">{facts.email}</span>}
          </>
        ) : (
          <Missing>No company phone, no website</Missing>
        )}
      </Row>

      <Row label="Who we know">
        {facts.contacts.length === 0 ? (
          <Missing>Nobody on file</Missing>
        ) : (
          facts.contacts.map((c) => (
            <span key={c.id} className="block">
              <span className="text-[14px] font-bold">{c.name ?? "Name unknown"}</span>
              {(c.title || c.phone) && (
                <span className="text-fg-muted">
                  {c.title ? ` — ${c.title}` : ""}
                  {c.phone ? ` · ${c.phone}` : ""}
                </span>
              )}
            </span>
          ))
        )}
      </Row>

      <Row label="From calls">
        {facts.currentCarrier || facts.commodities ? (
          <>
            {facts.currentCarrier && (
              <span className="block">
                Moves freight with <span className="font-bold">{facts.currentCarrier}</span>
              </span>
            )}
            {facts.commodities && <span className="block text-fg-muted">{facts.commodities}</span>}
          </>
        ) : facts.callCount === 0 ? (
          <Missing>Nobody has called them yet</Missing>
        ) : (
          /* Calls happened and taught us nothing we kept. That is a
             different fact from never having called, and worth saying. */
          <Missing>
            {facts.callCount} {facts.callCount === 1 ? "call" : "calls"} logged, nothing recorded yet
          </Missing>
        )}
      </Row>

      <p className="mt-3 flex items-baseline gap-2.5 border-t border-line pt-2.5">
        <Micro className="text-fg">From BOLs</Micro>
        <span className="text-[12.5px] font-semibold text-fg">none on file</span>
      </p>
    </div>
  );
}

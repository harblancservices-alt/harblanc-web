import type { PhoneEntry } from "../../../_shell/contactFields";
import { formatPhone } from "../../../_shell/format";
import { digitsForTel } from "../../../_shell/contactFields";

/**
 * The company's OWN way in — its numbers and its email, in one block.
 *
 * MERGED 2026-08-26. This was three separate things stacked in the left
 * rail: a pair of "Call" / "Email" buttons, then the phone list, then the
 * email address on its own row — all reading the same two columns. One of
 * Brent's five merges.
 *
 * These are the COMPANY's details, not a person's. That distinction is why
 * this block stays even when there are contacts: a switchboard number is
 * often the only thing that works, and 22 companies in this book have one
 * while 50 have no people at all.
 */
export function ContactBlock({
  phones,
  email,
  addGap,
}: {
  phones: PhoneEntry[];
  email: string | null;
  /** Rendered when there is neither a number nor an address — the gap
   * button that opens the one edit form. */
  addGap: React.ReactNode;
}) {
  const hasAny = phones.length > 0 || !!email;
  if (!hasAny) return <div className="text-[12.5px] text-fg-muted">No company number or email on file. {addGap}</div>;

  return (
    <div className="flex flex-col gap-1.5">
      {phones.map((p, i) => (
        <div key={`${p.number}-${i}`} className="flex items-baseline gap-2">
          <a
            href={`tel:${digitsForTel(p.number)}`}
            className="font-mono text-[13px] font-semibold text-accent hover:underline"
          >
            {formatPhone(p.number)}
          </a>
          {p.label && <span className="text-[11.5px] text-fg-subtle">{p.label}</span>}
        </div>
      ))}
      {email && (
        <a href={`mailto:${email}`} className="truncate text-[12.5px] text-accent hover:underline">
          {email}
        </a>
      )}
    </div>
  );
}

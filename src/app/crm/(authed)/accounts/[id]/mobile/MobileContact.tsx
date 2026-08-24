import type { ReactNode } from "react";
import { digitsForTel, type PhoneEntry } from "../../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { IconMail, IconMapPin, IconPhone } from "../../../_shell/icons";
import { M_DIVIDE, M_KEY, M_ROUND, M_ROUND_SOLID, M_ROW, M_ROW_ICON, M_VAL, M_VAL_SM } from "./ui";

/**
 * CONTACT — the company's own reachability, one tappable row per channel.
 *
 * This is the surviving half of the old CompanyDetailsCard: its contact
 * fields, minus the navy `bg-accent` header band that duplicated the page
 * title and carried a second Edit link (see mobile/MobileHeader.tsx).
 * Nothing was dropped — every field that card rendered still shows here or
 * in the Links / Commodities / At a glance / Company profile sections.
 *
 * Phone-first: the FIRST number gets a solid Call button plus a Text
 * shortcut, every other number a bordered Call. All plain `tel:` / `sms:` /
 * `mailto:` / maps links, so this stays a Server Component with no handlers
 * to hoist across the RSC boundary.
 */

function Row({ first, icon, label, children, action }: {
  first: boolean;
  icon: ReactNode;
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={first ? M_ROW : `${M_ROW} ${M_DIVIDE}`}>
      <span className={M_ROW_ICON}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={M_KEY}>{label}</span>
        {children}
      </span>
      {action && <span className="flex shrink-0 items-center gap-1.5">{action}</span>}
    </div>
  );
}

export function MobileContact({
  phones,
  legacyPhone,
  email,
  fullAddress,
}: {
  phones: PhoneEntry[];
  /** Pre-`phones` single-column value, still live on older rows. */
  legacyPhone: string | null;
  email: string | null;
  fullAddress: string | null;
}) {
  const numbers: PhoneEntry[] = phones.length
    ? phones
    : legacyPhone
      ? [{ label: "Main", number: legacyPhone }]
      : [];

  if (numbers.length === 0 && !email && !fullAddress) {
    return (
      <p className="px-[13px] py-[18px] text-[12.5px] font-semibold text-fg-muted">
        No company phone, email, or address on file yet — add them from Edit.
      </p>
    );
  }

  let index = 0;

  return (
    <div>
      {numbers.map((p, i) => {
        const tel = digitsForTel(p.number);
        const first = index++ === 0;
        return (
          <Row
            key={`${p.label}-${p.number}-${i}`}
            first={first}
            icon={<IconPhone width={16} height={16} />}
            label={p.label || "Phone"}
            action={
              <>
                <a href={`tel:${tel}`} aria-label={`Call ${p.label || "company"}`} className={i === 0 ? M_ROUND_SOLID : M_ROUND}>
                  <IconPhone width={15} height={15} />
                </a>
                {i === 0 && (
                  <a href={`sms:${tel}`} aria-label="Text company" className={M_ROUND}>
                    <IconMail width={15} height={15} />
                  </a>
                )}
              </>
            }
          >
            <span className={`${M_VAL} crm-num`}>{formatPhone(p.number)}</span>
          </Row>
        );
      })}

      {email && (
        <Row
          first={index++ === 0}
          icon={<IconMail width={16} height={16} />}
          label="Email"
          action={
            <a href={`mailto:${email}`} aria-label="Email company" className={M_ROUND}>
              <IconMail width={15} height={15} />
            </a>
          }
        >
          {/* M_VAL_SM, not M_VAL — see the note on those tokens: a real
              company address needs the smaller step to stay on one line. */}
          <span className={`${M_VAL_SM} [overflow-wrap:anywhere]`}>{email}</span>
        </Row>
      )}

      {fullAddress && (
        <Row
          first={index++ === 0}
          icon={<IconMapPin width={16} height={16} />}
          label="Address"
          action={
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[33px] shrink-0 items-center rounded-[9px] border border-line-strong bg-card px-3 text-[12px] font-extrabold text-fg transition-colors hover:bg-inset"
            >
              Map
            </a>
          }
        >
          <span className={`${M_VAL} [overflow-wrap:anywhere]`}>{fullAddress}</span>
        </Row>
      )}
    </div>
  );
}

/** LINKS — website / LinkedIn / everything else in `links`, as tap pills.
 * The same set the old CompanyDetailsCard rendered as "link bubbles". */
export function MobileLinks({ links }: { links: { label: string; href: string }[] }) {
  if (links.length === 0) {
    return (
      <p className="px-[13px] py-3.5 text-[12.5px] font-semibold text-fg-muted">
        No website or profile links on file yet.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5 px-[13px] py-2.5">
      {links.map((l) => (
        <a
          key={`${l.label}-${l.href}`}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent/45 bg-card px-3 py-1.5 text-[12px] font-bold text-accent transition-colors hover:bg-accent/10"
        >
          <span className="truncate">{l.label}</span>
        </a>
      ))}
    </div>
  );
}

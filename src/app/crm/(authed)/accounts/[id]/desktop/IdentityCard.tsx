"use client";

import { CompanyAvatar } from "../../../_shell/InitialAvatar";
import { digitsForTel, type PhoneEntry } from "../../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { LogCallDialog } from "../../../calls/LogCallDialog";
import { D_BTN_FILLED, D_BTN_OUTLINE, D_CARD, D_MICRO, D_MONO } from "./ui";

export type IdentityLink = { label: string; href: string };

const ACTION = "flex-1 px-0 py-2 text-[12px]";

/**
 * DESKTOP-ONLY left-rail "Company" card (design handoff §Left identity rail)
 * — 44px monogram, name, "industry · city" subline, three quick actions
 * (Call filled / Email + Log outlined), then PHONE (mono, with its label as
 * a pill) / ADDRESS / LINKS.
 *
 * Client Component only because "Log" drives the shared LogCallDialog, which
 * needs a `trigger` render prop — everything else here is static markup fed
 * serializable props from page.tsx. Call/Email are plain tel:/mailto: links
 * styled as buttons (same behavior the mobile card's values already have),
 * and they render disabled-looking when there's nothing to dial or mail.
 *
 * Data paths are unchanged: the same `parsePhones(account.phones)` array,
 * `account.email`, the same composed address string, and the same
 * website/linkedin/links bubbles the mobile contact block renders.
 */
export function IdentityCard({
  accountId,
  name,
  industry,
  city,
  email,
  phones,
  fullAddress,
  links,
}: {
  accountId: string;
  name: string;
  industry: string | null;
  city: string | null;
  email: string | null;
  phones: PhoneEntry[];
  fullAddress: string | null;
  links: IdentityLink[];
}) {
  const subline = [industry, city].filter(Boolean).join(" · ");
  const primaryPhone = phones[0]?.number ?? null;

  return (
    <div className={`${D_CARD} flex flex-col gap-3.5 p-[18px]`}>
      <div className="flex items-center gap-3">
        <CompanyAvatar name={name} className="h-11 w-11 text-[16px]" />
        <div className="min-w-0">
          <div className="text-[15px] font-bold leading-tight text-fg">{name}</div>
          {subline && <div className="mt-0.5 truncate text-[12px] font-medium text-fg-muted">{subline}</div>}
        </div>
      </div>

      <div className="flex gap-2">
        {primaryPhone ? (
          <a href={`tel:${digitsForTel(primaryPhone)}`} className={`${D_BTN_FILLED} ${ACTION}`}>
            Call
          </a>
        ) : (
          <span className={`${D_BTN_FILLED} ${ACTION} pointer-events-none opacity-50`}>Call</span>
        )}
        {email ? (
          <a href={`mailto:${email}`} className={`${D_BTN_OUTLINE} ${ACTION}`}>
            Email
          </a>
        ) : (
          <span className={`${D_BTN_OUTLINE} ${ACTION} pointer-events-none opacity-50`}>Email</span>
        )}
        <LogCallDialog
          accountId={accountId}
          phone={primaryPhone}
          trigger={(open) => (
            <button type="button" onClick={open} className={`${D_BTN_OUTLINE} ${ACTION}`}>
              Log
            </button>
          )}
        />
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line pt-3.5">
        {phones.length > 0 && (
          <div>
            <div className={D_MICRO}>Phone</div>
            <div className="mt-1 flex flex-col gap-1">
              {phones.map((p, i) => (
                <div key={`${p.label}:${p.number}:${i}`} className="flex items-center gap-2">
                  <a
                    href={`tel:${digitsForTel(p.number)}`}
                    className={`${D_MONO} text-[13px] font-medium text-fg transition-colors hover:text-accent`}
                  >
                    {formatPhone(p.number)}
                  </a>
                  {p.label && (
                    <span className="shrink-0 rounded-full bg-ok-bg px-1.5 py-px text-[10px] font-bold text-ok">
                      {p.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {email && (
          <div>
            <div className={D_MICRO}>Email</div>
            <a
              href={`mailto:${email}`}
              className="mt-1 block break-all text-[13px] font-medium text-fg transition-colors hover:text-accent"
            >
              {email}
            </a>
          </div>
        )}

        {fullAddress && (
          <div>
            <div className={D_MICRO}>Address</div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block text-[13px] leading-[1.45] text-fg transition-colors hover:text-accent"
            >
              {fullAddress}
            </a>
          </div>
        )}

        {links.length > 0 && (
          <div>
            <div className={D_MICRO}>Links</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {links.map((l, i) => (
                <a
                  key={`${l.label}:${i}`}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-semibold text-accent transition-colors hover:text-accent-hover hover:underline"
                >
                  {l.label} ↗
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

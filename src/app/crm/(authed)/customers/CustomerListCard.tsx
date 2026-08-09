"use client";

import { ClickableListItem } from "../_shell/ClickableRow";
import { BTN_ACTION } from "../_shell/ui";
import { IconPhone } from "../_shell/icons";
import { stageLabel, stageTone } from "../accounts/lifecycle";
import { lastContactStatus } from "../_shell/format";
import { digitsForTel } from "../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";

export type CustomerCardData = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  industry: string | null;
  commodities: string | null;
  repName: string | null;
  primaryContactName: string | null;
  primaryContactTitle: string | null;
  phone: string | null;
  lastContactMs: number | null;
};

/**
 * One customer card in the Active Customers mobile grid — same shape as
 * CompanyListCard (accounts/CompanyListCard.tsx), always showing the
 * "Customer" stage pill since that's the whole point of this list.
 */
export function CustomerListCard({ customer }: { customer: CustomerCardData }) {
  const location = [customer.city, customer.state].filter(Boolean).join(", ");
  const industryLine = [customer.industry, customer.commodities].filter(Boolean).join(" · ");
  const lastContact = lastContactStatus(customer.lastContactMs);

  return (
    <ClickableListItem
      href={`/crm/accounts/${customer.id}`}
      className="flex h-full min-h-[172px] flex-col justify-between border border-line-strong bg-card p-4 shadow-e1 hover:border-accent/40"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[14.5px] font-bold text-fg">{customer.name}</p>
          <span
            className={`shrink-0 inline-flex items-center px-2 py-0.5 text-[10.5px] font-semibold ${stageTone("customer")}`}
          >
            {stageLabel("customer")}
          </span>
        </div>

        <p className="truncate text-[12.5px] text-fg-muted">
          {[location, industryLine].filter(Boolean).join(" · ") || "—"}
        </p>

        {customer.primaryContactName ? (
          <p className="truncate text-[12.5px] text-fg">
            {customer.primaryContactName}
            {customer.primaryContactTitle ? (
              <span className="text-fg-subtle"> · {customer.primaryContactTitle}</span>
            ) : null}
          </p>
        ) : (
          <p className="text-[12.5px] text-fg-subtle">No contact on file</p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-subtle">
          {customer.repName && <span>Rep: {customer.repName}</span>}
          <span>
            {lastContact.freshness === "never" ? "Never contacted" : `Last contact: ${lastContact.text}`}
          </span>
        </div>
      </div>

      {customer.phone ? (
        <a
          href={`tel:${digitsForTel(customer.phone)}`}
          className={`mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-colors ${BTN_ACTION}`}
        >
          <IconPhone width={13} height={13} />
          {formatPhone(customer.phone)}
        </a>
      ) : (
        <span
          aria-disabled
          className="mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-fg-subtle bg-card text-[12.5px] font-semibold text-fg-subtle opacity-50"
        >
          <IconPhone width={13} height={13} />
          No phone on file
        </span>
      )}
    </ClickableListItem>
  );
}

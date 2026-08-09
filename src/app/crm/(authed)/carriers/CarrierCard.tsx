"use client";

import { ClickableListItem } from "../_shell/ClickableRow";
import { BTN_ACTION } from "../_shell/ui";
import { IconPhone } from "../_shell/icons";
import { titleCaseWords, upperCaseState } from "../_shell/format";
import { digitsForTel } from "../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import type { CarrierListRow } from "./CarriersListClient";

/** One carrier card in the mobile grid — same shape/height contract as
 * CompanyListCard/ShipmentCard so every CRM list grid reads consistently. */
export function CarrierCard({ carrier }: { carrier: CarrierListRow }) {
  const location = [titleCaseWords(carrier.city), upperCaseState(carrier.state)].filter(Boolean).join(", ");

  return (
    <ClickableListItem
      href={`/crm/carriers/${carrier.id}`}
      className="flex h-full min-h-[160px] flex-col justify-between rounded-lg border border-line-strong bg-card p-4 shadow-e1 hover:border-accent/40"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[14.5px] font-bold text-fg">{titleCaseWords(carrier.name)}</p>
          <span
            className={`shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${
              carrier.status === "active" ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"
            }`}
          >
            {carrier.status === "active" ? "Active" : "Inactive"}
          </span>
        </div>

        <p className="text-[12.5px] text-fg-muted">{location || "—"}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-subtle">
          {carrier.mcNumber && <span>MC {carrier.mcNumber}</span>}
          {carrier.dotNumber && <span>DOT {carrier.dotNumber}</span>}
          {carrier.equipment && <span>{carrier.equipment}</span>}
        </div>
      </div>

      {carrier.phone ? (
        <a
          href={`tel:${digitsForTel(carrier.phone)}`}
          className={`mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-colors ${BTN_ACTION}`}
        >
          <IconPhone width={13} height={13} />
          {formatPhone(carrier.phone)}
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

"use client";

import { ClickableListItem } from "../_shell/ClickableRow";
import { Badge } from "../_shell/ui";
import { stageLabel, stageBadgeTone } from "./lifecycle";
import { lastContactStatus, titleCaseWords, upperCaseState } from "../_shell/format";
import { temperatureOf } from "@/lib/crm/temperature";
import { TemperatureDot } from "../_shell/TemperatureDot";
import { CallAction } from "../_shell/mobileList";
import { CompanyRowActions } from "./CompanyRowActions";
import { ActiveCustomerRowActions, type ActiveCustomerActionsData } from "../customers/ActiveCustomerRowActions";
import type { CompanyOption } from "../contacts/CompanyCombobox";
import type { CrmTag } from "./tags";

export type CompanyCardData = {
  id: string;
  name: string;
  stage: string | null;
  city: string | null;
  state: string | null;
  primaryTag: CrmTag | null;
  contactCount: number;
  lastContactMs: number | null;
  phone: string | null;
  /** The person Call reaches — primary_contact_id where set, else the first
   * contact by name (lib/crm/primaryContact). Null when nobody is on file. */
  contactName?: string | null;
  /** What Call dials: the company's number if it has one, else that
   * person's. Null for 51 of 99 companies. */
  callPhone?: string | null;
};

/**
 * One company card in the Companies grid — Brent's spec: name, stage pill
 * (same LIFECYCLE_TONE system as the detail page), city/state, primary tag,
 * last-contact date, contact count, and row actions. Every card is the SAME
 * structure regardless of how much data it has so the grid reads as uniform
 * rows — the parent grid's `auto-rows-fr` (see page.tsx) then stretches every
 * card in a row to match its tallest neighbor.
 *
 * 2026-08-09: the tap-to-call button was replaced with CompanyRowActions
 * (Notes / Add contact / Loads-if-active-customer) — see that file.
 * `companyOptions` is the org roster its Add-contact dialog needs.
 *
 * `activeCustomerActions` swaps the row-actions block entirely — the Active
 * Customers hub passes its own data (Add notes/Add load/Add task, see
 * customers/ActiveCustomerRowActions.tsx) instead of the Companies-list
 * default (Notes/Add contact/Loads). This takes plain data rather than a
 * render callback because the caller (ActiveCustomersPanel) is a Server
 * Component — passing a function prop across that boundary crashes at
 * render with an opaque digest instead of failing the build.
 */
export function CompanyListCard({
  company,
  companyOptions,
  now,
  activeCustomerActions,
}: {
  company: CompanyCardData;
  companyOptions: CompanyOption[];
  /** Server clock — never Date.now() during render (React Compiler purity
   * rule). One instant for every temperature on the page. */
  now: number;
  activeCustomerActions?: ActiveCustomerActionsData;
}) {
  const location = [titleCaseWords(company.city), upperCaseState(company.state)].filter(Boolean).join(", ");
  const lastContact = lastContactStatus(company.lastContactMs);
  const temp = temperatureOf({ stage: company.stage, lastContactMs: company.lastContactMs, now });

  return (
    <ClickableListItem
      href={`/crm/accounts/${company.id}`}
      className="flex h-full min-h-[172px] flex-col justify-between rounded-lg border border-line-strong bg-card p-4 shadow-e1 hover:border-accent/40"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[14.5px] font-bold text-fg">{titleCaseWords(company.name)}</p>
          <Badge tone={stageBadgeTone(company.stage)}>{stageLabel(company.stage)}</Badge>
        </div>

        <p className="text-[12.5px] text-fg-muted">{location || "—"}</p>

        {company.primaryTag && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-line-strong bg-inset py-0.5 pl-1.5 pr-2 text-[11px] font-medium text-fg">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: company.primaryTag.color || "var(--fg-subtle)" }} />
            {company.primaryTag.label}
          </span>
        )}

        {/* WHO CALL REACHES, named. Brent: "I would want it to say the
            primary contacts name atleast." A bare phone icon on a company
            row does not say who answers; on 25 of 99 companies the number
            is a person's rather than a switchboard, so the name is the
            only thing that makes the button trustworthy before you tap. */}
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[12.5px] text-fg-muted">
            {company.contactName
              ? company.callPhone
                ? company.contactName
                : `${company.contactName} — no number`
              : "Nobody on file to call"}
          </span>
          <CallAction
            phone={company.callPhone ?? null}
            who={company.contactName ?? titleCaseWords(company.name)}
            emptyReason={
              company.contactName
                ? `No number on file for ${company.contactName}`
                : `Nobody is on file at ${titleCaseWords(company.name)} yet`
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-subtle">
          <span>
            {company.contactCount} contact{company.contactCount === 1 ? "" : "s"}
          </span>
          <span>
            <span className="flex items-center gap-1.5">
              <TemperatureDot temp={temp} />
              {lastContact.freshness === "never" ? "Never contacted" : `Last contact: ${lastContact.text}`}
            </span>
          </span>
        </div>
      </div>

      {activeCustomerActions ? (
        <ActiveCustomerRowActions
          company={company}
          contacts={activeCustomerActions.contactsByAccount[company.id] ?? []}
          reps={activeCustomerActions.reps}
          canAssignOthers={activeCustomerActions.canAssignOthers}
          currentUser={activeCustomerActions.currentUser}
          variant="card"
        />
      ) : (
        <CompanyRowActions company={company} companies={companyOptions} variant="card" />
      )}
    </ClickableListItem>
  );
}

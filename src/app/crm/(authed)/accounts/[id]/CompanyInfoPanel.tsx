import { Card, CardHead } from "../../_shell/ui";
import { PhoneList } from "../../_shell/PhoneList";
import { LinkList } from "../../_shell/LinkList";
import type { PhoneEntry, LinkEntry } from "../../_shell/contactFields";
import { LifecycleControl } from "./LifecycleControl";
import { RepControl } from "./RepControl";
import type { RepOption } from "../CompanyDialog";

/**
 * The operational profile's LEFT column — the company itself: lifecycle
 * stage, assigned rep, address, the labeled phone-number list, the labeled
 * link list, and commodities. Everything a rep needs to place a call or find
 * the company sits in this one card; the exhaustive field set (industry,
 * DOT/MC, size, spend, source, …) lives one tab over in "Details" instead.
 */
export function CompanyInfoPanel({
  accountId,
  stage,
  assignedUserId,
  reps,
  address,
  city,
  state,
  zip,
  phones,
  links,
  commodities,
}: {
  accountId: string;
  stage: string;
  assignedUserId: string | null;
  reps: RepOption[];
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phones: PhoneEntry[];
  links: LinkEntry[];
  commodities: string | null;
}) {
  const location = [city, state].filter(Boolean).join(", ");
  const fullAddress = [address, location, zip].filter(Boolean).join(", ");

  return (
    <Card>
      <CardHead title="Company" />
      <div className="flex flex-col gap-5 p-5">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            Lifecycle stage
          </p>
          <LifecycleControl accountId={accountId} current={stage} />
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            Assigned rep
          </p>
          <RepControl accountId={accountId} current={assignedUserId} reps={reps} />
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            Address
          </p>
          <p className={`text-[14px] ${fullAddress ? "text-fg" : "text-fg-subtle"}`}>
            {fullAddress || "—"}
          </p>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            Phone numbers
          </p>
          <PhoneList accountId={accountId} phones={phones} emptyText="No phone numbers on file." />
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            Links
          </p>
          <LinkList links={links} emptyText="No links on file." />
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            Commodities
          </p>
          <p className={`text-[14px] ${commodities ? "text-fg" : "text-fg-subtle"}`}>
            {commodities || "—"}
          </p>
        </div>
      </div>
    </Card>
  );
}

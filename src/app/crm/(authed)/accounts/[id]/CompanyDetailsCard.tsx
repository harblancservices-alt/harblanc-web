import type { ReactNode } from "react";
import { Card, CardHead } from "../../_shell/ui";
import { formatMoney } from "../../_shell/format";
import { digitsForTel, type PhoneEntry } from "../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { IconAiAgent } from "../../_shell/icons";
import type { LaneEntry } from "../../_shell/LanesEditor";
import { FreightProfileDialog, type FreightProfileDefaults } from "./FreightProfileDialog";
import { TagsCard, type CrmTagOption } from "./TagsCard";

function SubHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-fg-subtle">{title}</h3>
      {right}
    </div>
  );
}

function Row({ label, value, mono, fromAi }: { label: string; value: ReactNode; mono?: boolean; fromAi?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
        {fromAi && (
          <span
            title="Confirmed from AI research"
            className="inline-flex items-center gap-0.5 bg-warn-bg px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warn"
          >
            <IconAiAgent width={9} height={9} />
            AI
          </span>
        )}
      </p>
      <p className={`mt-1 break-words text-[14px] text-fg ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function Chips({ values }: { values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <span key={v} className="border border-line-strong bg-inset px-2 py-0.5 text-[11.5px] font-medium text-fg">
          {v}
        </span>
      ))}
    </div>
  );
}

function Lanes({ lanes }: { lanes: LaneEntry[] }) {
  if (!lanes.length) return null;
  return (
    <ul className="flex flex-col gap-1">
      {lanes.map((l, i) => (
        <li key={i} className="text-[13.5px] text-fg">
          {l.origin || "?"} <span className="text-fg-subtle">→</span> {l.destination || "?"}
        </li>
      ))}
    </ul>
  );
}

export type CompanyFreightData = {
  commodities: string | null;
  equipmentNeeded: string[];
  lanes: LaneEntry[];
  volumeFrequency: string | null;
  weightRange: string | null;
  specialRequirements: string[];
  confirmed: Record<string, unknown>;
};

/**
 * LEFT column — "Company Details": the single merged card the profile
 * rebuild (2026-08-09) consolidates the old About / Tags / Company owner
 * (left column) and the old standalone Company Details / Freight profile
 * cards into. Same column width as before, just taller — five subsections,
 * top to bottom: About, Location, Phones, Freight profile, Tags. Rows
 * without data are hidden outright, not shown as "—", matching the pattern
 * the pre-rebuild cards already used. The Lifecycle-stage pill that used to
 * live in this card's old right-column incarnation is dropped — the
 * StageTracker directly above this grid is now the one place stage is
 * displayed.
 *
 * 2026-08-09 follow-up: Sales rep (was "Company owner" — always
 * crm_accounts.assigned_user_id, never a literal ownership concept) moved
 * OUT of this card into a compact chip in the top header bar
 * (CompanyHeader.tsx) — it's no longer a subsection here at all.
 */
export function CompanyDetailsCard({
  accountId,
  name,
  email,
  website,
  websiteHref,
  industry,
  companyType,
  companySize,
  annualFreightSpend,
  source,
  description,
  dotNumber,
  mcNumber,
  fullAddress,
  phones,
  legacyPhone,
  freight,
  attachedTags,
  orgTags,
}: {
  accountId: string;
  name: string;
  email: string | null;
  website: string | null;
  websiteHref: string | null;
  industry: string | null;
  companyType: string | null;
  companySize: string | null;
  annualFreightSpend: number | null;
  source: string | null;
  description: string | null;
  dotNumber: string | null;
  mcNumber: string | null;
  fullAddress: string | null;
  phones: PhoneEntry[];
  legacyPhone: string | null;
  freight: CompanyFreightData;
  attachedTags: CrmTagOption[];
  orgTags: CrmTagOption[];
}) {
  const mcDot = [dotNumber ? `DOT ${dotNumber}` : null, mcNumber ? `MC ${mcNumber}` : null].filter(Boolean).join(" · ");
  const phoneRows: PhoneEntry[] = phones.length ? phones : legacyPhone ? [{ label: "Main", number: legacyPhone }] : [];

  const freightDialogDefaults: FreightProfileDefaults = {
    equipment_needed: freight.equipmentNeeded,
    lanes: freight.lanes,
    volume_frequency: freight.volumeFrequency,
    weight_range: freight.weightRange,
    special_requirements: freight.specialRequirements,
  };
  const freightIsEmpty =
    !freight.commodities &&
    !freight.equipmentNeeded.length &&
    !freight.lanes.length &&
    !freight.volumeFrequency &&
    !freight.weightRange &&
    !freight.specialRequirements.length;

  return (
    <Card>
      <CardHead title="Company details" />
      <div className="flex flex-col gap-5 p-5">
        {/* About */}
        <div className="flex flex-col gap-4">
          <SubHead title="About" />
          <Row label="Company name" value={name} />
          {email && (
            <Row
              label="Email"
              value={
                <a href={`mailto:${email}`} className="text-accent hover:underline">
                  {email}
                </a>
              }
            />
          )}
          {websiteHref && (
            <Row
              label="Website"
              value={
                <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  {website}
                </a>
              }
            />
          )}
          {industry && <Row label="Industry" value={industry} />}
          {companyType && <Row label="Company type" value={companyType} />}
          {companySize && <Row label="Employees" value={companySize} />}
          {annualFreightSpend != null && <Row label="Annual revenue" value={formatMoney(annualFreightSpend)} />}
          {source && <Row label="Source" value={source} />}
          {mcDot && <Row label="MC / DOT" value={mcDot} mono />}
          {description && <Row label="Description" value={<span className="whitespace-pre-wrap leading-relaxed">{description}</span>} />}
        </div>

        {/* Location */}
        {fullAddress && (
          <div className="flex flex-col gap-2 border-t border-line-strong pt-4">
            <SubHead title="Location" />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="break-words text-[14px] text-accent hover:underline"
            >
              {fullAddress}
            </a>
          </div>
        )}

        {/* Phones */}
        {phoneRows.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line-strong pt-4">
            <SubHead title="Phones" />
            <div className="flex flex-col gap-2">
              {phoneRows.map((p, i) => (
                <div key={`${p.label}:${p.number}:${i}`} className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-medium text-fg-muted">{p.label || "Phone"}</span>
                  <a
                    href={`tel:${digitsForTel(p.number)}`}
                    className="font-mono text-[13.5px] font-semibold text-accent hover:underline"
                  >
                    {formatPhone(p.number)}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Freight profile */}
        <div className="flex flex-col gap-3 border-t border-line-strong pt-4">
          <SubHead title="Freight profile" right={<FreightProfileDialog accountId={accountId} defaults={freightDialogDefaults} />} />
          {freightIsEmpty ? (
            <p className="text-[13px] text-fg-muted">No freight profile on file yet — commodities, equipment, lanes.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {freight.commodities && <Row label="Commodities" value={freight.commodities} />}
              {freight.equipmentNeeded.length > 0 && (
                <Row
                  label="Equipment needed"
                  value={<Chips values={freight.equipmentNeeded} />}
                  fromAi={!!freight.confirmed.equipment_needed}
                />
              )}
              {freight.lanes.length > 0 && (
                <Row label="Typical lanes" value={<Lanes lanes={freight.lanes} />} fromAi={!!freight.confirmed.lanes} />
              )}
              {freight.volumeFrequency && (
                <Row label="Volume & frequency" value={freight.volumeFrequency} fromAi={!!freight.confirmed.volume_frequency} />
              )}
              {freight.weightRange && (
                <Row label="Weight range" value={freight.weightRange} fromAi={!!freight.confirmed.weight_range} />
              )}
              {freight.specialRequirements.length > 0 && (
                <Row
                  label="Special requirements"
                  value={<Chips values={freight.specialRequirements} />}
                  fromAi={!!freight.confirmed.special_requirements}
                />
              )}
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="border-t border-line-strong pt-4">
          <TagsCard accountId={accountId} attached={attachedTags} orgTags={orgTags} />
        </div>
      </div>
    </Card>
  );
}

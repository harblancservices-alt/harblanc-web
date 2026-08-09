import type { ReactNode } from "react";
import { Card } from "../../_shell/ui";
import { digitsForTel, normalizeHref, type PhoneEntry, type LinkEntry } from "../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { IconAiAgent } from "../../_shell/icons";
import type { LaneEntry } from "../../_shell/LanesEditor";
import { FreightProfileDialog, type FreightProfileDefaults } from "./FreightProfileDialog";
import { TagsCard, type CrmTagOption } from "./TagsCard";
import { EditCompany } from "./EditCompany";
import type { CompanyDefaults, RepOption } from "../CompanyDialog";

/** Bold, dark field-title style — the CRM's high-contrast form standard
 * (near-black, not the faint fg-subtle grey) applied to this card's section
 * labels per the 2026-08-10 "A" design, which explicitly called out the old
 * faint uppercase-tracked grey titles as wrong. */
const FIELD_TITLE = "text-[11.5px] font-bold uppercase tracking-[0.08em] text-fg";

/** Every clickable value in this card is permanently underlined (not just on
 * hover) so it reads as tappable at rest, per the same design note. */
const LINK_CLASS = "text-accent underline decoration-1 underline-offset-2 hover:text-accent-hover";

function Field({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className={FIELD_TITLE}>{label}</p>
        {right}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function LabeledLink({ label, href, text }: { label: string; href: string; text: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-[12px] font-medium text-fg-muted">{label}</span>
      <a href={href} target="_blank" rel="noopener noreferrer" className={`truncate ${LINK_CLASS}`}>
        {text}
      </a>
    </div>
  );
}

function Chips({ values, fromAi }: { values: string[]; fromAi?: boolean }) {
  if (!values.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v) => (
        <span key={v} className="rounded-md border border-line-strong bg-inset px-2 py-0.5 text-[11.5px] font-medium text-fg">
          {v}
        </span>
      ))}
      {fromAi && <AiBadge />}
    </div>
  );
}

function AiBadge() {
  return (
    <span
      title="Confirmed from AI research"
      className="inline-flex items-center gap-0.5 bg-warn-bg px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warn"
    >
      <IconAiAgent width={9} height={9} />
      AI
    </span>
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
 * LEFT column — "Company Details" — rebuilt to the approved "A" design
 * (2026-08-10). No dark CardHead bar anymore: a plain white card, company
 * name large/bold at the top with industry as a small subtitle underneath
 * and a plain-text "Edit" link top-right (opens the same CompanyDialog the
 * profile header's Edit button does — EditCompany's `variant="link"`).
 * No "About" heading, no duplicate Active Customer pill (that lives in the
 * page's title bar now, next to the name) — just name + industry here.
 *
 * Below that: Email / Website / Phone / Location / Socials, each a bold
 * dark field title (no faint grey) over an underlined clickable value, then
 * Freight profile (commodities as pills + equipment/lanes/volume/weight/
 * special requirements, hidden when empty, own Edit trigger unchanged) and
 * Tags. Rows without data are hidden outright, matching the pattern this
 * card has used since the 2026-08-09 rebuild.
 *
 * Company type/Employees/Annual revenue/Source/MC-DOT/Description — real
 * fields the "A" design doesn't name for this card — moved to the
 * "Company profile" card below the grid (CompanyProfileSection.tsx) rather
 * than disappearing from the UI; still edited via the same top-bar Edit
 * dialog either way.
 */
export function CompanyDetailsCard({
  accountId,
  name,
  industry,
  email,
  website,
  websiteHref,
  fullAddress,
  phones,
  legacyPhone,
  linkedinUrl,
  links,
  freight,
  attachedTags,
  orgTags,
  editDefaults,
  reps,
}: {
  accountId: string;
  name: string;
  industry: string | null;
  email: string | null;
  website: string | null;
  websiteHref: string | null;
  fullAddress: string | null;
  phones: PhoneEntry[];
  legacyPhone: string | null;
  linkedinUrl: string | null;
  links: LinkEntry[];
  freight: CompanyFreightData;
  attachedTags: CrmTagOption[];
  orgTags: CrmTagOption[];
  editDefaults: CompanyDefaults & { id: string };
  reps: RepOption[];
}) {
  const phoneRows: PhoneEntry[] = phones.length ? phones : legacyPhone ? [{ label: "Main", number: legacyPhone }] : [];

  // Socials — linkedin_url (its own column) plus every `links` entry that
  // isn't the one already shown as "Website" above, so Facebook/Instagram/
  // a second LinkedIn/whatever else someone added all show up here without
  // a new column (see LINK_LABEL_PRESETS in _shell/contactFields.ts).
  const socialLinks: { label: string; url: string }[] = [
    ...(linkedinUrl ? [{ label: "LinkedIn", url: linkedinUrl }] : []),
    ...links.filter((l) => l.url && l.label?.toLowerCase() !== "website").map((l) => ({ label: l.label || "Link", url: l.url })),
  ];

  const commodityChips = (freight.commodities ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

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
      <div className="flex flex-col gap-5 p-5">
        {/* Name + industry subtitle + Edit link — no "About" label, no
            dark header, no Active Customer pill (that's in the page's
            title bar now). */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[22px] font-bold leading-tight tracking-tight text-fg">{name}</h2>
            {industry && <p className="mt-1 truncate text-[13.5px] font-medium text-fg-muted">{industry}</p>}
          </div>
          <EditCompany defaults={editDefaults} reps={reps} variant="link" />
        </div>

        <div className="flex flex-col gap-4 border-t border-line-strong pt-4">
          {email && (
            <Field label="Email">
              <a href={`mailto:${email}`} className={`text-[14px] font-medium ${LINK_CLASS}`}>
                {email}
              </a>
            </Field>
          )}

          {websiteHref && (
            <Field label="Website">
              <a href={websiteHref} target="_blank" rel="noopener noreferrer" className={`text-[14px] font-medium ${LINK_CLASS}`}>
                {website}
              </a>
            </Field>
          )}

          {phoneRows.length > 0 && (
            <Field label="Phone">
              <div className="flex flex-col gap-1.5">
                {phoneRows.map((p, i) => (
                  <LabeledLink
                    key={`${p.label}:${p.number}:${i}`}
                    label={p.label || "Phone"}
                    href={`tel:${digitsForTel(p.number)}`}
                    text={formatPhone(p.number)}
                  />
                ))}
              </div>
            </Field>
          )}

          {fullAddress && (
            <Field label="Location">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-[14px] font-medium ${LINK_CLASS}`}
              >
                {fullAddress}
              </a>
            </Field>
          )}

          {socialLinks.length > 0 && (
            <Field label="Socials">
              <div className="flex flex-col gap-1.5">
                {socialLinks.map((s, i) => (
                  <LabeledLink key={`${s.label}:${i}`} label={s.label} href={normalizeHref(s.url)} text={s.url} />
                ))}
              </div>
            </Field>
          )}
        </div>

        {/* Freight profile */}
        <div className="border-t border-line-strong pt-4">
          <Field label="Freight Profile" right={<FreightProfileDialog accountId={accountId} defaults={freightDialogDefaults} />}>
            {freightIsEmpty ? (
              <p className="text-[13px] text-fg-muted">No freight profile on file yet — commodities, equipment, lanes.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {commodityChips.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Commodities</p>
                    <Chips values={commodityChips} fromAi={!!freight.confirmed.commodities} />
                  </div>
                )}
                {freight.equipmentNeeded.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Equipment needed</p>
                    <Chips values={freight.equipmentNeeded} fromAi={!!freight.confirmed.equipment_needed} />
                  </div>
                )}
                {freight.lanes.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Typical lanes</p>
                    <Lanes lanes={freight.lanes} />
                  </div>
                )}
                {freight.volumeFrequency && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Volume & frequency</p>
                    <p className="mt-1 text-[13.5px] text-fg">{freight.volumeFrequency}</p>
                  </div>
                )}
                {freight.weightRange && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Weight range</p>
                    <p className="mt-1 text-[13.5px] text-fg">{freight.weightRange}</p>
                  </div>
                )}
                {freight.specialRequirements.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Special requirements</p>
                    <Chips values={freight.specialRequirements} fromAi={!!freight.confirmed.special_requirements} />
                  </div>
                )}
              </div>
            )}
          </Field>
        </div>

        {/* Tags */}
        <div className="border-t border-line-strong pt-4">
          <TagsCard accountId={accountId} attached={attachedTags} orgTags={orgTags} />
        </div>
      </div>
    </Card>
  );
}

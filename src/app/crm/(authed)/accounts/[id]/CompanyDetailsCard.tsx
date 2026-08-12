import type { ReactNode } from "react";
import { Card } from "../../_shell/ui";
import { digitsForTel, normalizeHref, type PhoneEntry, type LinkEntry } from "../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { IconAiAgent, IconFacebook, IconGlobe, IconInstagram, IconLink, IconLinkedIn, IconMail, IconTruck } from "../../_shell/icons";
import type { LaneEntry } from "../../_shell/LanesEditor";
import { FreightProfileDialog, type FreightProfileDefaults } from "./FreightProfileDialog";
import { TagsCard, type CrmTagOption } from "./TagsCard";
import { EditCompany } from "./EditCompany";
import type { CompanyDefaults, RepOption } from "../CompanyDialog";

/** Bold, dark field-title style — the CRM's high-contrast form standard
 * (near-black, not the faint fg-subtle grey). */
const FIELD_TITLE = "text-[11.5px] font-bold uppercase tracking-[0.08em] text-fg";

/** Contact values (email/phone/address) render as bold dark text rather
 * than the old permanently-underlined accent-blue — calmer and more
 * scannable, per the 2026-08-12 relayout. Still a real link (mailto:/tel:/
 * maps), just styled as data first, link second. */
const VALUE_LINK = "text-[14px] font-bold text-fg transition-colors hover:text-accent";

/** Header band styling — navy (bg-accent, which resolves to the CRM's own
 * steel-blue brand color) per Brent's 2026-08-12 call, for depth against the
 * plain-white body below. Kept as its own small block of tokens so a later
 * "make it a light header instead" request is a one-line swap: change
 * HEADER_BAND to something like "bg-card border-b border-line-strong" and
 * HEADER_TEXT/HEADER_SUB/HEADER_MONO to dark-on-light equivalents. */
const HEADER_BAND = "bg-accent";
const HEADER_TEXT = "text-white";
const HEADER_SUB = "text-white/70";
const HEADER_MONO = "border border-white/25 bg-white/15 text-white";

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

/** A small labeled section header — bold dark label + a little colored icon
 * chip — separating Contact / Links / Freight Profile / Tags so the card
 * reads as distinct groups instead of one long list. */
function SectionHeading({ icon, tint, label, right }: { icon: ReactNode; tint: string; label: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${tint}`}>{icon}</span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-fg">{label}</h3>
      </div>
      {right}
    </div>
  );
}

/** Phone row — label as a small pill (not plain muted text) + bold dark
 * tap-to-call value, per the 2026-08-12 "bold dark text, not underlined
 * blue" spec while keeping the label legible as a pill. */
function PhoneRow({ label, href, text }: { label: string; href: string; text: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 rounded-full bg-inset px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fg-muted">{label}</span>
      <a href={href} className={`truncate ${VALUE_LINK}`}>
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

/** Solid green "Active" badge — the header band's compact companion to the
 * page title bar's full "Active Customer" pill (CompanyHeader.tsx). Same
 * #15803d per Brent's spec, just shorter text to fit the tighter band. */
function ActiveBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[#15803d] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      Active
    </span>
  );
}

/** Icon + brand-ish tint for a Links bubble button, keyed off the link's
 * label. Falls back to a neutral chain-link glyph for anything not on the
 * short preset list (e.g. "Load board" or a custom label). */
function bubbleTone(label: string): { icon: ReactNode; bg: string } {
  const key = label.trim().toLowerCase();
  if (key === "website") return { icon: <IconGlobe width={11} height={11} className="text-white" />, bg: "bg-accent" };
  if (key === "linkedin") return { icon: <IconLinkedIn width={11} height={11} className="text-white" />, bg: "bg-[#0a66c2]" };
  if (key === "facebook") return { icon: <IconFacebook width={11} height={11} className="text-white" />, bg: "bg-[#1877f2]" };
  if (key === "instagram") return { icon: <IconInstagram width={11} height={11} className="text-white" />, bg: "bg-[#d62976]" };
  return { icon: <IconLink width={11} height={11} className="text-white" />, bg: "bg-fg-subtle" };
}

/** A tappable pill for Website/LinkedIn/any other social link — a compact
 * colored icon chip + label, replacing the old label-left/truncated-url-
 * right row so several fit per line and the card stays scannable. */
function LinkBubble({ label, href }: { label: string; href: string }) {
  const tone = bubbleTone(label);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-card py-1 pl-1 pr-3 text-[12px] font-semibold text-fg shadow-e1 transition-colors hover:border-accent/40 hover:bg-inset"
    >
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${tone.bg}`}>{tone.icon}</span>
      {label}
    </a>
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
 * LEFT column — "Company Details" — relaid out 2026-08-12 to a header-band +
 * sectioned design. A navy header band (HEADER_BAND, above) carries the
 * company monogram, name, industry subtitle, an "Active" badge for active
 * customers, and the Edit trigger; the plain-white body below is split into
 * four clearly separated groups (each its own small icon-chip header + a
 * divider): Contact (email/phone/location, bold dark values instead of
 * underlined blue), Links (Website/LinkedIn/any other social as tappable
 * bubble buttons instead of label-left/url-right rows), Freight Profile
 * (commodities now shown as chips + their own "+ Add commodity" trigger,
 * since commodities have no dedicated inline picker and are only ever
 * edited through the main CompanyDialog — see EditCompany's "pill" variant;
 * equipment/lanes/volume/weight/special still go through FreightProfileDialog
 * unchanged), and Tags (TagsCard — attached-only by default, full picker
 * collapsed behind "+ Add tag"). Rows/sections without data stay hidden,
 * matching this card's behavior since the 2026-08-09 rebuild.
 *
 * Company type/Employees/Annual revenue/Source/MC-DOT/Description — real
 * fields this design doesn't name for this card — still live in the
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
  isActiveCustomer,
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
  isActiveCustomer: boolean;
}) {
  const phoneRows: PhoneEntry[] = phones.length ? phones : legacyPhone ? [{ label: "Main", number: legacyPhone }] : [];
  const hasContact = !!email || phoneRows.length > 0 || !!fullAddress;

  // Links — Website + linkedin_url (its own column) + every `links` entry
  // that isn't the one already carrying the "Website" label, all rendered as
  // bubble buttons (see LINK_LABEL_PRESETS in _shell/contactFields.ts).
  const linkBubbles: { label: string; href: string }[] = [
    ...(websiteHref ? [{ label: "Website", href: websiteHref }] : []),
    ...(linkedinUrl ? [{ label: "LinkedIn", href: normalizeHref(linkedinUrl) }] : []),
    ...links.filter((l) => l.url && l.label?.toLowerCase() !== "website").map((l) => ({ label: l.label || "Link", href: normalizeHref(l.url) })),
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
  // Commodities have their own always-visible subsection/trigger below, so
  // "empty" here only covers the fields FreightProfileDialog actually edits.
  const otherFreightEmpty =
    !freight.equipmentNeeded.length && !freight.lanes.length && !freight.volumeFrequency && !freight.weightRange && !freight.specialRequirements.length;

  const monogram = (name || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <Card>
      {/* Header band */}
      <div className={`flex items-start justify-between gap-3 px-5 py-4 ${HEADER_BAND}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[16px] font-black ${HEADER_MONO}`}>
            {monogram}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`truncate text-[17px] font-bold leading-tight ${HEADER_TEXT}`}>{name}</h2>
              {isActiveCustomer && <ActiveBadge />}
            </div>
            {industry && <p className={`mt-0.5 truncate text-[12px] font-medium ${HEADER_SUB}`}>{industry}</p>}
          </div>
        </div>
        <EditCompany defaults={editDefaults} reps={reps} variant="onDark" />
      </div>

      <div className="flex flex-col gap-5 p-5">
        {/* Contact */}
        {hasContact && (
          <div className="flex flex-col gap-3">
            <SectionHeading icon={<IconMail width={12} height={12} />} tint="bg-accent/10 text-accent" label="Contact" />
            <div className="flex flex-col gap-4">
              {email && (
                <Field label="Email">
                  <a href={`mailto:${email}`} className={VALUE_LINK}>
                    {email}
                  </a>
                </Field>
              )}

              {phoneRows.length > 0 && (
                <Field label="Phone">
                  <div className="flex flex-col gap-1.5">
                    {phoneRows.map((p, i) => (
                      <PhoneRow
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
                    className={VALUE_LINK}
                  >
                    {fullAddress}
                  </a>
                </Field>
              )}
            </div>
          </div>
        )}

        {/* Links */}
        {linkBubbles.length > 0 && (
          <div className={`flex flex-col gap-3 ${hasContact ? "border-t border-line-strong pt-4" : ""}`}>
            <SectionHeading icon={<IconLink width={12} height={12} />} tint="bg-[#7c3aed]/10 text-[#7c3aed]" label="Links" />
            <div className="flex flex-wrap gap-2">
              {linkBubbles.map((b, i) => (
                <LinkBubble key={`${b.label}:${i}`} label={b.label} href={b.href} />
              ))}
            </div>
          </div>
        )}

        {/* Freight profile */}
        <div className={`flex flex-col gap-3 ${hasContact || linkBubbles.length > 0 ? "border-t border-line-strong pt-4" : ""}`}>
          <SectionHeading
            icon={<IconTruck width={13} height={13} />}
            tint="bg-ok/10 text-ok"
            label="Freight Profile"
            right={<FreightProfileDialog accountId={accountId} defaults={freightDialogDefaults} />}
          />
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Commodities</p>
                <EditCompany defaults={editDefaults} reps={reps} variant="pill" label="Add commodity" />
              </div>
              {commodityChips.length > 0 ? (
                <Chips values={commodityChips} fromAi={!!freight.confirmed.commodities} />
              ) : (
                <p className="text-[12.5px] text-fg-muted">No commodities on file yet.</p>
              )}
            </div>

            {otherFreightEmpty ? (
              <p className="text-[13px] text-fg-muted">No equipment, lanes, or other freight details on file yet.</p>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="border-t border-line-strong pt-4">
          <TagsCard accountId={accountId} attached={attachedTags} orgTags={orgTags} />
        </div>
      </div>
    </Card>
  );
}

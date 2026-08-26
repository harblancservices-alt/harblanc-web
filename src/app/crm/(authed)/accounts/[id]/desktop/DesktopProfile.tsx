import type { ReactNode } from "react";
import type { CompanyDefaults, RepOption } from "../../CompanyDialog";
import type { CrmActivityLogItem } from "../ActivityLogSection";
import type { CrmTagOption } from "../TagsCard";
import type { LocationListItem } from "../LocationRow";
import type { PhoneEntry } from "../../../_shell/contactFields";
import type { StrayContactOption } from "../StrayNumbersSection";
import { StageTrackerSection } from "../StageTrackerSection";
import { CommoditiesCard } from "../CommoditiesCard";
import { TagsCard } from "../TagsCard";
import { StrayNumbersSection } from "../StrayNumbersSection";
import { EditCompany } from "../EditCompany";
import { ProfileTopBar } from "./ProfileTopBar";
import { ContactsWheel, type WheelContact } from "./ContactsWheel";
import { FollowUpBanner } from "./FollowUpBanner";
import { LocationsCard } from "./LocationsCard";
import { EnrichmentCard } from "./EnrichmentCard";
import { ProfileSection, ProfileBlock } from "./ProfileSection";
import { ContactBlock } from "./ContactBlock";
import { DetailsGrid, countFilled, DETAIL_FIELD_COUNT, type CompanyDetails } from "./DetailsGrid";
import { HistoryBlock } from "./HistoryBlock";
import { titleCaseWords, upperCaseState } from "../../../_shell/format";

export type DesktopFollowUp = { taskId: string; title: string; notes: string | null; dueAt: string };

/**
 * The DESKTOP company profile, rebuilt 2026-08-26 (Brent: "right now its
 * sooo cluttered").
 *
 * The old page carried 43 distinct elements. An inventory against the real
 * book found the reason: it was built for a data model nobody fills — 14 of
 * the 24 company fields are empty on all 99 companies, Shipments is empty on
 * 98, Tags on 97, commodity photos on all of them. The layout reserved
 * structure for all of it.
 *
 * This is ~25 elements, about 11 visible at rest, in ONE SCROLL. No tabs:
 * five tabs meant five panels mounted at once and hid the two things every
 * company has — its history and its people — behind a click.
 *
 * Every section is in one of three states (see ProfileSection):
 *
 *   ALWAYS OPEN   name · stage · owner · trade and town · people ·
 *                 company numbers · next thing owed · open tasks · history
 *   COLLAPSED     notes · details · links · address · other addresses ·
 *                 what they ship · tags
 *   ABSENT        shipments · bills of lading · loose numbers · imported
 *                 data — the section does not render at all when empty
 *
 * FIVE MERGES landed here: the two edit forms became one (CompanyDialog
 * absorbed the four fields the second one owned), the two history views
 * became one (HistoryBlock), the company's call/email buttons and phone and
 * email rows became one (ContactBlock), "At a glance" and the details grid
 * became one (DetailsGrid), and the company name is printed once.
 *
 * CUT: the duplicate name, the monogram, "At a glance", commodity photos,
 * the second edit form, and the "Stage 1 of 10 · 0%" readout. Nothing was
 * deleted from the database — commodity photos in particular keep their
 * storage and their rows; only the UI is gone.
 *
 * Still a Server Component that hands already-rendered ReactNode panels to
 * client components. No function prop crosses the boundary — this route has
 * 500'd on exactly that before.
 *
 * Mobile is untouched: page.tsx renders mobile/MobileProfile under
 * `lg:hidden` and this tree under `hidden lg:block`.
 */
export function DesktopProfile({
  accountId,
  accountName,
  industry,
  city,
  state,
  stage,
  ownerId,
  ownerLabel,
  currentUserId,
  isAdmin,
  editDefaults,
  reps,
  canDelete,
  email,
  phones,
  fullAddress,
  links,
  contacts,
  details,
  commodities,
  attachedTags,
  orgTags,
  followUp,
  activityItems,
  notesCount,
  strayContacts,
  locations,
  custom,
  notesPanel,
  shipmentsPanel,
  hasShipments,
  tasksPanel,
  documentsPanel,
  hasDocuments,
}: {
  accountId: string;
  accountName: string;
  industry: string | null;
  city: string | null;
  state: string | null;
  stage: string;
  ownerId: string | null;
  ownerLabel: string | null;
  currentUserId: string;
  isAdmin: boolean;
  editDefaults: CompanyDefaults & { id: string };
  reps: RepOption[];
  canDelete: boolean;
  email: string | null;
  phones: PhoneEntry[];
  fullAddress: string | null;
  links: { label: string; href: string }[];
  contacts: WheelContact[];
  details: CompanyDetails;
  commodities: string[];
  attachedTags: CrmTagOption[];
  orgTags: CrmTagOption[];
  followUp: DesktopFollowUp | null;
  activityItems: CrmActivityLogItem[];
  notesCount: number;
  strayContacts: StrayContactOption[];
  locations: LocationListItem[];
  custom: Record<string, unknown> | null;
  notesPanel: ReactNode;
  shipmentsPanel: ReactNode;
  /** Whether this company has ANY loads — decides if the section exists. */
  hasShipments: boolean;
  tasksPanel: ReactNode;
  documentsPanel: ReactNode;
  hasDocuments: boolean;
}) {
  const place = [titleCaseWords(city), upperCaseState(state)].filter(Boolean).join(", ");
  const trade = (industry ?? "").trim();
  const filled = countFilled(details);
  const hasCustom = !!custom && Object.keys(custom).length > 0;

  /** The one edit form, reached from wherever a gap is visible. */
  const editLink = (label: string) => (
    <EditCompany defaults={editDefaults} reps={reps} canAssign={isAdmin} variant="link" label={label} />
  );

  return (
    <div>
      <ProfileTopBar
        name={accountName}
        accountId={accountId}
        stage={stage}
        ownerId={ownerId}
        ownerLabel={ownerLabel}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        editDefaults={editDefaults}
        reps={reps}
        canDelete={canDelete}
      />

      <div className="border-b border-line-strong bg-card px-6 py-2.5">
        <StageTrackerSection accountId={accountId} accountName={accountName} stage={stage} variant="strip" />
      </div>

      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-3 px-6 py-5">
        {/* WHO AND WHERE — trade and town, and the gap buttons for both.
            Missing values are buttons where you would fix them, which is the
            same idea as the completeness gaps on the dashboard. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1 text-[13px]">
          {trade ? (
            <span className="font-semibold text-fg">{trade}</span>
          ) : (
            editLink("+ industry")
          )}
          {place ? (
            <span className="text-fg-muted">{place}</span>
          ) : (
            editLink("+ location")
          )}
        </div>

        {followUp && (
          <FollowUpBanner
            taskId={followUp.taskId}
            title={followUp.title}
            notes={followUp.notes}
            dueAt={followUp.dueAt}
          />
        )}

        {/* ── ALWAYS OPEN ────────────────────────────────────────────── */}

        {/* ContactsWheel brings its own card, header and "+ Add", so it is
            rendered BARE — wrapping it in a ProfileBlock put a header above a
            header. It is still an always-visible section; it just supplies
            its own chrome. */}
        <ContactsWheel accountId={accountId} contacts={contacts} />

        <ProfileBlock title="Company number">
          <ContactBlock phones={phones} email={email} addGap={editLink("+ number")} />
        </ProfileBlock>

        {/* TasksTab supplies its own heading and Add button but NOT a card,
            so unlike ContactsWheel it needs the border — without it the
            section floated on the page background while every neighbour sat
            on a card. Header-less wrapper: the panel already has one. */}
        <section className="rounded-lg border border-line-strong bg-card shadow-e1">
          {tasksPanel}
        </section>

        <ProfileBlock title="History" count={String(activityItems.length)}>
          <HistoryBlock accountId={accountId} items={activityItems} />
        </ProfileBlock>

        {/* ── COLLAPSED ──────────────────────────────────────────────── */}

        <ProfileSection title="Notes" count={notesCount ? String(notesCount) : null}>
          {notesPanel}
        </ProfileSection>

        {/* Collapsed WITH A COUNT, deliberately. Eight of these eleven fields
            are near-empty across the book, so "2 of 11" tells you whether
            opening it is worth the click — which a bare chevron does not. */}
        <ProfileSection title="Details" count={`${filled} of ${DETAIL_FIELD_COUNT}`}>
          <DetailsGrid details={details} editAction={editLink(filled ? "Edit details" : "+ add details")} />
        </ProfileSection>

        <ProfileSection title="Links" count={links.length ? String(links.length) : null}>
          {links.length ? (
            <ul className="flex flex-col gap-1">
              {/* key includes the index: a company can legitimately carry the
                  same URL twice (Metallic Products has its LinkedIn listed
                  twice), and href alone threw a duplicate-key error. */}
              {links.map((l, i) => (
                <li key={`${l.href}-${i}`}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12.5px] text-accent hover:underline"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-fg-muted">No website or links on file. {editLink("+ link")}</p>
          )}
        </ProfileSection>

        <ProfileSection title="Address">
          {fullAddress ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
              target="_blank"
              rel="noreferrer"
              className="text-[12.5px] text-accent hover:underline"
            >
              {fullAddress}
            </a>
          ) : (
            <p className="text-[12.5px] text-fg-muted">No street address on file. {editLink("+ address")}</p>
          )}
        </ProfileSection>

        <ProfileSection title="Other addresses" count={locations.length ? String(locations.length) : null}>
          <LocationsCard accountId={accountId} locations={locations} />
        </ProfileSection>

        <ProfileSection title="What they ship" count={commodities.length ? String(commodities.length) : null}>
          <CommoditiesCard accountId={accountId} commodities={commodities} />
        </ProfileSection>

        <ProfileSection title="Tags" count={attachedTags.length ? String(attachedTags.length) : null}>
          <TagsCard accountId={accountId} attached={attachedTags} orgTags={orgTags} />
        </ProfileSection>

        {/* ── ONLY WHEN IT EXISTS ────────────────────────────────────── */}

        {hasShipments && (
          <ProfileSection title="Loads">{shipmentsPanel}</ProfileSection>
        )}

        {hasDocuments && (
          <ProfileSection title="Bills of lading">{documentsPanel}</ProfileSection>
        )}

        {phones.length > 0 && (
          <ProfileSection title="Loose numbers">
            <StrayNumbersSection
              accountId={accountId}
              phones={phones}
              contacts={strayContacts}
              variant="compact"
            />
          </ProfileSection>
        )}

        {hasCustom && (
          <ProfileSection title="Imported data">
            <EnrichmentCard custom={custom} />
          </ProfileSection>
        )}
      </div>
    </div>
  );
}

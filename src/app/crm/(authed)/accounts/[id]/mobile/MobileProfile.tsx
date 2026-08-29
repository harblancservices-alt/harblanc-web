import type { ReactNode } from "react";
import type { PhoneEntry } from "../../../_shell/contactFields";
import { IconDashboard, IconFile, IconNote, IconTasks, IconTruck } from "../../../_shell/icons";
import type { CompanyDefaults, RepOption } from "../../CompanyDialog";
import type { CrmActivityLogItem } from "../ActivityLogSection";
import type { CrmTagOption } from "../TagsCard";
import type { StrayContactOption } from "../StrayNumbersSection";
import { CommoditiesCard } from "../CommoditiesCard";
import { TagsCard } from "../TagsCard";
import { StrayNumbersSection } from "../StrayNumbersSection";
import { EditCompany } from "../EditCompany";
import { LocationsSection } from "../LocationsSection";
import { CustomFieldsCard } from "../CustomFieldsCard";
import { MobileHeader } from "./MobileHeader";
import { MobileFollowUp } from "./MobileFollowUp";
import { MobileContact, MobileLinks } from "./MobileContact";
import { MobileFacts, type MobileGlanceFacts } from "./MobileFacts";
import { MobilePeople, type MobilePerson } from "./MobilePeople";
import { MobileActivity } from "./MobileActivity";
import { AddPersonLink } from "./HeaderActions";
import { CardHeading, MobileAccordion, SectionHead } from "./parts";
import { M_CARD } from "./ui";

export type MobileFollowUpTask = { taskId: string; title: string; notes: string | null; dueAt: string };

/**
 * The MOBILE (`lg:hidden`) company profile — Brent's approved 2026-08-23
 * redesign, one column at 390px with no horizontal scroll.
 *
 * What this replaced and why (both from Brent's phone screenshots):
 *
 *   1. TWO headers. The white CompanyHeader card and CompanyDetailsCard's
 *      navy `bg-accent` band both named the company and both offered an
 *      Edit, ~120px apart. They are now one sticky identity block
 *      (MobileHeader) — one name, one Edit, one rep chip, plus Log call and
 *      Add person.
 *   2. SIDEWAYS SCROLL. The old two-column wrapper was `grid gap-4
 *      lg:grid-cols-[300px_1fr]` with no mobile column template, so the
 *      implicit `auto` track sized to min-content and pushed the document
 *      past the viewport (the dark gutter on the right of the screenshots
 *      was `body` showing past `.crm-light`). There is no such grid here;
 *      every section is a full-width block in one flex column.
 *   3. The 6-stage chevron chain needed 622px and scrolled under your thumb.
 *      It is now StageTracker's `variant="compact"` — a six-segment progress
 *      bar plus a bottom-sheet picker, writing through the same
 *      `updateLifecycleStatus`.
 *
 * REUSE, not reimplementation: every write on this screen is an existing
 * server action reached through the component that already owned it —
 * LogCallDialog, ContactDialog, CompanyDialog, ClaimCompanyButton/
 * assignAccount, StageTrackerSection, completeTask/snoozeTask, CommoditiesCard,
 * TagsCard, StrayNumbersSection, TasksTab/TaskRow, LocationsSection, NotesTab,
 * ShipmentsTab, FilesTab, CompanyProfileSection, ActivityLogSection. The
 * heavy panels the old tab strip kept permanently mounted now sit in
 * `<details>` accordions, rendering the SAME components — nothing Brent uses
 * today was dropped.
 *
 * Server Component. Panels that are async Server Components (ShipmentsTab,
 * CompanyProfileSection, LocationsSection) are passed in or rendered directly
 * as ReactNodes; no function prop crosses into a client component anywhere in
 * this tree.
 */
export function MobileProfile({
  accountId,
  accountName,
  industry,
  source,
  bolRole,
  city,
  state,
  stage,
  repLabel,
  currentUserId,
  isAdmin,
  editDefaults,
  reps,
  canDelete,
  finalizeBanner,
  followUp,
  phones,
  legacyPhone,
  email,
  fullAddress,
  links,
  commodities,
  commoditiesFromAi,
  glance,
  people,
  strayContacts,
  attachedTags,
  orgTags,
  activityItems,
  notesCount,
  openTaskCount,
  documentCount,
  custom,
  tasksPanel,
  activityPanel,
  notesPanel,
  shipmentsPanel,
  documentsPanel,
  linkedPanel,
  companyProfilePanel,
}: {
  accountId: string;
  accountName: string;
  industry: string | null;
  /** crm_accounts.source / bol_role — the provenance pills on the header. */
  source: string | null;
  bolRole: string | null;
  city: string | null;
  state: string | null;
  stage: string;
  repLabel: string | null;
  currentUserId: string;
  isAdmin: boolean;
  editDefaults: CompanyDefaults & { id: string };
  reps: RepOption[];
  canDelete: boolean;
  /** Pre-built FinalizeBanner, or null — kept as a node so page.tsx owns the
   * `needs_finalize` condition exactly once for both trees. */
  finalizeBanner: ReactNode;
  /** Soonest open dated task, or null when nothing is owed. */
  followUp: MobileFollowUpTask | null;
  phones: PhoneEntry[];
  legacyPhone: string | null;
  email: string | null;
  fullAddress: string | null;
  links: { label: string; href: string }[];
  commodities: string[];
  commoditiesFromAi: boolean;
  glance: MobileGlanceFacts;
  people: MobilePerson[];
  strayContacts: StrayContactOption[];
  attachedTags: CrmTagOption[];
  orgTags: CrmTagOption[];
  activityItems: CrmActivityLogItem[];
  notesCount: number;
  openTaskCount: number;
  documentCount: number;
  custom: Record<string, unknown> | null;
  tasksPanel: ReactNode;
  activityPanel: ReactNode;
  notesPanel: ReactNode;
  shipmentsPanel: ReactNode;
  documentsPanel: ReactNode;
  /** The "Linked company" card — brings its own chrome, renders null
   * when this company shares no BOL with another live one. */
  linkedPanel: ReactNode;
  companyProfilePanel: ReactNode;
}) {
  return (
    <div className="pb-6">
      <MobileHeader
        accountId={accountId}
        accountName={accountName}
        industry={industry}
        source={source}
        bolRole={bolRole}
        city={city}
        state={state}
        stage={stage}
        repLabel={repLabel}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        editDefaults={editDefaults}
        reps={reps}
        canDelete={canDelete}
      />

      <div className="flex flex-col gap-[11px] px-3 pt-[11px]">
        {finalizeBanner}

        {/* NEAR THE TOP, unlike desktop. The phone has no "What we know"
            panel to hang this off — its only BOL surface is the Documents
            file list, which is a list of files rather than of parsed
            parties. So it sits with the other provenance context just
            under the header, above Contact, where an agent about to call
            somebody can see that the other end of the load is on file. */}
        {linkedPanel}

        {followUp && (
          <MobileFollowUp
            taskId={followUp.taskId}
            title={followUp.title}
            notes={followUp.notes}
            dueAt={followUp.dueAt}
          />
        )}

        {/* ── CONTACT ─────────────────────────────────────────────── */}
        <SectionHead
          label="Contact"
          action={<EditCompany defaults={editDefaults} reps={reps} canAssign={isAdmin} variant="link" />}
        />
        <div className={M_CARD}>
          <MobileContact phones={phones} legacyPhone={legacyPhone} email={email} fullAddress={fullAddress} />
        </div>

        {/* ── LINKS ───────────────────────────────────────────────── */}
        <SectionHead
          label="Links"
          action={
            <EditCompany defaults={editDefaults} reps={reps} canAssign={isAdmin} variant="link" label="+ Add link" />
          }
        />
        <div className={M_CARD}>
          <MobileLinks links={links} />
        </div>

        {/* ── COMMODITIES (brings its own heading + picker) ────────── */}
        <div className={`${M_CARD} px-[13px] py-3`}>
          <CommoditiesCard accountId={accountId} commodities={commodities} fromAi={commoditiesFromAi} />
        </div>

        {/* ── AT A GLANCE ─────────────────────────────────────────── */}
        <div className={M_CARD}>
          <CardHeading
            icon={<IconDashboard width={14} height={14} />}
            tint="bg-accent/10 text-accent"
            label="At a glance"
          />
          <MobileFacts facts={glance} />
        </div>

        {/* ── PEOPLE ──────────────────────────────────────────────── */}
        <SectionHead label="People" count={people.length} action={<AddPersonLink accountId={accountId} />} />
        <div className={M_CARD}>
          <MobilePeople accountId={accountId} companyName={accountName} people={people} companyPhones={phones} />
        </div>

        {/* Company numbers not yet tied to a person — unchanged component,
            unchanged assign / create-contact flows. */}
        <StrayNumbersSection accountId={accountId} phones={phones} contacts={strayContacts} />

        {/* ── TASKS (real TaskRow cards: Done / Log call / Snooze / ⋯) ── */}
        <SectionHead label="Open tasks" count={openTaskCount} />
        <div className={M_CARD}>{tasksPanel}</div>

        {/* ── ACTIVITY ────────────────────────────────────────────── */}
        <SectionHead label="Activity" />
        <div className={M_CARD}>
          <MobileActivity items={activityItems} />
        </div>

        {/* ── LOCATIONS (self-fetching, brings its own Card) ───────── */}
        <LocationsSection accountId={accountId} />

        {/* ── TAGS (brings its own heading + picker) ───────────────── */}
        <div className={`${M_CARD} px-[13px] py-3`}>
          <TagsCard accountId={accountId} attached={attachedTags} orgTags={orgTags} />
        </div>

        {/* ── MORE — the old tab strip's panels, same components ───── */}
        <SectionHead label="More" />

        <MobileAccordion label="Shipments" icon={<IconTruck width={15} height={15} />}>
          {shipmentsPanel}
        </MobileAccordion>

        <MobileAccordion label="Documents" count={documentCount} icon={<IconFile width={15} height={15} />}>
          {documentsPanel}
        </MobileAccordion>

        <MobileAccordion label="Notes" count={notesCount} icon={<IconNote width={15} height={15} />}>
          {notesPanel}
        </MobileAccordion>

        <MobileAccordion
          label="Full history"
          count={activityItems.length}
          icon={<IconTasks width={15} height={15} />}
        >
          {activityPanel}
        </MobileAccordion>

        <MobileAccordion
          label="Company profile & enrichment"
          icon={<IconDashboard width={15} height={15} />}
        >
          <div className="flex flex-col gap-3 p-3">
            {companyProfilePanel}
            <CustomFieldsCard custom={custom} />
          </div>
        </MobileAccordion>
      </div>
    </div>
  );
}

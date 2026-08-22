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
import { ProfileTopBar } from "./ProfileTopBar";
import { IdentityCard, type IdentityLink } from "./IdentityCard";
import { ContactsWheel, type WheelContact } from "./ContactsWheel";
import { AtAGlanceCard, type GlanceFacts } from "./AtAGlanceCard";
import { FollowUpBanner } from "./FollowUpBanner";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { ActivityFeed } from "./ActivityFeed";
import { LocationsCard } from "./LocationsCard";
import { CompanyProfileGrid, type ProfileFacts } from "./CompanyProfileGrid";
import { EnrichmentCard } from "./EnrichmentCard";
import { D_CAP, D_CARD } from "./ui";

export type DesktopFollowUp = { taskId: string; title: string; notes: string | null; dueAt: string };

/**
 * The DESKTOP (lg:) company profile — the design handoff rebuilt in the
 * CRM's own token system ("hybrid skin", Brent's 2026-08-22 call):
 *
 *   sticky top bar
 *   pipeline stage strip (the real 6-stage lifecycle, same writes)
 *   296px identity rail | 1fr workspace
 *     rail:  Company · Contacts wheel · At a glance · Commodities · Tags
 *     main:  next-follow-up banner · workspace tabs
 *            (Overview = activity preview + notes) ·
 *            Locations + Stray numbers side by side ·
 *            Company profile grid · Enrichment data
 *
 * This is a LAYOUT rebuild, not a data change. It is a Server Component that
 * only ever hands plain serializable props (or already-built ReactNode
 * panels) to the existing client components — StageTrackerSection,
 * CommoditiesCard, TagsCard, StrayNumbersSection, NotesTab, TasksTab,
 * ActivityLogSection, ShipmentsTab, FilesTab, CompanyDialog/ContactDialog/
 * LocationDialog/LogCallDialog. No function prop crosses the RSC boundary
 * (this route has 500'd on exactly that before).
 *
 * Mobile is untouched: page.tsx renders the pre-existing layout under
 * `lg:hidden` and this tree under `hidden lg:block`, so nothing about the
 * phone profile changes.
 */
export function DesktopProfile({
  accountId,
  accountName,
  industry,
  city,
  stage,
  ownerLabel,
  editDefaults,
  reps,
  canDelete,
  email,
  phones,
  fullAddress,
  links,
  contacts,
  glance,
  commodities,
  commoditiesFromAi,
  attachedTags,
  orgTags,
  followUp,
  activityItems,
  notesCount,
  strayContacts,
  locations,
  profileFacts,
  custom,
  activityPanel,
  notesPanel,
  shipmentsPanel,
  tasksPanel,
  tasksCount,
  documentsPanel,
}: {
  accountId: string;
  accountName: string;
  industry: string | null;
  city: string | null;
  stage: string;
  ownerLabel: string | null;
  editDefaults: CompanyDefaults & { id: string };
  reps: RepOption[];
  canDelete: boolean;
  email: string | null;
  phones: PhoneEntry[];
  fullAddress: string | null;
  links: IdentityLink[];
  contacts: WheelContact[];
  glance: GlanceFacts;
  commodities: string[];
  commoditiesFromAi: boolean;
  attachedTags: CrmTagOption[];
  orgTags: CrmTagOption[];
  /** Soonest open dated task, or null when nothing is owed. */
  followUp: DesktopFollowUp | null;
  activityItems: CrmActivityLogItem[];
  notesCount: number;
  strayContacts: StrayContactOption[];
  locations: LocationListItem[];
  profileFacts: ProfileFacts;
  custom: Record<string, unknown> | null;
  activityPanel: ReactNode;
  notesPanel: ReactNode;
  shipmentsPanel: ReactNode;
  tasksPanel: ReactNode;
  tasksCount: number;
  documentsPanel: ReactNode;
}) {
  return (
    <div>
      <ProfileTopBar
        name={accountName}
        accountId={accountId}
        stage={stage}
        ownerLabel={ownerLabel}
        editDefaults={editDefaults}
        reps={reps}
        canDelete={canDelete}
      />

      <div className="border-b border-line-strong bg-card px-6 py-2.5">
        <StageTrackerSection accountId={accountId} accountName={accountName} stage={stage} variant="strip" />
      </div>

      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[296px_1fr] items-start gap-5 px-6 py-5">
        {/* ── Left identity rail ─────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <IdentityCard
            accountId={accountId}
            name={accountName}
            industry={industry}
            city={city}
            email={email}
            phones={phones}
            fullAddress={fullAddress}
            links={links}
          />

          <ContactsWheel accountId={accountId} contacts={contacts} />

          <AtAGlanceCard facts={glance} />

          <div className={`${D_CARD} p-4 px-[18px]`}>
            <CommoditiesCard accountId={accountId} commodities={commodities} fromAi={commoditiesFromAi} />
          </div>

          <div className={`${D_CARD} p-4 px-[18px]`}>
            <TagsCard accountId={accountId} attached={attachedTags} orgTags={orgTags} />
          </div>
        </div>

        {/* ── Main workspace ─────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          {followUp && (
            <FollowUpBanner
              taskId={followUp.taskId}
              title={followUp.title}
              notes={followUp.notes}
              dueAt={followUp.dueAt}
            />
          )}

          <WorkspaceTabs
            overviewActivity={<ActivityFeed items={activityItems} />}
            overviewNotes={notesPanel}
            notesCount={notesCount}
            activity={activityPanel}
            activityCount={activityItems.length}
            shipments={shipmentsPanel}
            tasks={tasksPanel}
            tasksCount={tasksCount}
            documents={documentsPanel}
          />

          <div className="grid grid-cols-2 items-start gap-4">
            <LocationsCard accountId={accountId} locations={locations} />
            {phones.length > 0 ? (
              <StrayNumbersSection
                accountId={accountId}
                phones={phones}
                contacts={strayContacts}
                variant="compact"
              />
            ) : (
              <div className={`${D_CARD} p-4 px-[18px]`}>
                <div className={D_CAP}>Stray numbers</div>
                <p className="mt-2 text-[12.5px] text-fg-muted">
                  No company-level numbers waiting to be tied to a person.
                </p>
              </div>
            )}
          </div>

          <CompanyProfileGrid accountId={accountId} facts={profileFacts} />

          <EnrichmentCard custom={custom} />
        </div>
      </div>
    </div>
  );
}

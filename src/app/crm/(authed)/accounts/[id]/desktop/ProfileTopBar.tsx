import { Badge } from "../../../_shell/ui";
import { BackButton } from "../../../_shell/BackButton";
import { stageBadgeTone, stageLabel } from "../../lifecycle";
import { EditCompany } from "../EditCompany";
import { CompanyMoreMenu } from "../CompanyMoreMenu";
import { AssignmentControl } from "./AssignmentControl";
import type { CompanyDefaults, RepOption } from "../../CompanyDialog";

/**
 * DESKTOP-ONLY sticky top bar (design handoff §Layout 1) — "← Companies"
 * back link · divider · name · stage chip · owner control ·
 * More · Edit, in one 56px white row that stays pinned while the profile
 * scrolls. The window is the scroll container (CrmShell's <main> doesn't
 * scroll independently — only the sidebar is sticky), so `sticky top-0`
 * behaves.
 *
 * The owner slot used to be a read-only chip; it's now AssignmentControl —
 * claim / reassign / unassign, with the rule enforced in
 * accounts/actions.ts::assignAccount, not here.
 *
 * Server Component: every interactive piece is an existing CLIENT component
 * that already owns its own handlers (BackButton, CompanyMoreMenu,
 * EditCompany → CompanyDialog). Nothing here passes a function across the
 * boundary — see the standing RSC rule this route has 500'd over before.
 *
 * The mobile profile has its own header (mobile/MobileHeader.tsx); this is
 * the lg: counterpart, not a replacement. (This used to name
 * CompanyHeader.tsx, deleted 2026-08-26 as an orphan.)
 */
export function ProfileTopBar({
  name,
  accountId,
  stage,
  ownerId,
  ownerLabel,
  currentUserId,
  isAdmin,
  editDefaults,
  reps,
  canDelete,
}: {
  name: string;
  accountId: string;
  stage: string;
  /** crm_accounts.assigned_user_id, or null when the company is unclaimed. */
  ownerId: string | null;
  /** Assigned rep's display name, or null when the company is unassigned. */
  ownerLabel: string | null;
  currentUserId: string;
  /** role === 'owner' — gates the reassign/unassign affordances only. */
  isAdmin: boolean;
  editDefaults: CompanyDefaults & { id: string };
  reps: RepOption[];
  canDelete: boolean;
}) {
  return (
    <div className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line-strong bg-card px-6">
      <BackButton
        fallbackHref="/crm/accounts"
        label="Companies"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:text-fg"
      />
      <span aria-hidden className="h-5 w-px shrink-0 bg-line-strong" />

      <div className="flex min-w-0 items-center gap-2.5">
        <span className="min-w-0 truncate text-[15px] font-bold text-fg">{name}</span>
        <span className="shrink-0">
          <Badge tone={stageBadgeTone(stage)}>{stageLabel(stage)}</Badge>
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[12px] font-medium text-fg-muted">Owner</span>
        <AssignmentControl
          accountId={accountId}
          ownerId={ownerId}
          ownerLabel={ownerLabel}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          reps={reps}
        />
        <CompanyMoreMenu accountId={accountId} accountName={name} canDelete={canDelete} />
        <EditCompany defaults={editDefaults} reps={reps} canDelete={canDelete} canAssign={isAdmin} />
      </div>
    </div>
  );
}

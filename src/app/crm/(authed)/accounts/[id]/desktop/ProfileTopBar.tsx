import { Badge } from "../../../_shell/ui";
import { BackButton } from "../../../_shell/BackButton";
import { CompanyAvatar } from "../../../_shell/InitialAvatar";
import { stageBadgeTone, stageLabel } from "../../lifecycle";
import { EditCompany } from "../EditCompany";
import { CompanyMoreMenu } from "../CompanyMoreMenu";
import type { CompanyDefaults, RepOption } from "../../CompanyDialog";

/**
 * DESKTOP-ONLY sticky top bar (design handoff §Layout 1) — "← Companies"
 * back link · divider · company monogram · name · stage chip · owner chip ·
 * More · Edit, in one 56px white row that stays pinned while the profile
 * scrolls. The window is the scroll container (CrmShell's <main> doesn't
 * scroll independently — only the sidebar is sticky), so `sticky top-0`
 * behaves.
 *
 * Server Component: every interactive piece is an existing CLIENT component
 * that already owns its own handlers (BackButton, CompanyMoreMenu,
 * EditCompany → CompanyDialog). Nothing here passes a function across the
 * boundary — see the standing RSC rule this route has 500'd over before.
 *
 * The mobile profile keeps CompanyHeader.tsx unchanged; this is its lg:
 * counterpart, not a replacement.
 */
export function ProfileTopBar({
  name,
  accountId,
  stage,
  ownerLabel,
  editDefaults,
  reps,
  canDelete,
}: {
  name: string;
  accountId: string;
  stage: string;
  /** Assigned rep's display name, or null when the company is unassigned. */
  ownerLabel: string | null;
  editDefaults: CompanyDefaults & { id: string };
  reps: RepOption[];
  canDelete: boolean;
}) {
  const ownerInitial = (ownerLabel ?? "").trim().charAt(0).toUpperCase();

  return (
    <div className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line-strong bg-card px-6">
      <BackButton
        fallbackHref="/crm/accounts"
        label="Companies"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:text-fg"
      />
      <span aria-hidden className="h-5 w-px shrink-0 bg-line-strong" />

      <div className="flex min-w-0 items-center gap-2.5">
        <CompanyAvatar name={name} className="h-7 w-7 text-[12px]" />
        <span className="min-w-0 truncate text-[15px] font-bold text-fg">{name}</span>
        <span className="shrink-0">
          <Badge tone={stageBadgeTone(stage)}>{stageLabel(stage)}</Badge>
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[12px] font-medium text-fg-muted">Owner</span>
        {ownerLabel ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-inset py-0.5 pl-0.5 pr-2.5 text-[12px] font-semibold text-fg">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
              {ownerInitial || "?"}
            </span>
            {ownerLabel}
          </span>
        ) : (
          <span className="rounded-full border border-line-strong bg-inset px-2.5 py-1 text-[12px] font-semibold text-fg-muted">
            Unassigned
          </span>
        )}
        <CompanyMoreMenu accountId={accountId} accountName={name} canDelete={canDelete} />
        <EditCompany defaults={editDefaults} reps={reps} canDelete={canDelete} />
      </div>
    </div>
  );
}

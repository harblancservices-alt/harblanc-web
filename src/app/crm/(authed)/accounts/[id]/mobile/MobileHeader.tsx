import { BackButton } from "../../../_shell/BackButton";
import { ProvenancePills } from "../ProvenancePills";
import { CompanyAvatar } from "../../../_shell/InitialAvatar";
import { normalizeStage, stageLabel } from "../../lifecycle";
import { CompanyMoreMenu } from "../CompanyMoreMenu";
import { ClaimCompanyButton } from "../ClaimCompanyButton";
import { EditCompany } from "../EditCompany";
import { StageTrackerSection } from "../StageTrackerSection";
import { LogCallButton, AddPersonButton } from "./HeaderActions";
import type { CompanyDefaults, RepOption } from "../../CompanyDialog";
import { M_PILL } from "./ui";

/**
 * The mobile company profile's SINGLE identity block (2026-08-23 rebuild).
 *
 * This replaces two stacked headers that both named the company and both
 * offered an Edit: the white CompanyHeader card and the navy `bg-accent`
 * band on top of CompanyDetailsCard. On a 390px screen those read as the
 * page rendering itself twice (Brent's screenshots, 2026-08-23). Everything
 * they carried is here exactly once — back link, More menu, monogram, name,
 * industry/city, stage, assigned rep (or Claim), Edit — plus the two actions
 * a rep actually opens this page to take, Log call and Add person.
 *
 * Sticky: the window is the scroll container (CrmShell's <main> doesn't
 * scroll independently), so `sticky top-0` behaves. Deliberately NOT wrapped
 * in _shell/ui.tsx's `Card` — that sets `overflow-hidden`, which silently
 * kills `position: sticky` on anything inside it.
 *
 * Server Component. Every interactive piece is an existing CLIENT component
 * that owns its own handlers (BackButton, CompanyMoreMenu, ClaimCompanyButton,
 * EditCompany, StageTrackerSection, and the two thin wrappers in
 * HeaderActions.tsx). No function prop crosses the RSC boundary — this route
 * has 500'd in production on exactly that.
 */
export function MobileHeader({
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
}: {
  accountId: string;
  accountName: string;
  industry: string | null;
  /** crm_accounts.source / bol_role — the provenance pills. */
  source: string | null;
  bolRole: string | null;
  city: string | null;
  state: string | null;
  stage: string;
  /** Assigned rep's display name, or null when the company is unclaimed. */
  repLabel: string | null;
  /** Claim target for the unclaimed state — see ClaimCompanyButton. */
  currentUserId: string;
  /** role === 'owner' — only surfaces the Edit dialog's "Assigned rep" field.
   * Reassigning an owned company stays admin-only in assignAccount() itself. */
  isAdmin: boolean;
  editDefaults: CompanyDefaults & { id: string };
  reps: RepOption[];
  canDelete: boolean;
}) {
  const normalized = normalizeStage(stage);
  const isActiveCustomer = normalized === "active";
  const subtitle = [industry, [city, state].filter(Boolean).join(", ") || null].filter(Boolean).join(" · ");
  const repInitial = repLabel?.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="sticky top-0 z-30 border-b border-line-strong bg-card shadow-e1">
      <div className="flex items-center justify-between gap-2 px-3 pb-0.5 pt-2">
        <BackButton
          fallbackHref="/crm/accounts"
          label="Companies"
          className="inline-flex items-center gap-1.5 px-0.5 py-1.5 text-[13px] font-extrabold text-accent transition-colors hover:text-accent-hover"
        />
        <CompanyMoreMenu accountId={accountId} accountName={accountName} canDelete={canDelete} />
      </div>

      <div className="flex items-start gap-[11px] px-3 pt-0.5">
        <CompanyAvatar name={accountName} className="h-[42px] w-[42px] rounded-xl text-[18px]" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-extrabold leading-[1.18] tracking-[-0.02em] text-fg [overflow-wrap:anywhere]">
            {accountName}
          </h1>
          {subtitle && <p className="mt-0.5 text-[12.5px] font-semibold text-fg-muted">{subtitle}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
        <span
          className={
            isActiveCustomer
              ? `${M_PILL} bg-[#15803d] text-white`
              : `${M_PILL} border border-accent/45 bg-accent/10 text-accent`
          }
        >
          {isActiveCustomer ? "Active Customer" : stageLabel(stage)}
        </span>
        {repLabel ? (
          <span className={`${M_PILL} border border-line-strong bg-inset pl-[3px] text-fg`}>
            <span className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-extrabold text-white">
              {repInitial}
            </span>
            {repLabel}
          </span>
        ) : (
          <ClaimCompanyButton accountId={accountId} currentUserId={currentUserId} />
        )}

        {/* PROVENANCE, in the row that already holds the stage pill and the
            owner / claim control — which is exactly the "assign area"
            Brent asked these to sit near, and it wraps on a narrow phone
            rather than adding a band. Light-ground tones here: this header
            is bg-card (white), not the desktop file's near-black. */}
        <ProvenancePills source={source} bolRole={bolRole} />
      </div>

      {/* The stage pill above deliberately uses the accent tint at every
          in-motion stage rather than LIFECYCLE_TONE's per-stage colors, so
          the one green pill on this page always means "won". */}
      <div className="grid grid-cols-3 gap-1.5 px-3 pb-3 pt-2.5">
        <LogCallButton accountId={accountId} />
        <AddPersonButton accountId={accountId} />
        <EditCompany defaults={editDefaults} reps={reps} canDelete={canDelete} canAssign={isAdmin} variant="mobileHeader" />
      </div>

      <div className="border-t border-line px-3 py-2.5">
        <StageTrackerSection
          accountId={accountId}
          accountName={accountName}
          stage={stage}
          variant="compact"
        />
      </div>
    </div>
  );
}

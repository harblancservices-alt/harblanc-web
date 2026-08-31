import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { CrmShell } from "./_shell/CrmShell";
import { ACTIVE_STATUSES } from "./upgrades/status";

export const dynamic = "force-dynamic";

/**
 * Gate for every authenticated CRM page. requireCrmUser() enforces BOTH a
 * valid Supabase session AND active crm_profiles membership — so a dispatch
 * admin (who has no crm_profiles row) is rejected here even with a session.
 * Fully independent of the /admin gate.
 */
export default async function CrmAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  // (The unclaimed-leads count query that used to live here went away with
  // the "Prospects" nav item on 2026-08-25 — the claim model is retired, so
  // nothing badges that number any more. One fewer count query on every CRM
  // page render. Unclaimed companies now surface on Admin → Companies.)

  // (The active-customers count query that used to live here went away with
  // the "Active Clients" nav item on 2026-08-22 — it became an Operations
  // sub-tab and no longer carries a badge, so the count is no longer read.
  // One fewer count query on every single CRM page render.)

  /**
   * OUTSTANDING upgrade requests, for the nav badge.
   *
   * ── THE BUG THIS FIXES ────────────────────────────────────────────
   *
   * This read `.neq("status", "done")`, and `done` HAS NOT BEEN A STATUS
   * SINCE 2026-08-28 — migration 20260828010000 renamed the vocabulary to
   * open / in_progress / completed / closed and rewrote every row. So the
   * filter excluded nothing, and the badge counted every request ever
   * filed. Brent: "it's currently showing 5 even though they are closed."
   *
   * A stale-vocabulary bug the migration left behind: it renamed the
   * statuses, updated the CHECK, and never touched this consumer. Nothing
   * failed, because excluding a value that no longer exists is silently
   * legal.
   *
   * It now uses ACTIVE_STATUSES from upgrades/status.ts — which ALREADY
   * EXISTED and already meant exactly this. The definition was there; the
   * badge simply never used it, and hand-writing the filter here instead
   * is what let it rot.
   *
   * ── WHAT "OUTSTANDING" MEANS ──────────────────────────────────────
   *
   * open AND in_progress. Something picked up but unfinished is still work
   * the reporter is waiting on, and a badge that dropped to zero the
   * moment somebody STARTED a job would say the queue was clear while
   * three things were in flight. completed and closed are both finished
   * states and neither counts. So the badge reaches zero exactly when
   * nothing is outstanding, which is the only thing that makes a badge
   * worth reading.
   *
   * ── WHO IT COUNTS ─────────────────────────────────────────────────
   *
   * Everyone's, for everyone — deliberately, and consistent with the board
   * it links to, which is not owner-gated and shows every request to every
   * user (only MARKING one done is owner-only). This is not the Activity
   * class of exposure: nothing here is scoped-per-agent elsewhere and
   * leaking through a count. If the board is ever narrowed to "your own",
   * this must be narrowed with it — the badge and the page it opens have
   * to agree about what they are counting.
   */
  const { count: outstandingUpgradeCount } = await supabase
    .from("crm_upgrade_requests")
    .select("id", { count: "exact", head: true })
    .in("status", ACTIVE_STATUSES as readonly string[])
    .is("deleted_at", null);

  return (
    <CrmShell
      email={user.email}
      fullName={user.fullName}
      role={user.role}
      outstandingUpgradeCount={outstandingUpgradeCount ?? 0}
    >
      {children}
    </CrmShell>
  );
}

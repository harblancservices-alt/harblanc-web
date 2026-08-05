/**
 * The write-side counterpart to resolve.ts's read-side DataSource split
 * (v2-architecture.md §10) — the canonical MUTATION pattern every /tms-v2
 * Server Action is built on, starting with this phase (loads + expenses
 * writes). Documented here so later phases copy this, not reinvent it.
 *
 * WHY A WRAPPER, NOT A "CALL blockedByDemo() FIRST" CONVENTION: V1's
 * blockedByDemo() (src/lib/admin/demo.ts) is correct in every action today,
 * but the audit's own finding on it stands: "nothing in the type system or
 * build process would catch the omission" if a future action forgot the
 * line. `mutation()` makes that omission structurally impossible — every
 * exported action in src/actions/tms-v2/*.ts is the wrapped function, so
 * the demo check (and the auth check) run before the wrapped body's first
 * line even executes. There is no bare, unwrapped server action to reach
 * for by mistake.
 *
 * WHY THIS ISN'T ROUTED THROUGH THE DataSource INTERFACE: reads go through
 * DataSource because demo mode needs a real (if static) dataset to answer
 * "what loads exist" from. Writes don't have that problem — a blocked write
 * has nothing to compute, it just needs to not happen. Giving DataSource a
 * parallel set of write methods whose only demo-mode implementation is
 * "no-op" would add a layer of indirection with no second behavior behind
 * it. This wrapper is that no-op, applied once, at the one place every
 * mutation must pass through.
 *
 * USAGE — one file per entity in src/actions/tms-v2/*.ts:
 *
 *   "use server";
 *   export const addLoad = mutation(async (formData: FormData): Promise<MutationResult<{ id: string }>> => {
 *     const sb = createServiceRoleClient();
 *     ... insert, revalidatePath(...), return { ok: true, data: { id } };
 *   });
 *
 * Every wrapped action returns a MutationResult instead of throwing on a
 * user-facing validation problem — a thrown error from a Server Action is
 * redacted in production (Next swaps the message for an opaque digest), so
 * "Rate must be a positive number" would never reach the operator. Genuinely
 * unexpected faults (a Supabase error, a bug) are still caught here and
 * turned into a MutationResult too, so the wrapper is also the ONE place
 * that turns an exception into an inline-displayable message — callers
 * never need their own try/catch.
 */

import { adminFromMiddleware } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/admin/demo";

export type MutationResult<T = void> = { ok: true; data?: T } | { ok: false; reason: string };

const DEMO_BLOCKED_REASON =
  "Demo mode is on — nothing was saved. Turn it off in Settings to make real changes.";

/**
 * Wrap a Server Action body with the auth + demo-mode gate. Re-verifies the
 * admin session even though the (authed) layout already checked it, per
 * Next's own guidance (a Server Action can be invoked directly, bypassing
 * whatever a parent layout would have gated) — same session, same
 * adminFromMiddleware() the layout uses, not a second auth system.
 */
export function mutation<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<MutationResult<T>>,
): (...args: Args) => Promise<MutationResult<T>> {
  return async (...args: Args): Promise<MutationResult<T>> => {
    await adminFromMiddleware();
    if (await isDemoMode()) return { ok: false, reason: DEMO_BLOCKED_REASON };
    try {
      return await fn(...args);
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "Something went wrong. Please try again." };
    }
  };
}

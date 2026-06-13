import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { validateEnv } from "@/lib/env";
import { IconLogout } from "../_shell/icons";

/**
 * Level 4 — Settings page.
 *
 *   1. Account email — display only.
 *   2. System diagnostics — conditional. Renders only when validateEnv()
 *      returns at least one issue. Replaces the previous Dashboard
 *      EnvBanner with a less intrusive admin-only location.
 *   3. Sign out — POST to /admin/logout (unchanged route).
 *
 * No other categories. No theme picker, no integrations, no preferences.
 */
export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await requireAdmin();
  const email = user.email ?? "—";
  // System diagnostics — surfaced here (not on the Dashboard) so the
  // owner-facing dashboard stays calm. Only renders when a real
  // operational risk is detected (e.g. Resend not configured →
  // emails won't send; Stripe webhook secret missing → payments
  // stuck in pending). Empty list = section hidden entirely.
  const envIssues = validateEnv();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <header>
        <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.28em] text-black">
          Settings
        </p>
        <h1 className="mt-1 text-[30px] font-bold leading-none tracking-tight text-black sm:text-[36px] lg:text-[40px]">
          Account
        </h1>
      </header>

      <section className="mt-6 border-2 border-black border-l-4 border-l-black bg-[#fafaf6] px-4 py-4 sm:px-5 sm:py-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-black">
          Email
        </p>
        <p className="mt-1 break-all text-[15px] text-black sm:text-base">
          {email}
        </p>
      </section>

      {envIssues.length > 0 ? (
        <section className="mt-4 border-2 border-amber-700 border-l-4 border-l-amber-700 bg-[#fdf6e3] px-4 py-4 sm:px-5 sm:py-5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-amber-900">
            System diagnostics
          </p>
          <p className="mt-1 text-[12px] text-amber-900">
            {envIssues.length} env var{envIssues.length === 1 ? "" : "s"} flagged.
            These affect background features only — the portal still works.
          </p>
          <ul className="mt-3 space-y-2 text-[12px] text-black">
            {envIssues.map((msg) => (
              <li
                key={msg}
                className="border-l-2 border-amber-700 pl-3 leading-snug"
              >
                {msg}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form action="/admin/logout" method="post" className="mt-4">
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 border-2 border-black bg-white px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black transition-colors hover:bg-[#f3f1e9] sm:w-auto"
        >
          <IconLogout className="h-4 w-4" />
          Sign out
        </button>
      </form>
    </div>
  );
}

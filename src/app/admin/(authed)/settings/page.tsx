import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { validateEnv } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { IconLogout } from "../_shell/icons";
import { updateFuelSettings } from "./actions";
import { ThemeToggle } from "./ThemeToggle";

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

  const sb = createServiceRoleClient();
  const { data: fuel } = await sb
    .from("dispatch_settings")
    .select("mpg, diesel_price_per_gallon, factoring_pct")
    .eq("id", true)
    .maybeSingle<{
      mpg: number | string;
      diesel_price_per_gallon: number | string;
      factoring_pct: number | string;
    }>();
  const mpg = fuel?.mpg ?? 13;
  const ppg = fuel?.diesel_price_per_gallon ?? 4.7;
  const factoringPct = fuel?.factoring_pct ?? 3;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <header>
        <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.28em] text-fg">
          Settings
        </p>
        <h1 className="mt-1 text-[30px] font-bold leading-none tracking-tight text-fg sm:text-[36px] lg:text-[40px]">
          Account
        </h1>
      </header>

      <section className="mt-6 border-2 border-line border-l-4 border-l-fg bg-card px-4 py-4 sm:px-5 sm:py-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-fg">
          Appearance
        </p>
        <p className="mt-1 text-[12px] text-fg/70">
          Switch the admin portal between light and dark.
        </p>
        <ThemeToggle />
      </section>

      <section className="mt-4 border-2 border-line border-l-4 border-l-fg bg-card px-4 py-4 sm:px-5 sm:py-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-fg">
          Email
        </p>
        <p className="mt-1 break-all text-[15px] text-fg sm:text-base">
          {email}
        </p>
      </section>

      {envIssues.length > 0 ? (
        <section className="mt-4 border-2 border-amber-300 border-l-4 border-l-amber-700 bg-[#fdf6e3] px-4 py-4 sm:px-5 sm:py-5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-amber-900">
            System diagnostics
          </p>
          <p className="mt-1 text-[12px] text-amber-900">
            {envIssues.length} env var{envIssues.length === 1 ? "" : "s"} flagged.
            These affect background features only — the portal still works.
          </p>
          <ul className="mt-3 space-y-2 text-[12px] text-fg">
            {envIssues.map((msg) => (
              <li
                key={msg}
                className="border-l-2 border-amber-300 pl-3 leading-snug"
              >
                {msg}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form
        action={updateFuelSettings}
        className="mt-4 border-2 border-line border-l-4 border-l-fg bg-card px-4 py-4 sm:px-5 sm:py-5"
      >
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-fg">
          Fuel defaults
        </p>
        <p className="mt-1 text-[12px] text-fg/70">
          Used to cost diesel per load and trip. Fuel CSV imports will refine
          these later.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg/70">
              MPG
            </span>
            <input
              name="mpg"
              type="number"
              step="0.1"
              min="1"
              defaultValue={String(mpg)}
              className="mt-1 block w-28 border-2 border-line bg-card px-3 py-2 font-mono text-[15px] text-fg focus:border-fg focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg/70">
              Diesel $/gal
            </span>
            <input
              name="diesel_price_per_gallon"
              type="number"
              step="0.01"
              min="0"
              defaultValue={String(ppg)}
              className="mt-1 block w-28 border-2 border-line bg-card px-3 py-2 font-mono text-[15px] text-fg focus:border-fg focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg/70">
              Factoring %
            </span>
            <input
              name="factoring_pct"
              type="number"
              step="0.1"
              min="0"
              defaultValue={String(factoringPct)}
              className="mt-1 block w-28 border-2 border-line bg-card px-3 py-2 font-mono text-[15px] text-fg focus:border-fg focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="border-2 border-fg bg-fg px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-canvas transition-colors hover:opacity-90"
          >
            Save
          </button>
        </div>
      </form>

      <form action="/admin/logout" method="post" className="mt-4">
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 border-2 border-line bg-card px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-fg transition-colors hover:bg-elevated sm:w-auto"
        >
          <IconLogout className="h-4 w-4" />
          Sign out
        </button>
      </form>
    </div>
  );
}

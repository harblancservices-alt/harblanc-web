import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { validateEnv } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { IconLogout } from "../_shell/icons";
import { updateFuelSettings } from "./actions";
import { ThemeToggle } from "./ThemeToggle";
import { DisplaySettings } from "./DisplaySettings";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { field } from "@/components/ui/styles";

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
      <PageHeader eyebrow="Settings" title="Account" className="mb-6" />

      <Card className="mt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
          Appearance
        </p>
        <p className="mt-1 text-[12px] text-ink-2">
          Switch the admin portal between light and dark.
        </p>
        <ThemeToggle />
      </Card>

      <Card className="mt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
          Display
        </p>
        <p className="mt-1 text-[12px] text-ink-2">
          Fit the portal to your monitor — orientation and scale.
        </p>
        <DisplaySettings />
      </Card>

      <Card className="mt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
          Email
        </p>
        <p className="mt-1 break-all text-[15px] text-ink sm:text-base">
          {email}
        </p>
      </Card>

      {envIssues.length > 0 ? (
        <Card className="mt-4 border-l-[3px] border-l-warn">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-warn">
            System diagnostics
          </p>
          <p className="mt-1 text-[12px] text-ink-2">
            {envIssues.length} env var{envIssues.length === 1 ? "" : "s"} flagged.
            These affect background features only — the portal still works.
          </p>
          <ul className="mt-3 space-y-2 text-[12px] text-ink">
            {envIssues.map((msg) => (
              <li
                key={msg}
                className="border-l-2 border-warn/40 pl-3 leading-snug"
              >
                {msg}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-4">
        <form action={updateFuelSettings}>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
            Fuel defaults
          </p>
          <p className="mt-1 text-[12px] text-ink-2">
            Used to cost diesel per load and trip. Fuel CSV imports will refine
            these later.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="block">
              <span className={field.label}>MPG</span>
              <input
                name="mpg"
                type="number"
                step="0.1"
                min="1"
                defaultValue={String(mpg)}
                className={field.input + " w-28 tabular-nums"}
              />
            </label>
            <label className="block">
              <span className={field.label}>Diesel $/gal</span>
              <input
                name="diesel_price_per_gallon"
                type="number"
                step="0.01"
                min="0"
                defaultValue={String(ppg)}
                className={field.input + " w-28 tabular-nums"}
              />
            </label>
            <label className="block">
              <span className={field.label}>Factoring %</span>
              <input
                name="factoring_pct"
                type="number"
                step="0.1"
                min="0"
                defaultValue={String(factoringPct)}
                className={field.input + " w-28 tabular-nums"}
              />
            </label>
            <Button type="submit" variant="primary">
              Save
            </Button>
          </div>
        </form>
      </Card>

      <form action="/admin/logout" method="post" className="mt-4">
        <Button
          type="submit"
          variant="navigate"
          leftIcon={<IconLogout className="h-4 w-4" />}
        >
          Sign out
        </Button>
      </form>
    </div>
  );
}

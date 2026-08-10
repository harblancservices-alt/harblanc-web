import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { validateEnv } from "@/lib/env";
import { company } from "@/lib/company";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { DEMO_SETTINGS_ROW } from "@/lib/demo/demoData";
import { IconLogout } from "../_shell/icons";
import { updateFuelSettings, updateProfitGoals } from "./actions";
import { ThemeToggle } from "./ThemeToggle";
import { DemoModeToggle } from "./DemoModeToggle";
import { DisplaySettings } from "./DisplaySettings";
import { AdvancedPanel } from "./AdvancedPanel";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { field } from "@/components/ui/styles";

/**
 * Level 4 — Settings page.
 *
 *   1. Account information — the carrier identity (read-only for now).
 *   2. Appearance          — light / dark.
 *   3. Display             — orientation + UI scale.
 *   4. Business defaults   — fuel costing + net profit goals.
 *   5. Email               — the signed-in dispatch account.
 *   6. Advanced            — env diagnostics, collapsed by default.
 *   7. Sign out            — POST to /admin/logout (unchanged route).
 */
export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

/** Trip-card surface: the same shell every section on this page sits in. */
function Section({
  label,
  caption,
  children,
  className,
}: {
  label: string;
  caption?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "rounded-lg border border-line-strong bg-card p-4 shadow-e2 sm:p-5 " +
        (className ?? "")
      }
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
        {label}
      </p>
      {caption ? (
        <p className="mt-1 text-[12px] text-ink-2">{caption}</p>
      ) : null}
      {children}
    </section>
  );
}

/** One labelled read-only identity row inside the account card. */
function AccountField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  const set = Boolean(value && value.trim());
  return (
    <div className="min-w-0 rounded-md border border-line bg-inset px-3 py-2.5">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </p>
      <p
        className={
          "mt-1 break-words text-[13px] leading-snug " +
          (set ? "text-ink " : "text-ink-3 ") +
          (mono && set ? "font-mono tabular-nums" : "")
        }
      >
        {set ? value : "Not set"}
      </p>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await requireAdmin();
  const email = user.email ?? "—";
  // System diagnostics — kept, but behind the Advanced disclosure so the
  // owner-facing page stays calm. Empty list = "nothing flagged" inside.
  const envIssues = validateEnv();

  // The demo flag drives both the toggle's initial state and (in demo) the
  // settings values shown, so the config panel matches the demo money math
  // rather than leaking the real stored numbers.
  const demoOn = await isDemoMode();

  const sb = createServiceRoleClient();
  const { data: fuel } = demoOn
    ? { data: DEMO_SETTINGS_ROW }
    : await sb
        .from("dispatch_settings")
        .select(
          "mpg, diesel_price_per_gallon, factoring_pct, monthly_net_goal, annual_net_goal",
        )
        .eq("id", true)
        .maybeSingle<{
          mpg: number | string;
          diesel_price_per_gallon: number | string;
          factoring_pct: number | string;
          monthly_net_goal: number | string | null;
          annual_net_goal: number | string | null;
        }>();
  const mpg = fuel?.mpg ?? 13;
  const ppg = fuel?.diesel_price_per_gallon ?? 4.7;
  const factoringPct = fuel?.factoring_pct ?? 3;
  const monthlyGoal = fuel?.monthly_net_goal ?? 10000;
  const annualGoal = fuel?.annual_net_goal ?? 120000;

  // Identity comes from the single source the site, PDFs, and the Reach
  // signature already read from (src/lib/company.ts). Nothing here is
  // invented — a field with no stored value renders "Not set".
  const accounts = [
    {
      id: "harblanc",
      name: company.legalName,
      role: "Motor carrier · Owner-operated",
      current: true,
      fields: [
        { label: "MC number", value: company.mcNumber, mono: true },
        { label: "USDOT number", value: company.dotNumber, mono: true },
        { label: "Owner", value: "Brent Harbaugh · Owner-operator" },
        { label: "Dispatch email", value: company.dispatchEmail },
        { label: "Phone", value: company.dispatchPhone, mono: true },
        { label: "Authority", value: company.authorityText },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <PageHeader eyebrow="Settings" title="Account" className="mb-6" />

      <div className="space-y-4">
        {/* 1 — Account information. Laid out as a list of account cards so a
            second linked account can slot in later without a re-layout.
            Display-only today: no add / edit / link flows. */}
        <Section
          label="Account information"
          caption="The carrier identity used on emails, quotes, and paperwork."
        >
          <div className="mt-4 space-y-3">
            {accounts.map((acct) => (
              <div
                key={acct.id}
                className="rounded-md border border-line-strong bg-card p-3.5 shadow-e1 sm:p-4"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-[15px] font-bold leading-tight text-ink">
                    {acct.name}
                  </p>
                  {acct.current ? (
                    <span className="rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink-2">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[12px] text-ink-2">{acct.role}</p>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {acct.fields.map((f) => (
                    <AccountField
                      key={f.label}
                      label={f.label}
                      value={f.value}
                      mono={f.mono}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 2 — Appearance */}
        <Section
          label="Appearance"
          caption="Switch the admin portal between light and dark."
        >
          <ThemeToggle />
        </Section>

        {/* 3 — Display */}
        <Section
          label="Display"
          caption="Fit the portal to your monitor — orientation and scale."
        >
          <DisplaySettings />
        </Section>

        {/* Demo mode — present the portal with curated sample data. Real data
            and demo data never cross: when ON every page reads the fake set and
            every mutating action no-ops. */}
        <Section
          label="Demo mode"
          caption="Show the portal with realistic sample data for a walkthrough. The real database is never read or changed while it's on."
        >
          <DemoModeToggle initialOn={demoOn} />
        </Section>

        {/* 4 — Business defaults: fuel costing + profit goals, one section. */}
        <Section
          label="Business defaults"
          caption="Operational numbers the load board and trip math run on."
        >
          <form action={updateFuelSettings} className="mt-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink-3">
              Fuel defaults
            </p>
            <p className="mt-1 text-[11px] text-ink-2">
              Used to cost diesel per load and trip. Fuel CSV imports will
              refine these later.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3 sm:gap-4 max-sm:flex-col max-sm:items-stretch">
              <label className="block max-sm:w-full">
                <span className={field.label}>MPG</span>
                <input
                  name="mpg"
                  type="number"
                  step="0.1"
                  min="1"
                  defaultValue={String(mpg)}
                  className={field.input + " w-28 tabular-nums max-sm:w-full"}
                />
              </label>
              <label className="block max-sm:w-full">
                <span className={field.label}>Diesel $/gal</span>
                <input
                  name="diesel_price_per_gallon"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={String(ppg)}
                  className={field.input + " w-28 tabular-nums max-sm:w-full"}
                />
              </label>
              <label className="block max-sm:w-full">
                <span className={field.label}>Factoring %</span>
                <input
                  name="factoring_pct"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={String(factoringPct)}
                  className={field.input + " w-28 tabular-nums max-sm:w-full"}
                />
              </label>
              <Button type="submit" variant="primary" className="max-sm:w-full">
                Save
              </Button>
            </div>
          </form>

          <form
            action={updateProfitGoals}
            className="mt-5 border-t border-line pt-4"
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink-3">
              Net profit goals
            </p>
            <p className="mt-1 text-[11px] text-ink-2">
              Targets for the Load Board goal bar — the monthly goal on a single
              month, the annual goal on “All months”.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3 sm:gap-4 max-sm:flex-col max-sm:items-stretch">
              <label className="block max-sm:w-full">
                <span className={field.label}>Monthly $</span>
                <input
                  name="monthly_net_goal"
                  type="number"
                  step="100"
                  min="0"
                  defaultValue={String(monthlyGoal)}
                  className={field.input + " w-32 tabular-nums max-sm:w-full"}
                />
              </label>
              <label className="block max-sm:w-full">
                <span className={field.label}>Annual $ (all months)</span>
                <input
                  name="annual_net_goal"
                  type="number"
                  step="1000"
                  min="0"
                  defaultValue={String(annualGoal)}
                  className={field.input + " w-32 tabular-nums max-sm:w-full"}
                />
              </label>
              <Button type="submit" variant="primary" className="max-sm:w-full">
                Save
              </Button>
            </div>
          </form>
        </Section>

        {/* 5 — Email */}
        <Section label="Email" caption="The account you're signed in as.">
          <p className="mt-2 break-all text-[15px] text-ink sm:text-base">
            {email}
          </p>
        </Section>

        {/* 6 — Advanced (collapsed) */}
        <AdvancedPanel issues={envIssues} />
      </div>

      {/* 7 — Sign out */}
      <form action="/admin/logout" method="post" className="mt-6">
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

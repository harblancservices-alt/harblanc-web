import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { IconLogout } from "../_shell/icons";

/**
 * Level 4 — Settings page (v1, microscopic).
 *
 * Two things:
 *   1. Account email — display only.
 *   2. Sign out — POST to /admin/logout (unchanged route).
 *
 * No other categories. No theme picker, no integrations, no preferences.
 * If a settings need surfaces later, add it deliberately in a separate
 * pass. Per Q7 / Settings guidance: stay microscopic.
 */
export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await requireAdmin();
  const email = user.email ?? "—";

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

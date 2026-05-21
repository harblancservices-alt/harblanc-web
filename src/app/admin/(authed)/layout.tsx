import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { BrandLogo } from "@/components/site/BrandLogo";
import { AdminNav } from "./AdminNav";
import { DispatchClock } from "./DispatchClock";

/**
 * Admin shell layout. Runs requireAdmin() once on every authed request — every
 * page underneath can assume the visitor is signed-in and on the allowlist.
 *
 * Top-bar layout:
 *   left   — brand mark + "DISPATCH CENTER" identity
 *   center — AdminNav tabs (Dashboard / Quotes / Applications)
 *   right  — UTC clock, signed-in email, sign-out button
 */
export default async function AuthedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950">
      <header className="border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {/* left — brand mark + identity */}
          <div className="flex items-center gap-3 md:gap-4">
            <Link
              href="/admin"
              aria-label="Dispatch center home"
              className="flex items-center"
            >
              <BrandLogo variant="inverted" className="h-7 w-auto" />
            </Link>
            <span
              aria-hidden
              className="hidden h-4 w-px bg-neutral-800 md:inline-block"
            />
            <span className="hidden font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase md:inline">
              Dispatch Center
            </span>
          </div>

          {/* center — nav */}
          <AdminNav />

          {/* right — clock + user + sign-out */}
          <div className="flex items-center gap-3 md:gap-4">
            <DispatchClock />
            <span
              aria-hidden
              className="hidden h-4 w-px bg-neutral-800 lg:inline-block"
            />
            <span className="hidden font-mono text-[10px] tracking-[0.18em] text-neutral-500 uppercase lg:inline">
              {user.email}
            </span>
            <form action="/admin/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center border border-neutral-700 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>
    </div>
  );
}

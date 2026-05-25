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
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {/* left — brand mark + identity */}
          <div className="flex items-center gap-3 md:gap-4">
            <Link
              href="/admin"
              aria-label="Dispatch center home"
              className="flex items-center"
            >
              <BrandLogo variant="default" className="h-7 w-auto" />
            </Link>
            <span
              aria-hidden
              className="hidden h-4 w-px bg-zinc-300 md:inline-block"
            />
            <span className="hidden font-mono text-xs tracking-[0.12em] text-red-600 uppercase md:inline">
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
              className="hidden h-4 w-px bg-zinc-300 lg:inline-block"
            />
            <span className="hidden font-mono text-xs tracking-[0.12em] text-black uppercase lg:inline">
              {user.email}
            </span>
            <form action="/admin/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-black transition-colors hover:border-zinc-400 hover:bg-zinc-100"
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

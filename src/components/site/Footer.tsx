import Link from "next/link";
import { company } from "@/lib/company";
import { BrandLogo } from "./BrandLogo";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t-2 border-[#dcd5c2]/30 bg-neutral-950">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        {/* Logo — centered as the footer’s visual anchor. Bumped from
            h-16 to h-20/h-24 so it carries the top of the block rather
            than sitting as a corner mark. */}
        <div className="flex justify-center">
          <Link
            href="/"
            aria-label={`${company.legalName} home`}
            className="inline-flex items-center"
          >
            <BrandLogo variant="inverted" className="h-20 w-auto sm:h-24" />
          </Link>
        </div>

        {/* Link columns — centered as a pair below the logo. Mobile
            stacks them and centers the type; sm+ puts them side by
            side, left-aligned within each column, centered as a unit
            via justify-center. Wider gaps (24/32) keep them from
            crowding now that the type is larger. */}
        <div className="mt-12 flex flex-col items-center gap-10 text-center sm:flex-row sm:items-start sm:justify-center sm:gap-24 sm:text-left lg:gap-32">
          <div>
            <h3 className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-neutral-400">
              Site
            </h3>
            <ul className="mt-5 space-y-3">
              <li>
                <Link href="/" className="text-[15px] font-semibold uppercase tracking-[0.1em] text-neutral-300 hover:text-white">
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/#services"
                  className="text-[15px] font-semibold uppercase tracking-[0.1em] text-neutral-300 hover:text-white"
                >
                  Services
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-neutral-400">
              Dispatch
            </h3>
            <ul className="mt-5 space-y-3">
              <li>
                <a
                  href={`mailto:${company.dispatchEmail}`}
                  className="text-[15px] font-semibold uppercase tracking-[0.1em] text-neutral-300 hover:text-white break-all"
                >
                  {company.dispatchEmail}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`}
                  className="text-[15px] font-semibold uppercase tracking-[0.1em] text-neutral-300 hover:text-white"
                >
                  {company.dispatchPhone}
                </a>
              </li>
              <li className="pt-3 font-mono text-sm text-neutral-400">
                USDOT {company.dotNumber}
              </li>
              <li className="font-mono text-sm text-neutral-400">
                MC {company.mcNumber}
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom row — copyright + authority line. Bumped from text-xs
            text-neutral-500 to text-sm text-neutral-400 so the legal
            line stays readable instead of dissolving into the surface. */}
        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-neutral-800 pt-6 text-sm text-neutral-400 sm:flex-row sm:items-center">
          <p>
            &copy; {year} {company.legalName}. All rights reserved.
          </p>
          <p className="font-mono uppercase tracking-[0.18em]">
            {company.authorityText} motor carrier
          </p>
        </div>
      </div>
    </footer>
  );
}

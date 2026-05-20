import Link from "next/link";
import { company } from "@/lib/company";
import { BrandLogo } from "./BrandLogo";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="inline-flex items-center"
              aria-label={`${company.legalName} home`}
            >
              <BrandLogo variant="inverted" className="h-10 w-auto" />
            </Link>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-400">
              Licensed motor carrier. Hotshot, expedited, equipment, and
              general freight across the lower 48. Owner-operated dispatch.
            </p>
          </div>

          <div>
            <h3 className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
              Site
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/" className="text-neutral-300 hover:text-white">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/#services" className="text-neutral-300 hover:text-white">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/#process" className="text-neutral-300 hover:text-white">
                  Process
                </Link>
              </li>
              <li>
                <Link href="/quote" className="text-neutral-300 hover:text-white">
                  Request a Quote
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
              Dispatch
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a
                  href={`mailto:${company.dispatchEmail}`}
                  className="text-neutral-300 hover:text-white break-all"
                >
                  {company.dispatchEmail}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`}
                  className="text-neutral-300 hover:text-white"
                >
                  {company.dispatchPhone}
                </a>
              </li>
              <li className="pt-3 font-mono text-xs text-neutral-500">
                USDOT {company.dotNumber}
              </li>
              <li className="font-mono text-xs text-neutral-500">
                MC {company.mcNumber}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-neutral-800 pt-6 text-xs text-neutral-500 sm:flex-row sm:items-center">
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

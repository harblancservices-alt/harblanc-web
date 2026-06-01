"use client";

import Link from "next/link";
import { useState } from "react";
import { company } from "@/lib/company";
import { BrandLogo } from "./BrandLogo";

const navLinks = [
  { href: "/#services", label: "Services" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b-2 border-[#dcd5c2]/30 bg-neutral-900">
      <div className="relative mx-auto flex h-24 max-w-7xl items-center justify-center gap-4 px-4 sm:px-6 md:justify-between lg:px-10">
        {/* LEFT: dark-ink logo lives on a small beige platform so it reads
            cleanly against the dark navbar without needing a separate
            inverted asset. */}
        <Link
          href="/"
          aria-label={`${company.legalName} home`}
          onClick={() => setOpen(false)}
          className="inline-flex items-center"
        >
          <BrandLogo variant="default" priority className="h-12 w-auto md:hidden" />
          <BrandLogo variant="default" priority className="hidden h-14 w-auto md:block" />
        </Link>

        {/* RIGHT: nav + Resources dropdown + CTAs */}
        <div className="hidden md:flex md:items-center md:gap-7 lg:gap-9">
          <nav className="flex items-center gap-6 lg:gap-7">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[15px] font-semibold uppercase tracking-[0.1em] text-neutral-300 transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}

            <a
              href={`mailto:${company.dispatchEmail}`}
              className="text-[15px] font-semibold uppercase tracking-[0.1em] text-neutral-300 transition-colors hover:text-white"
            >
              Contact
            </a>
          </nav>
          <span aria-hidden className="h-6 w-px bg-white/15" />
          <div className="flex items-center gap-2.5">
            <Link
              href="/quote"
              className="btn-cut inline-flex items-center bg-red-600 px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.1em] text-white shadow-[inset_0_0_0_2px_#000] transition-colors hover:bg-red-500"
            >
              Request a Quote
            </Link>
            <Link
              href="/apply"
              className="btn-outline-cut-light inline-flex items-center px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.1em] text-zinc-900 transition-colors"
            >
              Join the Fleet
            </Link>
          </div>
        </div>

        {/* MOBILE: hamburger */}
        <button
          type="button"
          className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center p-2 text-neutral-300 hover:bg-white/10 hover:text-white sm:right-4 md:hidden"
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6" aria-hidden>
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414Z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6" aria-hidden>
              <path fillRule="evenodd" d="M3 5.75A.75.75 0 0 1 3.75 5h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 5.75Zm0 4.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Zm.75 3.5a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H3.75Z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </div>

      {open && (
        <div className="border-t border-neutral-800 bg-neutral-950 md:hidden">
          <nav className="divide-y divide-neutral-900 px-4 py-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-1 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-neutral-300 hover:text-white"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}

            <a
              href={`mailto:${company.dispatchEmail}`}
              className="block px-1 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-neutral-300 hover:text-white"
              onClick={() => setOpen(false)}
            >
              Contact
            </a>
            <Link
              href="/quote"
              className="btn-cut mt-3 block bg-red-600 px-4 py-3 text-center text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[inset_0_0_0_2px_#000] hover:bg-red-500"
              onClick={() => setOpen(false)}
            >
              Request a Quote
            </Link>
            <Link
              href="/apply"
              className="btn-outline-cut-light mt-2 block px-4 py-3 text-center text-sm font-bold uppercase tracking-[0.12em] text-zinc-900"
              onClick={() => setOpen(false)}
            >
              Join the Fleet
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

import Link from "next/link";
import { company } from "@/lib/company";
import { BrandLogo } from "./BrandLogo";

/**
 * Site footer — Layout #4 (premium carrier / owner-operator / industrial).
 *
 * Structure:
 *   TOP — 3-column grid
 *     1. Logo + tagline (Owner-Operated / Licensed & Insured / Est. 2022)
 *     2. SITE       — Home, Services, Contact
 *     3. DISPATCH   — email, phone, USDOT, MC
 *
 *   BOTTOM — full-width strip
 *     left:  copyright    right: Licensed & Insured Motor Carrier
 *
 * Style rules:
 *   - background: bg-neutral-950 + topographic SVG layer behind (low opacity)
 *   - hierarchy comes from weight + spacing, not color
 *   - red used only as accent / hover affordance
 *   - section headers: small uppercase mono with wide letter-spacing
 *   - no buttons, no cards, no boxes, no gradients, no glassmorphism
 *
 * Responsive: lg = 3 columns, sm = 2 columns, mobile = single stack.
 * Bottom bar inverts to flex-col on mobile.
 */

export function Footer() {
  const year = new Date().getFullYear();
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;
  const mailHref = `mailto:${company.dispatchEmail}`;

  // Shared column header style — small uppercase mono, wider tracking,
  // weight 700. Hierarchy via weight + spacing, not color (white).
  const colHeader =
    "font-mono text-[13px] font-bold uppercase tracking-[0.22em] text-red-500";
  // Shared link style — white, slightly smaller than the body data,
  // hovers to a subtle red. No underline by default.
  const link =
    "text-sm font-medium text-fg drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] transition-colors hover:text-red-400";
  // Plain data row (USDOT, MC, etc.) — same size as links but no hover.
  const data = "text-sm font-medium text-fg drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]";

  return (
    <footer className="relative overflow-hidden border-t-2 border-[#dcd5c2]/30 bg-black text-white">
      {/* Topographic contour background — fractal-noise SVG layered
          edge-to-edge behind all content. opacity baked into the SVG
          (~22%) so it reads as a faint operational map without
          competing with the columns. */}
      {/* Layer 1 — topographic SVG */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-repeat bg-center"
        style={{ backgroundImage: "url('/brand/footer-topo.svg')", backgroundSize: "600px 600px" }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        {/* ── Top section: 5-column grid ───────────────────────────────
            lg+: 5 across with logo column slightly wider via col-span-2
                 on the logo so the right four columns fit comfortably.
            sm:  2 across; logo column spans both for prominence.
            mobile: single stack. */}
        <div className="grid grid-cols-1 gap-10 text-center sm:grid-cols-2 sm:gap-12 sm:text-left lg:grid-cols-[1.4fr_1fr_1.2fr] lg:gap-10">

          {/* Column 1 — Logo + tagline lines */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex justify-center sm:justify-start">
              <Link
                href="/"
                aria-label={`${company.legalName} home`}
                className="inline-flex items-center"
              >
                <BrandLogo variant="inverted" className="h-14 w-auto sm:h-16" />
              </Link>
            </div>
            <div className="mt-5 space-y-1 font-mono text-[11px] uppercase tracking-[0.18em] text-fg">
              <p>Owner-Operated</p>
              <p>Licensed &amp; Insured</p>
              <p>Est. 2022</p>
            </div>
          </div>

          {/* Column 2 — Site */}
          <div>
            <h3 className={colHeader}>Site</h3>
            <ul className="mt-5 space-y-3">
              <li><Link href="/" className={link}>Home</Link></li>
              <li><Link href="/#services" className={link}>Services</Link></li>
              <li><a href={mailHref} className={link}>Contact</a></li>
            </ul>
          </div>

          {/* Column 4 — Dispatch (contact + authority) */}
          <div>
            <h3 className={colHeader}>Dispatch</h3>
            <ul className="mt-5 space-y-3">
              <li>
                <a href={mailHref} className={`${link} break-all`}>
                  {company.dispatchEmail}
                </a>
              </li>
              <li>
                <a href={phoneHref} className={link}>
                  {company.dispatchPhone}
                </a>
              </li>
              <li className="pt-2"><span className={data}>USDOT {company.dotNumber}</span></li>
              <li><span className={data}>MC {company.mcNumber}</span></li>
            </ul>
          </div>

        </div>

        {/* ── Bottom bar: copyright (left) / authority (right) ───────── */}
        <div className="mt-16 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-center text-sm text-fg sm:flex-row sm:items-center sm:text-left lg:mt-20">
          <p className="font-medium">
            &copy; {year} {company.legalName}. All Rights Reserved.
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.22em]">
            Licensed &amp; Insured Motor Carrier
          </p>
        </div>
      </div>
    </footer>
  );
}

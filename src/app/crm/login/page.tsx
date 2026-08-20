import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in — Hello Hotshot CRM",
  robots: { index: false, follow: false },
};

/**
 * Standalone CRM sign-in screen. Self-contained dark palette (its own hex,
 * not the admin login's or the shared .crm-light scope), so it renders
 * identically regardless of the shared :root / admin theme scopes.
 *
 * 2026-08-20: rebuilt from a single centered card to crm-design's exact
 * split-screen composition — a dark branding panel (left, desktop only)
 * with the product name + a one-line pitch, and the sign-in form on a
 * lighter panel (right). Was one dark card floating on a plain dark
 * background at every width; the brand/tagline copy is new (real copy
 * about the real product, not mock content) since the old single-card
 * layout had no slot for it. LoginForm itself (the real Supabase auth
 * flow) is untouched — only the page shell around it changed.
 */
export default function CrmLoginPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_460px]">
      <div className="hidden flex-col justify-between bg-[#0e1217] p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#2f76d6] text-[15px] font-black text-white">
            H
          </span>
          <span className="text-[15px] font-bold text-white">Hello Hotshot CRM</span>
        </div>
        <div className="max-w-md">
          <p className="text-[26px] font-bold leading-tight text-white">
            One workspace for your book of business — companies, contacts, loads, and documents, all in one place.
          </p>
        </div>
        <p className="text-[11.5px] text-[#5f6b7a]">Hello Hotshot CRM · Authorized users only</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-8 bg-[#0e1217] p-6 sm:p-10 lg:bg-[#12161c]">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center bg-[#2f76d6] text-[18px] font-black text-white">
              H
            </span>
            <span className="text-[20px] font-bold tracking-tight text-white">Hello Hotshot</span>
          </div>

          <h1 className="mb-1 text-[22px] font-semibold text-white">Sign in</h1>
          <p className="mb-6 text-[13px] text-[#8b93a0]">Access your Hello Hotshot pipeline.</p>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>

          <p className="mt-6 text-center text-[12px] text-[#4b5563] lg:hidden">
            Hello Hotshot CRM · Authorized users only
          </p>
        </div>
      </div>
    </div>
  );
}

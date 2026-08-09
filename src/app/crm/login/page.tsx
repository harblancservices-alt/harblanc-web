import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in — Hello Hotshot CRM",
  robots: { index: false, follow: false },
};

/**
 * Standalone CRM sign-in screen. Self-contained dark palette (its own hex,
 * not the admin login's), so it renders identically regardless of the shared
 * :root / admin theme scopes. Branded distinctly as "Hello Hotshot" so it's
 * unmistakably a separate product from Dispatch.
 */
export default function CrmLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0e1217] px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center bg-[#2f76d6] text-[18px] font-black text-white">
              H
            </span>
            <span className="text-[20px] font-bold tracking-tight text-white">
              Hello Hotshot
            </span>
          </div>
          <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-[#5f6b7a]">
            CRM
          </p>
        </div>

        <div className="rounded-lg border border-[#242b35] bg-[#12161c] p-8 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
          <h1 className="mb-1 text-[22px] font-semibold text-white">Sign in</h1>
          <p className="mb-6 text-[13px] text-[#8b93a0]">
            Access your Hello Hotshot pipeline.
          </p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-[12px] text-[#4b5563]">
          Hello Hotshot CRM · Authorized users only
        </p>
      </div>
    </div>
  );
}

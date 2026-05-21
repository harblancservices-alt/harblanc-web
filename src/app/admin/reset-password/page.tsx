import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center bg-neutral-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
          <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
          Dispatch
        </p>
        <h1 className="mt-5 text-3xl font-display tracking-tight text-white sm:text-4xl">
          Reset password
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          Enter your dispatch email. We will send you a link to set a new
          password.
        </p>

        <ResetPasswordForm />
      </div>
    </div>
  );
}

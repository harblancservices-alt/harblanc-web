import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[#0E1217] px-4 py-12"
      style={{
        fontFamily:
          '"Helvetica Neue", Helvetica, Arial, system-ui, -apple-system, sans-serif',
      }}
    >
      <div className="w-full max-w-[420px] rounded-2xl border border-[#242B35] bg-[#12161C] p-[42px] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
        <h1 className="text-center text-[25px] font-bold leading-tight text-white">
          Reset password
        </h1>
        <p className="mt-2 text-center text-[12.5px] font-medium leading-relaxed text-[#7C8695]">
          Enter your email and we’ll send you a link to set a new password.
        </p>

        <ResetPasswordForm />
      </div>
    </div>
  );
}

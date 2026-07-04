import type { Metadata } from "next";
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata: Metadata = {
  title: "Set new password",
  robots: { index: false, follow: false },
};

export default function UpdatePasswordPage() {
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
          Set new password
        </h1>
        <p className="mt-2 text-center text-[12.5px] font-medium leading-relaxed text-[#7C8695]">
          Choose a new password for your account. You’ll sign in again with it.
        </p>

        <UpdatePasswordForm />
      </div>
    </div>
  );
}

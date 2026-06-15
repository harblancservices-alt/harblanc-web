import type { Metadata } from "next";
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata: Metadata = {
  title: "Set new password",
  robots: { index: false, follow: false },
};

export default function UpdatePasswordPage() {
  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="flex items-center gap-3 font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
          <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
          Dispatch
        </p>
        <h1 className="mt-5 text-3xl font-display tracking-tight text-fg sm:text-4xl">
          Set new password
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-fg">
          Choose a new password for your dispatch account. You will need to
          sign in again with the new password.
        </p>

        <UpdatePasswordForm />
      </div>
    </div>
  );
}

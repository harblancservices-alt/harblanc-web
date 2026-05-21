import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Dispatch login",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center bg-neutral-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
          <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
          Dispatch
        </p>
        <h1 className="mt-5 text-3xl font-display tracking-tight text-white sm:text-4xl">
          Sign in
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          Authorized personnel only.
        </p>

        <LoginForm
          initialError={params.error ?? null}
          initialNotice={params.notice ?? null}
        />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Dispatch login",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; next?: string }>;
}) {
  const params = await searchParams;
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
          Sign in
        </h1>
        <p className="mt-2 text-center text-[12.5px] font-medium text-[#7C8695]">
          Enter your credentials to continue
        </p>

        <LoginForm
          initialError={params.error ?? null}
          initialNotice={params.notice ?? null}
          next={params.next ?? null}
        />
      </div>
    </div>
  );
}

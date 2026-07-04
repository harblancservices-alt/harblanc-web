"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Status = "idle" | "submitting";

const ERROR_COPY: Record<string, string> = {
  not_authorized:
    "That account isn\u2019t authorized to access the dispatch center.",
  misconfigured: "Server configuration error. Contact dispatch.",
  auth_callback_failed:
    "That reset link couldn\u2019t be verified. Request a new one.",
};

const NOTICE_COPY: Record<string, string> = {
  password_updated:
    "Password updated. Sign in with your new password.",
};

export function LoginForm({
  initialError,
  initialNotice,
}: {
  initialError: string | null;
  initialNotice?: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(
    initialError
      ? (ERROR_COPY[initialError] ?? "Could not sign in.")
      : null,
  );
  const [notice] = useState<string | null>(
    initialNotice ? (NOTICE_COPY[initialNotice] ?? null) : null,
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message || "Could not sign in.");
      setStatus("idle");
      return;
    }

    // Push to /admin and force a server-side re-fetch so middleware sees
    // the freshly-written cookie.
    router.replace("/admin");
    router.refresh();
  }

  const fieldClass =
    "mt-2 block h-[50px] w-full rounded-[9px] border border-[#3A424D] bg-[#1B212A] pl-4 text-[13.5px] text-[#EDEFF2] placeholder:text-[#5A6472] transition-colors focus:border-[1.7px] focus:border-[#E5484D] focus:outline-none";
  const labelClass =
    "text-[10.5px] font-bold uppercase tracking-[0.8px] text-[#8790A0]";

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-8">
      <div className="space-y-5">
        <div>
          <label htmlFor="email" className={`block ${labelClass}`}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={fieldClass}
            placeholder="name@example.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <Link
              href="/admin/reset-password"
              className="text-[11.5px] text-[#8790A0] transition-colors hover:text-[#EDEFF2]"
            >
              Forgot?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={fieldClass}
          />
        </div>
      </div>

      {notice ? (
        <div
          role="status"
          className="mt-5 flex items-start gap-3 rounded-[9px] border border-[#242B35] bg-[#1B212A] p-4"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 rounded-sm bg-[#7C8695]"
          />
          <p className="text-[12.5px] leading-relaxed text-[#C3C9D2]">
            {notice}
          </p>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-[9px] border border-[#E5484D]/40 bg-[#E5484D]/10 p-4"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 rounded-sm bg-[#E5484D]"
          />
          <p className="text-[12.5px] leading-relaxed text-[#F1908F]">
            {error}
          </p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-6 inline-flex h-[52px] w-full items-center justify-center rounded-[9px] bg-[#E5484D] text-[14.5px] font-bold text-white transition-colors hover:bg-[#d13b40] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "submitting" ? "Signing in\u2026" : "Sign in"}
      </button>
    </form>
  );
}

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

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-10 space-y-6">
      <div>
        <label
          htmlFor="email"
          className="block font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase"
        >
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
          className="mt-2.5 block w-full bg-white px-4 py-3.5 text-base text-zinc-900 placeholder:text-zinc-400 border border-zinc-300 focus:border-red-600 focus:outline-none"
          placeholder="dispatch@harblancservices.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-2.5 block w-full bg-white px-4 py-3.5 text-base text-zinc-900 placeholder:text-zinc-400 border border-zinc-300 focus:border-red-600 focus:outline-none"
        />
      </div>

      {notice ? (
        <div
          role="status"
          className="flex items-start gap-3 border border-zinc-300 bg-zinc-100 p-4"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-zinc-500"
          />
          <p className="text-sm leading-relaxed text-zinc-800">{notice}</p>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 border border-red-300 bg-red-50 p-4"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
          />
          <p className="text-sm leading-relaxed text-red-800">{error}</p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "submitting" ? "Signing in\u2026" : "Sign in"}
      </button>

      <div className="text-center">
        <Link
          href="/admin/reset-password"
          className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase transition-colors hover:text-zinc-900"
        >
          Forgot password?
        </Link>
      </div>
    </form>
  );
}

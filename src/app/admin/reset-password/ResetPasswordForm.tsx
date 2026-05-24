"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Status = "idle" | "submitting" | "done";

export function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback?next=/admin/update-password`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo },
    );

    if (resetError) {
      setError(resetError.message || "Could not send reset link.");
      setStatus("idle");
      return;
    }

    setStatus("done");
  }

  if (status === "done") {
    return (
      <div className="mt-10 border border-zinc-300 bg-zinc-100 p-5">
        <p className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
          Sent
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-700">
          If that email is registered, a reset link is on its way. Check the
          inbox and click the link to set a new password.
        </p>
        <Link
          href="/admin/login"
          className="mt-5 inline-block font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase transition-colors hover:text-zinc-900"
        >
          &larr; Back to sign in
        </Link>
      </div>
    );
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
          className="mt-2.5 block w-full bg-white px-4 py-3.5 text-base text-zinc-900 placeholder:text-zinc-500 border border-zinc-300 focus:border-red-600 focus:outline-none"
          placeholder="dispatch@harblancservices.com"
        />
      </div>

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
        {status === "submitting" ? "Sending\u2026" : "Send reset link"}
      </button>

      <Link
        href="/admin/login"
        className="block font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase transition-colors hover:text-zinc-900"
      >
        &larr; Back to sign in
      </Link>
    </form>
  );
}

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
      <div className="mt-10 border border-neutral-800 bg-neutral-900/40 p-5">
        <p className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
          Sent
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-300">
          If that email is registered, a reset link is on its way. Check the
          inbox and click the link to set a new password.
        </p>
        <Link
          href="/admin/login"
          className="mt-5 inline-block font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase transition-colors hover:text-white"
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
          className="block font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase"
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
          className="mt-2.5 block w-full bg-neutral-900 px-4 py-3.5 text-base text-zinc-100 placeholder:text-neutral-600 border border-neutral-800 focus:border-red-600 focus:outline-none"
          placeholder="dispatch@harblancservices.com"
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 border border-red-700 bg-red-950/30 p-4"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
          />
          <p className="text-sm leading-relaxed text-red-200">{error}</p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "submitting" ? "Sending\u2026" : "Send reset link"}
      </button>

      <Link
        href="/admin/login"
        className="block font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase transition-colors hover:text-white"
      >
        &larr; Back to sign in
      </Link>
    </form>
  );
}

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
    const redirectTo = `${origin}/auth/callback?next=/update-password`;

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

  const labelClass =
    "text-[10.5px] font-bold uppercase tracking-[0.8px] text-[#8790A0]";
  const backLink =
    "text-[11.5px] font-medium text-[#8790A0] transition-colors hover:text-[#EDEFF2]";

  if (status === "done") {
    return (
      <div className="mt-8">
        <div className="rounded-[9px] border border-[#242B35] bg-[#1B212A] p-5">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.8px] text-[#8790A0]">
            Sent
          </p>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-[#C3C9D2]">
            If that email is registered, a reset link is on its way. Check the
            inbox and click the link to set a new password.
          </p>
        </div>
        <Link href="/login" className={`mt-6 inline-block ${backLink}`}>
          &larr; Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-8">
      <div>
        <label htmlFor="email" className={`block ${labelClass}`}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-2 block h-[50px] w-full rounded-[9px] border border-[#3A424D] bg-[#1B212A] pl-4 text-[13.5px] text-[#EDEFF2] placeholder:text-[#5A6472] transition-colors focus:border-[1.7px] focus:border-[#E5484D] focus:outline-none"
          placeholder="name@example.com"
        />
      </div>

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
        {status === "submitting" ? "Sending…" : "Send reset link"}
      </button>

      <Link href="/login" className={`mt-6 block text-center ${backLink}`}>
        &larr; Back to sign in
      </Link>
    </form>
  );
}

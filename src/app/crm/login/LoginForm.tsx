"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Hello Hotshot CRM sign-in. Authenticates against Supabase Auth
 * (signInWithPassword) via the shared browser client, then confirms the user
 * actually has a CRM membership row (crm_profiles) before entering the app —
 * a dispatch admin's credentials will authenticate but carry no CRM access,
 * so we sign them back out with a clear message instead of bouncing them
 * through a redirect. NO password is hardcoded anywhere; the user + org are
 * provisioned directly in Supabase.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialError =
    params.get("error") === "no_access"
      ? "This account doesn't have Hello Hotshot CRM access."
      : params.get("error") === "misconfigured"
        ? "The CRM is not configured correctly. Contact your administrator."
        : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      setError("Incorrect email or password.");
      setSubmitting(false);
      return;
    }

    // Confirm CRM membership before entering. RLS lets a member read only
    // their own crm_profiles row; a non-member reads nothing.
    const { data: profile } = await supabase
      .from("crm_profiles")
      .select("id, is_active")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      await supabase.auth.signOut();
      setError("This account doesn't have Hello Hotshot CRM access.");
      setSubmitting(false);
      return;
    }

    // Full page navigation so middleware re-reads the freshly set session
    // cookies on the first /crm request.
    window.location.assign("/crm");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[#4a2327] bg-[#2a181a] px-3.5 py-2.5 text-[13px] leading-snug text-[#f4a3a3]"
        >
          {error}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#8b93a0]">
          Email
        </span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-lg border border-[#3a424d] bg-[#1b212a] px-3.5 text-[15px] text-white outline-none transition-colors focus:border-[#3f8ae0] focus:ring-2 focus:ring-[#3f8ae0]/25"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#8b93a0]">
          Password
        </span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-lg border border-[#3a424d] bg-[#1b212a] pl-3.5 pr-16 text-[15px] text-white outline-none transition-colors focus:border-[#3f8ae0] focus:ring-2 focus:ring-[#3f8ae0]/25"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b93a0] transition-colors hover:text-white"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 h-11 rounded-lg bg-[#2f76d6] text-[14px] font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-[#2864bb] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

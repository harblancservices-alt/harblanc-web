"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Status = "idle" | "submitting";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don\u2019t match.");
      return;
    }

    setStatus("submitting");

    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message || "Could not update password.");
      setStatus("idle");
      return;
    }

    // Sign out so the next sign-in uses the new password explicitly.
    await supabase.auth.signOut();
    router.replace("/admin/login?notice=password_updated");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-10 space-y-6">
      <div>
        <label
          htmlFor="password"
          className="block font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase"
        >
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="mt-2.5 block w-full bg-white px-4 py-3.5 text-base text-zinc-900 placeholder:text-zinc-400 border border-zinc-300 focus:border-red-600 focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="confirm"
          className="block font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase"
        >
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          className="mt-2.5 block w-full bg-white px-4 py-3.5 text-base text-zinc-900 placeholder:text-zinc-400 border border-zinc-300 focus:border-red-600 focus:outline-none"
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
        {status === "submitting" ? "Updating\u2026" : "Set new password"}
      </button>
    </form>
  );
}

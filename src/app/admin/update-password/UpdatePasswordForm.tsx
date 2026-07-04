"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { EyeIcon, EyeOffIcon } from "../login/icons";

type Status = "idle" | "submitting";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // Best-effort account email from the recovery session, rendered into a
  // hidden username field so password managers save the new password against
  // the right account.
  const [accountEmail, setAccountEmail] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user?.email) setAccountEmail(data.user.email);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don’t match.");
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

  const labelClass =
    "text-[10.5px] font-bold uppercase tracking-[0.8px] text-[#8790A0]";
  const fieldBase =
    "block h-[50px] w-full rounded-[9px] border border-[#3A424D] bg-[#1B212A] pl-4 text-[13.5px] text-[#EDEFF2] placeholder:text-[#5A6472] transition-colors focus:border-[1.7px] focus:border-[#E5484D] focus:outline-none";

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-8">
      {/* Hidden username for password managers — associates the saved
          password with the account. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={accountEmail}
        readOnly
        aria-hidden
        tabIndex={-1}
        className="sr-only"
      />

      <div className="space-y-5">
        <div>
          <label htmlFor="password" className={`block ${labelClass}`}>
            New password
          </label>
          <div className="relative mt-2">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className={`${fieldBase} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center px-3.5 text-[#8790A0] transition-colors hover:text-[#EDEFF2]"
            >
              {showPassword ? (
                <EyeOffIcon className="h-[18px] w-[18px]" />
              ) : (
                <EyeIcon className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirm" className={`block ${labelClass}`}>
            Confirm new password
          </label>
          <input
            id="confirm"
            name="confirm"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className={`mt-2 ${fieldBase}`}
          />
        </div>
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
        {status === "submitting" ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}

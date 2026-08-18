"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { applySessionPersistence } from "./sessionPersistence";
import { EyeIcon, EyeOffIcon, SpinnerIcon, CapsLockIcon } from "./icons";

type Status = "idle" | "submitting";

// Copy for errors surfaced via the URL (?error=…) by middleware / callback.
const ERROR_COPY: Record<string, string> = {
  not_authorized:
    "That account isn’t authorized to access the dispatch center.",
  misconfigured: "Server configuration error. Contact dispatch.",
  auth_callback_failed:
    "That reset link couldn’t be verified. Request a new one.",
};

const NOTICE_COPY: Record<string, string> = {
  password_updated: "Password updated. Sign in with your new password.",
};

// Client-side lockout — a UX guard only. Real brute-force protection is
// Supabase Auth's built-in rate limiting (see the note in the PR/commit).
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 60_000;
const LS_FAILS = "hb-login-fails";
const LS_LOCK = "hb-login-lock-until";

/** Map a Supabase AuthError to a clear, human message. */
function friendlyAuthError(err: {
  message?: string;
  status?: number;
}): string {
  const msg = (err.message ?? "").toLowerCase();
  const status = err.status;
  if (status === 429 || msg.includes("rate limit") || msg.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid credentials")
  ) {
    return "Email or password is incorrect.";
  }
  if (msg.includes("email not confirmed")) {
    return "This email hasn’t been confirmed yet. Check your inbox for the confirmation link.";
  }
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return "Network error. Check your connection and try again.";
  }
  return err.message || "Could not sign in. Try again.";
}

/**
 * Sanitise the `next` redirect target the same way /auth/callback does:
 * only a same-origin path starting with `/` (never `//`, which browsers
 * treat as protocol-relative) is trusted. Anything else falls back to the
 * default landing page, so a crafted `?next=` query can never send a
 * successful login somewhere off-site.
 */
function sanitizeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function LoginForm({
  initialError,
  initialNotice,
  next,
}: {
  initialError: string | null;
  initialNotice?: string | null;
  /**
   * Where to land after a successful sign-in — set by middleware.ts when
   * it bounces an unauthenticated visitor here from a protected route
   * (e.g. /tms-v2/loads), so a tms-v2 visitor lands back in tms-v2 and an
   * admin visitor lands back in admin, without this form having to guess
   * which app a given login belongs to. Falls back to /admin (today's
   * existing default landing page) when absent — e.g. someone navigating
   * to /login directly rather than being redirected here.
   */
  next?: string | null;
}) {
  const router = useRouter();
  const destination = sanitizeNext(next) ?? "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(
    initialError ? (ERROR_COPY[initialError] ?? "Could not sign in.") : null,
  );
  const [notice] = useState<string | null>(
    initialNotice ? (NOTICE_COPY[initialNotice] ?? null) : null,
  );

  // Lockout state. lockUntil is an epoch-ms timestamp; 0 = not locked.
  const [lockUntil, setLockUntil] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const failsRef = useRef(0);

  // Restore any in-flight lockout / fail count from a prior page load. The
  // state write is deferred to a timeout so it isn't a synchronous setState in
  // the effect body (and never runs during SSR).
  useEffect(() => {
    let until = 0;
    try {
      failsRef.current = Number(localStorage.getItem(LS_FAILS)) || 0;
      until = Number(localStorage.getItem(LS_LOCK)) || 0;
    } catch {
      // localStorage unavailable (private mode) — lockout just won't persist.
    }
    if (until <= Date.now()) return;
    const t = setTimeout(() => {
      setNowMs(Date.now());
      setLockUntil(until);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Tick once a second while locked so the countdown updates and the form
  // re-enables when the cooldown expires. All state writes happen inside the
  // rAF / interval callbacks, not synchronously in the effect body.
  useEffect(() => {
    if (!lockUntil) return;
    const tick = () => {
      const t = Date.now();
      setNowMs(t);
      if (t >= lockUntil) {
        setLockUntil(0);
        try {
          localStorage.removeItem(LS_LOCK);
        } catch {}
      }
    };
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [lockUntil]);

  const locked = lockUntil > 0 && nowMs < lockUntil;
  const secondsLeft = locked ? Math.ceil((lockUntil - nowMs) / 1000) : 0;

  const syncCaps = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  }, []);

  function registerFailure() {
    const next = failsRef.current + 1;
    failsRef.current = next;
    try {
      if (next >= MAX_ATTEMPTS) {
        const until = Date.now() + COOLDOWN_MS;
        failsRef.current = 0;
        localStorage.setItem(LS_FAILS, "0");
        localStorage.setItem(LS_LOCK, String(until));
        setNowMs(Date.now());
        setLockUntil(until);
      } else {
        localStorage.setItem(LS_FAILS, String(next));
      }
    } catch {
      // No persistence — still enforce the in-memory count for this session.
      if (next >= MAX_ATTEMPTS) {
        failsRef.current = 0;
        setNowMs(Date.now());
        setLockUntil(Date.now() + COOLDOWN_MS);
      }
    }
  }

  function clearFailures() {
    failsRef.current = 0;
    try {
      localStorage.removeItem(LS_FAILS);
      localStorage.removeItem(LS_LOCK);
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked || status === "submitting") return;
    setStatus("submitting");
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(friendlyAuthError(signInError));
      registerFailure();
      setStatus("idle");
      return;
    }

    // Success — honor the Remember-me choice for cookie persistence, clear the
    // lockout counters, then hand off to the existing redirect.
    clearFailures();
    applySessionPersistence(remember);

    // Push to the intended destination and force a server-side re-fetch so
    // middleware sees the freshly-written cookie.
    router.replace(destination);
    router.refresh();
  }

  const fieldBase =
    "block h-[50px] w-full rounded-[9px] border border-[#3A424D] bg-[#1B212A] pl-4 text-[13.5px] text-[#EDEFF2] placeholder:text-[#5A6472] transition-colors focus:border-[1.7px] focus:border-[#E5484D] focus:outline-none disabled:opacity-60";
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
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={locked}
            className={`mt-2 ${fieldBase}`}
            placeholder="name@example.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <Link
              href="/reset-password"
              className="text-[11.5px] text-[#8790A0] transition-colors hover:text-[#EDEFF2]"
            >
              Forgot?
            </Link>
          </div>
          <div className="relative mt-2">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={syncCaps}
              onKeyUp={syncCaps}
              onBlur={() => setCapsOn(false)}
              required
              disabled={locked}
              className={`${fieldBase} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center px-3.5 text-[#8790A0] transition-colors hover:text-[#EDEFF2] focus-visible:text-[#EDEFF2]"
            >
              {showPassword ? (
                <EyeOffIcon className="h-[18px] w-[18px]" />
              ) : (
                <EyeIcon className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
          {capsOn ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-[#E0A64B]">
              <CapsLockIcon className="h-3.5 w-3.5" />
              Caps Lock is on
            </p>
          ) : null}
        </div>
      </div>

      <label className="mt-5 flex cursor-pointer items-center gap-2.5 select-none">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-4 w-4 rounded-[4px] border-[#3A424D] bg-[#1B212A] accent-[#E5484D]"
        />
        <span className="text-[12.5px] font-medium text-[#8790A0]">
          Remember me
        </span>
      </label>

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

      {locked ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-[9px] border border-[#E5484D]/40 bg-[#E5484D]/10 p-4"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 rounded-sm bg-[#E5484D]"
          />
          <p className="text-[12.5px] leading-relaxed text-[#F1908F]">
            Too many failed attempts. Try again in {secondsLeft}s.
          </p>
        </div>
      ) : error ? (
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
        disabled={status === "submitting" || locked}
        className="mt-6 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[9px] bg-[#E5484D] text-[14.5px] font-bold text-white transition-colors hover:bg-[#d13b40] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "submitting" ? (
          <>
            <SpinnerIcon className="h-[18px] w-[18px] animate-spin" />
            Signing in{"…"}
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}

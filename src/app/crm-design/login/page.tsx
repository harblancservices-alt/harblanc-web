"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "../_lib/store";
import { Button, INPUT, Field, TEXT } from "../_design/ui";
import { TEAM } from "../_lib/data";
import { Avatar } from "../_design/ui";

/**
 * Prototype login. Cosmetic only — there is no real auth here (see
 * DESIGN_DECISIONS.md). The "Continue as" row below the form is this
 * prototype's role switcher: it's how a reviewer experiences the Sales
 * Agent view vs the Owner/Admin view without a real multi-account login.
 * The same switcher is reachable from the account menu in the app shell
 * once signed in, so a reviewer never has to log out to compare views.
 */
export default function LoginPage() {
  const router = useRouter();
  const { setCurrentUserId } = useStore();
  const [email, setEmail] = useState("brent@hellohotshot.com");

  function enter(userId: string) {
    setCurrentUserId(userId);
    router.push("/crm-design");
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_460px]">
      <div className="hidden flex-col justify-between bg-[var(--cd-side-bg)] p-10 text-[var(--cd-side-text)] lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--cd-radius-sm)] bg-[var(--cd-accent)] text-[15px] font-black text-white">
            H
          </span>
          <span className="text-[15px] font-bold text-white">Hello Hotshot CRM</span>
        </div>
        <div className="max-w-md">
          <p className="text-[26px] font-bold leading-tight text-white">
            One workspace for your book of business — and a control center for running the team.
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--cd-side-text-dim)]">
            This is a redesign prototype (branch: crm-design-prototype). Every screen uses mock data — nothing
            here reads from or writes to the real CRM.
          </p>
        </div>
        <p className={`${TEXT.micro} text-[var(--cd-side-text-dim)]`}>Prototype build — not for production use.</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-8 bg-[var(--cd-bg)] p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--cd-radius-sm)] bg-[var(--cd-accent)] text-[15px] font-black text-white">
              H
            </span>
            <span className="text-[15px] font-bold text-[var(--cd-text)]">Hello Hotshot CRM</span>
          </div>

          <h1 className={`${TEXT.pageTitle} text-[var(--cd-text)]`}>Sign in</h1>
          <p className={`mt-1 ${TEXT.body} text-[var(--cd-text-muted)]`}>Welcome back. Enter your details to continue.</p>

          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              enter("u-brent");
            }}
          >
            <Field label="Email">
              <input className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </Field>
            <Field label="Password">
              <input className={INPUT} type="password" defaultValue="••••••••••" />
            </Field>
            <Button type="submit" variant="primary" className="mt-1 w-full">
              Sign in
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--cd-border)]" />
            <span className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>Prototype quick sign-in</span>
            <div className="h-px flex-1 bg-[var(--cd-border)]" />
          </div>

          <div className="flex flex-col gap-2">
            {TEAM.filter((m) => m.isActive).slice(0, 3).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => enter(m.id)}
                className="flex items-center gap-3 rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--cd-accent)]/40 hover:bg-[var(--cd-accent-soft)]"
              >
                <Avatar name={m.name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-[var(--cd-text)]">{m.name}</span>
                  <span className={`block truncate ${TEXT.micro} text-[var(--cd-text-subtle)]`}>
                    {m.title} · {m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Sales Agent"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

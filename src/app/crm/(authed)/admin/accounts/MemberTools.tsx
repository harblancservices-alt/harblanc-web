"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { BTN_CREATE, BTN_EDIT, BTN_NEUTRAL, Card, CardHead } from "../../_shell/ui";
import { formatDate } from "../../_shell/format";
import {
  inviteMember,
  repairLogin,
  ignoreLogin,
  sendInvite,
  type NewMemberRole,
} from "../member-actions";
import type { OrphanLogin } from "../accounts-data";

/**
 * ADD USER, AND FIX A LOGIN THAT HAS NO CRM ACCESS.
 *
 * Both halves of the same problem, on the one page that already lists the
 * team. See ../member-actions.ts for why this exists at all — briefly: a CRM
 * user is two rows, nothing created the pair, and on 2026-08-30 the profile
 * half was missed twice inside twenty minutes while provisioning one hire.
 *
 * THE REPAIR LIST IS FIRST, and rendered only when it has something in it.
 * It is the failure that actually happens; "Add user" is the one that stops
 * it happening. A list that is empty most of the time and loud when it is
 * not is the right shape for a warning — a permanently-visible one gets
 * learned and ignored, which is exactly why dispatch@ can be dismissed
 * rather than filtered by name in code.
 */

const ROLE_NOTE: Record<NewMemberRole, string> = {
  member: "Sees only what they own. The right choice for a sales hire.",
  owner: "Full admin — Activity, the work pool, and every team account.",
};

function RolePicker({
  value,
  onChange,
  idPrefix,
}: {
  value: NewMemberRole;
  onChange: (r: NewMemberRole) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-fg-muted">Role</span>
      <div className="flex gap-2">
        {(["member", "owner"] as const).map((r) => (
          <button
            key={r}
            id={`${idPrefix}-${r}`}
            type="button"
            onClick={() => onChange(r)}
            className={`flex-1 rounded-md border px-3 py-2 text-left text-[12.5px] font-bold capitalize transition-colors ${
              value === r
                ? "border-accent bg-accent-bg text-accent"
                : "border-line bg-card text-fg hover:bg-inset"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      {/* Never inferred, and never silent about what the choice means — a
          new hire quietly becoming an owner is the expensive mistake here. */}
      <p className="text-[11.5px] text-fg-subtle">{ROLE_NOTE[value]}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-fg-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-line bg-card px-3 py-2 text-[13px] text-fg focus:border-accent focus:outline-none"
      />
    </label>
  );
}

/* ═══════════════ ADD USER ════════════════════════════════════════════ */

export function AddUserButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<NewMemberRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await inviteMember({ email, fullName: name, role });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(email);
      router.refresh();
    });
  }

  function close() {
    setOpen(false);
    setName("");
    setEmail("");
    setRole("member");
    setError(null);
    setDone(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3.5 text-[12.5px] font-bold transition-colors ${BTN_CREATE}`}
      >
        + Add user
      </button>

      <Modal open={open} onClose={close} busy={pending} title="Add a team member">
        {done ? (
          /* THE ACCOUNT EXISTS. How they get in is a separate, explicit
             choice — Brent set passwords by hand twice rather than using an
             invite, so neither is done for him. */
          <div className="flex flex-col gap-3 p-1">
            <p className="text-[13px] font-bold text-fg">{done} can now be given access.</p>
            <p className="text-[12.5px] leading-relaxed text-fg-subtle">
              The login and the CRM profile both exist. They have <strong>no password yet</strong>.
              Either email them an invite so they set their own, or set one yourself in Supabase —
              whichever you prefer.
            </p>
            {error && (
              <p className="rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await sendInvite(done);
                    setError(res.ok ? null : res.error);
                    if (res.ok) close();
                  })
                }
                className={`rounded-md px-3 py-2 text-[12.5px] font-bold transition-colors ${BTN_EDIT}`}
              >
                Email them an invite
              </button>
              <button
                type="button"
                onClick={close}
                className={`rounded-md border px-3 py-2 text-[12.5px] font-bold transition-colors ${BTN_NEUTRAL}`}
              >
                I&rsquo;ll set the password myself
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-1">
            <Field label="Full name" value={name} onChange={setName} placeholder="Charia Webb" />
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              type="email"
              placeholder="name@hellohotshot.co"
            />
            <RolePicker value={role} onChange={setRole} idPrefix="add" />
            {error && (
              <p className="rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={close}
                className={`rounded-md border px-3 py-2 text-[12.5px] font-bold transition-colors ${BTN_NEUTRAL}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className={`rounded-md px-3.5 py-2 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_CREATE}`}
              >
                {pending ? "Creating…" : "Create account"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ═══════════════ REPAIR ══════════════════════════════════════════════ */

export function OrphanLogins({ logins }: { logins: OrphanLogin[] }) {
  const router = useRouter();
  const [fixing, setFixing] = useState<OrphanLogin | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<NewMemberRole>("member");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"fix" | "ignore">("fix");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Renders nothing when there is nothing wrong. See the note at the top.
  if (logins.length === 0) return null;

  function open(l: OrphanLogin, m: "fix" | "ignore") {
    setFixing(l);
    setMode(m);
    setName("");
    setRole("member");
    setReason("");
    setError(null);
  }

  function submit() {
    if (!fixing) return;
    setError(null);
    start(async () => {
      const res =
        mode === "fix"
          ? await repairLogin({ userId: fixing.userId, fullName: name, role })
          : await ignoreLogin({ userId: fixing.userId, reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFixing(null);
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardHead
          title="Logins without CRM access"
          hint={`${logins.length} ${logins.length === 1 ? "login" : "logins"}`}
        />
        <div className="border-t border-warn/40 bg-warn-bg px-3 py-2">
          <p className="text-[12.5px] leading-relaxed text-warn">
            These can sign in but have no CRM profile, so they land on{" "}
            <strong>&ldquo;This account doesn&rsquo;t have Hello Hotshot CRM access.&rdquo;</strong>{" "}
            Give them a profile, or mark the login as not a CRM member.
          </p>
        </div>
        <ul>
          {logins.map((l) => (
            <li
              key={l.userId}
              className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-fg">
                  {l.email ?? "(no email)"}
                </span>
                <span className="block text-[11.5px] text-fg-subtle">
                  Login created {formatDate(l.createdAt)}
                  {l.lastSignInAt ? ` · last signed in ${formatDate(l.lastSignInAt)}` : " · never signed in"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => open(l, "fix")}
                className={`shrink-0 rounded-md px-3 py-1.5 text-[12px] font-bold transition-colors ${BTN_CREATE}`}
              >
                Give CRM access
              </button>
              <button
                type="button"
                onClick={() => open(l, "ignore")}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-bold transition-colors ${BTN_NEUTRAL}`}
              >
                Not a CRM user
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Modal
        open={fixing !== null}
        onClose={() => setFixing(null)}
        busy={pending}
        title={mode === "fix" ? "Give this login CRM access" : "Mark as not a CRM user"}
      >
        <div className="flex flex-col gap-3 p-1">
          <p className="text-[12.5px] text-fg-subtle">{fixing?.email}</p>

          {mode === "fix" ? (
            <>
              <Field label="Full name" value={name} onChange={setName} placeholder="Charia Webb" />
              <RolePicker value={role} onChange={setRole} idPrefix="fix" />
            </>
          ) : (
            <>
              <Field
                label="Why"
                value={reason}
                onChange={setReason}
                placeholder="TMS dispatch login — not a CRM member"
              />
              <p className="text-[11.5px] text-fg-subtle">
                It stops appearing here. Nothing about the login itself changes.
              </p>
            </>
          )}

          {error && (
            <p className="rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setFixing(null)}
              className={`rounded-md border px-3 py-2 text-[12.5px] font-bold transition-colors ${BTN_NEUTRAL}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className={`rounded-md px-3.5 py-2 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_CREATE}`}
            >
              {pending ? "Saving…" : mode === "fix" ? "Create profile" : "Mark as not a CRM user"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  formatDateFull,
  formatDateShort,
  relativeTime,
} from "@/lib/admin/format";
import {
  softDeleteApplication,
  restoreApplication,
  permanentlyDeleteApplication,
} from "../actions";

export const metadata: Metadata = {
  title: "Application detail",
  robots: { index: false, follow: false },
};

/**
 * Level 6.7 — Application detail page (V7).
 *
 * Operator workspace layout, mirroring the design language established by:
 *   - Active Quotes V6.3 hero
 *   - Quotes Trash V6.5 retention strip + outlined actions
 *   - Applications V6.6 feed cards + outlined Trash/Restore/Delete buttons
 *
 * Vertical spine (top → bottom):
 *   1. Back link            (mono caps, no chrome)
 *   2. Hero                 (eyebrow + name H1 + right-aligned meta)
 *   3. Trash strip          (conditional, compact cream retention bar)
 *   4. Contact card         (primary card: Phone / Email / Trash | Restore + Delete)
 *   5. Operations strip     (inline metadata: equipment · CDL · years + home base)
 *   6. Message card         (conditional, cream feed card)
 *   7. Forensics disclosure (collapsed <details>: created, lead id, IP, UA)
 *
 * SCOPE (Level 6.7 directive): single-file presentational restructure.
 *   - Server actions unchanged: softDeleteApplication, restoreApplication,
 *     permanentlyDeleteApplication. Still bound via server-action form.
 *   - Loader unchanged.
 *   - No tabs, no workflow, no quote lifecycle, no activity feed, no
 *     uploads/notes/comments, no approval system. Applications stay
 *     intentionally narrow — read, contact, decide.
 */

type ApplicationRow = {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string;
  equipment_type: string;
  cdl_status: string;
  years_experience: string | null;
  home_base: string | null;
  message: string | null;
  user_agent: string | null;
  ip: string | null;
  deleted_at: string | null;
  delete_after: string | null;
};

async function loadApplication(id: string): Promise<ApplicationRow | null> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("applications")
    .select("*")
    .eq("id", id)
    .maybeSingle<ApplicationRow>();
  return data ?? null;
}

// "APP CEF2ADD5" — first 8 chars of the UUID, uppercased. Mirrors the
// REQ {shortId} convention used on quote detail pages.
function shortAppId(id: string): string {
  return `APP ${id.slice(0, 8).toUpperCase()}`;
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await loadApplication(id);
  if (!row) notFound();

  const isTrashed = Boolean(row.deleted_at);
  const phoneHref = `tel:${row.phone.replace(/[^\d+]/g, "")}`;
  const emailHref = `mailto:${row.email}`;
  const hasPhone = row.phone.trim().length > 0;
  const hasEmail = row.email.trim().length > 0;
  const hasMessage = row.message != null && row.message.trim().length > 0;

  // Operations strip tokens
  const equipment = row.equipment_type.trim().toUpperCase();
  const cdl = row.cdl_status.trim().toUpperCase();
  const years = row.years_experience?.trim() || null;
  const homeBase = row.home_base?.trim() || null;
  const metaTokens: string[] = [];
  if (equipment) metaTokens.push(equipment);
  if (cdl) metaTokens.push(`CDL ${cdl}`);
  if (years) metaTokens.push(`${years} YRS`);

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-6 sm:px-6 lg:px-10">
        <div className="max-w-4xl">
          {/* Back link */}
          <Link
            href={
              isTrashed ? "/admin/applications/trash" : "/admin/applications"
            }
            prefetch={false}
            className="inline-flex items-center font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-fg-muted transition-colors hover:text-fg"
          >
            ← All {isTrashed ? "trash" : "applications"}
          </Link>

          {/* Hero — eyebrow + name + right-aligned meta */}
          <header className="mb-4 mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
                Application
              </p>
              <h1 className="mt-1 text-[26px] font-semibold leading-none tracking-tight text-fg sm:text-[30px]">
                {row.name || "—"}
              </h1>
            </div>
            <p
              className="text-right font-mono text-[11px] leading-snug tabular-nums text-fg-subtle"
              title={formatDateFull(row.created_at)}
            >
              Received {relativeTime(row.created_at)}
              <br />
              {shortAppId(row.id)}
            </p>
          </header>

          {/* Trash strip (only when trashed) */}
          {isTrashed ? (
            <section
              aria-label="In trash"
              className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5"
            >
              <p className="shrink-0 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-amber-800">
                In trash
              </p>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-amber-700">
                Moved {relativeTime(row.deleted_at!)}
                {row.delete_after ? (
                  <>
                    <span aria-hidden className="mx-1.5 text-amber-700/50">
                      ·
                    </span>
                    Auto-purge {formatDateShort(row.delete_after).slice(0, 10)}
                  </>
                ) : null}
              </p>
            </section>
          ) : null}

          {/* Contact card */}
          <section
            aria-label="Contact"
            className="overflow-hidden rounded-md border border-line bg-card shadow-sm"
          >
            <div className="bg-bar px-4 py-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-bar-fg">
                Contact
              </span>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <p className="text-[18px] font-semibold text-fg">
                {row.name || "—"}
              </p>

              <div className="mt-3 space-y-2">
                {hasPhone ? (
                  <a
                    href={phoneHref}
                    aria-label={`Call ${row.name || "applicant"}`}
                    className="flex w-full items-center gap-2 rounded-md border border-line bg-elevated px-3 py-2 text-[13px] font-medium text-blue-700 transition-colors hover:bg-canvas"
                  >
                    <span aria-hidden>&#9742;</span>
                    {row.phone}
                  </a>
                ) : null}
                {hasEmail ? (
                  <a
                    href={emailHref}
                    aria-label={`Email ${row.name || "applicant"}`}
                    className="flex w-full items-center gap-2 break-all rounded-md border border-line bg-elevated px-3 py-2 text-[13px] font-medium text-blue-700 transition-colors hover:bg-canvas"
                  >
                    <span aria-hidden>&#9993;</span>
                    {row.email}
                  </a>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                {isTrashed ? (
                  <>
                    <form action={restoreApplication.bind(null, row.id)}>
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-md border border-line-strong bg-card px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-fg transition-colors hover:bg-elevated"
                      >
                        Restore
                      </button>
                    </form>
                    <form
                      action={permanentlyDeleteApplication.bind(null, row.id)}
                    >
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-md border border-red-300 bg-red-50 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-red-700 transition-colors hover:bg-red-600 hover:text-white"
                      >
                        Delete
                      </button>
                    </form>
                  </>
                ) : (
                  <form action={softDeleteApplication.bind(null, row.id)}>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-md border border-red-300 bg-red-50 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-red-700 transition-colors hover:bg-red-600 hover:text-white"
                    >
                      Trash
                    </button>
                  </form>
                )}
              </div>
            </div>
          </section>

          {/* Operations */}
          <section
            aria-label="Operations"
            className="mt-4 overflow-hidden rounded-md border border-line bg-card shadow-sm"
          >
            <div className="bg-bar px-4 py-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-bar-fg">
                Operations
              </span>
            </div>
            <div className="px-4 py-3 sm:px-5">
              <p
                className={
                  "font-mono text-[13px] font-semibold uppercase tracking-[0.12em] " +
                  (metaTokens.length > 0 ? "text-fg" : "text-fg-subtle")
                }
              >
                {metaTokens.length > 0 ? metaTokens.join(" · ") : "—"}
              </p>
              {homeBase ? (
                <p className="mt-1 text-[13px] text-fg-muted">{homeBase}</p>
              ) : null}
            </div>
          </section>

          {/* Message */}
          {hasMessage ? (
            <section
              aria-label="Message"
              className="mt-4 overflow-hidden rounded-md border border-line bg-card shadow-sm"
            >
              <div className="bg-bar px-4 py-2">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-bar-fg">
                  Message
                </span>
              </div>
              <div className="px-4 py-3 sm:px-5">
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-fg">
                  {row.message}
                </p>
              </div>
            </section>
          ) : null}

          {/* Forensics — collapsed disclosure */}
          <details className="mt-4 overflow-hidden rounded-md border border-line bg-card shadow-sm">
            <summary className="cursor-pointer list-none px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-muted transition-colors hover:text-fg">
              Forensics
            </summary>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-line px-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)]">
          <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
            Created
          </dt>
          <dd className="font-mono text-[11px] text-fg">
            {formatDateFull(row.created_at)}
          </dd>
          {row.deleted_at ? (
            <>
              <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
                Deleted
              </dt>
              <dd className="font-mono text-[11px] text-fg">
                {formatDateFull(row.deleted_at)}
              </dd>
            </>
          ) : null}
          {row.delete_after ? (
            <>
              <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
                Auto-purge
              </dt>
              <dd className="font-mono text-[11px] text-fg">
                {formatDateFull(row.delete_after)}
              </dd>
            </>
          ) : null}
          <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
            Lead ID
          </dt>
          <dd className="font-mono text-[11px] text-fg break-all">
            {row.id}
          </dd>
          {row.ip ? (
            <>
              <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
                IP
              </dt>
              <dd className="font-mono text-[11px] text-fg">{row.ip}</dd>
            </>
          ) : null}
          {row.user_agent ? (
            <>
              <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
                User agent
              </dt>
              <dd className="font-mono text-[11px] text-fg break-all">
                {row.user_agent}
              </dd>
            </>
          ) : null}
          </dl>
          </details>
        </div>
      </div>
    </div>
  );
}

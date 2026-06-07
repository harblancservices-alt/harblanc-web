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
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {/* 1. Back link */}
      <Link
        href={isTrashed ? "/admin/applications/trash" : "/admin/applications"}
        prefetch={false}
        className="inline-flex items-center font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-black transition-opacity hover:opacity-70"
      >
        ← All {isTrashed ? "trash" : "applications"}
      </Link>

      {/* 2. V3 hero — eyebrow + bold name + right-aligned meta */}
      <header className="mt-3 flex flex-wrap items-end justify-between gap-4 pb-5 sm:pb-6">
        <div>
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.28em] text-black">
            Application
          </p>
          <h1 className="mt-1 text-[30px] font-bold leading-none tracking-tight text-black sm:text-[36px] lg:text-[40px]">
            {row.name || "—"}
          </h1>
        </div>
        <p
          className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black text-right leading-snug"
          title={formatDateFull(row.created_at)}
        >
          Received {relativeTime(row.created_at)}
          <br />
          {shortAppId(row.id)}
        </p>
      </header>

      {/* 3. Trash strip — compact retention pattern (only when trashed) */}
      {isTrashed ? (
        <section
          aria-label="In trash"
          className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-[3px] border-black bg-[#fafaf6] px-4 py-2.5 sm:gap-x-4 sm:px-5"
        >
          <p className="shrink-0 font-mono text-[10.5px] font-bold uppercase tracking-[0.22em] text-black">
            In trash
          </p>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black/70">
            Moved {relativeTime(row.deleted_at!)}
            {row.delete_after ? (
              <>
                <span aria-hidden className="mx-1.5 text-black/40">
                  ·
                </span>
                Auto-purge {formatDateShort(row.delete_after).slice(0, 10)}
              </>
            ) : null}
          </p>
        </section>
      ) : null}

      {/* 4. Contact card — primary card. Phone + Email + actions */}
      <section
        aria-label="Contact"
        className="border-2 border-black border-l-4 border-l-black bg-[#fafaf6] px-5 py-5 sm:px-6 sm:py-6"
      >
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-black">
          Contact
        </p>
        <p className="mt-1.5 text-[22px] font-bold leading-tight text-black sm:text-[24px]">
          {row.name || "—"}
        </p>

        <div className="mt-4 space-y-2">
          {hasPhone ? (
            <a
              href={phoneHref}
              aria-label={`Call ${row.name || "applicant"}`}
              className="flex w-full items-center justify-center border-2 border-black bg-white px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-black hover:text-white"
            >
              <span aria-hidden className="mr-2">
                &#9742;
              </span>
              {row.phone}
            </a>
          ) : null}
          {hasEmail ? (
            <a
              href={emailHref}
              aria-label={`Email ${row.name || "applicant"}`}
              className="flex w-full items-center justify-center break-all border-2 border-black bg-white px-3 py-2 text-center font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-black hover:text-white"
            >
              <span aria-hidden className="mr-2">
                &#9993;
              </span>
              {row.email}
            </a>
          ) : null}
        </div>

        {/* Action row inside the Contact card. Server-action forms preserve
            the existing binding pattern (softDeleteApplication on active;
            restoreApplication + permanentlyDeleteApplication when trashed). */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-black/15 pt-4">
          {isTrashed ? (
            <>
              <form action={restoreApplication.bind(null, row.id)}>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center border-2 border-black bg-transparent px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-black hover:text-white"
                >
                  Restore
                </button>
              </form>
              <form action={permanentlyDeleteApplication.bind(null, row.id)}>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center border-2 border-red-700 bg-transparent px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-red-700 transition-colors hover:bg-red-700 hover:text-white"
                >
                  Delete
                </button>
              </form>
            </>
          ) : (
            <form action={softDeleteApplication.bind(null, row.id)}>
              <button
                type="submit"
                className="inline-flex items-center justify-center border-2 border-red-700 bg-transparent px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-red-700 transition-colors hover:bg-red-700 hover:text-white"
              >
                Trash
              </button>
            </form>
          )}
        </div>
      </section>

      {/* 5. Operations strip — inline metadata, no card chrome */}
      <section
        aria-label="Operations"
        className="mt-5 border-t border-black/15 pt-3"
      >
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-black">
          Operations
        </p>
        {metaTokens.length > 0 ? (
          <p className="mt-1.5 font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-black">
            {metaTokens.join(" · ")}
          </p>
        ) : (
          <p className="mt-1.5 font-mono text-[13px] uppercase tracking-[0.14em] text-black/50">
            —
          </p>
        )}
        {homeBase ? (
          <p className="mt-1 text-[13px] text-black/80">{homeBase}</p>
        ) : null}
      </section>

      {/* 6. Message card — conditional, standard cream feed chrome */}
      {hasMessage ? (
        <section
          aria-label="Message"
          className="mt-5 border-2 border-black border-l-4 border-l-black bg-[#fafaf6] px-5 py-4 sm:px-6 sm:py-5"
        >
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-black">
            Message
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-black sm:text-[15px]">
            {row.message}
          </p>
        </section>
      ) : null}

      {/* 7. Forensics — collapsed <details> disclosure */}
      <details className="mt-5 border-t border-black/15 pt-3">
        <summary className="cursor-pointer list-none font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-black/70 transition-colors hover:text-black">
          ▾ Forensics
        </summary>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-[120px_minmax(0,1fr)]">
          <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black/60">
            Created
          </dt>
          <dd className="font-mono text-[11px] text-black">
            {formatDateFull(row.created_at)}
          </dd>
          {row.deleted_at ? (
            <>
              <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black/60">
                Deleted
              </dt>
              <dd className="font-mono text-[11px] text-black">
                {formatDateFull(row.deleted_at)}
              </dd>
            </>
          ) : null}
          {row.delete_after ? (
            <>
              <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black/60">
                Auto-purge
              </dt>
              <dd className="font-mono text-[11px] text-black">
                {formatDateFull(row.delete_after)}
              </dd>
            </>
          ) : null}
          <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black/60">
            Lead ID
          </dt>
          <dd className="font-mono text-[11px] text-black break-all">
            {row.id}
          </dd>
          {row.ip ? (
            <>
              <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black/60">
                IP
              </dt>
              <dd className="font-mono text-[11px] text-black">{row.ip}</dd>
            </>
          ) : null}
          {row.user_agent ? (
            <>
              <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black/60">
                User agent
              </dt>
              <dd className="font-mono text-[11px] text-black break-all">
                {row.user_agent}
              </dd>
            </>
          ) : null}
        </dl>
      </details>
    </div>
  );
}

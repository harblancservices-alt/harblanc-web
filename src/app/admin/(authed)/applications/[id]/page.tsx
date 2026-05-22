import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatDateFull, relativeTime } from "@/lib/admin/format";
import {
  softDeleteApplication,
  restoreApplication,
  permanentlyDeleteApplication,
} from "../actions";

export const metadata: Metadata = {
  title: "Application detail",
  robots: { index: false, follow: false },
};

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

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await loadApplication(id);
  if (!row) notFound();

  const phoneHref = `tel:${row.phone.replace(/[^\d+]/g, "")}`;
  const isTrashed = Boolean(row.deleted_at);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {/* Back link */}
      <Link
        href={isTrashed ? "/admin/applications/trash" : "/admin/applications"}
        className="inline-flex items-center font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase transition-colors hover:text-white"
      >
        &larr; Back to {isTrashed ? "trash" : "applications"}
      </Link>

      {/* Trash banner */}
      {isTrashed ? (
        <div className="mt-5 flex items-start gap-3 border border-red-700/60 bg-red-950/30 p-4">
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
          />
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] text-red-400 uppercase">
              In trash
            </p>
            <p className="mt-1 text-sm leading-relaxed text-red-200">
              Moved to trash {relativeTime(row.deleted_at!)}.{" "}
              {row.delete_after ? (
                <>
                  Auto-purge on{" "}
                  <span className="font-mono text-red-100">
                    {formatDateFull(row.delete_after)}
                  </span>
                  .
                </>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}

      {/* Title block */}
      <header className="mt-5 sm:mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            Application
          </p>
          {!isTrashed ? (
            <span className="inline-flex items-center gap-1.5 border border-neutral-700 bg-neutral-900/40 px-2.5 py-1 font-mono text-[9px] tracking-[0.22em] text-neutral-300 uppercase">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 shrink-0 bg-neutral-400"
              />
              Active
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 text-3xl font-display tracking-tight text-white sm:text-4xl lg:text-5xl">
          {row.name}
        </h1>
        <p
          className="mt-2 font-mono text-xs text-neutral-500"
          title={formatDateFull(row.created_at)}
        >
          Received {relativeTime(row.created_at)}{" "}
          <span aria-hidden className="mx-1 text-neutral-700">
            ·
          </span>{" "}
          {formatDateFull(row.created_at)}
        </p>
      </header>

      {/* Grouped panel: Primary contact + Operations.
          Stacked on mobile with horizontal divider, side-by-side on tablet+
          with vertical divider. Single bordered container. */}
      <div className="mt-6 grid grid-cols-1 divide-y divide-neutral-800 border border-neutral-800 sm:mt-8 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <section className="bg-neutral-900/40 p-5 sm:p-6">
          <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
            Primary contact
          </h2>
          <dl className="mt-4 space-y-4">
            <Field label="Phone">
              <a
                href={phoneHref}
                className="block break-all font-mono text-xl text-white underline-offset-4 hover:underline sm:text-2xl"
              >
                {row.phone}
              </a>
            </Field>
            <Field label="Email">
              <a
                href={`mailto:${row.email}`}
                className="block break-all text-base text-white underline-offset-4 hover:underline sm:text-lg"
              >
                {row.email}
              </a>
            </Field>
          </dl>
        </section>

        <section className="bg-neutral-900/40 p-5 sm:p-6">
          <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
            Operations
          </h2>
          <dl className="mt-4 space-y-4">
            <Field label="Equipment">
              <span className="block text-xl text-white sm:text-2xl">
                {row.equipment_type}
              </span>
            </Field>
            <Field label="CDL status">
              <span className="block text-xl text-white sm:text-2xl">
                {row.cdl_status}
              </span>
            </Field>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Years experience">
                <span className="block font-mono text-base text-white sm:text-lg">
                  {row.years_experience ?? "\u2014"}
                </span>
              </Field>
              <Field label="Home base">
                <span className="block text-base text-white sm:text-lg">
                  {row.home_base ?? "\u2014"}
                </span>
              </Field>
            </div>
          </dl>
        </section>
      </div>

      {/* Message — separate panel, readable body */}
      {row.message ? (
        <section className="mt-4 border border-neutral-800 bg-neutral-900/40 p-5 sm:mt-5 sm:p-6">
          <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
            Message
          </h2>
          <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-neutral-100">
            {row.message}
          </p>
        </section>
      ) : null}

      {/* Metadata — subtle, dimmer */}
      <section className="mt-4 border border-neutral-800 p-5 sm:mt-5 sm:p-6">
        <h2 className="font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase">
          Metadata
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
          <Field label="Created" muted>
            <span className="font-mono text-xs text-neutral-300 sm:text-sm">
              {formatDateFull(row.created_at)}
            </span>
          </Field>
          {row.deleted_at ? (
            <Field label="Deleted" muted>
              <span className="font-mono text-xs text-red-300 sm:text-sm">
                {formatDateFull(row.deleted_at)}
              </span>
            </Field>
          ) : null}
          {row.delete_after ? (
            <Field label="Auto-purge" muted>
              <span className="font-mono text-xs text-neutral-300 sm:text-sm">
                {formatDateFull(row.delete_after)}
              </span>
            </Field>
          ) : null}
          <Field label="Lead ID" muted full>
            <span className="font-mono text-xs break-all text-neutral-300">
              {row.id}
            </span>
          </Field>
          {row.user_agent ? (
            <Field label="User agent" muted full>
              <span className="font-mono text-[11px] break-all text-neutral-500">
                {row.user_agent}
              </span>
            </Field>
          ) : null}
          {row.ip ? (
            <Field label="IP" muted>
              <span className="font-mono text-xs text-neutral-500">
                {row.ip}
              </span>
            </Field>
          ) : null}
        </dl>
      </section>

      {/* Action zone — strong visual anchor, red top accent */}
      <section className="mt-6 border border-neutral-800 border-t-2 border-t-red-600 bg-neutral-900 p-5 sm:mt-8 sm:p-6">
        <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
          Actions
        </h2>
        <div
          className={
            "mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center " +
            (isTrashed ? "sm:justify-between" : "")
          }
        >
          {isTrashed ? (
            <>
              <form action={restoreApplication.bind(null, row.id)}>
                <button
                  type="submit"
                  className="btn-outline-cut inline-flex w-full items-center justify-center px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors sm:w-auto"
                >
                  Restore
                </button>
              </form>
              <form action={permanentlyDeleteApplication.bind(null, row.id)}>
                <button
                  type="submit"
                  className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 sm:w-auto"
                >
                  Permanently delete
                </button>
              </form>
            </>
          ) : (
            <form action={softDeleteApplication.bind(null, row.id)}>
              <button
                type="submit"
                className="btn-outline-cut inline-flex w-full items-center justify-center px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors sm:w-auto"
              >
                Move to trash
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
  full = false,
  muted = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <dt
        className={
          "font-mono text-[10px] tracking-[0.22em] uppercase " +
          (muted ? "text-neutral-500" : "text-neutral-500")
        }
      >
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}

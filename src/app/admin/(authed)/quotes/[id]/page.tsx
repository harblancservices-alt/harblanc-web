import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatDateFull, relativeTime } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Quote detail",
  robots: { index: false, follow: false },
};

type QuoteRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  commodity: string;
  weight: string;
  notes: string | null;
  user_agent: string | null;
  ip: string | null;
};

async function loadQuote(id: string): Promise<QuoteRow | null> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("quote_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<QuoteRow>();
  return data ?? null;
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await loadQuote(id);
  if (!row) notFound();

  const phoneHref = `tel:${row.phone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        href="/admin/quotes"
        className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase transition-colors hover:text-white"
      >
        &larr; Back to quotes
      </Link>

      <p className="mt-6 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
        Quote request
      </p>
      <h1 className="mt-3 text-2xl font-display tracking-tight text-white sm:text-3xl">
        {row.name}
      </h1>
      <p
        className="mt-2 font-mono text-xs text-neutral-500"
        title={formatDateFull(row.created_at)}
      >
        {relativeTime(row.created_at)} &middot; {formatDateFull(row.created_at)}
      </p>

      <dl className="mt-10 grid grid-cols-1 gap-x-10 gap-y-6 border-t border-neutral-800 pt-8 sm:grid-cols-2">
        <Field label="Phone">
          <a
            href={phoneHref}
            className="font-mono text-sm text-white hover:underline"
          >
            {row.phone}
          </a>
        </Field>
        <Field label="Email">
          <a
            href={`mailto:${row.email}`}
            className="text-sm break-all text-white hover:underline"
          >
            {row.email}
          </a>
        </Field>
        <Field label="Commodity">
          <span className="text-sm text-white">{row.commodity}</span>
        </Field>
        <Field label="Estimated weight">
          <span className="font-mono text-sm text-white">{row.weight}</span>
        </Field>
        <Field label="Lead ID" full>
          <span className="font-mono text-xs break-all text-white">
            {row.id}
          </span>
        </Field>
      </dl>

      {row.notes ? (
        <div className="mt-10 border-t border-neutral-800 pt-8">
          <p className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
            Notes
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
            {row.notes}
          </p>
        </div>
      ) : null}

      {row.user_agent || row.ip ? (
        <div className="mt-10 border-t border-neutral-800 pt-8">
          <p className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
            Request metadata
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
            {row.user_agent ? (
              <Field label="User agent">
                <span className="font-mono text-xs break-all text-neutral-300">
                  {row.user_agent}
                </span>
              </Field>
            ) : null}
            {row.ip ? (
              <Field label="IP">
                <span className="font-mono text-xs text-neutral-300">
                  {row.ip}
                </span>
              </Field>
            ) : null}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <dt className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}

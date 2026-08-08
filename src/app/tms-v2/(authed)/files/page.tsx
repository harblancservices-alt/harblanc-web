import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { listFiles, type FileRow, type FileSource } from "@/lib/data/files";
import { DEFAULT_PAGE_SIZE } from "@/lib/data/pagination";

// Documents are uploaded from several live workflows (loads, maintenance,
// customer intake) — always read fresh, matching the Load Board's own
// force-dynamic choice for the same reason.
export const dynamic = "force-dynamic";

const SOURCE_GLYPH: Record<FileSource, string> = {
  load: "\u{1F4C4}",
  receipt: "\u{1F9FE}",
  intake: "\u{1F4CE}",
};

const SOURCE_LABEL: Record<FileSource, string> = {
  load: "Load docs",
  receipt: "Maintenance",
  intake: "Intake",
};

const SOURCE_CHIPS: FileSource[] = ["load", "receipt", "intake"];

// Real button classes (matching Button.tsx's secondary/sm variant) — these
// two actions are a <a target="_blank"> and a <Link>, neither of which
// Button.tsx (a plain <button>) can render, so the look is replicated here
// rather than leaving them as bare text links.
const ACTION_BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg shadow-e1 transition-colors hover:bg-elevated";

/** One file — icon + title, tidy broker/lane + date meta, and the View/
 * Record actions clearly grouped as real buttons — replaces the old
 * DataList row (bare "View"/"Record" text links) with the same card
 * language the rest of the app uses (LoadCard, TripLoadCard, etc.). */
function FileCard({ file: f }: { file: FileRow }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-card p-3.5 shadow-e1">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-elevated text-[18px]" aria-hidden>
        {SOURCE_GLYPH[f.source]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-fg">{f.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-fg-muted">
          <span className="truncate">{f.subtitle}</span>
          <span>·</span>
          <DateTimeCST value={f.createdAt} mode="date" />
          <span className="rounded-md border border-line-strong bg-elevated px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">{f.typeLabel}</span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          {f.url ? (
            <a href={f.url} target="_blank" rel="noopener noreferrer" className={ACTION_BUTTON}>
              View
            </a>
          ) : (
            <span className="text-[12px] text-fg-muted">Unavailable</span>
          )}
          <Link href={f.parentHref} className={ACTION_BUTTON}>
            Record
          </Link>
        </div>
      </div>
    </div>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function buildHref(base: {
  q?: string;
  source?: FileSource;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (base.q) params.set("q", base.q);
  if (base.source) params.set("source", base.source);
  if (base.page && base.page > 1) params.set("page", String(base.page));
  const qs = params.toString();
  return qs ? `/tms-v2/files?${qs}` : "/tms-v2/files";
}

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim() || undefined;
  const sourceParam = first(sp.source);
  const source = SOURCE_CHIPS.includes(sourceParam as FileSource)
    ? (sourceParam as FileSource)
    : undefined;
  const page = Math.max(1, Number(first(sp.page)) || 1);

  const result = await listFiles({ page, pageSize: DEFAULT_PAGE_SIZE, q, source });
  const totalAll = SOURCE_CHIPS.reduce((sum, s) => sum + result.counts[s], 0);

  return (
    <PageScroll
      header={
        <>
          <PageHeader
            title="Files"
            description="Every uploaded document — load paperwork, maintenance receipts, and customer intake uploads — in one searchable, newest-first timeline."
          />

          <div className="flex flex-col gap-3">
            <form action="/tms-v2/files" method="GET" className="flex items-center gap-2">
              {source ? <input type="hidden" name="source" value={source} /> : null}
              <input
                type="text"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search files…"
                className="h-9 w-full max-w-sm rounded-md border border-line-strong bg-card px-3 text-[13px] text-fg placeholder:text-fg-muted focus:border-fg focus:outline-none"
              />
              <button
                type="submit"
                className="h-9 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg hover:bg-elevated"
              >
                Search
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
              <Link
                href={buildHref({ q })}
                className={`rounded-full border px-3 py-1 ${!source ? "border-fg text-fg" : "border-line-strong text-fg-muted hover:bg-elevated"}`}
              >
                All ({totalAll})
              </Link>
              {SOURCE_CHIPS.filter((s) => result.counts[s] > 0 || source === s).map((s) => (
                <Link
                  key={s}
                  href={buildHref({ q, source: s })}
                  className={`rounded-full border px-3 py-1 ${source === s ? "border-fg text-fg" : "border-line-strong text-fg-muted hover:bg-elevated"}`}
                >
                  {SOURCE_LABEL[s]} ({result.counts[s]})
                </Link>
              ))}
            </div>
          </div>
        </>
      }
    >
      {result.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-10 text-center shadow-e1">
          <p className="text-[13px] text-fg-muted">{q || source ? "No files match this search." : "No documents uploaded yet."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {result.rows.map((f) => (
            <FileCard key={f.id} file={f} />
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-[13px] text-fg-muted">
        <span>
          Page {page} · {result.totalCount} file{result.totalCount === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={buildHref({ q, source, page: page - 1 })}
              className="rounded-md border border-line-strong px-3 py-1.5 font-medium text-fg hover:bg-elevated"
            >
              Previous
            </Link>
          ) : null}
          {result.hasMore ? (
            <Link
              href={buildHref({ q, source, page: page + 1 })}
              className="rounded-md border border-line-strong px-3 py-1.5 font-medium text-fg hover:bg-elevated"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </PageScroll>
  );
}

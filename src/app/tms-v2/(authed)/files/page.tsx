import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { listFiles, type FileCategory, type FileRow } from "@/lib/data/files";
import { FileDownloadButton } from "./FileDownloadButton";

// Documents are uploaded from several live workflows (loads, maintenance,
// customer intake) — always read fresh, matching the Load Board's own
// force-dynamic choice for the same reason.
export const dynamic = "force-dynamic";

// One distinct, high-contrast color per real document TYPE (not just the
// old three coarse buckets) — Brent's ask, 2026-08-08: "color-code each
// file by its type... clearly distinguishable, no faint grey." Every shade
// is a solid 50/200/600/700 Tailwind set (never a washed-out grey), applied
// to both the icon badge (solid fill) and the type chip (tinted). `label`
// is the SECTION heading; `abbr` is the icon badge's short mark.
const CATEGORY_STYLE: Record<FileCategory, { label: string; abbr: string; badge: string; chip: string; activeChip: string }> = {
  rate_con: {
    label: "Rate confirmations",
    abbr: "RC",
    badge: "bg-blue-600",
    chip: "border-blue-200 bg-blue-50 text-blue-700",
    activeChip: "border-blue-600 bg-blue-600 text-white",
  },
  bol: {
    label: "Bills of lading",
    abbr: "BOL",
    badge: "bg-violet-600",
    chip: "border-violet-200 bg-violet-50 text-violet-700",
    activeChip: "border-violet-600 bg-violet-600 text-white",
  },
  signed_bol: {
    label: "Signed BOLs",
    abbr: "SGN",
    badge: "bg-emerald-600",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    activeChip: "border-emerald-600 bg-emerald-600 text-white",
  },
  pod: {
    label: "Proof of delivery",
    abbr: "POD",
    badge: "bg-orange-600",
    chip: "border-orange-200 bg-orange-50 text-orange-700",
    activeChip: "border-orange-600 bg-orange-600 text-white",
  },
  receipt: {
    label: "Maintenance receipts",
    abbr: "RCT",
    badge: "bg-amber-600",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    activeChip: "border-amber-600 bg-amber-600 text-white",
  },
  application: {
    label: "Applications & quotes",
    abbr: "APP",
    badge: "bg-fuchsia-600",
    chip: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    activeChip: "border-fuchsia-600 bg-fuchsia-600 text-white",
  },
  load_other: {
    label: "Other load docs",
    abbr: "DOC",
    badge: "bg-slate-600",
    chip: "border-slate-200 bg-slate-50 text-slate-700",
    activeChip: "border-slate-600 bg-slate-600 text-white",
  },
};

// Sections render in this order when no type filter is active — most
// load-paperwork-first, matching Brent's own listed order (Rate Con, BOL,
// POD, ...), then maintenance/applications, then the catch-all.
const CATEGORY_ORDER: FileCategory[] = ["rate_con", "bol", "signed_bol", "pod", "receipt", "application", "load_other"];

const ACTION_BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg shadow-e1 transition-colors hover:bg-elevated";

/** One file — a color-coded type badge (replaces the old neutral emoji
 * circle), tidy broker/lane + date meta, and View/Download as real
 * buttons. */
function FileCard({ file: f }: { file: FileRow }) {
  const style = CATEGORY_STYLE[f.category];
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-card p-3.5 shadow-e1">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${style.badge}`} aria-hidden>
        {style.abbr}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-fg">{f.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-fg-muted">
          <span className="truncate">{f.subtitle}</span>
          <span>·</span>
          <DateTimeCST value={f.createdAt} mode="date" />
          <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${style.chip}`}>{f.typeLabel}</span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          {f.url ? (
            <>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className={ACTION_BUTTON}>
                View
              </a>
              <FileDownloadButton url={f.url} name={f.name} />
            </>
          ) : (
            <span className="text-[12px] text-fg-muted">Unavailable</span>
          )}
        </div>
      </div>
    </div>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function isFileCategory(v: string | undefined): v is FileCategory {
  return !!v && v in CATEGORY_STYLE;
}

function buildHref(base: { q?: string; category?: FileCategory }): string {
  const params = new URLSearchParams();
  if (base.q) params.set("q", base.q);
  if (base.category) params.set("type", base.category);
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
  const categoryParam = first(sp.type);
  const category = isFileCategory(categoryParam) ? categoryParam : undefined;

  const result = await listFiles({ q, category });
  const totalAll = Object.values(result.counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const presentCategories = CATEGORY_ORDER.filter((c) => (result.counts[c] ?? 0) > 0);

  // Grouped by type when showing everything; a single flat list once a
  // type filter narrows it to one category (a section header would be
  // redundant with the filter chip already showing which type is active).
  const sections = category
    ? [{ category, rows: result.rows }]
    : CATEGORY_ORDER.filter((c) => (result.counts[c] ?? 0) > 0).map((c) => ({
        category: c,
        rows: result.rows.filter((r) => r.category === c),
      }));

  return (
    <PageScroll
      header={
        <>
          <PageHeader
            title="Files"
            description="Every uploaded document — load paperwork, maintenance receipts, and customer intake uploads — grouped by type."
          />

          <div className="flex flex-col gap-3">
            <form action="/tms-v2/files" method="GET" className="flex items-center gap-2">
              {category ? <input type="hidden" name="type" value={category} /> : null}
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

            <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold">
              <Link
                href={buildHref({ q })}
                className={`rounded-full border px-3 py-1 transition-colors ${!category ? "border-fg bg-fg text-card" : "border-line-strong text-fg-muted hover:bg-elevated"}`}
              >
                All ({totalAll})
              </Link>
              {presentCategories.map((c) => {
                const style = CATEGORY_STYLE[c];
                return (
                  <Link
                    key={c}
                    href={buildHref({ q, category: c })}
                    className={`rounded-full border px-3 py-1 transition-colors ${category === c ? style.activeChip : style.chip}`}
                  >
                    {style.label} ({result.counts[c] ?? 0})
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      }
    >
      {result.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-10 text-center shadow-e1">
          <p className="text-[13px] text-fg-muted">{q || category ? "No files match this search." : "No documents uploaded yet."}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(({ category: c, rows }) => (
            <section key={c} className="flex flex-col gap-2.5">
              {!category ? (
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${CATEGORY_STYLE[c].badge}`} aria-hidden />
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-fg-muted">
                    {CATEGORY_STYLE[c].label} ({rows.length})
                  </h2>
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {rows.map((f) => (
                  <FileCard key={f.id} file={f} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="mt-4 text-[13px] text-fg-muted">
        {result.totalCount} file{result.totalCount === 1 ? "" : "s"}
      </div>
    </PageScroll>
  );
}

import Link from "next/link";

/**
 * Applications dark work-queue table.
 *
 * Matches the dark FreightGain visual system used by the Loads page
 * and the Dashboard. Dense, dark surface, status-rail-color on the
 * left of each row, tabular-nums where relevant, compact rows.
 *
 * STATUS COLUMN INTENTIONALLY OMITTED: the `applications` table has
 * no `status` / `approved` column today. We don't fake one. When
 * application status tracking lands in schema, add a column then.
 */

export type ApplicationDarkRow = {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string;
  equipment_type: string;
  cdl_status: string;
  years_experience: string | number | null;
  home_base: string | null;
};

const GRID_TEMPLATE =
  "4px 60px minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.1fr) 18px";

export function ApplicationsDarkTable({
  rows,
}: {
  rows: ReadonlyArray<ApplicationDarkRow>;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900/40">
      <div className="min-w-[640px]">
        <div
          role="row"
          className="grid items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-zinc-500"
          style={{ gridTemplateColumns: GRID_TEMPLATE }}
        >
          <div />
          <div>Age</div>
          <div>Applicant</div>
          <div>Equipment / CDL</div>
          <div>Contact</div>
          <div />
        </div>

        {rows.length === 0 ? (
          <div className="px-3 py-8 text-center font-mono text-[11px] text-zinc-500">
            No applications yet.
          </div>
        ) : (
          rows.map((row) => <ApplicationRowItem key={row.id} row={row} />)
        )}
      </div>
    </div>
  );
}

function ApplicationRowItem({ row }: { row: ApplicationDarkRow }) {
  const equipment = (row.equipment_type ?? "").trim();
  const cdl = (row.cdl_status ?? "").trim();
  const yearsRaw =
    typeof row.years_experience === "number"
      ? String(row.years_experience)
      : (row.years_experience ?? "").trim();

  const equipmentLine = equipment || cdl || "—";
  const secondaryParts: string[] = [];
  if (equipment && cdl) secondaryParts.push(cdl);
  if (yearsRaw) secondaryParts.push(yearsRaw + "y exp");
  if (row.home_base && row.home_base.trim().length > 0)
    secondaryParts.push(row.home_base);
  const secondaryLine = secondaryParts.join(" · ");

  return (
    <Link
      href={"/admin/applications/" + row.id}
      prefetch={false}
      className="group grid items-center gap-2 border-b border-zinc-900 px-3 py-2 text-[12px] transition-colors hover:bg-zinc-900/50"
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      <span
        aria-hidden
        className="block h-[18px] w-[4px] self-stretch rounded-sm bg-zinc-700"
      />

      <span
        className={
          "text-[11px] font-medium tabular-nums " +
          (isWithinLast24h(row.created_at) ? "text-purple-300" : "text-zinc-400")
        }
      >
        {ageLabel(row.created_at)}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-zinc-100">
          {row.name}
        </span>
        {row.home_base && row.home_base.trim().length > 0 ? (
          <span className="block truncate text-[10px] text-zinc-500">
            {row.home_base}
          </span>
        ) : null}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-zinc-100">
          {equipmentLine}
        </span>
        {secondaryLine ? (
          <span className="block truncate text-[10px] text-zinc-500">
            {secondaryLine}
          </span>
        ) : null}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[11.5px] text-zinc-100">
          {row.email}
        </span>
        <span className="block truncate font-mono text-[10px] text-zinc-500">
          {row.phone}
        </span>
      </span>

      <span
        aria-hidden
        className="flex justify-center text-zinc-600 group-hover:text-zinc-400"
      >
        <ChevronRight />
      </span>
    </Link>
  );
}

function ChevronRight() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * True when the row landed within the last 24 hours. Used to color the
 * Age column purple — a subtle "this just came in" signal that doesn't
 * require a schema-level status column. Same purple as the Applications
 * sidebar/dashboard badge color so the visual language stays consistent.
 */
function isWithinLast24h(iso: string): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

function ageLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return minutes <= 1 ? "1m" : minutes + "m";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + "d";
  const weeks = Math.floor(days / 7);
  return weeks + "w";
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { softDeleteApplications } from "./actions";

/**
 * Applications dark work-queue table.
 *
 * Dense dark surface matching Loads and the Dashboard, plus a bulk
 * select / delete toolbar for cleanup. Selecting rows and pressing Delete
 * posts the ids to the existing `softDeleteApplications` server action,
 * which moves them to trash (recoverable for 30 days).
 *
 * STATUS COLUMN INTENTIONALLY OMITTED: the `applications` table has no
 * `status` / `approved` column today. We don't fake one.
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
  "30px 4px 60px minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.1fr) 18px";

/** Shared equipment / experience summary used by both the row and the card. */
function describe(row: ApplicationDarkRow): {
  equipmentLine: string;
  secondaryLine: string;
} {
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
  if (row.home_base && row.home_base.trim().length > 0) {
    secondaryParts.push(row.home_base);
  }
  return { equipmentLine, secondaryLine: secondaryParts.join(" · ") };
}

export function ApplicationsDarkTable({
  rows,
}: {
  rows: ReadonlyArray<ApplicationDarkRow>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  }

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleAll}
          className="rounded-md border border-line bg-card px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:bg-elevated"
        >
          {allSelected ? "Clear" : "Select all"}
        </button>

        {selected.size > 0 ? (
          <>
            <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
              {selected.size} selected
            </span>
            <form
              action={softDeleteApplications}
              onSubmit={(e) => {
                if (
                  !window.confirm(
                    `Delete ${selected.size} application${selected.size === 1 ? "" : "s"}? They move to trash and can be restored for 30 days.`,
                  )
                ) {
                  e.preventDefault();
                } else {
                  setSelected(new Set());
                }
              }}
            >
              {[...selected].map((id) => (
                <input key={id} type="hidden" name="ids" value={id} />
              ))}
              <button
                type="submit"
                className="rounded-md border border-red-700 bg-red-600 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700"
              >
                Delete {selected.size}
              </button>
            </form>
          </>
        ) : null}
      </div>

      {/* Table (tablet / desktop) — matches the Load Board's md+ table */}
      <div className="hidden overflow-x-auto rounded-md border border-line bg-card shadow-md md:block">
        <div className="min-w-[640px]">
          <div
            role="row"
            className="grid items-center gap-2 bg-bar px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-bar-fg"
            style={{ gridTemplateColumns: GRID_TEMPLATE }}
          >
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all applications"
                className="h-3.5 w-3.5 cursor-pointer accent-red-600"
              />
            </div>
            <div />
            <div>Age</div>
            <div>Applicant</div>
            <div>Equipment / CDL</div>
            <div>Contact</div>
            <div />
          </div>

          {rows.length === 0 ? (
            <div className="px-3 py-8 text-center font-mono text-[13px] text-fg-subtle">
              No applications yet.
            </div>
          ) : (
            rows.map((row) => (
              <ApplicationRowItem
                key={row.id}
                row={row}
                selected={selected.has(row.id)}
                onToggle={() => toggle(row.id)}
                onOpen={() => router.push("/admin/applications/" + row.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Cards (mobile) — match the Load Board's card-on-mobile pattern */}
      <div className="space-y-2 md:hidden">
        {rows.length === 0 ? (
          <div className="rounded-md border border-line bg-card px-3 py-8 text-center font-mono text-[13px] text-fg-subtle">
            No applications yet.
          </div>
        ) : (
          rows.map((row) => (
            <ApplicationCardItem
              key={row.id}
              row={row}
              selected={selected.has(row.id)}
              onToggle={() => toggle(row.id)}
              onOpen={() => router.push("/admin/applications/" + row.id)}
            />
          ))
        )}
      </div>
    </>
  );
}

function ApplicationCardItem({
  row,
  selected,
  onToggle,
  onOpen,
}: {
  row: ApplicationDarkRow;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { equipmentLine, secondaryLine } = describe(row);
  const fresh = isWithinLast24h(row.created_at);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={
        "cursor-pointer rounded-md border p-3 shadow-sm transition-colors active:bg-elevated " +
        (selected ? "border-red-400 bg-red-50" : "border-line bg-card")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-2.5">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Select ${row.name}`}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggle}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-red-600"
          />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-fg">
              {row.name}
            </span>
            {row.home_base && row.home_base.trim().length > 0 ? (
              <span className="block truncate text-[12px] text-fg-subtle">
                {row.home_base}
              </span>
            ) : null}
          </span>
        </span>
        <span
          className={
            "shrink-0 rounded-sm px-1.5 py-[1px] font-mono text-[11px] font-bold tabular-nums " +
            (fresh
              ? "bg-indigo-100 text-indigo-700"
              : "bg-elevated text-amber-700")
          }
        >
          {ageLabel(row.created_at)}
        </span>
      </div>

      <div className="mt-2 truncate text-[13.5px] font-medium text-fg">
        {equipmentLine}
      </div>
      {secondaryLine ? (
        <div className="truncate text-[12px] text-fg-subtle">{secondaryLine}</div>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]">
        <span className="truncate text-blue-700">{row.email}</span>
        <span className="font-mono text-fg-subtle">{row.phone}</span>
      </div>
    </div>
  );
}

function ApplicationRowItem({
  row,
  selected,
  onToggle,
  onOpen,
}: {
  row: ApplicationDarkRow;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { equipmentLine, secondaryLine } = describe(row);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={
        "group grid cursor-pointer items-center gap-2 border-b border-line px-3 py-2.5 text-[14px] transition-colors " +
        (selected ? "bg-red-100 hover:bg-red-100" : "hover:bg-elevated")
      }
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      <span className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${row.name}`}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
          className="h-3.5 w-3.5 cursor-pointer accent-red-600"
        />
      </span>

      <span
        aria-hidden
        className="block h-[18px] w-[4px] self-stretch rounded-sm bg-line-strong"
      />

      <span
        className={
          "text-[12px] font-semibold tabular-nums " +
          (isWithinLast24h(row.created_at) ? "text-indigo-600" : "text-amber-600")
        }
      >
        {ageLabel(row.created_at)}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-fg">
          {row.name}
        </span>
        {row.home_base && row.home_base.trim().length > 0 ? (
          <span className="block truncate text-[12px] text-fg-subtle">
            {row.home_base}
          </span>
        ) : null}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-fg">
          {equipmentLine}
        </span>
        {secondaryLine ? (
          <span className="block truncate text-[12px] text-fg-subtle">
            {secondaryLine}
          </span>
        ) : null}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[13px] text-fg">{row.email}</span>
        <span className="block truncate font-mono text-[12px] text-fg-subtle">
          {row.phone}
        </span>
      </span>

      <span
        aria-hidden
        className="flex justify-center text-fg-subtle group-hover:text-fg"
      >
        <ChevronRight />
      </span>
    </div>
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

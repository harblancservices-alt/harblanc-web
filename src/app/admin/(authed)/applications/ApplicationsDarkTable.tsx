"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { softDeleteApplications } from "./actions";

/**
 * Applications dark work-queue table.
 *
 * Dense dark surface matching Loads and the Dashboard, with the standardized
 * mode-based delete (same as the Load Board / loads-under-quotes). Default:
 * no checkboxes, tapping an application opens it, a "Delete" button enters
 * selection mode. In selection mode tapping cards/rows toggles them and a bar
 * shows the count + Delete Selected + Cancel. Delete posts the ids to the
 * existing `softDeleteApplications` action (trash, recoverable for 30 days).
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
  // Selection only exists inside an explicit delete mode (mirrors the Load
  // Board). Default off: tapping an application opens it, no checkboxes shown.
  const [selectMode, setSelectMode] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function openApplication(id: string) {
    router.push("/admin/applications/" + id);
  }

  return (
    <>
      {/* Default: a Delete button enters selection mode. */}
      {!selectMode && rows.length > 0 ? (
        <div className="mb-2 flex justify-end">
          <Button
            variant="destructive"
            size="md"
            type="button"
            onClick={() => setSelectMode(true)}
          >
            Delete
          </Button>
        </div>
      ) : null}

      {/* Delete-selection bar — only while in explicit delete mode. */}
      {selectMode ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-bad/40 bg-bad-bg px-3 py-2">
          <span className="font-mono text-[12px] font-bold text-ink">
            {selected.size} selected
          </span>
          <span className="font-mono text-[11px] text-ink-3">
            · tap to select
          </span>
          <Button
            variant="cancel"
            size="sm"
            type="button"
            onClick={exitSelectMode}
            className="ml-auto"
          >
            Cancel
          </Button>
          <form
            action={softDeleteApplications}
            onSubmit={(e) => {
              if (selected.size === 0) {
                e.preventDefault();
                return;
              }
              if (
                !window.confirm(
                  `Delete ${selected.size} application${selected.size === 1 ? "" : "s"}? They move to trash and can be restored for 30 days.`,
                )
              ) {
                e.preventDefault();
              } else {
                exitSelectMode();
              }
            }}
          >
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <BulkDeleteButton count={selected.size} />
          </form>
        </div>
      ) : null}

      {/* Table (tablet / desktop) — matches the Load Board's md+ table */}
      <div className="hidden overflow-x-auto rounded-md border border-line bg-card shadow-e2 md:block">
        <div className="min-w-[640px]">
          <div
            role="row"
            className="grid items-center gap-2 border-b-2 border-line-strong bg-inset px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3"
            style={{ gridTemplateColumns: GRID_TEMPLATE }}
          >
            <div />
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
            rows.map((row, i) => (
              <ApplicationRowItem
                key={row.id}
                row={row}
                alt={i % 2 === 1}
                selectMode={selectMode}
                selected={selected.has(row.id)}
                onToggle={() => toggle(row.id)}
                onOpen={() => openApplication(row.id)}
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
              selectMode={selectMode}
              selected={selected.has(row.id)}
              onToggle={() => toggle(row.id)}
              onOpen={() => openApplication(row.id)}
            />
          ))
        )}
      </div>
    </>
  );
}

function ApplicationCardItem({
  row,
  selectMode,
  selected,
  onToggle,
  onOpen,
}: {
  row: ApplicationDarkRow;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { equipmentLine, secondaryLine } = describe(row);
  const fresh = isWithinLast24h(row.created_at);
  const isSel = selectMode && selected;

  return (
    <div
      role={selectMode ? "button" : "link"}
      tabIndex={0}
      aria-pressed={selectMode ? selected : undefined}
      onClick={() => (selectMode ? onToggle() : onOpen())}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (selectMode) onToggle();
        else onOpen();
      }}
      className={
        "cursor-pointer rounded-md border p-3 shadow-e1 transition-colors active:bg-inset " +
        (isSel ? "border-bad bg-bad-bg" : "border-line bg-card")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-2.5">
          {/* Selection indicator — only in delete mode. The whole card
              toggles, so this is a visual checkbox, not a hit target. */}
          {selectMode ? (
            <span
              aria-hidden
              className={
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-[12px] font-bold leading-none " +
                (selected
                  ? "border-bad bg-bad text-white"
                  : "border-line-strong text-transparent")
              }
            >
              ✓
            </span>
          ) : null}
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
            "shrink-0 rounded px-1.5 py-[1px] font-mono text-[11px] font-bold tabular-nums " +
            (fresh
              ? "bg-steel-bg text-steel"
              : "bg-warn-bg text-warn")
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
        <span className="truncate text-steel">{row.email}</span>
        <span className="font-mono text-fg-subtle">{row.phone}</span>
      </div>
    </div>
  );
}

function ApplicationRowItem({
  row,
  alt,
  selectMode,
  selected,
  onToggle,
  onOpen,
}: {
  row: ApplicationDarkRow;
  alt: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { equipmentLine, secondaryLine } = describe(row);
  const fresh = isWithinLast24h(row.created_at);

  return (
    <div
      role={selectMode ? "button" : "link"}
      tabIndex={0}
      aria-pressed={selectMode ? selected : undefined}
      onClick={() => (selectMode ? onToggle() : onOpen())}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (selectMode) onToggle();
        else onOpen();
      }}
      className={
        "group grid cursor-pointer items-center gap-2 border-b border-line px-3 py-2.5 text-[14px] transition-colors " +
        (selectMode && selected
          ? "bg-bad-bg hover:bg-bad-bg"
          : (alt ? "bg-inset " : "bg-card ") + "hover:bg-inset")
      }
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      {/* Checkbox only in delete mode — visual mirror of the row's selected
          state (the whole row toggles). */}
      <span className="flex items-center justify-center">
        {selectMode ? (
          <input
            type="checkbox"
            readOnly
            aria-hidden
            tabIndex={-1}
            checked={selected}
            className="pointer-events-none h-3.5 w-3.5 accent-accent"
          />
        ) : null}
      </span>

      {/* Freshness anchor — accent bar for applications received in the
          last 24h, otherwise a quiet hairline. */}
      <span
        aria-hidden
        className={
          "block h-[18px] w-[4px] self-stretch rounded-sm " +
          (fresh ? "bg-accent" : "bg-line-strong")
        }
      />

      <span
        className={
          "inline-flex w-fit items-center rounded bg-inset px-1.5 py-[1px] font-mono text-[11px] font-bold tabular-nums " +
          (fresh ? "text-steel" : "text-warn")
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
        <span className="block truncate text-[13px] text-steel">{row.email}</span>
        <span className="block truncate font-mono text-[12px] text-fg-subtle">
          {row.phone}
        </span>
      </span>

      <span
        aria-hidden
        className="flex justify-center text-fg-subtle group-hover:text-fg"
      >
        {selectMode ? null : <ChevronRight />}
      </span>
    </div>
  );
}

// Submit button for the bulk soft-delete form. useFormStatus() (from react-dom)
// shows progress while the action is in flight, so the delete can't be
// double-fired.
function BulkDeleteButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button
      variant="destructive"
      size="md"
      type="submit"
      disabled={pending || count === 0}
      aria-busy={pending}
      leftIcon={
        pending ? (
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-2 border-current/40 border-t-current"
          />
        ) : undefined
      }
    >
      {pending ? "Deleting…" : "Delete Selected"}
    </Button>
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

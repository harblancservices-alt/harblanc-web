"use client";

import { useState } from "react";
import { updateLoadOdometers } from "../actions";
import { LoadStatusControl } from "./LoadStatusControl";

/**
 * "Odometer & status" panel — matches CollapsibleWorkspaceSection's dark
 * header bar, but adds a small edit toggle on the bar. Odometer readings show
 * read-only until you hit edit; the status control is always interactive.
 */
export function OdometerStatusCard({
  loadId,
  status,
  statusLabel,
  lastReading,
  odoAssigned,
  odoLoaded,
  odoDelivered,
}: {
  loadId: string;
  status: string;
  statusLabel: string;
  lastReading: number | null;
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);

  return (
    <section className="overflow-hidden rounded-md border border-line bg-card shadow-md">
      <div className="flex items-center justify-between gap-2 bg-bar px-3 py-2.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <Chevron open={open} />
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-bar-fg">
            Odometer &amp; status
          </h2>
        </button>
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-bar-fg/70">
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={() => {
              setEditing((e) => !e);
              setOpen(true);
            }}
            aria-pressed={editing}
            aria-label="Edit odometer"
            title="Edit odometer"
            className={
              "flex h-6 w-6 items-center justify-center rounded border text-[12px] transition-colors " +
              (editing
                ? "border-white/40 bg-white/15 text-bar-fg"
                : "border-white/20 text-bar-fg/70 hover:bg-white/10 hover:text-bar-fg")
            }
          >
            <PencilIcon />
          </button>
        </div>
      </div>

      {open ? (
        <div className="space-y-3 bg-card p-3 text-fg">
          <InnerCard title="Status">
            <LoadStatusControl
              loadId={loadId}
              current={status}
              lastReading={lastReading}
            />
          </InnerCard>

          <InnerCard title="Odometer">
            {editing ? (
              <form
                key={`${odoAssigned}-${odoLoaded}-${odoDelivered}`}
                action={async (fd) => {
                  await updateLoadOdometers(loadId, fd);
                  setEditing(false);
                }}
                className="space-y-2"
              >
                <OdoField label="Assigned" name="odo_assigned" value={odoAssigned} />
                <OdoField label="Loaded" name="odo_loaded" value={odoLoaded} />
                <OdoField label="Delivered" name="odo_delivered" value={odoDelivered} />
                <button
                  type="submit"
                  className="mt-1 w-full rounded-md border border-red-700 bg-red-600 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700"
                >
                  Save odometer · Enter
                </button>
              </form>
            ) : (
              <table className="w-full border-collapse text-fg">
                <thead>
                  <tr className="border-b border-line">
                    <th className="py-1 pr-2 text-left font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-fg-subtle">
                      Stage
                    </th>
                    <th className="py-1 px-2 text-right font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-fg-subtle">
                      Odometer
                    </th>
                    <th className="py-1 pl-2 text-right font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-fg-subtle">
                      + Miles
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <OdoTableRow label="Assigned" value={odoAssigned} />
                  <OdoTableRow
                    label="Loaded"
                    value={odoLoaded}
                    delta={delta(odoAssigned, odoLoaded)}
                    tone="amber"
                  />
                  <OdoTableRow
                    label="Delivered"
                    value={odoDelivered}
                    delta={delta(odoLoaded, odoDelivered)}
                    tone="green"
                  />
                </tbody>
              </table>
            )}
          </InnerCard>
        </div>
      ) : null}
    </section>
  );
}

function InnerCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border border-line bg-card">
      <header className="border-b border-line bg-card/70 px-3 py-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-fg-muted">
          {title}
        </p>
      </header>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

function delta(from: number | null, to: number | null): number | null {
  if (from == null || to == null) return null;
  const d = to - from;
  return d >= 0 ? d : null;
}

function OdoTableRow({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: number | null;
  delta?: number | null;
  tone?: "amber" | "green";
}) {
  const color = tone === "amber" ? "text-amber-700" : "text-green-700";
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="py-1.5 pr-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </td>
      <td
        className={
          "py-1.5 px-2 text-right font-mono text-[12.5px] tabular-nums " +
          (value != null ? "text-fg" : "text-fg-subtle")
        }
      >
        {value != null ? value.toLocaleString() : "—"}
      </td>
      <td className="py-1.5 pl-2 text-right font-mono text-[11px] tabular-nums">
        {delta != null ? (
          <span className={color}>+{delta.toLocaleString()}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
    </tr>
  );
}

function OdoField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: number | null;
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2">
      <label className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </label>
      <input
        name={name}
        type="number"
        inputMode="numeric"
        defaultValue={value ?? undefined}
        placeholder="—"
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-md border border-line-strong bg-card px-2 py-1 font-mono text-[12.5px] tabular-nums text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
      />
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={"shrink-0 text-bar-fg/70 transition-transform " + (open ? "rotate-90" : "")}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function PencilIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

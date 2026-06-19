"use client";

import { useState } from "react";
import { updateLoadOdometers } from "../actions";
import { LoadStatusControl } from "./LoadStatusControl";

/**
 * Odometer & status panel. The status control is always interactive; the
 * odometer readings show read-only until you hit Edit. No dark header bar —
 * just the two white inner cards (Status, Odometer). A failed save shows an
 * inline error rather than throwing to an error page.
 */
export function OdometerStatusCard({
  loadId,
  status,
  lastReading,
  odoAssigned,
  odoLoaded,
  odoDelivered,
}: {
  loadId: string;
  status: string;
  lastReading: number | null;
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-3 text-fg">
      <InnerCard title="Status">
        <LoadStatusControl
          loadId={loadId}
          current={status}
          lastReading={lastReading}
        />
      </InnerCard>

      <InnerCard
        title="Odometer"
        action={
          <button
            type="button"
            onClick={() => {
              setErr(null);
              setEditing((e) => !e);
            }}
            aria-pressed={editing}
            className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-fg-muted transition-colors hover:text-fg"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        }
      >
        {editing ? (
          <form
            key={`${odoAssigned}-${odoLoaded}-${odoDelivered}`}
            action={async (fd) => {
              // Catch so a rejected save (e.g. monotonicity) shows inline
              // instead of bubbling to an error page.
              try {
                await updateLoadOdometers(loadId, fd);
                setErr(null);
                setEditing(false);
              } catch (e) {
                setErr(
                  e instanceof Error ? e.message : "Could not save odometer.",
                );
              }
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
            {err ? (
              <p role="alert" className="text-[11px] font-semibold text-red-700">
                {err}
              </p>
            ) : null}
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
  );
}

function InnerCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-line bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-card/70 px-3 py-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-fg-muted">
          {title}
        </p>
        {action ?? null}
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
  // Comma-formatted as you type (e.g. 292,891). A text input is required —
  // <input type="number"> rejects the comma. The submitted string keeps its
  // commas; the server's numOrNull strips them back to an integer.
  const [display, setDisplay] = useState(
    value != null ? value.toLocaleString("en-US") : "",
  );
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2">
      <label className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </label>
      <input
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          setDisplay(
            digits === "" ? "" : Number(digits).toLocaleString("en-US"),
          );
        }}
        placeholder="—"
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-md border border-line-strong bg-card px-2 py-1 font-mono text-[12.5px] tabular-nums text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
      />
    </div>
  );
}


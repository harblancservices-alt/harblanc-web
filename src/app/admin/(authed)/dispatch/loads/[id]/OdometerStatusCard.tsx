"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { updateLoadOdometers } from "../actions";

/**
 * Odometer (& status) panel, shared by the load detail page and the dashboard
 * active-loads list but with two distinct looks:
 *
 *  - variant="full" (load page, default): the original dark "Odometer &
 *    status" header bar with the Edit toggle, a Status section, and the
 *    odometer readings underneath.
 *  - variant="dashboard": a clean white card — no dark bar, no status section —
 *    just the three odometer readings and a working Edit button.
 *
 * Both edit inline through the SAME updateLoadOdometers action (so the two
 * pages mirror), keep comma-formatted inputs, and surface a failed save inline
 * instead of throwing to an error page.
 */
type OdometerStatusCardProps = {
  loadId: string;
  status: string;
  statusLabel?: string;
  lastReading: number | null;
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
  variant?: "full" | "dashboard";
};

export function OdometerStatusCard(props: OdometerStatusCardProps) {
  if (props.variant === "dashboard") return <DashboardOdometer {...props} />;
  return <FullOdometerStatus {...props} />;
}

// ── Load detail (full): the three odometer stage lines (Assigned / Loaded /
//    Delivered) stay visible — they ARE the status. There's no status dropdown;
//    entering an odometer reading advances the load's status (delivered odo →
//    delivered, etc., handled in updateLoadOdometers). Edit reveals the inputs;
//    the section is collapsible but expanded by default. ──────────────────────
function FullOdometerStatus({
  loadId,
  odoAssigned,
  odoLoaded,
  odoDelivered,
}: OdometerStatusCardProps) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);

  return (
    <section className="overflow-hidden rounded-md border border-line bg-card shadow-e2">
      {/* min-h-[48px] matches the Load details / Financials section headers so
          the three panel bars (and their Edit buttons) line up across columns. */}
      <div className="flex min-h-[48px] items-center justify-between gap-2 bg-bar px-3 py-2">
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
        <Button
          type="button"
          variant="edit"
          size="sm"
          onClick={() => {
            setEditing((e) => !e);
            setOpen(true);
          }}
          aria-pressed={editing}
          aria-label="Edit odometer"
          title="Edit odometer"
          leftIcon={<PencilIcon />}
        >
          {editing ? "Close" : "Edit"}
        </Button>
      </div>

      {open ? (
        <div className="bg-card p-3 text-fg">
          {editing ? (
            <OdometerEditForm
              loadId={loadId}
              odoAssigned={odoAssigned}
              odoLoaded={odoLoaded}
              odoDelivered={odoDelivered}
              onSaved={() => setEditing(false)}
            />
          ) : (
            <OdometerTable
              odoAssigned={odoAssigned}
              odoLoaded={odoLoaded}
              odoDelivered={odoDelivered}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}

// ── Dashboard: white card, no bar, no status, just odometer + Edit ───────────
function DashboardOdometer({
  loadId,
  odoAssigned,
  odoLoaded,
  odoDelivered,
}: OdometerStatusCardProps) {
  const [editing, setEditing] = useState(false);

  return (
    <InnerCard
      title="Odometer"
      action={
        <Button
          type="button"
          variant={editing ? "cancel" : "edit"}
          size="sm"
          onClick={() => setEditing((e) => !e)}
          aria-pressed={editing}
          leftIcon={editing ? undefined : <PencilIcon />}
        >
          {editing ? "Cancel" : "Edit"}
        </Button>
      }
    >
      {editing ? (
        <OdometerEditForm
          loadId={loadId}
          odoAssigned={odoAssigned}
          odoLoaded={odoLoaded}
          odoDelivered={odoDelivered}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <OdometerTable
          odoAssigned={odoAssigned}
          odoLoaded={odoLoaded}
          odoDelivered={odoDelivered}
        />
      )}
    </InnerCard>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function OdometerEditForm({
  loadId,
  odoAssigned,
  odoLoaded,
  odoDelivered,
  onSaved,
}: {
  loadId: string;
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
  onSaved: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      key={`${odoAssigned}-${odoLoaded}-${odoDelivered}`}
      action={async (fd) => {
        // A rejected save (e.g. a reading that goes backwards) comes back as
        // { ok: false, reason } rather than a throw: an error thrown from a
        // server action is redacted in production, so a catch here would only
        // ever have the opaque digest message to show. The catch stays for
        // genuine faults — a dropped connection mid-submit.
        try {
          const res = await updateLoadOdometers(loadId, fd);
          if (!res.ok) {
            setErr(res.reason);
            return;
          }
          setErr(null);
          onSaved();
        } catch {
          setErr("Could not save odometer. Check your connection and try again.");
        }
      }}
      className="space-y-2"
    >
      <OdoField label="Assigned" name="odo_assigned" value={odoAssigned} />
      <OdoField label="Loaded" name="odo_loaded" value={odoLoaded} />
      <OdoField label="Delivered" name="odo_delivered" value={odoDelivered} />
      <Button type="submit" variant="primary" size="sm" fullWidth className="mt-1">
        Save odometer · Enter
      </Button>
      {err ? (
        <p role="alert" className="text-[11px] font-semibold text-red-700">
          {err}
        </p>
      ) : null}
    </form>
  );
}

function OdometerTable({
  odoAssigned,
  odoLoaded,
  odoDelivered,
}: {
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
}) {
  return (
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
      className={
        "shrink-0 text-bar-fg/70 transition-transform " + (open ? "rotate-90" : "")
      }
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

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { updateLoadDetails } from "../actions";

/**
 * Load details panel (load detail page). A dedicated client card — same dark
 * header bar as its siblings (Financials / Odometer) so the three line up — that
 * shows the load's identity + schedule and, behind an Edit toggle, lets dispatch
 * set the fields that have NO effect on the money math: pickup date, delivery
 * date, and load number. Origin/dest/mileage/trip/broker stay read-only here —
 * they're owned by their own flows (ZIP→miles resolution, trip/broker rollups) —
 * so editing schedule never disturbs the P&L. Trip / Broker jump-links live in
 * the bar too. Edit forces the section open and saves through updateLoadDetails.
 */
type LoadDetailsCardProps = {
  loadId: string;
  loadNumber: string | null;
  brokerName: string | null;
  brokerId: string | null;
  tripId: string | null;
  tripLabel: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  miles: number | null;
  origin: string | null;
  originZip: string | null;
  destination: string | null;
  destZip: string | null;
};

export function LoadDetailsCard(props: LoadDetailsCardProps) {
  const {
    loadId,
    loadNumber,
    brokerName,
    brokerId,
    tripId,
    tripLabel,
    pickupDate,
    deliveryDate,
    miles,
    origin,
    originZip,
    destination,
    destZip,
  } = props;

  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);

  return (
    <section className="overflow-hidden rounded-md border border-line bg-card shadow-e2">
      {/* min-h-[48px] matches the Financials / Odometer section headers so the
          three panel bars (and their action buttons) line up across columns. */}
      <div className="flex min-h-[48px] items-center justify-between gap-2 bg-bar px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <Chevron open={open} />
          <h2 className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-bar-fg">
            Load details
          </h2>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {tripId ? (
            <Button
              href={`/admin/dispatch/trips/${tripId}`}
              prefetch={false}
              variant="navigate"
              size="sm"
            >
              Trip
            </Button>
          ) : null}
          {brokerId ? (
            <Button
              href={`/admin/dispatch/brokers/${brokerId}`}
              prefetch={false}
              variant="navigate"
              size="sm"
            >
              Broker
            </Button>
          ) : null}
          <Button
            type="button"
            variant="edit"
            size="sm"
            onClick={() => {
              setEditing((e) => !e);
              setOpen(true);
            }}
            aria-pressed={editing}
            aria-label="Edit load details"
            title="Edit load details"
            leftIcon={editing ? undefined : <PencilIcon />}
          >
            {editing ? "Close" : "Edit"}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="space-y-3 bg-card p-3 text-fg">
          {editing ? (
            <LoadDetailsEditForm
              loadId={loadId}
              loadNumber={loadNumber}
              pickupDate={pickupDate}
              deliveryDate={deliveryDate}
              onSaved={() => setEditing(false)}
            />
          ) : (
            <>
              <InnerCard title="Load">
                <Spec
                  label="Load #"
                  value={loadNumber?.trim() ? `#${loadNumber.trim()}` : null}
                />
                <Spec label="Broker" value={brokerName} />
                <Spec label="Trip" value={tripLabel} />
              </InnerCard>

              <InnerCard title="Schedule">
                <Spec label="Pickup" value={dateLabel(pickupDate)} />
                <Spec label="Delivery" value={dateLabel(deliveryDate)} />
                <Spec
                  label="Mileage"
                  value={miles != null ? `${miles.toLocaleString()} mi` : null}
                />
                <Spec
                  label="Origin"
                  value={
                    origin
                      ? `${origin}${originZip ? " " + originZip : ""}`
                      : null
                  }
                />
                <Spec
                  label="Dest"
                  value={
                    destination
                      ? `${destination}${destZip ? " " + destZip : ""}`
                      : null
                  }
                />
              </InnerCard>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

// ── Edit form: schedule + load number. Native date inputs (YYYY-MM-DD) drop
//    straight into the date columns via updateLoadDetails; blank clears. ───────
function LoadDetailsEditForm({
  loadId,
  loadNumber,
  pickupDate,
  deliveryDate,
  onSaved,
}: {
  loadId: string;
  loadNumber: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  onSaved: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      key={`${pickupDate}-${deliveryDate}-${loadNumber}`}
      action={async (fd) => {
        // Catch so a rejected save surfaces inline instead of an error page.
        try {
          await updateLoadDetails(loadId, fd);
          setErr(null);
          onSaved();
        } catch (e) {
          setErr(
            e instanceof Error ? e.message : "Could not save load details.",
          );
        }
      }}
      className="space-y-3"
    >
      <InnerCard title="Schedule">
        <div className="grid grid-cols-2 gap-2.5">
          <Field
            label="Pickup date"
            name="pickup_date"
            type="date"
            defaultValue={dateValue(pickupDate)}
          />
          <Field
            label="Delivery date"
            name="delivery_date"
            type="date"
            defaultValue={dateValue(deliveryDate)}
          />
        </div>
        <div className="mt-2.5">
          <Field
            label="Load #"
            name="load_number"
            type="text"
            placeholder="—"
            defaultValue={loadNumber ?? ""}
          />
        </div>
      </InnerCard>
      <Button type="submit" variant="primary" size="sm" fullWidth>
        Save details · Enter
      </Button>
      {err ? (
        <p role="alert" className="text-[11px] font-semibold text-red-700">
          {err}
        </p>
      ) : null}
    </form>
  );
}

// ── Shared pieces (self-contained, mirroring the load page's InnerCard/Spec) ──

function InnerCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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

function Spec({ label, value }: { label: string; value: string | null }) {
  const text = (value ?? "").trim();
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-baseline gap-2 py-1">
      <dt className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </dt>
      <dd
        className={
          "text-[12.5px] font-medium tabular-nums " +
          (text ? "text-fg" : "text-fg-subtle")
        }
      >
        {text || "—"}
      </dd>
    </div>
  );
}

function Field({
  label,
  name,
  type,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="min-w-0">
      <label className="block font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        className="mt-1 block w-full min-w-0 rounded-md border border-line-strong bg-card px-2 py-1.5 font-mono text-[12.5px] tabular-nums text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
      />
    </div>
  );
}

/** Human label for a stored YYYY-MM-DD date (UTC, no TZ drift). */
function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Stored date → the YYYY-MM-DD a native <input type="date"> expects. */
function dateValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
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

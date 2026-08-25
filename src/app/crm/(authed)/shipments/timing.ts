import { formatDate } from "../_shell/format";
import type { CrmShipmentRow, StopTimingMode } from "./types";

/**
 * The ONE place a stop's timing is turned into something readable. Both PDFs
 * and both document editors go through here, so the Rate Confirmation, the
 * Bill of Lading, and the two review screens can never disagree about what a
 * shipment's pickup or delivery says — the exact drift the audits found.
 *
 * Renderers stay dumb by design (see CrmShipmentBolPDF's header: "no business
 * logic in the renderer"). This module produces plain display strings; the
 * generate actions put those into the PDF data, so nothing under src/lib/pdf
 * has to import app code.
 *
 * TIMEZONE, AND WHY IT DIFFERS PER SOURCE — this is the subtle part:
 *
 *   pickup_date is a Postgres `date`. It has no time and no timezone; it is
 *   the literal calendar day someone picked. It must therefore be formatted
 *   from its own "YYYY-MM-DD" parts and NEVER pushed through the Central
 *   conversion — `new Date("2026-08-26")` is UTC midnight, which in Central
 *   is the evening of Aug 25, so converting would silently print the wrong
 *   day. formatDateOnly below exists for exactly that reason.
 *
 *   pickup_at (legacy) IS an instant, so it keeps going through the existing
 *   Central-aware formatDate(), unchanged.
 */

export type TimingSource = "model" | "legacy" | "none";

export type ResolvedStopTiming = {
  source: TimingSource;
  /** "August 26, 2026", or null when no date is known. */
  dateLabel: string | null;
  /** "Time TBD" | "8:00 AM – 10:00 AM" | "8:30 AM Appointment", or null. */
  timeLabel: string | null;
  /** Null for legacy rows — their meaning is unknown and is never guessed. */
  mode: StopTimingMode | null;
  /** One line for compact spots: "August 26, 2026 · 8:30 AM Appointment". */
  summary: string | null;
};

/** "2026-08-26" -> "August 26, 2026". No Date object, no timezone, no drift. */
function formatDateOnly(value: string | null): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

/** "08:30:00" / "08:30" -> "8:30 AM". Wall clock; no conversion applied. */
function formatClock(value: string | null): string | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const h24 = Number(m[1]);
  if (!Number.isFinite(h24) || h24 > 23) return null;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/**
 * Resolve one stop. Prefers the timing model; falls back to the legacy
 * columns ONLY when the model is absent for that stop.
 *
 * The legacy branch deliberately reports mode = null and reproduces what is
 * stored rather than interpreting it: a degenerate "08:00 - 08:00" is shown
 * as the window it literally is, never promoted to an appointment, because
 * the original intent is unknowable (per Brent's Phase 1C instruction).
 */
export function resolveStopTiming(
  row: Pick<
    CrmShipmentRow,
    | "pickup_date" | "pickup_timing_mode" | "pickup_appointment_time"
    | "pickup_window_start" | "pickup_window_end" | "pickup_at" | "pickup_window"
    | "delivery_date" | "delivery_timing_mode" | "delivery_appointment_time"
    | "delivery_window_start" | "delivery_window_end" | "delivery_at" | "delivery_window"
  >,
  stop: "pickup" | "delivery",
): ResolvedStopTiming {
  const P = stop === "pickup";
  const date = P ? row.pickup_date : row.delivery_date;
  const mode = P ? row.pickup_timing_mode : row.delivery_timing_mode;
  const appt = P ? row.pickup_appointment_time : row.delivery_appointment_time;
  const wStart = P ? row.pickup_window_start : row.delivery_window_start;
  const wEnd = P ? row.pickup_window_end : row.delivery_window_end;
  const legacyAt = P ? row.pickup_at : row.delivery_at;
  const legacyWindow = P ? row.pickup_window : row.delivery_window;

  // ── New model ──────────────────────────────────────────────────────────
  if (date) {
    const dateLabel = formatDateOnly(date);
    let timeLabel: string | null = null;

    if (mode === "tbd") {
      timeLabel = "Time TBD";
    } else if (mode === "appointment") {
      const t = formatClock(appt);
      timeLabel = t ? `${t} Appointment` : null;
    } else if (mode === "window") {
      const a = formatClock(wStart);
      const b = formatClock(wEnd);
      timeLabel = a && b ? `${a} – ${b}` : null;
    }

    return {
      source: "model",
      dateLabel,
      timeLabel,
      mode: mode ?? null,
      summary: [dateLabel, timeLabel].filter(Boolean).join(" · ") || null,
    };
  }

  // ── Legacy fallback ────────────────────────────────────────────────────
  if (legacyAt || legacyWindow?.trim()) {
    // legacyAt is a real instant -> the existing Central-aware formatter.
    const dateLabel = legacyAt ? formatDate(legacyAt) : null;
    const win = legacyWindow?.trim();
    const timeLabel = win ? `Window ${win}` : null;
    return {
      source: "legacy",
      dateLabel,
      timeLabel,
      mode: null,
      summary: [dateLabel, timeLabel].filter(Boolean).join(" · ") || null,
    };
  }

  return { source: "none", dateLabel: null, timeLabel: null, mode: null, summary: null };
}

/**
 * Both stops at once — what the generate actions want. Takes the snake_case
 * DB row, which is what those actions already have in hand.
 */
export function resolveShipmentTiming(
  row: Parameters<typeof resolveStopTiming>[0],
): { pickup: ResolvedStopTiming; delivery: ResolvedStopTiming } {
  return {
    pickup: resolveStopTiming(row, "pickup"),
    delivery: resolveStopTiming(row, "delivery"),
  };
}

/**
 * Same resolution from the camelCase domain type — what the document editors
 * hold (CrmShipmentDetail). A thin adapter rather than a second copy of the
 * rule, so the editors and the generated PDFs can never disagree.
 */
export function resolveShipmentTimingFromDomain(s: {
  pickupDate: string | null;
  pickupTimingMode: StopTimingMode | null;
  pickupAppointmentTime: string | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  pickupAt: string | null;
  pickupWindow: string | null;
  deliveryDate: string | null;
  deliveryTimingMode: StopTimingMode | null;
  deliveryAppointmentTime: string | null;
  deliveryWindowStart: string | null;
  deliveryWindowEnd: string | null;
  deliveryAt: string | null;
  deliveryWindow: string | null;
}): { pickup: ResolvedStopTiming; delivery: ResolvedStopTiming } {
  return resolveShipmentTiming({
    pickup_date: s.pickupDate,
    pickup_timing_mode: s.pickupTimingMode,
    pickup_appointment_time: s.pickupAppointmentTime,
    pickup_window_start: s.pickupWindowStart,
    pickup_window_end: s.pickupWindowEnd,
    pickup_at: s.pickupAt,
    pickup_window: s.pickupWindow,
    delivery_date: s.deliveryDate,
    delivery_timing_mode: s.deliveryTimingMode,
    delivery_appointment_time: s.deliveryAppointmentTime,
    delivery_window_start: s.deliveryWindowStart,
    delivery_window_end: s.deliveryWindowEnd,
    delivery_at: s.deliveryAt,
    delivery_window: s.deliveryWindow,
  });
}

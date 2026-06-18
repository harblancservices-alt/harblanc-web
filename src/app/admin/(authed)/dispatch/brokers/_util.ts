/** Shared helpers for the broker portal. */

const PALETTE = [
  "bg-red-600",
  "bg-indigo-600",
  "bg-emerald-600",
  "bg-teal-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-sky-700",
  "bg-violet-600",
];

/** Deterministic avatar color from a broker name. */
export function brokerColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function brokerInitial(name: string): string {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

export function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function usd2(n: number): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Format a US phone number for display, e.g. "(423) 708-3613".
 *
 * Tolerant by design — strips non-digits, accepts an optional leading
 * country code "1", and returns the original (trimmed) string unchanged
 * for anything that isn't a clean 10/11-digit US number (short numbers,
 * blanks, extensions, international). Never throws.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const ten =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length === 10) {
    return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  }
  return raw.trim();
}

/** Digits-only `tel:` target, preserving a leading "+" for intl numbers. */
export function telHref(raw: string | null | undefined): string {
  if (!raw) return "";
  const plus = raw.trim().startsWith("+") ? "+" : "";
  return plus + raw.replace(/\D/g, "");
}

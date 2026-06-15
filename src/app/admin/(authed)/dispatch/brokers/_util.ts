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

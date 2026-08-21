import { MOOD_LABEL, MOOD_TONE, normalizeMood } from "./mood";

/** Read-only mood pill — renders nothing when unset (no "None" chip
 * cluttering every contact that hasn't been worked yet). Same visual formula
 * as Badge/ROLE_TONE, just not going through Badge's fixed tone union since
 * "cold" needs the CRM's steel-blue token, which Badge doesn't expose. */
export function MoodBadge({ mood, className }: { mood: string | null | undefined; className?: string }) {
  const m = normalizeMood(mood);
  if (!m) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide ${MOOD_TONE[m]} ${className ?? ""}`}
    >
      {MOOD_LABEL[m]}
    </span>
  );
}

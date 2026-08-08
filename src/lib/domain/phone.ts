/**
 * The ONE phone-formatting module for /tms-v2 — every phone number entered
 * or displayed (broker contacts, a broker's own phone, the Add-Load
 * dispatcher phone, Reach contacts, driver applications, …) goes through
 * this, never a page-local regex. Pure, no React — `PhoneField` (loads/
 * _form.tsx, the shared form-primitives file already cross-imported by
 * loads/brokers/reach) is the one React-facing piece that calls into it.
 *
 * US 10-digit numbers only. Anything else (an extension, an international
 * number, a malformed value) is returned unchanged rather than mangled —
 * silently truncating/reflowing a number that isn't a plain 10-digit US
 * line would corrupt real data.
 */

/** Digits only, capped at 10. */
function digitsOnly(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Display formatting — exactly 10 digits → "(XXX) XXX-XXXX". Re-formats
 * an already-formatted value the same way (normalizes to digits first), so
 * "832-445-8775" and "(832) 445-8775" both render identically. Any other
 * length passes through as-is. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = digitsOnly(raw);
  if (digits.length !== 10) return raw;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

/** Progressive formatter for onChange — formats as the user types,
 * gracefully handling partial input (fewer than 10 digits typed so far).
 * Digits beyond the 10th are dropped (a US number has no more to give). */
export function formatPhoneInput(raw: string): string {
  const digits = digitsOnly(raw).slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

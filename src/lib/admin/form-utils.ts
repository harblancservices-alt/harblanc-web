/**
 * Shared client-side form helpers for the HARBLANC admin workspace.
 *
 * Reused across LoadDetailsCard, QuoteRangeWorkspace, FinalizedQuoteWorkspace,
 * and BolWorkspace so the operator gets identical UX (progressive phone
 * formatting + Enter-to-advance focus) on every input.
 *
 * The customer-facing PhoneField in intake-fields.tsx uses the same
 * progressive formatter; this module is the admin-side parallel so
 * neither side has to import the other.
 */

import type { KeyboardEvent } from "react";

/**
 * Progressive US phone formatter. Strips non-digits, caps at 10, and
 * formats the partial string as the operator types:
 *
 *   ""           ->  ""
 *   "303"        ->  "(303"
 *   "3035"       ->  "(303) 5"
 *   "303555"     ->  "(303) 555"
 *   "3035550144" ->  "(303) 555-0144"
 *
 * Accepts pasted values in any format (e.g. "303-555-0144",
 * "+1 303 555 0144"). Anything beyond 10 digits is silently dropped --
 * out of scope for this carrier's customer base.
 */
export function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

/**
 * Enter-to-advance keydown handler. Attach to every form input across
 * the admin workspace so pressing Enter moves focus to the next
 * focusable element instead of submitting the form / doing nothing.
 *
 * Behavior:
 *   - Pressing Enter inside a <textarea> falls through (operators
 *     expect newlines in notes / special instructions).
 *   - Inside any other input / select, Enter focuses the next
 *     focusable element AFTER the current one in tab order. If there
 *     is no next focusable element, focus stays put.
 *   - Modifier keys (Cmd/Ctrl/Alt/Shift) are passed through so
 *     keyboard shortcuts and form submit chords still work.
 */
export function advanceOnEnter(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== "Enter") return;
  // Pass through inside textareas so operators can still type newlines.
  const target = e.currentTarget as HTMLElement;
  if (target.tagName === "TEXTAREA") return;
  // Pass through if a modifier is held — Cmd+Enter / Shift+Enter often
  // means "submit" or "newline" elsewhere and we should not intercept.
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

  e.preventDefault();

  // Walk the document for the next focusable element AFTER this one.
  // Includes inputs, selects, textareas, and buttons. Hidden / disabled
  // controls are skipped.
  const focusables = Array.from(
    document.querySelectorAll<HTMLElement>(
      'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    if ((el as HTMLInputElement).type === "hidden") return false;
    if (el.tabIndex < 0) return false;
    // Skip elements that are not laid out (display:none / detached) by
    // checking whether they have a renderable client rect.
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  });

  const idx = focusables.indexOf(target);
  if (idx < 0) return;
  const next = focusables[idx + 1];
  if (next) next.focus();
}

"use client";

/**
 * A real slide toggle — the CRM's first, so it lives in _shell rather than
 * inside the one screen that needed it.
 *
 * A native `<button role="switch">` with `aria-checked`, NOT a styled
 * checkbox: this is an instant action (it fires a server action on click),
 * not a form field that gets submitted later, and "switch" is what tells a
 * screen reader that flipping it does something now.
 *
 * Colors come from the semantic token set only — `bg-accent` when on,
 * `bg-fg-subtle` when off. The off state is a real, visible track, never a
 * pale grey that reads as "disabled"; `disabled` itself is opacity-60 plus
 * a not-allowed cursor, the same treatment every BTN_* token uses.
 */
export function SlideToggle({
  checked,
  onChange,
  disabled,
  label,
  busy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name — required, since the track itself has no text. */
  label: string;
  /** Renders the pending state without changing the visual position, so the
   * switch doesn't appear to snap back while the action is in flight. */
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "border-accent bg-accent" : "border-line-strong bg-fg-subtle"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-card shadow-e1 transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

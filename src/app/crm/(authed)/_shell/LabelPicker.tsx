"use client";

import { useEffect, useRef, useState } from "react";
import { CONTROL } from "./form";
import { IconChevronDown } from "./icons";

/**
 * Popover-based label picklist — a button that opens a small styled list of
 * presets, with a free-type "Other…" fallback. Replaces a native <select>
 * so a long preset list doesn't render as the OS scroll-wheel picker on
 * mobile (iOS/Android render any multi-option <select> that way regardless
 * of CSS). Shared by PhonesEditor (phone labels), LinksEditor (link labels),
 * and the Stray numbers assign/create flow via the `presets` prop. A value
 * that doesn't match any preset (legacy free-typed labels) starts in text
 * mode so it isn't silently blanked out.
 */
export function LabelPicker({
  value,
  onChange,
  presets,
  placeholder = "Select label…",
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  presets: readonly string[];
  placeholder?: string;
  className?: string;
}) {
  const matchesPreset = presets.includes(value);
  const [customMode, setCustomMode] = useState(value !== "" && !matchesPreset);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (customMode) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Custom label"
          className={`h-11 w-full ${CONTROL}`}
        />
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            onChange("");
          }}
          className="shrink-0 text-[11px] font-semibold text-fg-subtle hover:text-fg"
        >
          Presets
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-11 w-full items-center justify-between gap-2 ${CONTROL}`}
      >
        <span className={`truncate ${value ? "text-fg" : "text-fg-subtle"}`}>
          {value || placeholder}
        </span>
        <IconChevronDown width={14} height={14} className="shrink-0 text-fg-subtle" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-64 w-full min-w-[10rem] overflow-y-auto rounded-lg border border-line-strong bg-card py-1 shadow-e3"
        >
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              role="option"
              aria-selected={p === value}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-[13.5px] font-medium transition-colors hover:bg-inset ${
                p === value ? "bg-inset text-accent" : "text-fg"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCustomMode(true);
              onChange("");
              setOpen(false);
            }}
            className="block w-full border-t border-line px-3 py-2 text-left text-[13.5px] font-medium text-fg-subtle transition-colors hover:bg-inset hover:text-fg"
          >
            Other…
          </button>
        </div>
      )}
    </div>
  );
}

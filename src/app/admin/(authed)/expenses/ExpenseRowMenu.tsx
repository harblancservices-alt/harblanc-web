"use client";

import { useEffect, useRef, useState } from "react";
import { IconArchive, IconCopy, IconDots, IconPencil, IconSkip, IconTrash } from "./icons";

/** Compact three-dot row menu — Edit / Duplicate / Skip Next Payment /
 *  Archive-or-Restore / Delete. Opens a small anchored popover rather than a
 *  full dialog, so scanning many rows never means a large control per row. */
export function ExpenseRowMenu({
  archived,
  canSkip,
  onEdit,
  onDuplicate,
  onSkip,
  onToggleArchive,
  onDelete,
}: {
  archived: boolean;
  canSkip: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onSkip: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-inset hover:text-ink"
      >
        <IconDots className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-line-strong bg-card py-1 shadow-e3"
        >
          <MenuItem icon={<IconPencil className="h-3.5 w-3.5" />} onClick={() => run(onEdit)}>
            Edit
          </MenuItem>
          <MenuItem icon={<IconCopy className="h-3.5 w-3.5" />} onClick={() => run(onDuplicate)}>
            Duplicate
          </MenuItem>
          <MenuItem
            icon={<IconSkip className="h-3.5 w-3.5" />}
            onClick={() => run(onSkip)}
            disabled={!canSkip}
          >
            Skip Next Payment
          </MenuItem>
          <MenuItem
            icon={<IconArchive className="h-3.5 w-3.5" />}
            onClick={() => run(onToggleArchive)}
          >
            {archived ? "Restore" : "Archive"}
          </MenuItem>
          <div className="my-1 border-t border-line" />
          <MenuItem icon={<IconTrash className="h-3.5 w-3.5" />} tone="bad" onClick={() => run(onDelete)}>
            Delete
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  disabled = false,
  tone = "default",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "bad";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
        (tone === "bad" ? "text-bad hover:bg-bad-bg" : "text-ink hover:bg-inset")
      }
    >
      <span className="shrink-0 text-ink-3">{icon}</span>
      {children}
    </button>
  );
}

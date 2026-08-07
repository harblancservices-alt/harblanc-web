"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type ShellSearchContext = { open: boolean; setOpen: (v: boolean) => void };

const Ctx = createContext<ShellSearchContext | null>(null);

/** Owns the ⌘K command palette's open state above the shell, so both the
 * desktop top-right trigger (TopBar) and the mobile More sheet's Search
 * row (MoreSheet) can open the SAME dialog (CommandPalette) instead of
 * each needing their own copy of it. Also carries the global ⌘K/Esc
 * keyboard listener, since that's shell-wide behavior, not tied to
 * wherever the trigger button happens to render. */
export function ShellSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

export function useShellSearch(): ShellSearchContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShellSearch must be used within ShellSearchProvider");
  return ctx;
}

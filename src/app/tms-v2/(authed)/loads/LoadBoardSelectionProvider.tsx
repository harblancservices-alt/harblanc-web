"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { bulkDeleteLoads } from "@/actions/tms-v2/loads";
import type { MutationResult } from "@/lib/demo/mutation";

type LoadBoardSelection = {
  selectMode: boolean;
  selected: Set<string>;
  pending: boolean;
  error: string | null;
  enterSelectMode: () => void;
  exitSelectMode: () => void;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearAll: () => void;
  deleteSelected: () => Promise<void>;
};

const Ctx = createContext<LoadBoardSelection | null>(null);

/** Delete/bulk-select state, lifted above the Load Board so the trash-icon
 * trigger (top row, beside MonthDropdown) and the card grid's select mode
 * (LoadBoardListClient) can share it despite living in two different
 * PageScroll slots (header vs. children) with no parent-child relationship
 * of their own — same reasoning ShellSearchProvider lifts ⌘K's open state
 * above the shell so Sidebar's and MoreSheet's search entries open the
 * same dialog. */
export function LoadBoardSelectionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function enterSelectMode() {
    setSelectMode(true);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
    setError(null);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(ids: string[]) {
    setSelected(new Set(ids));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} load${selected.size === 1 ? "" : "s"}? Recoverable later from Archived loads.`)) return;
    setPending(true);
    setError(null);
    const result: MutationResult = await bulkDeleteLoads(Array.from(selected));
    setPending(false);
    if (result.ok) {
      exitSelectMode();
      router.refresh();
    } else {
      setError(result.reason);
    }
  }

  return (
    <Ctx.Provider
      value={{ selectMode, selected, pending, error, enterSelectMode, exitSelectMode, toggle, selectAll, clearAll, deleteSelected }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useLoadBoardSelection(): LoadBoardSelection {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLoadBoardSelection must be used within LoadBoardSelectionProvider");
  return ctx;
}

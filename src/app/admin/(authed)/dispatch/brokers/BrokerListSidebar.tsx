"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { brokerColor, brokerInitial, usd } from "./_util";

export type BrokerListItem = {
  id: string;
  name: string;
  status: string;
  mc: string | null;
  loads: number;
  gross: number;
};

type SortKey = "name" | "gross" | "loads";

/**
 * Persistent left rail for the broker portal: search, sort, and the broker
 * list with colored avatars and gross. Highlights the active broker from the
 * current path so the rail stays in sync as the right pane changes.
 */
export function BrokerListSidebar({ brokers }: { brokers: BrokerListItem[] }) {
  const pathname = usePathname();
  const activeId = pathname.split("/").filter(Boolean).pop();
  // On mobile the rail is the page itself on the index route; on a detail /
  // new route it hides so the right pane (full width) shows instead.
  const isIndex = pathname === "/admin/dispatch/brokers";
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? brokers.filter(
          (b) =>
            b.name.toLowerCase().includes(needle) ||
            (b.mc ?? "").toLowerCase().includes(needle),
        )
      : brokers;
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "gross") return b.gross - a.gross;
      if (sort === "loads") return b.loads - a.loads;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [brokers, q, sort]);

  return (
    <aside
      className={
        (isIndex ? "flex " : "hidden ") +
        "w-full shrink-0 flex-col bg-card md:flex md:w-[286px] md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:border-r md:border-line"
      }
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fg-subtle">
          Brokers
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            href="/admin/dispatch/brokers/quick-add"
            prefetch={false}
            variant="navigate"
            size="sm"
          >
            Quick add
          </Button>
          <Button
            href="/admin/dispatch/brokers/new"
            prefetch={false}
            variant="primary"
            size="sm"
            leftIcon={<span className="text-[13px] leading-none">+</span>}
          >
            New
          </Button>
        </div>
      </div>

      <div className="border-b border-line px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, MC, or DOT"
            className="min-w-0 flex-1 rounded-md border border-line-strong bg-canvas px-2.5 py-1.5 text-[12px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="cursor-pointer rounded border border-transparent bg-transparent py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted focus:outline-none"
          aria-label="Sort brokers"
        >
          <option value="name">Name (A–Z)</option>
          <option value="gross">Gross (high)</option>
          <option value="loads">Loads (high)</option>
        </select>
        <span className="font-mono text-[10.5px] tabular-nums text-fg-subtle">
          {rows.length} of {brokers.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-3 py-4 font-mono text-[11px] text-fg-subtle">
            {brokers.length === 0
              ? "No brokers yet."
              : `No match for “${q}”.`}
          </p>
        ) : (
          rows.map((b) => {
            const active = b.id === activeId;
            return (
              <Link
                key={b.id}
                href={`/admin/dispatch/brokers/${b.id}`}
                prefetch={false}
                className={
                  "flex items-center gap-2.5 border-b border-line px-3 py-2.5 transition-colors " +
                  (active
                    ? "bg-elevated"
                    : "hover:bg-elevated/60") +
                  (active ? " border-l-[3px] border-l-red-600 pl-[9px]" : "")
                }
              >
                <span
                  className={
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded text-[13px] font-bold text-white " +
                    brokerColor(b.name)
                  }
                >
                  {brokerInitial(b.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold leading-tight text-fg">
                    {b.name}
                  </span>
                  <span className="block font-mono text-[10px] text-fg-subtle">
                    {b.loads} {b.loads === 1 ? "load" : "loads"}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] font-bold tabular-nums text-green-700">
                  {usd(b.gross)}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}

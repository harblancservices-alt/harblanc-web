"use client";

import { useMemo, useState } from "react";
import { Card, CardHead, EmptyState } from "../../_shell/ui";
import { CONTROL } from "../../_shell/form";
import { IconSearch, IconTruck } from "../../_shell/icons";
import { NewShipmentButton } from "../../shipments/NewShipmentButton";
import { LoadTable } from "./LoadTable";
import { LoadCard } from "./LoadCard";
import {
  LOAD_FILTERS,
  countByFilter,
  matchesFilter,
  matchesQuery,
  sortLoads,
  type LoadFilterKey,
  type LoadRow,
  type SortDir,
  type SortKey,
} from "./loadRow";

/**
 * Operations → Active Loads (the Load Center). Every open, dispatched and
 * in-transit load in one dense, filterable list.
 *
 * All filtering, searching and sorting is CLIENT-SIDE over the rows the
 * server already fetched — same contract as ShipmentsListClient. The active
 * set is small by definition (loads still moving, not the full history), so
 * a round trip per keystroke would buy nothing.
 *
 * NO MONEY ON THIS SCREEN. Not the customer rate, not the carrier rate, not
 * margin, and no totals in the footer — sales agents work here. LoadRow
 * doesn't carry those fields at all (see loadRow.ts), so this isn't a
 * styling decision that a later edit could undo by accident.
 *
 * "+ Create load" is the EXISTING NewShipmentButton, unmodified: it calls
 * createShipment() on click (never on render — see that component for the
 * Next 16 revalidate-during-render crash it's avoiding) and routes into the
 * new shipment's workspace. Whatever permission that action already
 * enforces is what applies here; this screen adds no gate of its own.
 */
export function LoadCenterClient({ loads }: { loads: LoadRow[] }) {
  const [filter, setFilter] = useState<LoadFilterKey>("all");
  const [query, setQuery] = useState("");
  // Soonest pickup first: on a board of live loads, the next thing to happen
  // is the thing worth looking at.
  const [sortKey, setSortKey] = useState<SortKey>("pickup");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const counts = useMemo(() => countByFilter(loads), [loads]);

  const visible = useMemo(() => {
    const filtered = loads.filter((row) => matchesFilter(row, filter) && matchesQuery(row, query));
    return sortLoads(filtered, sortKey, sortDir);
  }, [loads, filter, query, sortKey, sortDir]);

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {LOAD_FILTERS.map((f) => {
              const active = filter === f.key;
              const count = counts[f.key];
              // The paperwork chip is the working queue — when something is
              // actually in it, it reads red whether or not it's selected.
              const alert = f.key === "paperwork" && count > 0;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                    active
                      ? alert
                        ? "border-bad bg-bad text-white"
                        : "border-accent bg-accent text-white"
                      : alert
                        ? "border-bad/45 bg-bad-bg text-bad hover:bg-bad/10"
                        : "border-line-strong bg-card text-fg-muted hover:bg-inset hover:text-fg"
                  }`}
                >
                  {f.label}
                  <span className="crm-num tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative flex flex-1 items-center sm:max-w-sm">
              <IconSearch
                width={16}
                height={16}
                className="pointer-events-none absolute left-3 text-fg-muted"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search load #, customer, carrier…"
                className={`h-10 w-full pl-9 ${CONTROL}`}
              />
            </label>
            <NewShipmentButton label="Create load" />
          </div>
        </div>
      </Card>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconTruck width={22} height={22} />}
            title={loads.length === 0 ? "No active loads" : "Nothing matches"}
            body={
              loads.length === 0
                ? "Open, dispatched and in-transit loads show up here. Create a load to get one moving."
                : "Try a different filter or search."
            }
            action={loads.length === 0 ? <NewShipmentButton label="Create load" /> : undefined}
          />
        </Card>
      ) : (
        <>
          {/* Mobile: stacked rows. */}
          <div className="flex flex-col gap-2.5 lg:hidden">
            {visible.map((row) => (
              <LoadCard key={row.id} row={row} />
            ))}
            <p className="px-1 pt-1 text-[12.5px] font-semibold text-fg-muted">
              <span className="crm-num tabular-nums">{visible.length}</span>{" "}
              {visible.length === 1 ? "load" : "loads"} · this view
            </p>
          </div>

          {/* Desktop: the dense table. */}
          <Card className="hidden lg:block">
            <CardHead title="Active loads" hint="Open, dispatched, and in transit" />
            <div className="overflow-x-auto">
              <LoadTable loads={visible} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            </div>
            {/* Footer is a COUNT ONLY — no money totals, by design. */}
            <div className="border-t border-line-strong bg-inset px-4 py-2.5 text-[12.5px] font-semibold text-fg-muted">
              <span className="crm-num tabular-nums">{visible.length}</span>{" "}
              {visible.length === 1 ? "load" : "loads"} · this view
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

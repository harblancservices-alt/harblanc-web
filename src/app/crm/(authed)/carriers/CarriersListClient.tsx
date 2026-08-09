"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardHead, EmptyState } from "../_shell/ui";
import { CONTROL } from "../_shell/form";
import { IconTruck, IconSearch } from "../_shell/icons";
import { CarrierCard } from "./CarrierCard";
import { CarrierTable } from "./CarrierTable";
import { AddCarrierButton } from "./AddCarrierButton";

export type CarrierListRow = {
  id: string;
  name: string;
  mcNumber: string | null;
  dotNumber: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  equipment: string | null;
  status: string;
};

/**
 * Search over the carrier directory. listCarriers() (the only read action
 * available here) caps at 20 rows per query — built for a picker, not a
 * full-directory dump — so this searches SERVER-side via the `q` URL param
 * (re-running listCarriers(q) on the server) rather than filtering an
 * already-capped client array, which would silently hide carriers past the
 * first 20 that a search should have surfaced.
 */
export function CarriersListClient({ carriers, q }: { carriers: CarrierListRow[]; q: string }) {
  const [text, setText] = useState(q);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function runSearch(next: string) {
    const params = new URLSearchParams(searchParams?.toString());
    if (next.trim()) params.set("q", next.trim());
    else params.delete("q");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(text);
          }}
          className="relative flex items-center"
        >
          <IconSearch width={16} height={16} className="pointer-events-none absolute left-3 text-fg-subtle" />
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => runSearch(text)}
            placeholder="Search carrier, MC/DOT #, city…"
            className={`h-10 w-full pl-9 ${CONTROL}`}
          />
        </form>
      </Card>

      {carriers.length === 0 ? (
        <Card>
          {!q ? (
            <EmptyState
              icon={<IconTruck />}
              title="No carriers yet"
              body="Add your first carrier to start assigning them to shipments."
              action={<AddCarrierButton />}
            />
          ) : (
            <EmptyState icon={<IconTruck />} title="No carriers match" body="Try a different search." />
          )}
        </Card>
      ) : (
        <>
          {carriers.length >= 20 && (
            <p className="px-1 text-[12px] text-fg-subtle">
              Showing the first 20 matches — refine your search to find more.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 [grid-auto-rows:1fr] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:hidden">
            {carriers.map((c) => (
              <CarrierCard key={c.id} carrier={c} />
            ))}
          </div>

          <Card className="hidden md:block">
            <CardHead
              title="Carriers"
              hint={`${carriers.length} ${carriers.length === 1 ? "carrier" : "carriers"}${pending ? " · searching…" : ""}`}
            />
            <div className="overflow-x-auto">
              <CarrierTable carriers={carriers} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

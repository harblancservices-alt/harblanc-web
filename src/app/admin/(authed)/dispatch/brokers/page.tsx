import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Brokers",
  robots: { index: false, follow: false },
};

/**
 * Brokers index — empty right pane. The persistent list lives in layout.tsx;
 * this prompts the operator to pick a broker or add one.
 */
export default function BrokersIndexPage() {
  return (
    <div className="hidden min-h-[60vh] items-center justify-center px-6 py-16 md:flex">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-elevated text-[20px] text-fg-subtle">
          ☷
        </div>
        <p className="text-[15px] font-semibold text-fg">Select a broker</p>
        <p className="mt-1 text-[13px] text-fg-muted">
          Pick a broker from the list to view its profile, loads, and
          receivables — or add a new one.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button
            href="/admin/dispatch/brokers/new"
            prefetch={false}
            variant="primary"
            leftIcon={<span className="text-[14px] leading-none">+</span>}
          >
            New Broker
          </Button>
          <Button
            href="/admin/dispatch/brokers/quick-add"
            prefetch={false}
            variant="navigate"
            leftIcon={<span className="text-[14px] leading-none">+</span>}
          >
            Quick add from load board
          </Button>
        </div>
      </div>
    </div>
  );
}

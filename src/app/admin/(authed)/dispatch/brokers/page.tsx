import type { Metadata } from "next";
import Link from "next/link";

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
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-elevated text-[20px] text-fg-subtle">
          ☷
        </div>
        <p className="text-[15px] font-semibold text-fg">Select a broker</p>
        <p className="mt-1 text-[13px] text-fg-muted">
          Pick a broker from the list to view its profile, loads, and
          receivables — or add a new one.
        </p>
        <Link
          href="/admin/dispatch/brokers/new"
          prefetch={false}
          className="mt-4 inline-flex items-center gap-1 rounded-md bg-blue-600 px-3.5 py-2 text-[12px] font-bold text-white transition-colors hover:bg-blue-700"
        >
          <span className="text-[14px] leading-none">+</span> New Broker
        </Link>
      </div>
    </div>
  );
}

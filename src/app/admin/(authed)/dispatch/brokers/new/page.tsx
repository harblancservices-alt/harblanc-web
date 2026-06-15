import type { Metadata } from "next";
import { AddBrokerPanel } from "../AddBrokerPanel";

export const metadata: Metadata = {
  title: "New Broker",
  robots: { index: false, follow: false },
};

/** Right-pane New Broker form (with FMCSA lookup). */
export default function NewBrokerPage() {
  return (
    <div className="px-4 py-5 sm:px-6">
      <header className="mb-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600">
          Dispatch
        </p>
        <h1 className="mt-1 text-[19px] font-semibold leading-none tracking-tight text-fg">
          New broker
        </h1>
      </header>
      <div className="max-w-3xl">
        <AddBrokerPanel forceOpen />
      </div>
    </div>
  );
}

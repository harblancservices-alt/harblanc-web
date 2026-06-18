import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { QuickAddForm } from "./QuickAddForm";

export const metadata: Metadata = {
  title: "Quick add broker",
  robots: { index: false, follow: false },
};

/**
 * Dispatch → Brokers → Quick add. Rapidly capture brokers + dispatchers +
 * posted lanes from a load board. The broker-name datalist is seeded with
 * existing names so re-entries reuse a broker instead of duplicating it.
 */
export default async function QuickAddBrokerPage() {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("brokers")
    .select("name")
    .is("deleted_at", null)
    .order("name");
  const brokerNames = Array.from(
    new Set(
      (data ?? [])
        .map((b: { name: string | null }) => (b.name ?? "").trim())
        .filter((n: string) => n.length > 0),
    ),
  );
  return <QuickAddForm brokerNames={brokerNames} />;
}

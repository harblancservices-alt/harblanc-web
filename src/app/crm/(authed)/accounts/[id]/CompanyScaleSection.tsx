import { createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead } from "../../_shell/ui";
import { LocationsSection } from "./LocationsSection";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{label}</p>
      <p className="mt-1 break-words text-[14px] text-fg">{value}</p>
    </div>
  );
}

/**
 * COMPANY SCALE — size, facilities/locations, and volume indicators; ONLY
 * what has data (per the reality check, size/volume are essentially all
 * empty right now). The size/volume facts card only renders when at least
 * one of them is set — no wall of dashes — but LocationsSection always
 * renders below it: it already carries its own proper "no facilities yet —
 * add one" empty state and Add button (see LocationsSection.tsx), so hiding
 * it here would just remove the one way to add the first facility.
 */
export async function CompanyScaleSection({
  accountId,
  companySize,
}: {
  accountId: string;
  companySize: string | null;
}) {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_accounts")
    .select("volume_frequency, weight_range")
    .eq("id", accountId)
    .maybeSingle();

  const volumeFrequency = (data?.volume_frequency as string | null) ?? null;
  const weightRange = (data?.weight_range as string | null) ?? null;
  const hasFacts = !!(companySize || volumeFrequency || weightRange);

  return (
    <div className="flex flex-col gap-4">
      {hasFacts && (
        <Card>
          <CardHead title="Company scale" />
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 p-5 sm:grid-cols-3">
            {companySize && <Fact label="Company size" value={companySize} />}
            {volumeFrequency && <Fact label="Volume & frequency" value={volumeFrequency} />}
            {weightRange && <Fact label="Weight range" value={weightRange} />}
          </div>
        </Card>
      )}
      <LocationsSection accountId={accountId} />
    </div>
  );
}

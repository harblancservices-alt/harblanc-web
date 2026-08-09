import { createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead } from "../../_shell/ui";
import { DetailFact } from "./DetailFact";
import type { LaneEntry } from "../../_shell/LanesEditor";
import { FreightProfileDialog } from "./FreightProfileDialog";

function Chips({ values }: { values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <span
          key={v}
          className="border border-line-strong bg-inset px-2 py-0.5 text-[11.5px] font-medium text-fg"
        >
          {v}
        </span>
      ))}
    </div>
  );
}

function Lanes({ lanes }: { lanes: LaneEntry[] }) {
  if (!lanes.length) return null;
  return (
    <ul className="flex flex-col gap-1">
      {lanes.map((l, i) => (
        <li key={i} className="text-[13.5px] text-fg">
          {l.origin || "?"} <span className="text-fg-subtle">→</span> {l.destination || "?"}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Freight profile" group — equipment, lanes, volume/frequency, weight
 * range, special requirements. Commodities live on the main Company Details
 * card instead (what they ship, alongside the firmographic facts); this
 * covers the deeper freight fields the reference layout doesn't call out by
 * name but which are real, editable data that must still display somewhere.
 * Self-contained fetch, same reasoning as CompanyProfileSection.
 */
export async function FreightProfileSection({ accountId }: { accountId: string }) {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_accounts")
    .select("equipment_needed, lanes, volume_frequency, weight_range, special_requirements, ai_confirmed_fields")
    .eq("id", accountId)
    .maybeSingle();

  const equipmentNeeded = ((data?.equipment_needed as string[] | null) ?? []).filter(Boolean);
  const lanes = ((data?.lanes as LaneEntry[] | null) ?? []).filter((l) => l.origin || l.destination);
  const volumeFrequency = (data?.volume_frequency as string | null) ?? null;
  const weightRange = (data?.weight_range as string | null) ?? null;
  const specialRequirements = ((data?.special_requirements as string[] | null) ?? []).filter(Boolean);
  const confirmed = (data?.ai_confirmed_fields as Record<string, unknown> | null) ?? {};
  const isEmpty =
    !equipmentNeeded.length && !lanes.length && !volumeFrequency && !weightRange && !specialRequirements.length;
  const dialog = (
    <FreightProfileDialog
      accountId={accountId}
      defaults={{
        equipment_needed: equipmentNeeded,
        lanes,
        volume_frequency: volumeFrequency,
        weight_range: weightRange,
        special_requirements: specialRequirements,
      }}
    />
  );

  return (
    <Card>
      <CardHead title="Freight profile" right={isEmpty ? undefined : dialog} />
      {isEmpty ? (
        <div className="flex items-center justify-between gap-3 px-5 py-5">
          <p className="text-[13px] text-fg-muted">No freight profile on file yet — equipment, lanes, volume.</p>
          {dialog}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
          <DetailFact
            label="Equipment needed"
            value={<Chips values={equipmentNeeded} />}
            fromAi={!!confirmed.equipment_needed}
          />
          <DetailFact label="Typical lanes" value={<Lanes lanes={lanes} />} fromAi={!!confirmed.lanes} />
          <DetailFact label="Volume & frequency" value={volumeFrequency} fromAi={!!confirmed.volume_frequency} />
          <DetailFact label="Weight range" value={weightRange} fromAi={!!confirmed.weight_range} />
          <DetailFact
            label="Special requirements"
            value={<Chips values={specialRequirements} />}
            fromAi={!!confirmed.special_requirements}
          />
        </div>
      )}
    </Card>
  );
}

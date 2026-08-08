// Dark odometer hero — matches the near-black (#0d1117) header treatment
// Expenses' "Fixed monthly" card and the Coming-up date badges already
// established this session, not a new color. `currentOdo` is unchanged:
// still the max across BOTH load odometers and logged service odometers
// (lib/dispatch/maintenance.ts's currentOdoFromSources, via
// lib/data/maintenance.ts's fetchCurrentOdo).
export function MaintenanceHero({ currentOdo }: { currentOdo: number }) {
  return (
    <div className="overflow-hidden rounded-xl px-4 py-5 text-center shadow-e2" style={{ backgroundColor: "#0d1117" }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Current odometer</div>
      <div className="mt-1 font-mono text-[34px] font-semibold leading-none tabular-nums text-white sm:text-[40px]">
        {currentOdo.toLocaleString()} <span className="text-[16px] font-medium text-white/60">mi</span>
      </div>
      <div className="mt-1.5 text-[12px] text-white/50">Highest reading across all loads and service logs.</div>
    </div>
  );
}

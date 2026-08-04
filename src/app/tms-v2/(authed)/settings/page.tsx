import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Card } from "@/components/tms-v2/ui/Card";
import { Money } from "@/components/tms-v2/ui/Money";
import { getDispatchSettingsSummary } from "@/lib/data/settings";
import { isDemoMode } from "@/lib/admin/demo";
import { company } from "@/lib/company";

// Money-affecting data, read fresh every visit — matches Today's pattern.
export const dynamic = "force-dynamic";

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-elevated px-3 py-2.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-muted">{label}</p>
      <p className={`mt-1 text-[14px] text-fg ${mono ? "font-mono tabular-nums" : ""}`}>{value}</p>
    </div>
  );
}

export default async function TmsV2SettingsPage() {
  const [settings, demoOn] = await Promise.all([getDispatchSettingsSummary(), isDemoMode()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Business defaults the money engine runs on, and account identity. Read-only in this phase — editable forms land in a later phase."
        badge={
          demoOn ? (
            <span className="rounded-full bg-warn-bg px-2.5 py-0.5 text-[12px] font-medium text-warn">Demo mode — showing sample values</span>
          ) : null
        }
      />

      <Card>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Business defaults</p>
        <p className="mt-1 text-[13px] text-fg-muted">
          Read from `dispatch_settings` — every money-computing screen (Load Board, Trips, Performance, Receivables) runs on these same values via the one money engine.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="MPG" value={settings.mpg.toString()} mono />
          <Field label="Diesel $/gal" value={`$${settings.dieselPricePerGallon.toFixed(2)}`} mono />
          <Field label="Factoring %" value={`${settings.factoringPct}%`} mono />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-line bg-elevated px-3 py-2.5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-muted">Monthly net goal</p>
            <p className="mt-1"><Money value={settings.monthlyNetGoal} tone="none" /></p>
          </div>
          <div className="rounded-md border border-line bg-elevated px-3 py-2.5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-muted">Annual net goal</p>
            <p className="mt-1"><Money value={settings.annualNetGoal} tone="none" /></p>
          </div>
          <div className="rounded-md border border-line bg-elevated px-3 py-2.5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-muted">Current cash</p>
            <p className="mt-1"><Money value={settings.currentCash} tone="none" /></p>
          </div>
        </div>
      </Card>

      <Card>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Account &amp; identity</p>
        <p className="mt-1 text-[13px] text-fg-muted">The carrier identity used on emails, quotes, and paperwork — same source as /admin's Settings page (src/lib/company.ts).</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Legal name" value={company.legalName} />
          <Field label="MC number" value={company.mc} mono />
          <Field label="USDOT number" value={company.dot} mono />
          <Field label="Dispatch model" value={company.dispatchModel} />
          <Field label="Dispatch email" value={company.dispatchEmail} />
          <Field label="Phone" value={company.dispatchPhone} mono />
          <Field label="Authority" value={company.authorityText} />
          <Field label="Service area" value={company.serviceArea} />
        </div>
      </Card>
    </div>
  );
}

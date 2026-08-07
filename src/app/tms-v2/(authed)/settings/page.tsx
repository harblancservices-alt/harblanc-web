import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Card } from "@/components/tms-v2/ui/Card";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { getDispatchSettingsSummary } from "@/lib/data/settings";
import { listExpenseAccounts } from "@/lib/data/recurring-expenses";
import { isDemoMode } from "@/lib/admin/demo";
import { company } from "@/lib/company";
import { FuelSettingsForm, ProfitGoalsForm } from "./SettingsForms";
import { PaymentMethodsCard } from "./PaymentMethodsCard";

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
  const [settings, demoOn, paymentAccounts] = await Promise.all([getDispatchSettingsSummary(), isDemoMode(), listExpenseAccounts()]);

  return (
    <PageScroll
      header={
        <PageHeader
          title="Settings"
          description="Business defaults the money engine runs on, and account identity."
          badge={
            demoOn ? (
              <span className="rounded-full bg-warn-bg px-2.5 py-0.5 text-[12px] font-medium text-warn">Demo mode — showing sample values</span>
            ) : null
          }
        />
      }
    >
    <div className="flex flex-col gap-6">
      <Card>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Business defaults</p>
        <p className="mt-1 text-[13px] text-fg-muted">
          Every money-computing screen (Load Board, Trips, Performance, Receivables) runs on these same values via the one money engine — edit carefully.
        </p>
        <FuelSettingsForm settings={settings} disabled={demoOn} />
      </Card>

      <Card>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Profit goals</p>
        <p className="mt-1 text-[13px] text-fg-muted">Drives Performance's goal bar and Today's pace. Current cash isn't editable here.</p>
        <ProfitGoalsForm settings={settings} disabled={demoOn} />
      </Card>

      <Card>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Payment methods</p>
        <p className="mt-1 text-[13px] text-fg-muted">Nicknames for the cards/accounts recurring expenses charge to — no card numbers stored, only a last4.</p>
        <PaymentMethodsCard accounts={paymentAccounts} disabled={demoOn} />
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
    </PageScroll>
  );
}

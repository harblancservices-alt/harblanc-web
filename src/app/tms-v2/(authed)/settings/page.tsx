import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Card } from "@/components/tms-v2/ui/Card";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { getDispatchSettingsSummary } from "@/lib/data/settings";
import { listExpenseAccounts } from "@/lib/data/recurring-expenses";
import { company } from "@/lib/company";
import { formatPhone } from "@/lib/domain/phone";
import { FuelSettingsForm, ProfitGoalsForm, CurrentCashForm } from "./SettingsForms";
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
  const [settings, paymentAccounts] = await Promise.all([getDispatchSettingsSummary(), listExpenseAccounts()]);

  return (
    <PageScroll
      header={
        <PageHeader
          title="Settings"
          description="Business defaults the money engine runs on, and account identity."
        />
      }
    >
    <div className="flex flex-col gap-6">
      <Card>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Business defaults</p>
        <p className="mt-1 text-[13px] text-fg-muted">
          Every money-computing screen (Load Board, Trips, Performance, Receivables) runs on these same values via the one money engine — edit carefully.
        </p>
        <FuelSettingsForm settings={settings} disabled={false} />
      </Card>

      <Card>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Profit goals</p>
        <p className="mt-1 text-[13px] text-fg-muted">Drives Performance's goal bar and Today's pace.</p>
        <ProfitGoalsForm settings={settings} disabled={false} />
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-[13px] text-fg-muted">Cash on hand — compared against the goal total to show the shortfall.</p>
          <CurrentCashForm settings={settings} disabled={false} />
        </div>
      </Card>

      <Card>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Payment methods</p>
        <p className="mt-1 text-[13px] text-fg-muted">Nicknames for the cards/accounts recurring expenses charge to — no card numbers stored, only a last4.</p>
        <PaymentMethodsCard accounts={paymentAccounts} disabled={false} />
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
          <Field label="Phone" value={formatPhone(company.dispatchPhone)} mono />
          <Field label="Authority" value={company.authorityText} />
          <Field label="Service area" value={company.serviceArea} />
        </div>
      </Card>
    </div>
    </PageScroll>
  );
}

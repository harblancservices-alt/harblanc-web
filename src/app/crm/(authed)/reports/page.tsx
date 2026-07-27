import { requireCrmUser } from "@/lib/crm/auth";
import { ComingSoon } from "../_shell/ComingSoon";
import { IconReports } from "../_shell/icons";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireCrmUser();
  return (
    <ComingSoon
      eyebrow="Insights"
      title="Reports"
      subtitle="Pipeline health and sales performance."
      icon={<IconReports />}
      body="Chart-forward reporting — pipeline value by stage, win rate, activity volume, and revenue forecasts — arrives next."
    />
  );
}

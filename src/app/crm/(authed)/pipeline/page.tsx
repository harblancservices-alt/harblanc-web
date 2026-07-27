import { requireCrmUser } from "@/lib/crm/auth";
import { ComingSoon } from "../_shell/ComingSoon";
import { IconPipeline } from "../_shell/icons";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  await requireCrmUser();
  return (
    <ComingSoon
      eyebrow="Deals"
      title="Pipeline"
      subtitle="Freight opportunities by stage."
      icon={<IconPipeline />}
      body="A drag-and-drop board across your pipeline stages — with weighted revenue, expected close, and win/loss tracking — arrives next."
    />
  );
}

import { requireCrmUser } from "@/lib/crm/auth";
import { ComingSoon } from "../_shell/ComingSoon";
import { IconTasks } from "../_shell/icons";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  await requireCrmUser();
  return (
    <ComingSoon
      eyebrow="Follow-ups"
      title="Tasks"
      subtitle="What's due, and what's next."
      icon={<IconTasks />}
      body="A prioritized task list with due dates, reminders, and per-company follow-ups arrives next."
    />
  );
}

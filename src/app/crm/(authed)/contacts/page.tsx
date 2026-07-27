import { requireCrmUser } from "@/lib/crm/auth";
import { ComingSoon } from "../_shell/ComingSoon";
import { IconContacts } from "../_shell/icons";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  await requireCrmUser();
  return (
    <ComingSoon
      eyebrow="People"
      title="Contacts"
      subtitle="Decision-makers across your companies."
      icon={<IconContacts />}
      body="A searchable directory of every contact — with best time to call, decision-maker flags, and follow-up reminders — arrives next."
    />
  );
}

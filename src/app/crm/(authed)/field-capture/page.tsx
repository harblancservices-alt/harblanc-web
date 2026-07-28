import { redirect } from "next/navigation";
import { requireCrmUser } from "@/lib/crm/auth";
import { PageShell } from "../_shell/ui";
import { FieldCaptureApp } from "./FieldCaptureApp";

export const dynamic = "force-dynamic";

/**
 * Field Capture — owner-only. Non-owners are redirected server-side, same
 * enforcement point as the AI Review gate; the nav item itself is also
 * owner-only (see _shell/nav.ts) so a non-owner never sees the destination.
 * Everything interactive (recording, parsing, review editing) lives in the
 * client component below — this server component passes it no props at all,
 * so there's no risk of a function/closure crossing the RSC boundary.
 */
export default async function FieldCapturePage() {
  const user = await requireCrmUser();
  if (user.role !== "owner") redirect("/crm");

  return (
    <PageShell
      eyebrow="Admin"
      title="Field Capture"
      subtitle="Dictate a field note, then let AI split it into leads for review."
    >
      <FieldCaptureApp />
    </PageShell>
  );
}

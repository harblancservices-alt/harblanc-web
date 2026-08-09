import { requireCrmUser } from "@/lib/crm/auth";
import { PageShell } from "../_shell/ui";
import { RateConfirmationDocument } from "./RateConfirmationDocument";

export const dynamic = "force-dynamic";

/**
 * Fillable, print-to-PDF carrier Rate Confirmation. No data fetching, no
 * persistence — the form is entirely uncontrolled inputs filled in by hand
 * before printing. All interactivity (typing, the print button) lives in
 * the client component; this stays a Server Component just for the
 * requireCrmUser() auth gate, consistent with every other /crm page.
 */
export default async function RateConfirmationPage() {
  await requireCrmUser();

  return (
    <PageShell>
      <RateConfirmationDocument />
    </PageShell>
  );
}

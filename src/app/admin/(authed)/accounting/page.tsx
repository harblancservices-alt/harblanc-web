import { redirect } from "next/navigation";

/**
 * Legacy route — Accounting moved into the Operations hub. Redirect existing
 * bookmarks / inbound links to the matching tab. The render + data logic now
 * live in ../operations/AccountingPanel (loader) and ./AccountingView (view).
 */
export default function AccountingRedirect() {
  redirect("/admin/operations?tab=accounting");
}

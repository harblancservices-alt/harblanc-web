import { redirect } from "next/navigation";

/**
 * Accounting folded into the Operations hub (v2-design.md) — this route
 * stays live so old links/bookmarks keep working, but the nav no longer
 * links here directly. Content lives at the Operations "Accounting
 * summary" tab now (./operations/_components/AccountingTab.tsx).
 */
export default function AccountingRedirectPage() {
  redirect("/tms-v2/operations?tab=accounting");
}

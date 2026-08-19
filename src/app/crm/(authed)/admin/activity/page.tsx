import { listOrgActivity } from "../activity-data";
import { AdminActivityList } from "./AdminActivityList";

export const dynamic = "force-dynamic";

/**
 * Admin Account "Activity" — the org-wide, all-companies activity feed
 * this feature moves out of Settings (../../settings/activity/[userId]'s
 * per-member login/page-view log, now removed — see that route's deletion).
 * Unlike the log it replaces, this reads the CRM's actual business activity
 * (crm_activities/crm_calls/crm_notes via ../activity-data.ts), same source
 * the per-company profile's Timeline tab already reads — filterable and
 * clickable, per the approved mockup.
 */
export default async function AdminActivityPage() {
  const items = await listOrgActivity();
  return <AdminActivityList items={items} />;
}

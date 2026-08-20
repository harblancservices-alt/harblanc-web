import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState } from "../_shell/ui";
import { IconUpgrades } from "../_shell/icons";
import { firstName } from "../_shell/format";
import { UpgradeComposer } from "./UpgradeComposer";
import { UpgradeRequestCard, type CrmUpgradeRequest } from "./UpgradeRequestCard";

export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "crm-documents";
/** Signed URLs are generated server-side per page load and only ever used to
 * render a thumbnail/lightbox on that same load — short-lived is enough,
 * same reasoning as BolSection/CommodityPhotoTiles. */
const SIGNED_URL_TTL_SECONDS = 300;

type RequestRow = {
  id: string;
  author_id: string | null;
  title: string;
  body: string | null;
  status: string;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  request_id: string;
  file_name: string;
  storage_path: string;
};

type ProfileRow = { id: string; full_name: string | null; email: string | null };

/**
 * The Upgrades feedback board — any active CRM member can post a change/
 * removal request with screenshots; every member can see the whole board
 * (org-scoped RLS, same as every other crm_* table — see
 * 20260808020000_crm_upgrade_requests.sql), and only an owner (Brent) can
 * move a request's status. Newest first.
 */
export default async function UpgradesPage() {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();
  const isOwner = user.role === "owner";

  const [requestsRes, attachmentsRes, profilesRes] = await Promise.all([
    supabase
      .from("crm_upgrade_requests")
      .select("id, author_id, title, body, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("crm_upgrade_attachments")
      .select("id, request_id, file_name, storage_path")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(2000),
    supabase.from("crm_profiles").select("id, full_name, email"),
  ]);

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const attachmentRows = (attachmentsRes.data ?? []) as AttachmentRow[];

  // Signed URLs resolved server-side in one batch (the bucket is private) —
  // same pattern as commodity photos on the company profile.
  const paths = attachmentRows.map((a) => a.storage_path);
  const signedUrlByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signedRows } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const row of signedRows ?? []) {
      if (row.signedUrl && row.path) signedUrlByPath.set(row.path, row.signedUrl);
    }
  }

  const attachmentsByRequest = new Map<string, CrmUpgradeRequest["attachments"]>();
  for (const a of attachmentRows) {
    const list = attachmentsByRequest.get(a.request_id) ?? [];
    list.push({
      id: a.id,
      fileName: a.file_name,
      signedUrl: signedUrlByPath.get(a.storage_path) ?? null,
    });
    attachmentsByRequest.set(a.request_id, list);
  }

  const requestRows = (requestsRes.data ?? []) as RequestRow[];
  const requests: CrmUpgradeRequest[] = requestRows.map((r) => {
    const author = r.author_id ? profileById.get(r.author_id) : undefined;
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      status: r.status,
      createdAt: r.created_at,
      authorName: (author && firstName(author.full_name, author.email)) || "Someone",
      attachments: attachmentsByRequest.get(r.id) ?? [],
    };
  });

  return (
    <PageShell title="Upgrades">
      <UpgradeComposer orgId={user.orgId} />

      <Card>
        <CardHead
          title="Requests"
          hint={requests.length ? `${requests.length} total` : undefined}
        />
        {requests.length === 0 ? (
          <EmptyState
            icon={<IconUpgrades width={24} height={24} />}
            title="No requests yet"
            body="Be the first to flag something you'd like changed, fixed, or removed."
          />
        ) : (
          <ul className="divide-y divide-line-strong">
            {requests.map((r) => (
              <UpgradeRequestCard key={r.id} request={r} canEditStatus={isOwner} />
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}

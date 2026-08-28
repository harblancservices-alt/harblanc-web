import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState } from "../_shell/ui";
import { IconUpgrades } from "../_shell/icons";
import { firstName } from "../_shell/format";
import { UpgradeComposer } from "./UpgradeComposer";
import { UpgradeRequestCard, type CrmUpgradeRequest } from "./UpgradeRequestCard";
import { UPGRADE_STATUSES, UPGRADE_STATUS_STYLE, isUpgradeStatus } from "./status";

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
  completed_at: string | null;
  completed_by: string | null;
  completion_note: string | null;
};

type AttachmentRow = {
  id: string;
  request_id: string;
  file_name: string;
  storage_path: string;
};

type ProfileRow = { id: string; full_name: string | null; email: string | null };

type Filter = "all" | "mine" | (typeof UPGRADE_STATUSES)[number];

function one(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * The Upgrades board — the CRM's own bug tracker.
 *
 * Any active member can post; everyone sees the whole board (org-scoped RLS,
 * same as every other crm_* table); only an owner can move a request through
 * its lifecycle. Newest first.
 *
 * The board is FILTERED, not truncated. Completing a request moves it to the
 * Completed tab rather than deleting it from view — the counts across the top
 * are the answer to "what did I report and where has it got to", which is the
 * question this page exists to answer and the old one could not.
 */
export default async function UpgradesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();
  const isOwner = user.role === "owner";

  const sp = await searchParams;
  const rawFilter = one(sp.show);
  const filter: Filter =
    rawFilter === "all" || rawFilter === "mine" || (rawFilter && isUpgradeStatus(rawFilter))
      ? (rawFilter as Filter)
      : "all";

  const [requestsRes, attachmentsRes, profilesRes] = await Promise.all([
    supabase
      .from("crm_upgrade_requests")
      .select(
        "id, author_id, title, body, status, created_at, completed_at, completed_by, completion_note",
      )
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

  // A failed read must not look like an empty board — "nobody has reported
  // anything" and "we could not load what was reported" are different facts.
  const loadFailed = Boolean(requestsRes.error);

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const nameOf = (id: string | null) => {
    if (!id) return null;
    const p = profileById.get(id);
    return p ? firstName(p.full_name, p.email) : null;
  };

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
  const all: CrmUpgradeRequest[] = requestRows.map((r) => {
    const author = r.author_id ? profileById.get(r.author_id) : undefined;
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      status: r.status,
      createdAt: r.created_at,
      authorName: (author && firstName(author.full_name, author.email)) || "Someone",
      isMine: r.author_id === user.id,
      completedAt: r.completed_at,
      completedByName: nameOf(r.completed_by),
      completionNote: r.completion_note,
      attachments: attachmentsByRequest.get(r.id) ?? [],
    };
  });

  const mine = all.filter((r) => r.isMine);
  const countOf = (status: string) => all.filter((r) => r.status === status).length;

  const visible =
    filter === "all"
      ? all
      : filter === "mine"
        ? mine
        : all.filter((r) => r.status === filter);

  const TABS: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: all.length },
    ...UPGRADE_STATUSES.map((s) => ({
      key: s as Filter,
      label: UPGRADE_STATUS_STYLE[s].label,
      count: countOf(s),
    })),
    { key: "mine", label: "Mine", count: mine.length },
  ];

  /** The agent's own one-line answer to "where did my reports get to". */
  const mineOpen = mine.filter((r) => r.status === "open").length;
  const mineInProgress = mine.filter((r) => r.status === "in_progress").length;
  const mineCompleted = mine.filter((r) => r.status === "completed").length;

  return (
    <PageShell title="Upgrades">
      <UpgradeComposer orgId={user.orgId} />

      <Card>
        <CardHead
          title="Requests"
          hint={
            mine.length
              ? `Yours — ${mineOpen} open · ${mineInProgress} in progress · ${mineCompleted} completed`
              : undefined
          }
        />

        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "all" ? "/crm/upgrades" : `/crm/upgrades?show=${t.key}`}
              prefetch={false}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
                filter === t.key ? "bg-accent text-white" : "bg-card text-fg-muted hover:bg-inset"
              }`}
            >
              {t.label}
              <span
                className={`crm-num text-[11px] font-bold ${
                  filter === t.key ? "text-white/80" : "text-fg-subtle"
                }`}
              >
                {t.count}
              </span>
            </Link>
          ))}
        </div>

        {loadFailed ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] font-bold text-bad">Requests could not be loaded</p>
            <p className="mx-auto mt-1 max-w-[42ch] text-[12px] text-fg-subtle">
              The query failed, so nothing is shown rather than an empty board that would read as
              &ldquo;nobody has reported anything&rdquo;. Reload to try again.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<IconUpgrades width={24} height={24} />}
            title={
              all.length === 0
                ? "No requests yet"
                : filter === "mine"
                  ? "You haven't reported anything yet"
                  : `Nothing ${TABS.find((t) => t.key === filter)?.label.toLowerCase()}`
            }
            body={
              all.length === 0
                ? "Be the first to flag something you'd like changed, fixed, or removed."
                : filter === "completed"
                  ? "Completed work will collect here so you can see what's been fixed."
                  : "Nothing in this tab right now — try another one."
            }
          />
        ) : (
          <ul className="divide-y divide-line-strong">
            {visible.map((r) => (
              <UpgradeRequestCard key={r.id} request={r} canEditStatus={isOwner} />
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}

import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { BTN_EDIT, PageShell, Card, CardHead, ZEBRA_ROWS } from "../_shell/ui";
import { firstName } from "../_shell/format";
import { LocalTime } from "../_shell/LocalTime";
import { MemberEditButton } from "./MemberEditButton";
import { BrokerProfileEditButton } from "./BrokerProfileEditButton";
import { getBrokerProfile } from "../_shell/brokerProfile";
import { OrgDocumentsSection, type OrgDocumentCard } from "./OrgDocumentsSection";
import { createBlankTemplateDocument } from "./blankTemplates";
import { GENERATED_TEMPLATE_LABELS } from "./templateLabels";
import { renderPdfFirstPageToPng } from "@/lib/pdf/pdfPageThumbnail";

export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "crm-documents";
const SIGNED_URL_TTL_SECONDS = 300;
/** Same prefix as documents-actions.ts::ORG_DOC_KIND_PREFIX — duplicated
 * because a "use server" file may only export async functions. */
const ORG_DOC_KIND_PREFIX = "org_doc:";
/** Always rendered, in this order, even with no file uploaded yet — Brent's
 * four starting document types. Any other org_doc kind found in the data
 * (added later via "+ Add document") is appended after these, alphabetically. */
const SEED_DOC_LABELS = ["Bill of Lading", "Rate Confirmation", "Carrier Agreement", "Shipper Agreement"];

type OrgDocumentRow = {
  id: string;
  kind: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

type MemberRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  title: string | null;
  role: string;
  is_active: boolean;
};

function initials(name: string | null, email: string | null): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return source.charAt(0).toUpperCase();
}

function roleLabel(role: string): string {
  return role === "owner" ? "Admin" : "Member";
}

/**
 * Settings — the signed-in identity plus the org's Team roster (crm_profiles,
 * RLS-scoped: crm_profiles_rw lets any signed-in member read every profile in
 * their org). Editing a member (name, title, active status) is gated to
 * role=owner at the app layer in ./actions — RLS itself only scopes rows to
 * the org, not by role, so this page is the enforcement point.
 */
export default async function SettingsPage() {
  const user = await requireCrmUser();
  const isAdmin = user.role === "owner";
  const supabase = await createCrmServerClient();

  const [{ data }, brokerProfile, { data: orgDocData }] = await Promise.all([
    supabase
      .from("crm_profiles")
      .select("id, full_name, email, title, role, is_active")
      .order("full_name", { ascending: true }),
    getBrokerProfile(),
    supabase
      .from("crm_documents")
      .select("id, kind, file_name, storage_path, mime_type, size_bytes, created_at")
      .is("account_id", null)
      .is("deal_id", null)
      .is("deleted_at", null)
      .like("kind", `${ORG_DOC_KIND_PREFIX}%`)
      .order("created_at", { ascending: false }),
  ]);

  const members = ((data ?? []) as MemberRow[]).slice().sort((a, b) => {
    if (a.role === "owner" && b.role !== "owner") return -1;
    if (b.role === "owner" && a.role !== "owner") return 1;
    return (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "");
  });

  // One card per document type — the latest (first, since ordered desc)
  // row per kind wins. Seed labels always render (even with no upload yet);
  // any custom kind Brent has added is appended after, alphabetically.
  const latestByLabel = new Map<string, OrgDocumentRow>();
  for (const row of (orgDocData ?? []) as OrgDocumentRow[]) {
    const label = row.kind.slice(ORG_DOC_KIND_PREFIX.length);
    if (!latestByLabel.has(label)) latestByLabel.set(label, row);
  }
  const customLabels = [...latestByLabel.keys()]
    .filter((label) => !SEED_DOC_LABELS.includes(label))
    .sort((a, b) => a.localeCompare(b));
  const allLabels = [...SEED_DOC_LABELS, ...customLabels];

  // thumbUrlByPath is always keyed by the DOC's OWN storage_path, even
  // though a PDF's actual signed URL points at a sibling `<path>.thumb.png`
  // object (rendered at generate/upload time — see blankTemplates.ts /
  // documents-actions.ts::createOrgDocument) rather than the PDF itself.
  const imagePaths = [...latestByLabel.values()]
    .filter((row) => row.mime_type?.startsWith("image/"))
    .map((row) => row.storage_path);
  const pdfRows = [...latestByLabel.values()].filter((row) => row.mime_type === "application/pdf");
  const signPaths = [...imagePaths, ...pdfRows.map((row) => `${row.storage_path}.thumb.png`)];

  const thumbUrlByPath = new Map<string, string>();
  if (signPaths.length) {
    const { data: signedRows } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrls(signPaths, SIGNED_URL_TTL_SECONDS);
    const signedUrlByRequestedPath = new Map<string, string>();
    for (const row of signedRows ?? []) {
      if (row.signedUrl && row.path) signedUrlByRequestedPath.set(row.path, row.signedUrl);
    }
    for (const path of imagePaths) {
      const url = signedUrlByRequestedPath.get(path);
      if (url) thumbUrlByPath.set(path, url);
    }
    for (const row of pdfRows) {
      const url = signedUrlByRequestedPath.get(`${row.storage_path}.thumb.png`);
      if (url) thumbUrlByPath.set(row.storage_path, url);
    }
  }

  const documentCards: OrgDocumentCard[] = allLabels.map((label) => {
    const row = latestByLabel.get(label);
    return {
      label,
      doc: row
        ? {
            id: row.id,
            fileName: row.file_name,
            storagePath: row.storage_path,
            mimeType: row.mime_type,
            sizeBytes: row.size_bytes,
            createdAt: row.created_at,
            thumbUrl: thumbUrlByPath.get(row.storage_path) ?? null,
          }
        : null,
    };
  });

  // Backfill a missing thumbnail on any EXISTING PDF doc (the two blank
  // templates from before this backfill shipped, or any admin-uploaded PDF
  // predating it) — same best-effort render + upload as
  // createBlankTemplateDocument/createOrgDocument, just triggered lazily on
  // read instead of at creation time. Self-limiting: once a `.thumb.png`
  // sibling exists, this is a no-op for that doc on every later visit.
  if (isAdmin) {
    for (const card of documentCards) {
      const doc = card.doc;
      if (!doc || doc.mimeType !== "application/pdf" || doc.thumbUrl) continue;

      const { data: pdfBlob } = await supabase.storage.from(STORAGE_BUCKET).download(doc.storagePath);
      if (!pdfBlob) continue;
      const thumbResult = await renderPdfFirstPageToPng(new Uint8Array(await pdfBlob.arrayBuffer()));
      if (!thumbResult.ok) continue;

      const thumbPath = `${doc.storagePath}.thumb.png`;
      const { error: thumbUploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(thumbPath, thumbResult.png, { contentType: "image/png", upsert: false });
      if (thumbUploadError) continue;

      const { data: thumbSigned } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(thumbPath, SIGNED_URL_TTL_SECONDS);
      if (thumbSigned?.signedUrl) doc.thumbUrl = thumbSigned.signedUrl;
    }
  }

  // Self-seed the two generated-template cards (Bill of Lading, Rate
  // Confirmation) the first time an admin loads Settings after they're
  // introduced — renders a blank copy of the real PDF generator's output
  // (see blankTemplates.ts) and splices it straight into this render's
  // documentCards, no revalidatePath (that throws Next 16's E7 mid-render —
  // this render already reflects the new row, no cache bust needed). A
  // later admin visit is a no-op once each card has a doc — there's no
  // regenerate control on the card anymore (Brent's call: a filled card is
  // just preview + View doc), so this is the only path that ever creates
  // these two docs.
  if (isAdmin) {
    for (const label of GENERATED_TEMPLATE_LABELS) {
      const idx = documentCards.findIndex((c) => c.label === label);
      if (idx === -1 || documentCards[idx].doc) continue;

      const result = await createBlankTemplateDocument(supabase, user, label, brokerProfile);
      if (result.ok) {
        // The thumbnail PNG was just uploaded alongside the PDF inside
        // createBlankTemplateDocument — sign it now so the card shows the
        // real preview on this very page load, not just after a refresh.
        const { data: thumbSigned } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(`${result.row.storagePath}.thumb.png`, SIGNED_URL_TTL_SECONDS);
        documentCards[idx] = {
          label,
          doc: {
            id: result.row.id,
            fileName: result.row.fileName,
            storagePath: result.row.storagePath,
            mimeType: result.row.mimeType,
            sizeBytes: result.row.sizeBytes,
            createdAt: result.row.createdAt,
            thumbUrl: thumbSigned?.signedUrl ?? null,
          },
        };
      }
    }
  }

  const me = members.find((m) => m.id === user.id);

  // "Last seen" per member — owner-only, so this extra query never runs for
  // regular members (mirroring the pendingReviewCount pattern in layout.tsx).
  // crm_user_events has no per-member aggregate to query directly, so this
  // reads the org's most recent events newest-first and keeps the first
  // (= latest) occurrence per user_id — same "first-seen wins" reduction
  // ai-review/page.tsx uses for its most-recent-pinned-note lookup.
  const lastSeenByUser = new Map<string, string>();
  if (isAdmin) {
    const { data: recentEvents } = await supabase
      .from("crm_user_events")
      .select("user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    for (const e of (recentEvents ?? []) as { user_id: string; created_at: string }[]) {
      if (!lastSeenByUser.has(e.user_id)) lastSeenByUser.set(e.user_id, e.created_at);
    }
  }

  return (
    <PageShell>
      <Card>
        <CardHead title="Your account" />
        <div className="flex items-center gap-3 px-5 py-4">
          <Avatar name={me?.full_name ?? user.fullName} email={user.email} size={48} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-fg">
              {firstName(me?.full_name ?? user.fullName, user.email) || "—"}
            </p>
            <p className="truncate text-[13px] text-fg-muted">
              {me?.title || "No title set"} · {user.email}
            </p>
          </div>
        </div>
        <dl className="divide-y divide-line-strong border-t border-line-strong">
          <Row label="Role" value={roleLabel(user.role)} />
        </dl>
      </Card>

      <Card>
        <CardHead
          title="Company / Brokerage Info"
          hint="The letterhead every generated document reads from."
          right={isAdmin && <BrokerProfileEditButton profile={brokerProfile} />}
        />
        <dl className="divide-y divide-line-strong">
          <Row label="Company name" value={brokerProfile.name || "—"} />
          <Row label="MC #" value={brokerProfile.mc || "—"} />
          <Row label="DOT #" value={brokerProfile.dot || "—"} />
          <Row label="Address" value={brokerProfile.address || "—"} />
          <Row label="Phone" value={brokerProfile.phone || "—"} />
          <Row label="Email" value={brokerProfile.email || "—"} />
        </dl>
      </Card>

      <Card>
        <CardHead
          title="Team"
          hint={`${members.length} ${members.length === 1 ? "member" : "members"}`}
        />
        {members.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-fg-muted">
            No team members found.
          </div>
        ) : (
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {members.map((m) => {
              const isSelf = m.id === user.id;
              return (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                  <Avatar name={m.full_name} email={m.email} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-fg">
                        {firstName(m.full_name, m.email) || "Unnamed"}
                      </span>
                      {isSelf && (
                        <span className="bg-steel-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel">
                          You
                        </span>
                      )}
                      {m.role === "owner" && (
                        <span className="bg-ok-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
                          Admin
                        </span>
                      )}
                      {!m.is_active && (
                        <span className="bg-warn-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[12.5px] text-fg-muted">
                      {m.title || "No title"} · {m.email || "—"}
                    </p>
                    {isAdmin && (
                      <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">
                        Last seen:{" "}
                        {lastSeenByUser.has(m.id) ? (
                          <LocalTime iso={lastSeenByUser.get(m.id)} />
                        ) : (
                          "Never"
                        )}
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Link
                        href={`/crm/settings/activity/${m.id}`}
                        prefetch={false}
                        className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
                      >
                        Activity
                      </Link>
                      <MemberEditButton
                        member={{
                          id: m.id,
                          full_name: m.full_name,
                          title: m.title,
                          is_active: m.is_active,
                        }}
                        isSelf={isSelf}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <OrgDocumentsSection orgId={user.orgId} isAdmin={isAdmin} cards={documentCards} />
    </PageShell>
  );
}

function Avatar({
  name,
  email,
  size,
}: {
  name: string | null | undefined;
  email: string | null | undefined;
  size: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center bg-accent font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name ?? null, email ?? null)}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </dt>
      <dd className="text-[14px] text-fg">{value}</dd>
    </div>
  );
}

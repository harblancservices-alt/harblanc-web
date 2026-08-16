"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Card, CardHead, BTN_EDIT, BTN_PRIMARY, BTN_NEUTRAL } from "../_shell/ui";
import { Modal } from "../_shell/Modal";
import { IconPlus } from "../_shell/icons";
import { createOrgDocument } from "./documents-actions";

const STORAGE_BUCKET = "crm-documents";
const ACCEPT = "application/pdf,image/*";
/** Short-lived — generated fresh on each "View doc" click, never persisted. */
const SIGNED_URL_TTL_SECONDS = 300;

export type OrgDocumentCardDoc = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  /** Resolved server-side (the bucket is private) — for images this signs
   * the file itself; for PDFs it signs a `<path>.thumb.v2.png` sibling
   * rendered at upload/generate time (see blankTemplates.ts /
   * documents-actions.ts::createOrgDocument). Null if that render/upload
   * failed or hasn't happened yet — there is deliberately NO icon or other
   * placeholder fallback (Brent's explicit call): the preview slot is
   * either the real page-1 image or empty, never a stand-in glyph. */
  thumbUrl: string | null;
};

export type OrgDocumentCard = {
  label: string;
  doc: OrgDocumentCardDoc | null;
};

/** Path segments can't contain arbitrary characters — same contract as
 * BolSection.tsx/CommodityPhotoTiles.tsx's sanitizeFileName. */
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 150 ? cleaned.slice(-150) : cleaned;
}

function slugify(label: string): string {
  const cleaned = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "document";
}

/**
 * Settings → Documents — the org-wide document type library (crm_documents,
 * kind='org_doc:<label>', account_id/deal_id both null). Seeded with four
 * fixed cards (Bill of Lading, Rate Confirmation, Carrier Agreement, Shipper
 * Agreement) via the `cards` prop built in page.tsx, plus any custom types
 * Brent has added — "+ Add document" lets him create more without a code
 * change. Deliberately minimal per Brent's call: a filled card is just its
 * preview thumbnail + "View doc", nothing else — no delete, replace,
 * regenerate, or timestamp. An empty card keeps an admin-only "Upload" so
 * new types can still get their first file attached.
 */
export function OrgDocumentsSection({
  orgId,
  isAdmin,
  cards,
}: {
  orgId: string;
  isAdmin: boolean;
  cards: OrgDocumentCard[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card>
      <CardHead
        title="Documents"
        hint="Reference documents your team can pull up any time."
        right={
          isAdmin && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
            >
              <IconPlus width={14} height={14} />
              Add document
            </button>
          )
        }
      />

      {error && (
        <p className="border-b border-line-strong bg-bad-bg px-5 py-2.5 text-[12.5px] text-bad">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <DocumentTypeCard
            key={card.label}
            orgId={orgId}
            card={card}
            isAdmin={isAdmin}
            onError={setError}
          />
        ))}
      </div>

      {addOpen && (
        <AddDocumentModal
          orgId={orgId}
          onClose={() => setAddOpen(false)}
          onError={setError}
        />
      )}
    </Card>
  );
}

function DocumentTypeCard({
  orgId,
  card,
  isAdmin,
  onError,
}: {
  orgId: string;
  card: OrgDocumentCard;
  isAdmin: boolean;
  onError: (msg: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { doc } = card;

  async function upload(file: File) {
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      onError("Only PDF or image files are accepted.");
      return;
    }
    onError(null);
    setBusy(true);

    const supabase = createSupabaseBrowserClient();
    const storagePath = `${orgId}/org-docs/${slugify(card.label)}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });

    if (uploadError) {
      setBusy(false);
      onError("Upload failed. Please try again.");
      return;
    }

    const res = await createOrgDocument(card.label, {
      fileName: file.name,
      storagePath,
      mimeType: file.type || null,
      sizeBytes: file.size,
    });

    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    router.refresh();
  }

  async function view() {
    if (!doc) return;
    onError(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(doc.storagePath, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      onError("Could not open this document. Please try again.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-line-strong bg-card shadow-e1">
      {/* No icon/placeholder fallback here, ever — either the real page-1
          image or an empty bg-inset box. */}
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-inset">
        {doc?.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doc.thumbUrl} alt={doc.fileName} className="h-full w-full object-cover object-top" />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-[13.5px] font-bold text-fg">{card.label}</p>
        {doc ? (
          <p className="truncate text-[12px] text-fg-muted">{doc.fileName}</p>
        ) : (
          <p className="text-[12px] text-fg-subtle">No file uploaded yet.</p>
        )}
      </div>

      <div className="border-t border-line-strong p-2.5">
        {doc ? (
          <button
            type="button"
            onClick={view}
            className={`w-full rounded-md py-1.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
          >
            View doc
          </button>
        ) : (
          isAdmin && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className={`w-full rounded-md py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
              >
                {busy ? "…" : "Upload"}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
            </>
          )
        )}
      </div>
    </div>
  );
}

function AddDocumentModal({
  orgId,
  onClose,
  onError,
}: {
  orgId: string;
  onClose: () => void;
  onError: (msg: string | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();

  async function submit() {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setFormError("Give this document type a name.");
      return;
    }
    if (!file) {
      setFormError("Choose a file to upload.");
      return;
    }
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      setFormError("Only PDF or image files are accepted.");
      return;
    }

    setFormError(null);
    setBusy(true);

    const supabase = createSupabaseBrowserClient();
    const storagePath = `${orgId}/org-docs/${slugify(trimmedLabel)}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });

    if (uploadError) {
      setBusy(false);
      setFormError("Upload failed. Please try again.");
      return;
    }

    const res = await createOrgDocument(trimmedLabel, {
      fileName: file.name,
      storagePath,
      mimeType: file.type || null,
      sizeBytes: file.size,
    });

    setBusy(false);
    if (!res.ok) {
      setFormError(res.error);
      onError(res.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title="Add document" busy={busy}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
            Document type name
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Insurance Certificate"
            className="w-full rounded-md border border-fg-subtle bg-card px-3 py-2 text-[14px] text-fg outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
            File
          </label>
          <input
            type="file"
            accept={ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-[13px] text-fg"
          />
        </div>
        {formError && <p className="text-[12.5px] text-bad">{formError}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_NEUTRAL}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
          >
            {busy ? "Adding…" : "Add document"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

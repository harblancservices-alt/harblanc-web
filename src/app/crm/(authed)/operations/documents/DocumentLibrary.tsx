"use client";

import { useMemo, useState } from "react";
import { Card, CardHead, EmptyState, Badge, BTN_NEUTRAL, DEPTH_PRIMARY } from "../../_shell/ui";
import { CONTROL } from "../../_shell/form";
import { IconBillOfLading, IconCheck, IconDownload, IconFolder, IconSearch } from "../../_shell/icons";
import { DocThumb } from "../../_shell/DocThumb";
import { formatDate } from "../../_shell/format";
import { getSignedPdfUrl } from "../../shipments/pdfClient";
import { CompileFolderDialog } from "./CompileFolderDialog";
import { MAX_PACKET_DOCUMENTS, PACKET_FILENAME_HEADER, safePacketFileName } from "./packetContract";

/**
 * One published document, trimmed to exactly what this screen renders.
 *
 * `storagePath` IS passed to the client, deliberately — it is what the two
 * per-document actions (open in a new tab, download the original) sign a
 * short-lived URL for, through the same shipments/pdfClient helper the Admin
 * grid uses. It is NOT how a folder gets compiled: that still posts document
 * IDs and ./packet/route.ts re-resolves every storage path itself, org-scoped
 * and is_public-checked, so a tampered payload still reaches nothing. Reading
 * a path here buys no access the signed URL didn't already grant, and the
 * bucket's RLS is a first-path-segment org match either way.
 */
export type LibraryDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  thumbUrl: string | null;
  previewUrl: string | null;
};

const PACKET_ROUTE = "/crm/operations/documents/packet";

/** Byte-identical to the Admin Documents grid's GRID_CLASS. These are the
 * same documents at two permission levels, so they get the same card size,
 * the same gap, and the same five-across breakpoint ladder — a rep and an
 * admin looking at one document should be looking at the same tile. */
const GRID_CLASS = "grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Short type word from the stored mime type — same vocabulary as
 * _shell/DocThumb.tsx's fallback tile and the company Files tab. */
function typeLabel(mimeType: string | null, fileName: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType?.startsWith("image/")) return "IMAGE";
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return ext && ext.length <= 5 ? ext.toUpperCase() : "FILE";
}

/**
 * Operations → Documents — the SALES-AGENT view of the org's document
 * library, plus the folder compiler.
 *
 * "These are the same documents, two permission levels." This grid is
 * deliberately the Admin Documents grid's twin: same GRID_CLASS, same 4:3
 * DocThumb card face, same title/meta typography, same bordered footer band
 * on every card. What differs is only what that footer band holds — an admin
 * gets a publish toggle, a rep gets a selection checkbox — and what is in the
 * grid at all: an admin sees every document, a rep sees only what an admin
 * published (is_public, filtered server-side by listPublicOrgDocuments()).
 *
 * READ-ONLY BY CONSTRUCTION. There is no upload, rename, delete, replace or
 * publish control anywhere on this screen, and none could be bolted on from
 * here: every one of those writes lives in ../../admin/documents/actions.ts
 * behind requireAdminUser(), which re-verifies role==='owner' on each call.
 * Nothing on this page is a mutation — the only network write is a POST that
 * returns a zip and stores nothing.
 *
 * NOTHING IS SAVED when a folder is compiled: no folder row, no bundle table,
 * no second copy in Storage. The zip in the rep's Downloads is the whole
 * deliverable (see ./packet/route.ts).
 */
export function DocumentLibrary({ documents }: { documents: LibraryDocument[] }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [compileOpen, setCompileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ fileName: string; count: number } | null>(null);

  /** Search is by document name only — the same single concept the Admin grid
   * would get if it ever grew one, not a second filtering architecture.
   * Client-side over an already-loaded list: this library is an org's
   * templates and agreements, tens of rows, never thousands. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => d.fileName.toLowerCase().includes(q));
  }, [documents, query]);

  const selectedBytes = useMemo(
    () => documents.reduce((sum, d) => (selected.has(d.id) ? sum + (d.sizeBytes ?? 0) : sum), 0),
    [documents, selected],
  );

  const overLimit = selected.size > MAX_PACKET_DOCUMENTS;
  const allVisibleSelected = visible.length > 0 && visible.every((d) => selected.has(d.id));

  function clearFeedback() {
    setError(null);
    setConfirmation(null);
  }

  function toggle(id: string) {
    clearFeedback();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Adds everything currently VISIBLE to the selection rather than replacing
   * it — with a search term active, a "Select all" that silently dropped the
   * documents a rep had already picked from an earlier search would lose work
   * with no undo. */
  function selectAllVisible() {
    clearFeedback();
    setSelected((prev) => {
      const next = new Set(prev);
      for (const d of visible) next.add(d.id);
      return next;
    });
  }

  function clearSelection() {
    clearFeedback();
    setSelected(new Set());
  }

  /**
   * Open the original in a real new tab. `window.open` fires SYNCHRONOUSLY on
   * the click, before the signed-URL round trip, and is navigated once the URL
   * resolves — calling it after an `await` is what gets the navigation treated
   * as an unrequested popup and blocked (Safari especially). Same two-step
   * pattern, for the same reason, as the Admin grid's openInNewWindow().
   */
  function openDocument(doc: LibraryDocument) {
    clearFeedback();
    setOpening(doc.id);
    const win = window.open("", "_blank");
    void getSignedPdfUrl(doc.storagePath).then((url) => {
      setOpening(null);
      if (!url || !win) {
        win?.close();
        setError(`Could not open "${doc.fileName}". Please try again.`);
        return;
      }
      win.location.href = url;
    });
  }

  /**
   * Download the ORIGINAL file, untouched — same bytes, same name, no
   * re-encoding and no zip wrapper.
   *
   * No popup is involved: the signed URL is minted WITH Supabase's `download`
   * option, so the object comes back carrying
   * `Content-Disposition: attachment` and a plain anchor click saves it
   * instead of navigating. Which is also why the "call window.open before the
   * await" rule above doesn't apply here — there is no window to open.
   */
  async function downloadDocument(doc: LibraryDocument) {
    clearFeedback();
    setDownloading(doc.id);
    const url = await getSignedPdfUrl(doc.storagePath, doc.fileName);
    setDownloading(null);
    if (!url) {
      setError(`Could not download "${doc.fileName}". Please try again.`);
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = doc.fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  /**
   * POST the selected IDs, get a zip back, hand it to the browser.
   *
   * fetch -> Blob -> a programmatic `<a download>` rather than a form post or
   * window.open: the request carries a JSON body, and this shape lets a
   * server-side failure come back as readable JSON and render inline in the
   * dialog instead of navigating the rep away to a raw error page.
   *
   * The zip's filename comes off a response HEADER rather than being
   * re-derived here, so what lands on disk is exactly what the server built.
   * The object URL is revoked on a delay and the blob is never stored — that,
   * plus no row and no Storage object being written anywhere, is the whole of
   * "clean up temp data".
   */
  async function compile(folderName: string) {
    setCompileError(null);
    setBusy(true);

    // Library order, not click order: `ids` follows the page's own
    // newest-first ordering, so the same picks always produce the same zip.
    const ids = documents.filter((d) => selected.has(d.id)).map((d) => d.id);

    try {
      const res = await fetch(PACKET_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName, ids }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setCompileError(payload?.error ?? "Could not compile the folder. Please try again.");
        return;
      }

      const blob = await res.blob();
      const fileName =
        res.headers.get(PACKET_FILENAME_HEADER) || `${safePacketFileName(folderName)}.zip`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoked on a delay, not immediately: revoking in the same tick can
      // cancel the download before the browser has read the blob.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);

      setCompileOpen(false);
      setError(null);
      setConfirmation({ fileName, count: ids.length });
    } catch {
      setCompileError("Could not compile the folder. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardHead title="Documents" hint="Published templates and agreements" />
        <EmptyState
          icon={<IconBillOfLading width={22} height={22} />}
          title="No documents published yet"
          body="An admin uploads documents under Admin Account → Documents and switches each one to Public. Published documents show up here for the whole team to open, download, and compile into a folder."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-bad/30 bg-bad-bg px-4 py-2.5 text-[13px] font-semibold text-bad">
          {error}
        </Card>
      )}

      {confirmation && (
        <Card className="flex items-start gap-2 border-ok/45 bg-ok-bg px-4 py-2.5 text-[13px] font-semibold text-ok">
          <IconCheck width={16} height={16} className="mt-0.5 shrink-0" />
          <span>
            Folder ready — &ldquo;{confirmation.fileName}&rdquo; downloaded with{" "}
            {confirmation.count} document{confirmation.count === 1 ? "" : "s"}. Nothing was saved to
            the CRM; compile it again any time.
          </span>
        </Card>
      )}

      <Card>
        <CardHead
          title="Documents"
          hint={
            query.trim()
              ? `${visible.length} of ${documents.length} match this search`
              : `${documents.length} published · select what goes in the folder`
          }
          right={
            <div className="flex shrink-0 items-center gap-2">
              <div className="relative">
                <IconSearch
                  width={14}
                  height={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
                />
                <input
                  type="search"
                  value={query}
                  placeholder="Search by name"
                  aria-label="Search documents by name"
                  onChange={(e) => setQuery(e.target.value)}
                  className={`h-8 w-36 pl-8 sm:w-52 ${CONTROL}`}
                />
              </div>
              <button
                type="button"
                onClick={selectAllVisible}
                disabled={allVisibleSelected}
                className={`inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_NEUTRAL}`}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selected.size === 0}
                className={`inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_NEUTRAL}`}
              >
                Clear
              </button>
            </div>
          }
        />

        <div className={GRID_CLASS}>
          {visible.map((d) => {
            const checked = selected.has(d.id);
            const meta = [
              formatDate(d.createdAt),
              formatBytes(d.sizeBytes),
              typeLabel(d.mimeType, d.fileName),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={d.id}
                className={`flex flex-col overflow-hidden rounded-lg border bg-card text-left shadow-e1 ${
                  checked ? "border-accent ring-2 ring-accent/35" : "border-line-strong"
                }`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${d.fileName}`}
                  onClick={() => openDocument(d)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDocument(d);
                    }
                  }}
                  className="flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden bg-inset text-fg-subtle transition-shadow hover:shadow-e2"
                >
                  <DocThumb
                    thumbUrl={d.thumbUrl}
                    previewUrl={d.previewUrl}
                    fileName={d.fileName}
                    mimeType={d.mimeType}
                    sizeBytes={d.sizeBytes}
                    className="h-full w-full"
                  />
                </div>
                <div className="flex flex-col gap-1.5 p-3">
                  <p className="truncate text-[13.5px] font-bold text-fg" title={d.fileName}>
                    {opening === d.id ? "Opening…" : d.fileName}
                  </p>
                  <p className="truncate text-[12px] text-fg-subtle">{meta}</p>
                  {/* The same bordered footer band the Admin card carries its
                      publish toggle in — one row, same height, so the two
                      grids line up card for card. Selection sits on the left
                      where the admin's state word is; the one per-document
                      action a rep gets sits on the right, and the card face
                      itself opens a preview. */}
                  <div className="mt-1 flex items-center justify-between gap-2 border-t border-line-strong pt-2">
                    <label className="flex min-w-0 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(d.id)}
                        aria-label={`Select ${d.fileName} for the folder`}
                        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      <span
                        className={`truncate text-[11px] font-bold uppercase tracking-[0.08em] ${
                          checked ? "text-accent" : "text-fg-muted"
                        }`}
                      >
                        {checked ? "Selected" : "Select"}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => void downloadDocument(d)}
                      disabled={downloading === d.id}
                      aria-label={`Download ${d.fileName}`}
                      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11.5px] font-bold transition-colors ${BTN_NEUTRAL}`}
                    >
                      <IconDownload width={13} height={13} />
                      {downloading === d.id ? "…" : "Download"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {visible.length === 0 && (
            <p className="col-span-full py-10 text-center text-[13px] text-fg-muted">
              No documents match that search.
            </p>
          )}
        </div>
      </Card>

      {/* Contextual action bar — present only with a selection, and pinned
          above the mobile bottom nav (CrmShell's is fixed at z-40, so this
          sits at bottom-24 below `lg` and tucks to bottom-4 on desktop, where
          that nav doesn't exist). */}
      {selected.size > 0 && (
        <div className="sticky bottom-24 z-30 lg:bottom-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/45 bg-card px-4 py-3 shadow-e3">
            <p className="text-[13.5px] font-bold text-fg">
              {selected.size} document{selected.size === 1 ? "" : "s"} selected
              {selectedBytes > 0 && (
                <span className="font-medium text-fg-muted"> · {formatBytes(selectedBytes)}</span>
              )}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {overLimit && <Badge tone="danger">Max {MAX_PACKET_DOCUMENTS}</Badge>}
              <button
                type="button"
                onClick={clearSelection}
                className={`inline-flex h-9 items-center rounded-md px-3.5 text-[13px] font-bold transition-colors ${BTN_NEUTRAL}`}
              >
                Clear
              </button>
              <button
                type="button"
                disabled={overLimit}
                onClick={() => {
                  setCompileError(null);
                  setCompileOpen(true);
                }}
                className={`inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13.5px] font-bold transition-colors disabled:pointer-events-none ${DEPTH_PRIMARY}`}
              >
                <IconFolder width={15} height={15} />
                Compile Folder
              </button>
            </div>
          </div>
          {overLimit && (
            <p className="mt-2 rounded-md border border-bad/30 bg-bad-bg px-3.5 py-2 text-[12.5px] font-semibold text-bad">
              A folder can hold up to {MAX_PACKET_DOCUMENTS} documents. Deselect{" "}
              {selected.size - MAX_PACKET_DOCUMENTS} to continue.
            </p>
          )}
        </div>
      )}

      {compileOpen && (
        <CompileFolderDialog
          count={selected.size}
          busy={busy}
          error={compileError}
          onCancel={() => {
            if (!busy) setCompileOpen(false);
          }}
          onCompile={(folderName) => void compile(folderName)}
        />
      )}
    </div>
  );
}

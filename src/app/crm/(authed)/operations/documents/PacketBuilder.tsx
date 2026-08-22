"use client";

import { useMemo, useState } from "react";
import { Card, CardHead, EmptyState, BTN_NEUTRAL, DEPTH_PRIMARY, Badge } from "../../_shell/ui";
import { CONTROL, LABEL } from "../../_shell/form";
import { IconBillOfLading, IconCheck } from "../../_shell/icons";
import { DocThumb } from "../../_shell/DocThumb";
import { formatDate } from "../../_shell/format";
import {
  MAX_PACKET_DOCUMENTS,
  MAX_PACKET_NAME_LENGTH,
  PACKET_FILENAME_HEADER,
  safePacketFileName,
} from "./packetContract";

/** One selectable row — the org's uploaded document templates, trimmed to
 * exactly what this screen renders. No storage path: the client only ever
 * posts IDs (see page.tsx). The two signed URLs feed DocThumb, the same
 * preview component the Admin Documents grid uses. */
export type PacketTemplate = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  thumbUrl: string | null;
  previewUrl: string | null;
};

const PACKET_ROUTE = "/crm/operations/documents/packet";

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Short type chip from the stored mime type — same vocabulary as the Admin
 * Documents grid and the company Files tab ("PDF" / "IMAGE" / "FILE"). */
function typeLabel(mimeType: string | null): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType?.startsWith("image/")) return "IMAGE";
  return "FILE";
}

/**
 * The vendor-packet builder: multi-select the org's document templates, name
 * the packet, download a .zip containing those files as SEPARATE documents
 * under their original names.
 *
 * Nothing is saved. There is no packet table, no packet object in Storage,
 * and no server action — the whole write path is one POST to a streaming
 * route handler, and the response body IS the product. Re-downloading means
 * re-selecting, which is the intended cost of keeping this stateless.
 *
 * The download deliberately goes through fetch -> Blob -> a programmatic
 * `<a download>` rather than window.open or a plain link: the request is a
 * POST carrying the selected IDs, and this shape lets a server-side error
 * come back as readable JSON and render inline instead of navigating the rep
 * away to a raw error page. No popup is ever opened, so the "window.open
 * must fire synchronously before the await" popup-blocker trap (see
 * ../../admin/documents/AdminDocumentsGrid.tsx) doesn't apply here — an
 * anchor click on a blob: URL needs no user-gesture window.
 *
 * The zip's filename comes back from the server on a response header rather
 * than being re-derived here, so the name on disk is always exactly the name
 * the server built.
 */
export function PacketBuilder({ templates }: { templates: PacketTemplate[] }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ fileName: string; count: number } | null>(null);

  const trimmedName = name.trim();
  const overLimit = selected.size > MAX_PACKET_DOCUMENTS;
  const canDownload = !busy && selected.size > 0 && trimmedName.length > 0 && !overLimit;

  const selectedBytes = useMemo(
    () =>
      templates.reduce(
        (sum, t) => (selected.has(t.id) ? sum + (t.sizeBytes ?? 0) : sum),
        0,
      ),
    [templates, selected],
  );

  function toggle(id: string) {
    setError(null);
    setConfirmation(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setError(null);
    setConfirmation(null);
    setSelected(new Set(templates.map((t) => t.id)));
  }

  function clearAll() {
    setError(null);
    setConfirmation(null);
    setSelected(new Set());
  }

  async function download() {
    if (!canDownload) return;
    setError(null);
    setConfirmation(null);
    setBusy(true);

    const ids = templates.filter((t) => selected.has(t.id)).map((t) => t.id);

    try {
      const res = await fetch(PACKET_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, ids }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not build the packet. Please try again.");
        return;
      }

      const blob = await res.blob();
      const fileName =
        res.headers.get(PACKET_FILENAME_HEADER) || `${safePacketFileName(trimmedName)}.zip`;

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

      setConfirmation({ fileName, count: ids.length });
    } catch {
      setError("Could not build the packet. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardHead title="Document packet" hint="Bundle templates into one download" />
        <EmptyState
          icon={<IconBillOfLading width={22} height={22} />}
          title="No templates yet"
          body="Admins add templates in the Admin portal, under Admin Account → Documents. Once they're uploaded they'll show up here for anyone on the team to pull into a packet."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHead
          title="Document templates"
          hint={`${templates.length} available · select what goes in the packet`}
          right={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_NEUTRAL}`}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={selected.size === 0}
                className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_NEUTRAL}`}
              >
                Clear
              </button>
            </div>
          }
        />
        {/* divide-line-strong, matching every other CRM list (BolSection,
            LocationsSection, admin/accounts) — and note the rows below set
            no border-color of their own, which is what would silently
            no-op the divider. Deliberately NOT paired with ZEBRA_ROWS: the
            selected-row highlight is the meaningful stripe here, and zebra
            banding underneath it would fight for the same signal. */}
        <ul className="divide-y divide-line-strong">
          {templates.map((t) => {
            const checked = selected.has(t.id);
            const meta = [formatDate(t.createdAt), formatBytes(t.sizeBytes)].filter(Boolean).join(" · ");
            return (
              <li key={t.id}>
                <label
                  className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors ${
                    checked ? "bg-accent/5" : "hover:bg-inset"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(t.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                  />
                  {/* Same preview component and the same signed-URL sources
                      as the Admin Documents grid — one mechanism, so a
                      document looks the same in both places. Portrait chip
                      here rather than the grid's 4:3 card face, since these
                      are rows in a list. */}
                  <DocThumb
                    thumbUrl={t.thumbUrl}
                    previewUrl={t.previewUrl}
                    fileName={t.fileName}
                    mimeType={t.mimeType}
                    sizeBytes={t.sizeBytes}
                    className={`h-16 w-12 shrink-0 rounded border ${
                      checked ? "border-accent" : "border-line-strong"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-fg">{t.fileName}</span>
                    {meta && <span className="mt-0.5 block text-[12px] text-fg-muted">{meta}</span>}
                  </span>
                  <Badge tone={checked ? "accent" : "neutral"}>{typeLabel(t.mimeType)}</Badge>
                </label>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHead title="Build your packet" hint="Name it, then download the zip" />
        <div className="flex flex-col gap-4 p-4">
          <label className="flex w-full min-w-0 flex-col gap-1 sm:max-w-md">
            <span className={LABEL}>Packet name</span>
            <input
              type="text"
              value={name}
              maxLength={MAX_PACKET_NAME_LENGTH}
              placeholder="Vendor packet — Alamo Manufacturing"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
                setConfirmation(null);
              }}
              className={`h-10 w-full min-w-0 ${CONTROL}`}
            />
          </label>

          <p className="text-[13px] font-medium text-fg-muted">
            {selected.size === 0
              ? "Nothing selected yet."
              : `${selected.size} document${selected.size === 1 ? "" : "s"} selected${
                  selectedBytes > 0 ? ` · ${formatBytes(selectedBytes)}` : ""
                } · each stays a separate file inside the zip.`}
          </p>

          {overLimit && (
            <p className="text-[13px] font-semibold text-bad">
              A packet can hold up to {MAX_PACKET_DOCUMENTS} documents. Deselect{" "}
              {selected.size - MAX_PACKET_DOCUMENTS} to continue.
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={() => void download()}
              disabled={!canDownload}
              className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-[14px] font-bold transition-colors disabled:pointer-events-none ${DEPTH_PRIMARY}`}
            >
              {busy ? "Building packet…" : "Download packet"}
            </button>
          </div>

          {error && (
            <div className="rounded-md border border-bad/30 bg-bad-bg px-3.5 py-2.5 text-[13px] font-semibold text-bad">
              {error}
            </div>
          )}

          {confirmation && (
            <div className="flex items-start gap-2 rounded-md border border-ok/45 bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-ok">
              <IconCheck width={16} height={16} className="mt-0.5 shrink-0" />
              <span>
                Packet ready — “{confirmation.fileName}” downloaded with {confirmation.count} file
                {confirmation.count === 1 ? "" : "s"}. Nothing was saved to the CRM; build it again
                any time.
              </span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Modal } from "../../_shell/Modal";
import { StickyActionBar } from "../../_shell/StickyActionBar";
import { CONTROL, LABEL } from "../../_shell/form";
import { BTN_NEUTRAL, DEPTH_PRIMARY } from "../../_shell/ui";
import { MAX_PACKET_NAME_LENGTH, safePacketFileName } from "./packetContract";

/**
 * "Compile Folder" — the one dialog between a rep's selection and the zip
 * landing in their Downloads. Its only job is to collect a REQUIRED folder
 * name, because that name becomes the file name: `<folder name>.zip`.
 *
 * Mounted only while open (the caller renders it conditionally), so the name
 * field starts empty on every compile instead of remembering the last one —
 * a folder name is per-packet, and a stale "New Customer Packet" silently
 * reused for a different vendor is worse than typing it again.
 *
 * NOTHING HERE IS SAVED. There is no folder record, no bundle row, no second
 * copy of any file in Storage. The zip the browser receives is the entire
 * product; re-downloading means re-selecting. That is the whole design (see
 * ./packet/route.ts), and the dialog says so in words so a rep isn't left
 * hunting for a saved folder that was never meant to exist.
 */
export function CompileFolderDialog({
  count,
  busy,
  error,
  onCancel,
  onCompile,
}: {
  /** How many documents are going in — echoed so the rep can catch a
   * mis-click before the download rather than after. */
  count: number;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCompile: (folderName: string) => void;
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const canCompile = trimmed.length > 0 && !busy;

  return (
    <Modal open onClose={() => !busy && onCancel()} title="Compile folder" busy={busy}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canCompile) onCompile(trimmed);
        }}
      >
        <div className="flex flex-col gap-4">
          <label className="flex w-full min-w-0 flex-col gap-1">
            <span className={LABEL}>Folder name</span>
            <input
              type="text"
              value={name}
              autoFocus
              required
              maxLength={MAX_PACKET_NAME_LENGTH}
              placeholder="New Customer Packet"
              onChange={(e) => setName(e.target.value)}
              className={`h-10 w-full min-w-0 ${CONTROL}`}
            />
            <span className="text-[12px] text-fg-muted">
              {trimmed
                ? `Downloads as “${safePacketFileName(trimmed)}.zip”.`
                : "Required — this becomes the name of the downloaded .zip."}
            </span>
          </label>

          <p className="text-[13px] font-medium text-fg-muted">
            {count} document{count === 1 ? "" : "s"} will go in, each kept as its own file under
            its original name. Nothing is saved to the CRM — the download is the folder.
          </p>

          {error && (
            <div className="rounded-md border border-bad/30 bg-bad-bg px-3.5 py-2.5 text-[13px] font-semibold text-bad">
              {error}
            </div>
          )}

          <StickyActionBar>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className={`inline-flex h-10 items-center rounded-md px-4 text-[13.5px] font-bold transition-colors ${BTN_NEUTRAL}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canCompile}
              className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-[13.5px] font-bold transition-colors disabled:pointer-events-none ${DEPTH_PRIMARY}`}
            >
              {busy ? "Compiling…" : "Compile & Download"}
            </button>
          </StickyActionBar>
        </div>
      </form>
    </Modal>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { batchManifest, setBatchClosed } from "../actions";

/**
 * Batch controls and the parsing handoff.
 *
 * ── WHY THE MANIFEST IS GENERATED, NEVER STORED ───────────────────────
 *
 * Its links are signed and expire. A manifest saved yesterday is a list of
 * dead URLs, which is worse than no manifest — it looks usable right up
 * until every fetch 403s. So it is built on demand, stamped with the moment
 * it was made and the moment it stops working.
 *
 * ── WHY IT SHOWS THE JSON RATHER THAN DOWNLOADING IT ──────────────────
 *
 * The parsing session is another Claude session, and what it needs is text
 * it can be handed. Copy puts it on the clipboard. A file download would add
 * a step and a path to type.
 */
export function BatchControls({
  batchId,
  closed,
  unparsed,
}: {
  batchId: string;
  closed: boolean;
  unparsed: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [json, setJson] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleClosed() {
    setError(null);
    startTransition(async () => {
      const res = await setBatchClosed(batchId, !closed);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function makeManifest() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const res = await batchManifest(batchId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setJson(JSON.stringify(res.manifest, null, 2));
    });
  }

  async function copy() {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      // Clipboard access is refused often enough (insecure origin, denied
      // permission, an old browser) that failing loudly here would be noise.
      // The textarea below is selectable — that is the fallback.
      setError("Could not reach the clipboard. Select the text below and copy it.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleClosed}
          disabled={pending}
          className={`rounded-md border px-3 py-1.5 text-[12px] font-bold disabled:opacity-60 ${
            closed
              ? "border-accent/40 bg-card text-accent hover:bg-accent/10"
              : "border-line-strong bg-card text-fg hover:bg-inset"
          }`}
        >
          {closed ? "Reopen batch" : "Done shooting"}
        </button>

        <button
          type="button"
          onClick={makeManifest}
          disabled={pending}
          className="rounded-md border border-accent bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "…" : "Build parsing manifest"}
        </button>

        <span className="text-[11.5px] text-fg-subtle">
          <span className="crm-num">{unparsed}</span> not yet parsed
        </span>
      </div>

      {json && (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-inset p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-md border border-accent/40 bg-card px-2.5 py-1 text-[12px] font-bold text-accent hover:bg-accent/10"
            >
              {copied ? "Copied" : "Copy manifest"}
            </button>
            <button
              type="button"
              onClick={() => setJson(null)}
              className="rounded-md border border-line px-2.5 py-1 text-[12px] font-bold text-fg-muted hover:bg-card"
            >
              Hide
            </button>
            <span className="text-[11.5px] text-fg-subtle">
              Links expire in 12 hours — rebuild it if the session starts later.
            </span>
          </div>
          <textarea
            readOnly
            value={json}
            rows={12}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full resize-y rounded-md border border-line bg-card p-2 font-mono text-[11px] leading-snug text-fg"
          />
        </div>
      )}
    </div>
  );
}

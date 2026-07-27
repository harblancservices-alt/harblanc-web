"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { attachTag, detachTag, createTag } from "../actions";
import { IconPlus } from "../../_shell/icons";

export type CrmTag = { id: string; label: string; color: string | null };

/**
 * Tag management on the company profile: view attached tags, remove them, add
 * an existing org tag, or create a brand-new one inline. Tag colours drive a
 * small dot only — the chip body stays a neutral inset fill so the label keeps
 * near-black contrast on the white card regardless of the chosen colour.
 */
export function TagEditor({
  accountId,
  attached,
  allTags,
}: {
  accountId: string;
  attached: CrmTag[];
  allTags: CrmTag[];
}) {
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#2f5d80");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const attachedIds = new Set(attached.map((t) => t.id));
  const available = allTags.filter((t) => !attachedIds.has(t.id));

  function run(fn: () => Promise<{ ok: boolean }>) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
    });
  }

  function onCreate() {
    const label = newLabel.trim();
    if (!label) return;
    startTransition(async () => {
      const res = await createTag(accountId, label, newColor);
      if (res.ok) {
        setNewLabel("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {attached.length === 0 && !open && (
          <span className="text-[13px] text-fg-subtle">No tags yet.</span>
        )}
        {attached.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-inset py-1 pl-2.5 pr-1.5 text-[12.5px] font-medium text-fg"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: t.color || "var(--fg-subtle)" }}
            />
            {t.label}
            <button
              type="button"
              onClick={() => run(() => detachTag(accountId, t.id))}
              disabled={pending}
              aria-label={`Remove ${t.label}`}
              className="flex h-4 w-4 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-line hover:text-fg disabled:opacity-60"
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[12.5px] font-semibold text-fg-muted transition-colors hover:bg-inset hover:text-fg"
        >
          <IconPlus width={13} height={13} />
          Tag
        </button>
      </div>

      {open && (
        <div className="rounded-xl border border-line bg-inset p-3">
          {available.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                Add existing
              </p>
              <div className="flex flex-wrap gap-1.5">
                {available.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => run(() => attachTag(accountId, t.id))}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[12.5px] font-medium text-fg transition-colors hover:bg-inset disabled:opacity-60"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: t.color || "var(--fg-subtle)" }}
                    />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
            Create new
          </p>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label="Tag colour"
              className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-card p-1"
            />
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCreate();
                }
              }}
              placeholder="New tag name"
              className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-card px-3 text-[13.5px] text-fg outline-none focus:ring-2 focus:ring-accent/40"
            />
            <button
              type="button"
              onClick={onCreate}
              disabled={pending || !newLabel.trim()}
              className="inline-flex h-9 shrink-0 items-center rounded-lg bg-accent px-3 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

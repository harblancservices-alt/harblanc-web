"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead } from "../../_shell/ui";
import { LABEL, CONTROL } from "../../_shell/form";
import { IconPlus, IconX } from "../../_shell/icons";
import { attachTag, createTag, detachTag } from "../actions";

export type CrmTagOption = { id: string; label: string; color: string | null };

const TAG_COLORS = ["#dc2626", "#d97706", "#16a34a", "#2563eb", "#7c3aed", "#64748b"];

/**
 * LEFT column — "Tags": attached tag pills (each with a remove ×) plus an
 * "Add tag" popover that lists the org's other tags to attach and a small
 * inline form to create a brand-new one. No tag editor existed on this page
 * before — the Companies list only ever filtered/displayed tags — so this is
 * new UI wired onto the existing attachTag/detachTag/createTag actions.
 */
export function TagsCard({
  accountId,
  attached,
  orgTags,
}: {
  accountId: string;
  attached: CrmTagOption[];
  orgTags: CrmTagOption[];
}) {
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const attachedIds = new Set(attached.map((t) => t.id));
  const available = orgTags.filter((t) => !attachedIds.has(t.id));

  function remove(tagId: string) {
    setBusyId(tagId);
    setError(null);
    startTransition(async () => {
      const res = await detachTag(accountId, tagId);
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function attach(tagId: string) {
    setBusyId(tagId);
    setError(null);
    startTransition(async () => {
      const res = await attachTag(accountId, tagId);
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function create() {
    const label = newLabel.trim();
    if (!label) return;
    setError(null);
    startTransition(async () => {
      const res = await createTag(accountId, label, newColor);
      if (res.ok) {
        setNewLabel("");
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHead
        title="Tags"
        right={
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-card px-3 py-1.5 text-[12.5px] font-semibold text-accent transition-colors hover:bg-accent/10"
          >
            <IconPlus width={13} height={13} />
            Add tag
          </button>
        }
      />
      <div className="flex flex-col gap-3 p-5">
        {attached.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No tags yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {attached.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 border border-line-strong bg-inset py-1 pl-2.5 pr-1.5 text-[12.5px] font-medium text-fg"
              >
                <span className="h-1.5 w-1.5 shrink-0" style={{ background: t.color || "var(--fg-subtle)" }} />
                {t.label}
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  disabled={pending && busyId === t.id}
                  aria-label={`Remove ${t.label}`}
                  className="flex h-5 w-5 items-center justify-center text-fg-subtle hover:bg-bad-bg hover:text-bad disabled:opacity-60"
                >
                  <IconX width={11} height={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {error && <p className="text-[12px] text-bad">{error}</p>}

        {open && (
          <div className="flex flex-col gap-3 border-t border-line-strong pt-3">
            {available.length > 0 && (
              <div>
                <p className={LABEL}>Attach existing</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {available.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => attach(t.id)}
                      disabled={pending && busyId === t.id}
                      className="inline-flex items-center gap-1.5 border border-line-strong bg-card px-2.5 py-1 text-[12px] font-medium text-fg transition-colors hover:bg-inset disabled:opacity-60"
                    >
                      <span className="h-1.5 w-1.5 shrink-0" style={{ background: t.color || "var(--fg-subtle)" }} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className={LABEL}>New tag</p>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      create();
                    }
                  }}
                  placeholder="e.g. VIP"
                  className={`h-9 min-w-0 flex-1 ${CONTROL}`}
                />
                <button
                  type="button"
                  onClick={create}
                  disabled={pending || !newLabel.trim()}
                  className="h-9 shrink-0 rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
                >
                  Create
                </button>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    aria-label={`Color ${c}`}
                    aria-pressed={newColor === c}
                    className={`h-6 w-6 shrink-0 rounded-full ${newColor === c ? "ring-2 ring-offset-1 ring-fg" : ""}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

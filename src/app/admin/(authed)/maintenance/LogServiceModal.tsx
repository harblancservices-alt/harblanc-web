"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  createReceiptUploadUrl,
  deleteService,
  logService,
  updateService,
} from "./actions";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import { Button } from "@/components/ui/Button";
import {
  CATEGORIES,
  POSITIONS,
  POSITION_LABEL,
  categoryForText,
  isCategory,
  money,
  parseMoney,
  type Category,
} from "@/lib/dispatch/repair-log";
import type { ReceiptView, ServiceFull } from "./types";

/** Pre-fill for a fresh service opened from a reminder / category / set. */
export type ServicePreset = {
  initialPart?: {
    description?: string;
    category?: Category;
    position?: string;
    partGroup?: string;
    reminderInterval?: number;
  };
};

const FIELD =
  "mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40";
const LABEL =
  "block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg";

type PartState = {
  key: string;
  id?: string;
  name: string;
  category: Category;
  categoryTouched: boolean;
  position: string;
  partGroup: string;
  remind: string;
};

type NewFile = { id: string; file: File };

function blankPart(): PartState {
  return {
    key: crypto.randomUUID(),
    name: "",
    category: "Other",
    categoryTouched: false,
    position: "",
    partGroup: "",
    remind: "",
  };
}

function seedParts(
  editService: ServiceFull | null | undefined,
  preset: ServicePreset | null | undefined,
): PartState[] {
  if (editService && editService.parts.length > 0) {
    return editService.parts.map((p) => ({
      key: crypto.randomUUID(),
      id: p.id,
      name: p.description,
      category: p.category,
      categoryTouched: true,
      position: p.position ?? "",
      partGroup: p.partGroup ?? "",
      remind: p.reminderInterval != null ? String(p.reminderInterval) : "",
    }));
  }
  const ip = preset?.initialPart;
  if (ip) {
    return [
      {
        key: crypto.randomUUID(),
        name: ip.description ?? "",
        category: ip.category ?? categoryForText(ip.description ?? ""),
        categoryTouched: !!ip.category,
        position: ip.position ?? "",
        partGroup: ip.partGroup ?? "",
        remind: ip.reminderInterval != null ? String(ip.reminderInterval) : "",
      },
    ];
  }
  return [blankPart()];
}

export function LogServiceModal({
  currentOdo,
  partGroups,
  preset,
  editService,
  onClose,
  onSaved,
  onDeleted,
}: {
  currentOdo: number;
  partGroups: string[];
  preset?: ServicePreset | null;
  editService?: ServiceFull | null;
  onClose: () => void;
  onSaved?: () => void;
  onDeleted?: () => void;
}) {
  const isEdit = !!editService;
  const today = new Date().toISOString().slice(0, 10);

  const [serviceDate, setServiceDate] = useState(editService?.date ?? today);
  const [odo, setOdo] = useState(() => {
    const seed = editService?.odometer ?? currentOdo;
    return seed != null && seed > 0 ? seed.toLocaleString("en-US") : "";
  });
  const [shop, setShop] = useState(editService?.shop ?? "");
  const [total, setTotal] = useState(
    editService?.totalCost != null ? String(editService.totalCost) : "",
  );
  const [notes, setNotes] = useState(editService?.notes ?? "");
  const [parts, setParts] = useState<PartState[]>(() =>
    seedParts(editService, preset),
  );

  const [existing, setExisting] = useState<ReceiptView[]>(
    editService?.receipts ?? [],
  );
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [files, setFiles] = useState<NewFile[]>([]);

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  function onOdoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, "");
    setOdo(digits ? Number(digits).toLocaleString("en-US") : "");
  }

  function patchPart(key: string, patch: Partial<PartState>) {
    setParts((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }
  function onPartName(key: string, value: string) {
    setParts((prev) =>
      prev.map((p) =>
        p.key === key
          ? {
              ...p,
              name: value,
              category: p.categoryTouched ? p.category : categoryForText(value),
            }
          : p,
      ),
    );
  }
  function addPart() {
    setParts((prev) => [...prev, blankPart()]);
  }
  function removePart(key: string) {
    setParts((prev) => (prev.length <= 1 ? prev : prev.filter((p) => p.key !== key)));
  }

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    setFiles((prev) => [
      ...prev,
      ...picked.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  }
  function removeExisting(id: string) {
    setRemovedIds((r) => (r.includes(id) ? r : [...r, id]));
    setExisting((prev) => prev.filter((a) => a.id !== id));
  }

  const [state, action, pending] = useActionState<
    { ok: boolean; error: string | null },
    FormData
  >(
    async (_prev, fd) => {
      try {
        if (editService) await updateService(editService.id, fd);
        else await logService(fd);
        return { ok: true, error: null };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Could not save service.",
        };
      }
    },
    { ok: false, error: null },
  );

  useEffect(() => {
    if (state.ok) (onSaved ?? onClose)();
  }, [state.ok, onSaved, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending && !uploading) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, uploading, onClose]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || uploading) return;
    const form = e.currentTarget;
    setUploading(true);
    setUploadErr(null);
    try {
      const metas: {
        storagePath: string;
        name: string;
        type: string;
        size: number;
      }[] = [];
      for (const f of files) {
        const urlRes = await createReceiptUploadUrl(
          f.file.name,
          f.file.type,
          f.file.size,
        );
        if (!urlRes.ok) {
          setUploadErr(urlRes.reason);
          return;
        }
        const upRes = await uploadFileToSignedUrl(
          urlRes.bucket,
          urlRes.path,
          urlRes.token,
          f.file,
        );
        if (!upRes.ok) {
          setUploadErr(`Upload failed ("${f.file.name}"): ${upRes.reason}`);
          return;
        }
        metas.push({
          storagePath: urlRes.path,
          name: f.file.name,
          type: f.file.type,
          size: f.file.size,
        });
      }

      const partsPayload = parts
        .filter((p) => p.name.trim().length > 0)
        .map((p) => ({
          id: p.id,
          description: p.name.trim(),
          category: p.category,
          position: p.position || null,
          partGroup: p.partGroup.trim() || null,
          reminderInterval: p.remind.trim() ? Number(p.remind) : null,
        }));

      const fd = new FormData(form);
      fd.set("parts", JSON.stringify(partsPayload));
      fd.set("receipts", JSON.stringify(metas));
      if (isEdit) fd.set("remove_receipt_ids", JSON.stringify(removedIds));
      action(fd);
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function onDelete() {
    if (!editService) return;
    if (
      !confirm(
        "Delete this whole service?\n\nThis removes the visit, every part in it, and its receipt. This can't be undone.",
      )
    ) {
      return;
    }
    setDeleteErr(null);
    startDelete(async () => {
      try {
        await deleteService(editService.id);
        (onDeleted ?? onClose)();
      } catch (e) {
        setDeleteErr(e instanceof Error ? e.message : "Could not delete service.");
      }
    });
  }

  const busy = pending || uploading || deleting;
  const errorMsg = uploadErr ?? deleteErr ?? state.error;
  const totalNum = parseMoney(total);

  return (
    <ModalShell
      title={isEdit ? "Edit service" : "Log a service"}
      pending={busy}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3 bg-elevated px-4 py-4">
          {/* Visit header */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Date</label>
              <input
                name="service_date"
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                required
                className={FIELD + " block min-w-0"}
              />
            </div>
            <div>
              <label className={LABEL}>Odometer</label>
              <input
                name="odometer"
                type="text"
                inputMode="numeric"
                value={odo}
                onChange={onOdoChange}
                autoComplete="off"
                placeholder="0"
                className={FIELD + " tabular-nums"}
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Shop (optional)</label>
            <input
              name="shop"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
              autoComplete="off"
              placeholder="e.g. Cummins dealer, roadside, self"
              className={FIELD}
            />
          </div>

          {/* Parts replaced */}
          <div>
            <div className="flex items-center justify-between">
              <label className={LABEL}>Parts replaced</label>
              <Button type="button" onClick={addPart} variant="primary" size="sm">
                + Add another part
              </Button>
            </div>
            <div className="mt-1.5 space-y-2">
              {parts.map((p) => (
                <div
                  key={p.key}
                  className="rounded-md border border-line bg-card p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={p.name}
                      onChange={(e) => onPartName(p.key, e.target.value)}
                      autoComplete="off"
                      placeholder="Part (e.g. Front-left wheel bearing)"
                      aria-label="Part name"
                      className="block w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                    />
                    {parts.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removePart(p.key)}
                        aria-label="Remove part"
                        className="shrink-0 rounded-md border border-line-strong bg-card px-2 py-1 text-[15px] leading-none text-fg-muted hover:bg-inset hover:text-bad"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <select
                      value={p.category}
                      onChange={(e) => {
                        if (isCategory(e.target.value)) {
                          patchPart(p.key, {
                            category: e.target.value,
                            categoryTouched: true,
                          });
                        }
                      }}
                      aria-label="Category"
                      className="min-w-0 flex-1 rounded-md border border-line-strong bg-inset px-2 py-1 text-[12px] font-semibold text-ink outline-none focus:border-accent"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <select
                      value={p.position}
                      onChange={(e) => patchPart(p.key, { position: e.target.value })}
                      aria-label="Position"
                      className="rounded-md border border-line-strong bg-inset px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
                    >
                      <option value="">No position</option>
                      {POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {POSITION_LABEL[pos]}
                        </option>
                      ))}
                    </select>
                    <input
                      value={p.remind}
                      onChange={(e) =>
                        patchPart(p.key, {
                          remind: e.target.value.replace(/[^\d]/g, ""),
                        })
                      }
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="remind mi"
                      aria-label="Remind every miles"
                      className="w-[92px] rounded-md border border-line-strong bg-inset px-2 py-1 text-[12px] tabular-nums text-ink outline-none placeholder:text-ink-3 focus:border-accent"
                    />
                  </div>
                  {p.position || p.remind.trim() ? (
                    <input
                      value={p.partGroup}
                      onChange={(e) =>
                        patchPart(p.key, { partGroup: e.target.value })
                      }
                      autoComplete="off"
                      list="repair-part-groups"
                      placeholder="Set / part group (e.g. Wheel bearings)"
                      aria-label="Set / part group"
                      className="mt-2 block w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[12.5px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <datalist id="repair-part-groups">
              {partGroups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <p className="mt-1 font-mono text-[10px] text-fg-subtle">
              Category is guessed from the part name — change it if needed. Set a
              position for corner sets; add “remind mi” to make a part recurring.
            </p>
          </div>

          {/* Receipt (service-level) */}
          <div>
            <div className="flex items-center justify-between">
              <label className={LABEL}>Receipt (optional)</label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-steel/50 bg-steel-bg px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-steel transition-colors hover:bg-steel-bg/70">
                + Receipt
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.heic"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
            </div>
            {existing.length > 0 || files.length > 0 ? (
              <div className="mt-1.5 space-y-1">
                {existing.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-md border border-line bg-card px-2 py-1"
                  >
                    <span className="shrink-0 rounded-sm bg-elevated px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                      {a.isImage ? "IMG" : "PDF"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg">
                      {a.name}
                    </span>
                    {a.url ? (
                      <Button
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        variant="navigate"
                        size="sm"
                        className="shrink-0"
                      >
                        View
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      onClick={() => removeExisting(a.id)}
                      variant="destructive"
                      size="sm"
                      className="shrink-0"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-2 rounded-md border border-line-strong bg-card px-2 py-1"
                  >
                    <span className="shrink-0 rounded-sm bg-elevated px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-steel">
                      New
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-fg-muted">
                      {f.file.name}
                    </span>
                    <Button
                      type="button"
                      onClick={() =>
                        setFiles((prev) => prev.filter((x) => x.id !== f.id))
                      }
                      variant="destructive"
                      size="sm"
                      className="shrink-0"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="mt-1 font-mono text-[10px] text-fg-subtle">
              One receipt covers the whole visit — it holds the cost breakdown.
            </p>
          </div>

          {/* One optional total + notes */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Total (optional)</label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-ink-3">
                  $
                </span>
                <input
                  name="total_cost"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  className="w-full rounded-md border border-line-strong bg-card py-1.5 pl-6 pr-2.5 text-[13px] tabular-nums text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>
            <div className="flex items-end">
              <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
                {totalNum > 0 ? money(totalNum) : ""}
              </span>
            </div>
          </div>
          <div>
            <label className={LABEL}>Notes (optional)</label>
            <textarea
              name="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              autoComplete="off"
              placeholder="Anything worth remembering about this visit…"
              className={FIELD + " resize-none"}
            />
          </div>

          {errorMsg ? (
            <p role="alert" className="text-[12px] font-semibold text-bad">
              {errorMsg}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
          {isEdit ? (
            <Button
              type="button"
              onClick={onDelete}
              disabled={busy}
              variant="destructive"
              className="mr-auto"
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
          <Button type="button" onClick={onClose} disabled={busy} variant="cancel">
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            variant="primary"
            leftIcon={
              busy ? (
                <span
                  aria-hidden
                  className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
              ) : undefined
            }
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Log service"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({
  title,
  pending,
  onClose,
  children,
}: {
  title: string;
  pending: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="my-4 w-full max-w-md overflow-hidden rounded-lg border border-line-strong bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
          <span className="truncate font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            {title}
          </span>
          <Button
            type="button"
            onClick={onClose}
            disabled={pending}
            variant="cancel"
            size="sm"
          >
            Cancel
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

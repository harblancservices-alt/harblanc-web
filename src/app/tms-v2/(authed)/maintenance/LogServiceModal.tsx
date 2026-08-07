"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { createReceiptUploadUrl, deleteService, logService, updateService } from "@/actions/tms-v2/maintenance";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { CATEGORIES, POSITIONS, POSITION_LABEL, categoryForText, isCategory, type Category } from "@/lib/dispatch/repair-log";
import type { MutationResult } from "@/lib/demo/mutation";

/**
 * Log/edit-service form — ported from V1's LogServiceModal.tsx (parts-first,
 * one visit holds many parts) onto tms-v2's Modal + Button primitives and
 * the mutation-result actions in actions/tms-v2/maintenance.ts. Closes the
 * audit's Critical Maintenance gap: "a shop visit happening today cannot be
 * recorded from tms-v2 at all."
 */

export type ReceiptView = { id: string; name: string; url: string | null; isImage: boolean };

export type ServiceFormPart = {
  id?: string;
  description: string;
  category: Category;
  position: string | null;
  partGroup: string | null;
  reminderInterval: number | null;
};

export type ServiceFull = {
  id: string;
  date: string | null;
  odometer: number | null;
  totalCost: number | null;
  notes: string | null;
  receipts: ReceiptView[];
  parts: ServiceFormPart[];
};

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
  return { key: crypto.randomUUID(), name: "", category: "Other", categoryTouched: false, position: "", partGroup: "", remind: "" };
}

function seedParts(editService: ServiceFull | null | undefined): PartState[] {
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
  return [blankPart()];
}

export function LogServiceModal({
  open,
  currentOdo,
  partGroups,
  editService,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  currentOdo: number;
  partGroups: string[];
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
  const [total, setTotal] = useState(editService?.totalCost != null ? String(editService.totalCost) : "");
  const [notes, setNotes] = useState(editService?.notes ?? "");
  const [parts, setParts] = useState<PartState[]>(() => seedParts(editService));

  const [existing, setExisting] = useState<ReceiptView[]>(editService?.receipts ?? []);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [files, setFiles] = useState<NewFile[]>([]);

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setServiceDate(editService?.date ?? today);
    const seed = editService?.odometer ?? currentOdo;
    setOdo(seed != null && seed > 0 ? seed.toLocaleString("en-US") : "");
    setTotal(editService?.totalCost != null ? String(editService.totalCost) : "");
    setNotes(editService?.notes ?? "");
    setParts(seedParts(editService));
    setExisting(editService?.receipts ?? []);
    setRemovedIds([]);
    setFiles([]);
    setUploadErr(null);
    setDeleteErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onOdoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, "");
    setOdo(digits ? Number(digits).toLocaleString("en-US") : "");
  }

  function patchPart(key: string, patch: Partial<PartState>) {
    setParts((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }
  function onPartName(key: string, value: string) {
    setParts((prev) =>
      prev.map((p) => (p.key === key ? { ...p, name: value, category: p.categoryTouched ? p.category : categoryForText(value) } : p)),
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
    setFiles((prev) => [...prev, ...picked.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }
  function removeExisting(id: string) {
    setRemovedIds((r) => (r.includes(id) ? r : [...r, id]));
    setExisting((prev) => prev.filter((a) => a.id !== id));
  }

  const [state, action, pending] = useActionState<{ ok: boolean; error: string | null }, FormData>(
    async (_prev, fd) => {
      const result: MutationResult = editService ? await updateService(editService.id, fd) : await logService(fd);
      return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
    },
    { ok: false, error: null },
  );

  useEffect(() => {
    if (state.ok) (onSaved ?? onClose)();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || uploading) return;
    const form = e.currentTarget;
    setUploading(true);
    setUploadErr(null);
    try {
      const metas: { storagePath: string; name: string; type: string; size: number }[] = [];
      for (const f of files) {
        const urlRes = await createReceiptUploadUrl(f.file.name, f.file.type, f.file.size);
        if (!urlRes.ok) {
          setUploadErr(urlRes.reason);
          return;
        }
        const upRes = await uploadFileToSignedUrl(urlRes.bucket, urlRes.path, urlRes.token, f.file);
        if (!upRes.ok) {
          setUploadErr(`Upload failed ("${f.file.name}"): ${upRes.reason}`);
          return;
        }
        metas.push({ storagePath: urlRes.path, name: f.file.name, type: f.file.type, size: f.file.size });
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
    if (!confirm("Delete this whole service?\n\nThis removes the visit, every part in it, and its receipts. This can't be undone.")) return;
    setDeleteErr(null);
    startDelete(async () => {
      const result: MutationResult = await deleteService(editService.id);
      if (result.ok) (onDeleted ?? onClose)();
      else setDeleteErr(result.reason);
    });
  }

  const busy = pending || uploading || deleting;
  const errorMsg = uploadErr ?? deleteErr ?? state.error;
  const FIELD =
    "mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-fg";
  const LABEL = "block text-[11px] font-semibold uppercase tracking-wide text-fg-muted";

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit service" : "Log a service"}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Date</label>
            <input name="service_date" type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} required className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Odometer</label>
            <input name="odometer" type="text" inputMode="numeric" value={odo} onChange={onOdoChange} placeholder="0" className={`${FIELD} tabular-nums`} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className={LABEL}>Parts replaced</label>
            <Button type="button" onClick={addPart} variant="secondary" size="sm">
              + Add another part
            </Button>
          </div>
          <div className="mt-1.5 space-y-2">
            {parts.map((p) => (
              <div key={p.key} className="rounded-md border border-line bg-elevated p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    value={p.name}
                    onChange={(e) => onPartName(p.key, e.target.value)}
                    placeholder="Part (e.g. Front-left wheel bearing)"
                    aria-label="Part name"
                    className="block w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                  />
                  {parts.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removePart(p.key)}
                      aria-label="Remove part"
                      className="shrink-0 rounded-md border border-line-strong bg-card px-2 py-1 text-[15px] leading-none text-fg-muted hover:text-bad"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <select
                    value={p.category}
                    onChange={(e) => {
                      if (isCategory(e.target.value)) patchPart(p.key, { category: e.target.value, categoryTouched: true });
                    }}
                    aria-label="Category"
                    className="min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2 py-1 text-[12px] font-medium text-fg outline-none focus:border-fg"
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
                    className="rounded-md border border-line-strong bg-card px-2 py-1 text-[12px] text-fg outline-none focus:border-fg"
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
                    onChange={(e) => patchPart(p.key, { remind: e.target.value.replace(/[^\d]/g, "") })}
                    inputMode="numeric"
                    placeholder="remind mi"
                    aria-label="Remind every miles"
                    className="w-[92px] rounded-md border border-line-strong bg-card px-2 py-1 text-[12px] tabular-nums text-fg outline-none placeholder:text-fg-subtle focus:border-fg"
                  />
                </div>
                {p.position || p.remind.trim() ? (
                  <input
                    value={p.partGroup}
                    onChange={(e) => patchPart(p.key, { partGroup: e.target.value })}
                    list="tms-v2-repair-part-groups"
                    placeholder="Set / part group (e.g. Wheel bearings)"
                    aria-label="Set / part group"
                    className="mt-2 block w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[12.5px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                  />
                ) : null}
              </div>
            ))}
          </div>
          <datalist id="tms-v2-repair-part-groups">
            {partGroups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className={LABEL}>Receipt (optional)</label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-card px-2.5 py-1 text-[11px] font-semibold text-fg hover:bg-elevated">
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
                <div key={a.id} className="flex items-center gap-2 rounded-md border border-line bg-elevated px-2 py-1">
                  <span className="shrink-0 rounded-sm bg-card px-1.5 py-[1px] text-[9px] font-bold uppercase text-fg-muted">{a.isImage ? "IMG" : "PDF"}</span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg">{a.name}</span>
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noreferrer" className="shrink-0 text-[12px] font-medium text-accent hover:underline">
                      View
                    </a>
                  ) : null}
                  <button type="button" onClick={() => removeExisting(a.id)} className="shrink-0 text-[12px] font-medium text-bad hover:underline">
                    Remove
                  </button>
                </div>
              ))}
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-md border border-line-strong bg-elevated px-2 py-1">
                  <span className="shrink-0 rounded-sm bg-card px-1.5 py-[1px] text-[9px] font-bold uppercase text-accent">New</span>
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-fg-muted">{f.file.name}</span>
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))} className="shrink-0 text-[12px] font-medium text-bad hover:underline">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <label className={LABEL}>Total (optional)</label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-fg-subtle">$</span>
            <input
              name="total_cost"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full rounded-md border border-line-strong bg-card py-1.5 pl-6 pr-2.5 text-[13px] tabular-nums text-fg outline-none placeholder:text-fg-subtle focus:border-fg"
            />
          </div>
        </div>
        <div>
          <label className={LABEL}>Notes (optional)</label>
          <textarea name="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${FIELD} resize-none`} />
        </div>

        {errorMsg ? (
          <p role="alert" className="text-[12px] font-semibold text-bad">
            {errorMsg}
          </p>
        ) : null}

        <div className="mt-1 flex items-center justify-end gap-2 border-t border-line pt-3">
          {isEdit ? (
            <Button type="button" onClick={onDelete} disabled={busy} variant="destructive" className="mr-auto">
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
          <Button type="button" onClick={onClose} disabled={busy} variant="secondary">
            Cancel
          </Button>
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Log service"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { logRepair, updateRepair, deleteRepair, createReceiptUploadUrl } from "./actions";
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
import type { EntryLite, ReceiptView, RepairEntryFull } from "./types";

/** Fields that can be pre-filled when opening the form (from a reminder/set). */
export type RepairPreset = {
  description?: string;
  partGroup?: string;
  position?: string;
  reminderInterval?: number;
  category?: Category;
};

const FIELD =
  "mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40";
const LABEL =
  "block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg";

type NewFile = { id: string; file: File };

export function LogRepairModal({
  currentOdo,
  partGroups,
  allEntries,
  preset,
  editEntry,
  onClose,
  onSaved,
  onDeleted,
}: {
  currentOdo: number;
  partGroups: string[];
  allEntries: EntryLite[];
  preset?: RepairPreset | null;
  editEntry?: RepairEntryFull | null;
  onClose: () => void;
  onSaved?: () => void;
  onDeleted?: () => void;
}) {
  const isEdit = !!editEntry;
  const today = new Date().toISOString().slice(0, 10);

  const [description, setDescription] = useState(
    editEntry?.description ?? preset?.description ?? "",
  );
  // Category auto-follows the description until the user picks one by hand
  // (edit mode and category-presets start "touched" so they don't drift).
  const [category, setCategory] = useState<Category>(
    editEntry?.category ??
      preset?.category ??
      categoryForText(editEntry?.description ?? preset?.description ?? ""),
  );
  const [categoryTouched, setCategoryTouched] = useState(
    !!editEntry || !!preset?.category,
  );
  function onDescriptionChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setDescription(v);
    if (!categoryTouched) setCategory(categoryForText(v));
  }
  const [serviceDate, setServiceDate] = useState(editEntry?.date ?? today);
  const [odo, setOdo] = useState(() => {
    const seed = editEntry?.odometer ?? currentOdo;
    return seed != null && seed > 0 ? seed.toLocaleString("en-US") : "";
  });
  const [cost, setCost] = useState(
    editEntry?.cost != null ? String(editEntry.cost) : "",
  );
  const [notes, setNotes] = useState(editEntry?.notes ?? "");
  const [position, setPosition] = useState(
    editEntry?.position ?? preset?.position ?? "",
  );
  const [partGroup, setPartGroup] = useState(
    editEntry?.partGroup ?? preset?.partGroup ?? "",
  );
  const [remind, setRemind] = useState(
    editEntry?.reminderInterval != null
      ? String(editEntry.reminderInterval)
      : preset?.reminderInterval != null
        ? String(preset.reminderInterval)
        : "",
  );

  // Receipts: existing (edit) with a remove list + newly-picked files.
  const [existing, setExisting] = useState<ReceiptView[]>(
    editEntry?.receipts ?? [],
  );
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [files, setFiles] = useState<NewFile[]>([]);

  // Attach-related (create mode only; edit uses the detail page's picker).
  const [relatedIds, setRelatedIds] = useState<string[]>([]);
  const [relatedQuery, setRelatedQuery] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  function onOdoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, "");
    setOdo(digits ? Number(digits).toLocaleString("en-US") : "");
  }

  const [state, action, pending] = useActionState<
    { ok: boolean; error: string | null },
    FormData
  >(
    async (_prev, fd) => {
      try {
        if (editEntry) await updateRepair(editEntry.id, fd);
        else await logRepair(fd);
        return { ok: true, error: null };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Could not save repair.",
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

  const relatedMatches = useMemo(() => {
    const q = relatedQuery.trim().toLowerCase();
    return allEntries
      .filter((e) => !editEntry || e.id !== editEntry.id)
      .filter((e) => !relatedIds.includes(e.id))
      .filter((e) => (q ? e.description.toLowerCase().includes(q) : true))
      .slice(0, 6);
  }, [allEntries, relatedQuery, relatedIds, editEntry]);

  const relatedChosen = useMemo(
    () => allEntries.filter((e) => relatedIds.includes(e.id)),
    [allEntries, relatedIds],
  );

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
      const fd = new FormData(form);
      fd.set("receipts", JSON.stringify(metas));
      if (isEdit) fd.set("remove_receipt_ids", JSON.stringify(removedIds));
      else fd.set("related_ids", JSON.stringify(relatedIds));
      action(fd);
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function onDelete() {
    if (!editEntry) return;
    if (
      !confirm(
        "Delete this repair entry?\n\nThis removes the entry, its receipts, and its related links. This can't be undone.",
      )
    ) {
      return;
    }
    setDeleteErr(null);
    startDelete(async () => {
      try {
        await deleteRepair(editEntry.id);
        (onDeleted ?? onClose)();
      } catch (e) {
        setDeleteErr(e instanceof Error ? e.message : "Could not delete repair.");
      }
    });
  }

  const busy = pending || uploading || deleting;
  const errorMsg = uploadErr ?? deleteErr ?? state.error;
  const costNum = parseMoney(cost);

  return (
    <ModalShell
      title={isEdit ? "Edit repair" : "Log repair"}
      pending={busy}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3 bg-elevated px-4 py-4">
          <div>
            <label className={LABEL}>Description</label>
            <input
              name="description"
              value={description}
              onChange={onDescriptionChange}
              required
              autoComplete="off"
              placeholder="e.g. Front wheel bearing"
              className={FIELD}
            />
          </div>

          <div>
            <label className={LABEL}>Category</label>
            <select
              name="category"
              value={category}
              onChange={(e) => {
                if (isCategory(e.target.value)) {
                  setCategory(e.target.value);
                  setCategoryTouched(true);
                }
              }}
              className={FIELD}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
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
            <div>
              <label className={LABEL}>Cost</label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-ink-3">
                  $
                </span>
                <input
                  name="cost"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  className="w-full rounded-md border border-line-strong bg-card py-1.5 pl-6 pr-2.5 text-[13px] tabular-nums text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>
          </div>

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
            <label className={LABEL}>Notes (optional)</label>
            <textarea
              name="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              autoComplete="off"
              placeholder="Anything worth remembering…"
              className={FIELD + " resize-none"}
            />
          </div>

          {/* Position — a tiny fixed enum (optional). Picking one reveals the
              set/group field so its corners roll up together. */}
          <div>
            <label className={LABEL}>Position (optional)</label>
            <select
              name="position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className={FIELD}
            >
              <option value="">None</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {POSITION_LABEL[p]}
                </option>
              ))}
            </select>
          </div>

          {/* Set / part group — needed to roll positioned corners together, and
              also names the reminder. Optional; auto-defaults to the
              description when a position or reminder is set. */}
          {position || remind.trim() ? (
            <div>
              <label className={LABEL}>Set / part group</label>
              <input
                name="part_group"
                value={partGroup}
                onChange={(e) => setPartGroup(e.target.value)}
                autoComplete="off"
                list="repair-part-groups"
                placeholder="e.g. Wheel bearings"
                className={FIELD}
              />
              <datalist id="repair-part-groups">
                {partGroups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
          ) : (
            <input type="hidden" name="part_group" value={partGroup} />
          )}

          {/* Reminder — flag this part to repeat every X miles. */}
          <div>
            <label className={LABEL}>Remind me every (miles, optional)</label>
            <input
              name="reminder_interval_miles"
              type="text"
              inputMode="numeric"
              value={remind}
              onChange={(e) =>
                setRemind(e.target.value.replace(/[^\d]/g, ""))
              }
              autoComplete="off"
              placeholder="e.g. 5000"
              className={FIELD + " tabular-nums"}
            />
            {remind.trim() ? (
              <p className="mt-1 font-mono text-[10px] text-fg-subtle">
                Adds a reminder; next-due = this part&apos;s latest odometer +{" "}
                {Number(remind).toLocaleString()} mi.
              </p>
            ) : null}
          </div>

          {/* Receipts */}
          <div>
            <div className="flex items-center justify-between">
              <label className={LABEL}>Receipts (optional)</label>
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
              Photo or PDF, up to 20 MB each.
            </p>
          </div>

          {/* Attach related — create mode only. */}
          {!isEdit ? (
            <div>
              <label className={LABEL}>Related repairs (optional)</label>
              {relatedChosen.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {relatedChosen.map((e) => (
                    <span
                      key={e.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-steel-bg px-2 py-[3px] text-[11px] font-semibold text-steel"
                    >
                      <span className="max-w-[160px] truncate">
                        {e.description}
                      </span>
                      <button
                        type="button"
                        aria-label={`Unlink ${e.description}`}
                        onClick={() =>
                          setRelatedIds((r) => r.filter((id) => id !== e.id))
                        }
                        className="text-steel/70 hover:text-steel"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              {allEntries.length > 0 ? (
                <input
                  value={relatedQuery}
                  onChange={(e) => setRelatedQuery(e.target.value)}
                  autoComplete="off"
                  placeholder="Search repairs to link…"
                  className={FIELD}
                />
              ) : null}
              {relatedQuery.trim() && relatedMatches.length > 0 ? (
                <div className="mt-1 overflow-hidden rounded-md border border-line">
                  {relatedMatches.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        setRelatedIds((r) => [...r, e.id]);
                        setRelatedQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-2 border-b border-line bg-card px-2.5 py-1.5 text-left last:border-b-0 hover:bg-inset"
                    >
                      <span className="min-w-0 truncate text-[12.5px] text-fg">
                        {e.description}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-subtle">
                        {e.odometer != null ? e.odometer.toLocaleString() : "—"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Cost echo */}
          <div className="flex items-center justify-between rounded-md border border-line-strong bg-card px-3 py-2">
            <span className={LABEL}>Cost</span>
            <span className="font-mono text-[16px] font-bold tabular-nums text-ok">
              {costNum > 0 ? money(costNum) : "$0.00"}
            </span>
          </div>

          {errorMsg ? (
            <p role="alert" className="text-[12px] font-semibold text-bad">
              {errorMsg}
            </p>
          ) : null}
        </div>

        <ModalFooter
          pending={busy}
          onClose={onClose}
          label={isEdit ? "Save changes" : "Log repair"}
          onDelete={isEdit ? onDelete : undefined}
          deleting={deleting}
        />
      </form>
    </ModalShell>
  );
}

export function ModalShell({
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

function ModalFooter({
  pending,
  onClose,
  label,
  onDelete,
  deleting,
}: {
  pending: boolean;
  onClose: () => void;
  label: string;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
      {onDelete ? (
        <Button
          type="button"
          onClick={onDelete}
          disabled={pending}
          variant="destructive"
          className="mr-auto"
        >
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      ) : null}
      <Button type="button" onClick={onClose} disabled={pending} variant="cancel">
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        variant="primary"
        leftIcon={
          pending ? (
            <span
              aria-hidden
              className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          ) : undefined
        }
      >
        {pending ? "Saving…" : label}
      </Button>
    </div>
  );
}

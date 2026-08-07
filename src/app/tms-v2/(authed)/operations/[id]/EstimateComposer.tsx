"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { buildEstimatePreview, saveDraftEstimate, sendEstimate } from "@/actions/tms-v2/pipeline";
import { PreviewPane, type Preview } from "./PreviewPane";
import type { EstimateDraft } from "@/lib/data/pipeline-drafts";

/** Range estimate composer — build a preview (persists the draft + the
 * exact rendered bytes that will be sent), then send. Closes the audit's
 * #1 Tier-2 gap: "the revenue-generating sales motion cannot happen from
 * tms-v2." Fields match V1's dispatch_estimates draft exactly. */
export function EstimateComposer({ quoteRequestId, draft }: { quoteRequestId: string; draft: EstimateDraft | null }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave(formData: FormData) {
    setSaving(true);
    setError(null);
    formData.set("quote_request_id", quoteRequestId);
    const result = await saveDraftEstimate(formData);
    setSaving(false);
    if (result.ok) router.refresh();
    else setError(result.reason);
  }

  async function onBuild(formData: FormData) {
    setBuilding(true);
    setError(null);
    formData.set("quote_request_id", quoteRequestId);
    const res = await buildEstimatePreview(formData);
    setBuilding(false);
    if (res.ok) setPreview(res.preview);
    else setError(res.reason);
  }

  async function onSend() {
    setSending(true);
    setError(null);
    const result = await sendEstimate(quoteRequestId);
    setSending(false);
    if (result.ok) {
      setPreview(null);
      router.refresh();
    } else {
      setError(result.reason);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={onBuild} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Rate low ($)
            <input name="linehaul_low" type="number" step="any" min="0" required defaultValue={draft?.linehaulLow ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Rate high ($)
            <input name="linehaul_high" type="number" step="any" min="0" defaultValue={draft?.linehaulHigh ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Miles
            <input name="miles_estimate" type="number" min="0" defaultValue={draft?.milesEstimate ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Expires
            <input name="expiration_at" type="date" defaultValue={draft?.expirationAt ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Pickup timing notes
            <input name="pickup_timing_notes" defaultValue={draft?.pickupTimingNotes ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Equipment notes
            <input name="equipment_notes" defaultValue={draft?.equipmentNotes ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
          Closing line (optional message to the customer)
          <textarea name="closing_line" rows={2} defaultValue={draft?.closingLine ?? ""} className="rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
        </label>

        {error ? <p className="text-[13px] font-medium text-bad">{error}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <Button type="submit" formAction={onSave} variant="secondary" size="sm" disabled={saving || building} aria-busy={saving}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
          <Button type="submit" formAction={onBuild} size="sm" disabled={saving || building} aria-busy={building}>
            {building ? "Building…" : "Build preview"}
          </Button>
        </div>
      </form>

      {preview ? (
        <>
          <PreviewPane preview={preview} />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" size="sm" onClick={onSend} disabled={sending} aria-busy={sending}>
              {sending ? "Sending…" : "Send estimate"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

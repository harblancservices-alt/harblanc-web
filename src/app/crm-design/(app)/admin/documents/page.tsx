"use client";

import { useState } from "react";
import { Card, CardHead, TEXT } from "../../../_design/ui";
import { IconBillOfLadingGlyph, IconRateConfirmationGlyph } from "../../../_shared/doc-glyphs";
import { Modal } from "../../../_design/Modal";

const TEMPLATES = [
  { type: "rate_confirmation", label: "Rate Confirmation", glyph: <IconRateConfirmationGlyph /> },
  { type: "bill_of_lading", label: "Bill of Lading", glyph: <IconBillOfLadingGlyph /> },
] as const;

/**
 * Admin → Documents — a small, fixed reference library of the org's 2 blank
 * master templates. Deliberately NOT a searchable per-shipment document
 * archive (that design was tried in the real CRM and explicitly reverted —
 * CRM_MASTER_AUDIT.md §3/§15-J). The copy here is accurate to what this tab
 * actually shows, unlike the real CRM's Overview page.
 */
export default function AdminDocumentsPage() {
  const [preview, setPreview] = useState<(typeof TEMPLATES)[number] | null>(null);
  return (
    <Card>
      <CardHead title="Blank Templates" hint="The default master template for each generated document type — not a per-shipment archive." />
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => setPreview(t)}
            className="flex flex-col items-center gap-3 rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface-2)] p-6 text-center transition-colors hover:border-[var(--cd-admin)]/40 hover:bg-[var(--cd-admin-soft)]"
          >
            <span className="text-[var(--cd-admin)]">{t.glyph}</span>
            <span>
              <span className="block text-[13.5px] font-bold text-[var(--cd-text)]">{t.label}</span>
              <span className={`block ${TEXT.micro} text-[var(--cd-text-muted)]`}>Blank master template</span>
            </span>
          </button>
        ))}
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.label ?? ""} subtitle="Preview">
        <div className="flex aspect-[8.5/11] w-full items-center justify-center rounded-[var(--cd-radius-md)] border border-dashed border-[var(--cd-border-strong)] bg-[var(--cd-surface-2)] text-[var(--cd-text-subtle)]">
          <span className="flex flex-col items-center gap-2">
            {preview?.glyph}
            <span className={TEXT.micro}>Mock preview — no real PDF in this prototype</span>
          </span>
        </div>
      </Modal>
    </Card>
  );
}

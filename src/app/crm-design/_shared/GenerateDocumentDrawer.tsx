"use client";

import { useState } from "react";
import { useStore, useCompany } from "../_lib/store";
import { Button, TEXT } from "../_design/ui";
import { Drawer } from "../_design/Drawer";
import { IconBillOfLadingGlyph, IconRateConfirmationGlyph } from "./doc-glyphs";
import type { DocType } from "../_lib/types";

/**
 * The document-generation workflow, reachable from a Company's Documents
 * tab. Two steps in one drawer (choose type → mock preview → Generate) —
 * mirrors the real CRM's actual Rate Confirmation / Bill of Lading
 * generator conceptually (pick a type, fill a form, produce a document)
 * without building a real PDF pipeline, which is explicitly out of scope
 * for a visual prototype.
 */
export function GenerateDocumentDrawer({
  open,
  onClose,
  companyId,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
}) {
  const { generateDocument } = useStore();
  const company = useCompany(companyId);
  const [step, setStep] = useState<"choose" | "preview">("choose");
  const [type, setType] = useState<DocType>("rate_confirmation");

  function reset() {
    setStep("choose");
    setType("rate_confirmation");
  }

  function generate() {
    generateDocument(companyId, type);
    reset();
    onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Generate document"
      subtitle={company?.name}
      width="520px"
      footer={
        step === "choose" ? (
          <Button variant="primary" onClick={() => setStep("preview")}>
            Continue
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep("choose")}>
              Back
            </Button>
            <Button variant="primary" onClick={generate}>
              Generate
            </Button>
          </>
        )
      }
    >
      {step === "choose" ? (
        <div className="grid grid-cols-2 gap-3">
          <DocTypeCard
            active={type === "rate_confirmation"}
            onClick={() => setType("rate_confirmation")}
            label="Rate Confirmation"
            glyph={<IconRateConfirmationGlyph />}
          />
          <DocTypeCard
            active={type === "bill_of_lading"}
            onClick={() => setType("bill_of_lading")}
            label="Bill of Lading"
            glyph={<IconBillOfLadingGlyph />}
          />
        </div>
      ) : (
        <div>
          <div className="flex aspect-[8.5/11] w-full flex-col gap-3 overflow-hidden rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-white p-6 text-[10.5px] text-[#1a1a1a] shadow-[var(--cd-shadow-sm)]">
            <div className="flex items-center justify-between border-b border-[#e2e2e2] pb-2">
              <div>
                <p className="text-[13px] font-black">Hello Hotshot Logistics LLC</p>
                <p className="text-[9px] text-[#666]">MC-812340 · DOT-2947710 · Odessa, TX</p>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wide">
                {type === "rate_confirmation" ? "Rate Confirmation" : "Bill of Lading"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PreviewField label="Shipper" value={company?.name ?? "—"} />
              <PreviewField label="Date" value={new Date().toLocaleDateString()} />
              <PreviewField label="Origin" value={`${company?.city ?? "—"}, ${company?.state ?? ""}`} />
              <PreviewField label="Destination" value="TBD — set on load" />
            </div>
            <div className="mt-2 flex-1 rounded border border-dashed border-[#d5d5d5] p-3 text-[9.5px] text-[#999]">
              {type === "rate_confirmation"
                ? "Rate, equipment type, and accessorial line items render here — mock preview only."
                : "Commodity, weight, and piece-count line items render here — mock preview only."}
            </div>
            <p className="text-center text-[8.5px] text-[#aaa]">Preview — prototype only, not a real document</p>
          </div>
          <p className={`mt-3 ${TEXT.micro} text-[var(--cd-text-subtle)]`}>
            This is a mock preview for the click-through — the real feature would populate rate/line-item fields before
            generating a PDF, same as the shipped RC/BOL generator.
          </p>
        </div>
      )}
    </Drawer>
  );
}

function DocTypeCard({ active, onClick, label, glyph }: { active: boolean; onClick: () => void; label: string; glyph: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2.5 rounded-[var(--cd-radius-md)] border p-5 transition-colors ${
        active ? "border-[var(--cd-accent)] bg-[var(--cd-accent-soft)]" : "border-[var(--cd-border)] hover:bg-[var(--cd-surface-2)]"
      }`}
    >
      <span className={active ? "text-[var(--cd-accent)]" : "text-[var(--cd-text-subtle)]"}>{glyph}</span>
      <span className="text-[13px] font-bold text-[var(--cd-text)]">{label}</span>
    </button>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] font-bold uppercase tracking-wide text-[#999]">{label}</p>
      <p className="text-[11px] font-medium">{value}</p>
    </div>
  );
}

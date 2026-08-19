"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "../_lib/store";
import { Badge, Button, TEXT } from "../_design/ui";
import { Drawer } from "../_design/Drawer";
import { IconCamera, IconDocument, IconUpload } from "../_design/icons";
import type { BolRecord } from "../_lib/types";

type Step = "capture" | "received";

/**
 * The BOL Center's upload/capture experience — three deliberately equal-
 * weight entry points (camera, photo library, PDF) since Brent's actual
 * workflow is "400 photos from a phone," not a form. Whichever one is
 * clicked calls the same mock store.uploadBol() — there is no meaningful
 * difference in a prototype with no real file I/O, but the three affordances
 * are kept distinct because a document-capture tool that only offers "choose
 * file" doesn't read as camera-first the way this workflow needs to.
 *
 * Critically: the drawer's own copy repeats the funnel's core guarantee
 * (nothing here touches Sales) at the exact moment a user might expect an
 * upload to "do" something — this is the surface most likely to make someone
 * assume 400 uploads = 400 new leads if it stayed silent about that.
 */
export function UploadBolDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { uploadBol } = useStore();
  const [step, setStep] = useState<Step>("capture");
  const [busy, setBusy] = useState(false);
  const [lastUploaded, setLastUploaded] = useState<BolRecord | null>(null);

  function capture(kind: "camera" | "photo" | "pdf") {
    setBusy(true);
    const ext = kind === "pdf" ? "pdf" : "jpg";
    const fileName = `IMG_${Math.floor(1000 + Math.random() * 8999)}.${ext}`;
    // Brief mock "processing the capture" delay — the point is to feel like
    // a real capture flow, not to simulate real upload latency.
    setTimeout(() => {
      const record = uploadBol(fileName);
      setLastUploaded(record);
      setBusy(false);
      setStep("received");
    }, 500);
  }

  function reset() {
    setStep("capture");
    setLastUploaded(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Drawer open={open} onClose={handleClose} title="Upload BOL" subtitle="Adds to the review queue only — nothing is sent to Sales.">
      {step === "capture" ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface-2)] px-3.5 py-3">
            <p className={`${TEXT.body} text-[var(--cd-text-muted)]`}>
              Every upload lands as <Badge tone="neutral">New</Badge> in the BOL Inbox — unreviewed, unmatched, and
              invisible to Sales until an admin extracts, researches, approves, and explicitly releases it.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <CaptureTile icon={<IconCamera width={22} height={22} />} label="Take Photo" hint="Use the device camera" onClick={() => capture("camera")} busy={busy} />
            <CaptureTile icon={<IconUpload width={22} height={22} />} label="Upload Photo" hint="Choose from photo library" onClick={() => capture("photo")} busy={busy} />
            <CaptureTile icon={<IconDocument width={22} height={22} />} label="Upload PDF" hint="Choose a scanned PDF" onClick={() => capture("pdf")} busy={busy} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--cd-success-soft)] text-[var(--cd-success)]">
            <IconDocument width={26} height={26} />
          </span>
          <div>
            <p className="text-[15px] font-bold text-[var(--cd-text)]">{lastUploaded?.fileName} received</p>
            <p className={`mt-1 ${TEXT.body} text-[var(--cd-text-muted)]`}>
              Entered the queue as <Badge tone="neutral">New</Badge>. Nothing has been extracted, matched, or shown to
              Sales yet.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 pt-2">
            <Button
              variant="primary"
              onClick={() => {
                if (lastUploaded) router.push(`/crm-design/admin/bol-center/${lastUploaded.id}`);
                handleClose();
              }}
            >
              Review now →
            </Button>
            <Button variant="secondary" onClick={reset}>
              Upload another
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function CaptureTile({
  icon,
  label,
  hint,
  onClick,
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-3.5 rounded-[var(--cd-radius-md)] border border-[var(--cd-border-strong)] bg-[var(--cd-surface)] px-4 py-3.5 text-left transition-colors hover:border-[var(--cd-admin)]/50 hover:bg-[var(--cd-admin-soft)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--cd-radius-sm)] bg-[var(--cd-admin-soft)] text-[var(--cd-admin)]">
        {icon}
      </span>
      <span>
        <span className="block text-[14px] font-bold text-[var(--cd-text)]">{busy ? "Uploading…" : label}</span>
        <span className={`block ${TEXT.micro} text-[var(--cd-text-muted)]`}>{hint}</span>
      </span>
    </button>
  );
}

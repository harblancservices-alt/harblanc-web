"use client";

import { useEffect, useState } from "react";
import { Modal } from "../../_shell/Modal";
import { RateConfirmationEditor } from "./rc/[rcId]/RateConfirmationEditor";
import { BolEditor } from "./bol/[bolId]/BolEditor";
import { getRateConfirmation } from "../rate-confirmation-actions";
import { getBol } from "../bol-actions";
import type { CrmBillOfLadingDetail, CrmRateConfirmationDetail, CrmShipmentDetail } from "../types";

export type DocModalTarget = { type: "rc" | "bol"; id: string };

/**
 * The RC/BOL editors as a pop-up over the shipment workspace instead of a
 * separate route (2026-08-09) — fetches the target doc client-side (the
 * editors already refresh() through the same getRateConfirmation/getBol
 * actions internally, so this is the same data, just loaded before first
 * paint instead of server-side by a page.tsx). `onNavigate` lets the editor
 * swap this modal to a different doc id in place (duplicate/supersede)
 * without a real navigation; `onClose` closes it (delete, or the X/backdrop).
 */
export function DocumentEditorModal({
  shipment,
  target,
  onClose,
  onNavigate,
}: {
  shipment: CrmShipmentDetail;
  target: DocModalTarget;
  onClose: () => void;
  onNavigate: (target: DocModalTarget) => void;
}) {
  const [rc, setRc] = useState<CrmRateConfirmationDetail | null>(null);
  const [bol, setBol] = useState<CrmBillOfLadingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    setRc(null);
    setBol(null);
    (async () => {
      if (target.type === "rc") {
        const data = await getRateConfirmation(target.id);
        if (cancelled) return;
        if (data) setRc(data);
        else setMissing(true);
      } else {
        const data = await getBol(target.id);
        if (cancelled) return;
        if (data) setBol(data);
        else setMissing(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [target.type, target.id]);

  const title = rc?.rcNumber ?? bol?.bolNumber ?? (target.type === "rc" ? "Rate Confirmation" : "Bill of Lading");

  return (
    <Modal open onClose={onClose} title={title} wide fullScreen>
      {loading && <p className="py-10 text-center text-[13px] text-fg-subtle">Loading…</p>}
      {!loading && missing && <p className="py-10 text-center text-[13px] text-bad">Could not load this document.</p>}
      {!loading && rc && target.type === "rc" && (
        <RateConfirmationEditor
          shipment={shipment}
          initialRc={rc}
          onClose={onClose}
          onNavigate={(id) => onNavigate({ type: "rc", id })}
        />
      )}
      {!loading && bol && target.type === "bol" && (
        <BolEditor
          shipment={shipment}
          initialBol={bol}
          onClose={onClose}
          onNavigate={(id) => onNavigate({ type: "bol", id })}
        />
      )}
    </Modal>
  );
}

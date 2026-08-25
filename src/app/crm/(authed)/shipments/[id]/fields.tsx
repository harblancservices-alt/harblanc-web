"use client";

/**
 * Controlled field primitives for the shipment workspace and the RC/BOL
 * document editors — every value is autosaved on blur (see the various
 * commit() functions in ShipmentWorkspace/RateConfirmationEditor/BolEditor),
 * so these need onChange (keystroke-level, local state only) AND onBlur
 * (fires the actual server write) rather than form.tsx's uncontrolled
 * defaultValue inputs built for submit-once dialogs.
 *
 * The actual CONTROL/LABEL/Row implementations now live in
 * `_shell/compactForm.tsx` — promoted there (2026-08-10) so every CRM
 * dialog can share this compact chrome instead of it being scoped to just
 * these three files. Re-exported here unchanged so existing imports in
 * this directory don't need to move.
 *
 * `highlight` marks a field that still holds its untouched value from a
 * customer/location/carrier pick — the same "auto-filled" affordance across
 * every picker in these editors.
 */

export {
  LABEL,
  CONTROL,
  CONTROL_SIZE,
  NARROW,
  FIELD_W,
  TextRow,
  TextAreaRow,
  MoneyRow,
  TimeWindowRow,
  SelectRow,
  FormRow2,
  FormRow3,
  SectionDivider,
} from "../../_shell/compactForm";

/**
 * The compact "selected entity" readout for a prefill picker (customer,
 * carrier, shipper/consignee location) — a one-line summary plus a Change
 * (reopen the picker to swap) and Reset (detach + blank the filled fields)
 * control, so swapping or clearing what a picker filled is always one tap.
 * Kept local — this is specific to the shipment/RC/BOL prefill flow, not a
 * general-purpose primitive.
 */
export function SelectedEntityChip({
  title,
  detail,
  onChange,
  onReset,
}: {
  title: string;
  detail?: string | null;
  onChange?: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[5px] border border-ok/40 bg-ok-bg px-2.5 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-semibold text-fg">{title}</p>
        {detail && <p className="truncate text-[10.5px] text-fg-muted">{detail}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {onChange && (
          <button
            type="button"
            onClick={onChange}
            className="rounded-[3px] bg-[#2563eb] px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#1d4ed8]"
          >
            Change
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          className="rounded-[3px] bg-[#2563eb] px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#1d4ed8]"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

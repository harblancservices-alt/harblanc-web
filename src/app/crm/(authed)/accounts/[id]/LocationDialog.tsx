"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { Field, TextareaField, SubmitButton, FormError } from "../../_shell/form";
import { SectionDivider } from "../../_shell/compactForm";
import { AsyncSearchPicker } from "../../_shell/AsyncSearchPicker";
import { SelectedEntityChip } from "../../shipments/[id]/fields";
import { listCarriers, getCarrier } from "../../shipments/carriers-actions";
import { titleCaseWords } from "../../_shell/format";
import { createLocation, updateLocation } from "./locations-actions";
import type { CrmCarrier, CrmCarrierContact } from "../../shipments/types";

export type LocationDefaults = {
  id?: string;
  label?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  receiving_hours?: string | null;
  dock_notes?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  default_carrier_id?: string | null;
  default_carrier_contact_id?: string | null;
  default_carrier_name?: string | null;
  default_carrier_contact_name?: string | null;
};

export function LocationDialog({
  accountId,
  mode,
  defaults,
  trigger,
}: {
  accountId: string;
  mode: "create" | "edit";
  defaults?: LocationDefaults;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const d = defaults ?? {};

  // Recurring carrier relationship — kept as component state (not a plain
  // uncontrolled Field) because it's an id picked from a search, plus a
  // dependent second picker (that carrier's contacts) that only exists once
  // a carrier is chosen. Submitted via hidden inputs alongside the rest of
  // the plain FormData fields.
  const [carrierId, setCarrierId] = useState<string>(d.default_carrier_id ?? "");
  const [carrierName, setCarrierName] = useState<string>(d.default_carrier_name ?? "");
  const [carrierPickerOpen, setCarrierPickerOpen] = useState(false);
  const [contactId, setContactId] = useState<string>(d.default_carrier_contact_id ?? "");
  const [contacts, setContacts] = useState<CrmCarrierContact[]>([]);
  const [, startContactsTransition] = useTransition();

  function loadContacts(id: string) {
    startContactsTransition(async () => {
      const carrier = await getCarrier(id);
      setContacts(carrier?.contacts ?? []);
    });
  }

  function selectCarrier(c: CrmCarrier) {
    setCarrierId(c.id);
    setCarrierName(c.name);
    setContactId("");
    setCarrierPickerOpen(false);
    loadContacts(c.id);
  }

  function resetCarrier() {
    setCarrierId("");
    setCarrierName("");
    setContactId("");
    setContacts([]);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createLocation(accountId, formData)
          : await updateLocation(d.id as string, accountId, formData);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      {trigger(() => {
        setError(null);
        if (mode === "edit" && d.default_carrier_id) loadContacts(d.default_carrier_id);
        setOpen(true);
      })}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={pending}
        title={mode === "create" ? "Add location" : "Edit location"}
      >
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <Field
            label="Label"
            name="label"
            placeholder="e.g. Main warehouse, Yard 2"
            defaultValue={d.label}
            autoFocus
          />
          <Field label="Address" name="address" defaultValue={d.address} />
          <div className="grid grid-cols-6 gap-2">
            <div className="col-span-3">
              <Field label="City" name="city" defaultValue={d.city} />
            </div>
            <div className="col-span-1">
              <Field label="State" name="state" defaultValue={d.state} />
            </div>
            <div className="col-span-2">
              <Field label="ZIP" name="zip" defaultValue={d.zip} />
            </div>
          </div>
          <Field
            label="Receiving hours"
            name="receiving_hours"
            placeholder="e.g. Mon–Fri 7am–3pm"
            defaultValue={d.receiving_hours}
          />
          <TextareaField
            label="Dock / appointment notes"
            name="dock_notes"
            placeholder="e.g. Appointment required 24h ahead, dock 4 only"
            defaultValue={d.dock_notes}
          />

          <SectionDivider label="Site contact" />
          <Field label="Contact name" name="contact_name" defaultValue={d.contact_name} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Phone" name="contact_phone" defaultValue={d.contact_phone} />
            <Field label="Email" name="contact_email" defaultValue={d.contact_email} />
          </div>

          <SectionDivider label="Recurring carrier (optional)" />
          <p className="text-[11.5px] text-fg-subtle">
            When this location is picked as a shipment&rsquo;s pickup or delivery, this carrier/contact
            auto-suggests — always overridable on the load itself.
          </p>
          <input type="hidden" name="default_carrier_id" value={carrierId} />
          <input type="hidden" name="default_carrier_contact_id" value={contactId} />
          {(!carrierId || carrierPickerOpen) && (
            <AsyncSearchPicker<CrmCarrier>
              placeholder="Search carriers by name, MC, or DOT…"
              search={listCarriers}
              getKey={(c) => c.id}
              onSelect={selectCarrier}
              renderOption={(c) => (
                <>
                  <span className="font-medium">{titleCaseWords(c.name)}</span>
                  {c.mcNumber && <span className="ml-1.5 text-[11px] text-fg-subtle">MC {c.mcNumber}</span>}
                </>
              )}
            />
          )}
          {carrierId && (
            <SelectedEntityChip
              title={titleCaseWords(carrierName)}
              detail="Recurring carrier for this location"
              onChange={() => setCarrierPickerOpen(true)}
              onReset={resetCarrier}
            />
          )}
          {carrierId && contacts.length > 0 && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                Usual contact
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="h-9 w-full rounded-[5px] border border-fg-subtle bg-card px-2.5 text-[12.5px] text-fg"
              >
                <option value="">No specific contact</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || "Unnamed"} {c.role ? `— ${c.role}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <SubmitButton pending={pending}>{mode === "create" ? "Save location" : "Save changes"}</SubmitButton>
        </form>
      </Modal>
    </>
  );
}

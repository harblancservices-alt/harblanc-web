"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { updateBroker, archiveBroker, addBrokerContact, updateBrokerContact, deleteBrokerContact } from "@/actions/tms-v2/brokers";
import type { MutationResult } from "@/lib/demo/mutation";
import type { BrokerIdentity, BrokerContact } from "@/lib/data/broker-profile";
import { Field, PhoneField, SelectField, FormError, FormActions } from "../../loads/_form";
import { formatPhone } from "@/lib/domain/phone";

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

const EDIT_BROKER_FORM_ID = "tms-v2-edit-broker-form";
const CONTACT_FORM_ID = "tms-v2-broker-contact-form";

/** Broker Profile's write actions — Edit (MC/DOT/status/factoring/phone/
 * email/notes), Archive, and contact add/edit/delete. Closes the audit's
 * Critical Brokers gap: a broker created implicitly via the Load form was
 * "permanently incomplete... no edit UI exists in tms-v2 at all." */
export function BrokerActions({ identity }: { identity: BrokerIdentity }) {
  const router = useRouter();
  const [openModal, setOpenModal] = useState<"edit" | "archive" | null>(null);
  const close = () => setOpenModal(null);
  const refresh = () => router.refresh();

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpenModal("edit")}>
        Edit broker
      </Button>
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpenModal("archive")}>
        Archive
      </Button>

      <EditBrokerModal open={openModal === "edit"} onClose={close} identity={identity} onSaved={refresh} />
      <ArchiveBrokerModal open={openModal === "archive"} onClose={close} brokerId={identity.id} />
    </div>
  );
}

/** Same fixed-header/scrollable-body/fixed-footer split the Add Load form
 * got (Modal's `footer` prop + a `form={id}` submit button outside the
 * scrollable area) — this is the longest form on the broker profile (10
 * fields + notes), so it's the one most at risk of clipping its Save
 * button off-screen on a short mobile viewport. */
function EditBrokerModal({
  open,
  onClose,
  identity,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  identity: BrokerIdentity;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await updateBroker(identity.id, formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      onSaved();
      onClose();
    }
  }, [state.ok, onSaved, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit broker"
      footer={
        <div className="flex flex-col gap-2">
          <FormError message={state.error} />
          <FormActions>
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form={EDIT_BROKER_FORM_ID} disabled={pending} aria-busy={pending}>
              {pending ? "Saving…" : "Save broker"}
            </Button>
          </FormActions>
        </div>
      }
    >
      <form id={EDIT_BROKER_FORM_ID} action={formAction} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="MC #" name="mc_number" defaultValue={identity.mcNumber ?? ""} />
          <Field label="DOT #" name="dot_number" defaultValue={identity.dotNumber ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PhoneField label="Phone" name="phone" defaultValue={identity.phone} />
          <Field label="Email" name="email" type="email" defaultValue={identity.email ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Office" name="office" defaultValue={identity.office ?? ""} />
          <Field label="Timezone" name="timezone" defaultValue={identity.timezone ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Authority" name="authority" defaultValue={identity.authority ?? ""} />
          <Field label="Insurance" name="insurance" defaultValue={identity.insurance ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="W9" name="w9" defaultValue={identity.w9 ?? ""} />
          <Field label="1099" name="ten99" defaultValue={identity.ten99 ?? ""} />
        </div>
        <SelectField label="Status" name="status" defaultValue={identity.status}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectField>
        <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <input type="checkbox" name="factoring" defaultChecked={identity.factoring} className="h-4 w-4" />
          Factoring
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
          Notes
          <textarea
            name="notes"
            rows={3}
            defaultValue={identity.notes ?? ""}
            className="rounded-md border border-line-strong bg-card px-2.5 py-2 text-[14px] font-normal text-fg focus:border-fg focus:outline-none"
          />
        </label>
      </form>
    </Modal>
  );
}

function ArchiveBrokerModal({ open, onClose, brokerId }: { open: boolean; onClose: () => void; brokerId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setError(null);
    const result: MutationResult = await archiveBroker(brokerId);
    if (result.ok) {
      router.push("/tms-v2/brokers");
      router.refresh();
    } else {
      setPending(false);
      setError(result.reason);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Archive broker">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-muted">
          Loads keep this broker&apos;s name on file. Restore it later from the Brokers directory&apos;s Archived section.
        </p>
        <FormError message={error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending} aria-busy={pending}>
            {pending ? "Archiving…" : "Archive broker"}
          </Button>
        </FormActions>
      </div>
    </Modal>
  );
}

/** One contact row — no avatar/initials circle (Brent's explicit ask: no
 * pfp). Name is the clear primary line (with the role tag beside it, never
 * overlapping anything since it's inline on the same text row), phone and
 * email underneath on their own line, and Edit/Delete as real rectangular
 * buttons right-aligned on the row. */
function ContactRow({ contact: c, onEdit, onDelete }: { contact: BrokerContact; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-3.5 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-fg">{c.name ?? "Unnamed contact"}</span>
          {c.isBackhaul ? (
            <span className="shrink-0 rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn">Backhaul</span>
          ) : null}
        </div>
        {c.title ? <div className="truncate text-[12px] text-fg-muted">{c.title}</div> : null}
        {c.phone || c.email ? (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-fg-muted">
            {c.phone ? <span className="truncate">{formatPhone(c.phone)}</span> : null}
            {c.email ? <span className="truncate">{c.email}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

type ContactModalState = { mode: "add" } | { mode: "edit"; contact: BrokerContact } | null;

export function ContactsSection({ brokerId, contacts }: { brokerId: string; contacts: BrokerContact[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<ContactModalState>(null);
  const refresh = () => router.refresh();

  async function onDelete(contactId: string) {
    if (!confirm("Delete this contact?")) return;
    await deleteBrokerContact(contactId, brokerId);
    refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setModal({ mode: "add" })}>
        + Add contact
      </Button>

      {contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-10 text-center">
          <p className="text-[13px] text-fg-muted">No contacts on file for this broker.</p>
        </div>
      ) : (
        <div className="no-scrollbar overflow-hidden rounded-xl border border-line bg-card shadow-e1">
          {contacts.map((c) => (
            <ContactRow key={c.id} contact={c} onEdit={() => setModal({ mode: "edit", contact: c })} onDelete={() => onDelete(c.id)} />
          ))}
        </div>
      )}

      {modal ? (
        <ContactModal
          key={modal.mode === "edit" ? modal.contact.id : "add"}
          brokerId={brokerId}
          contact={modal.mode === "edit" ? modal.contact : null}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

/** One modal, two callers (Add/Edit) — same optional-entity pattern as
 * LoadFormModal (`contact` present = editing, absent = adding). Mounted
 * only while a modal is open (parent conditionally renders it, keyed by
 * which contact — or "add" — is being edited) so useActionState's error/
 * pending state can't leak from one contact's form into the next. Same
 * fixed-footer split as Edit broker above. */
function ContactModal({
  onClose,
  brokerId,
  contact,
  onSaved,
}: {
  onClose: () => void;
  brokerId: string;
  contact: BrokerContact | null;
  onSaved: () => void;
}) {
  const editing = contact != null;

  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = editing
      ? await updateBrokerContact(contact.id, brokerId, formData)
      : await addBrokerContact(brokerId, formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      onSaved();
      onClose();
    }
  }, [state.ok, onSaved, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit contact" : "Add contact"}
      footer={
        <div className="flex flex-col gap-2">
          <FormError message={state.error} />
          <FormActions>
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form={CONTACT_FORM_ID} disabled={pending} aria-busy={pending}>
              {pending ? "Saving…" : editing ? "Save contact" : "Add contact"}
            </Button>
          </FormActions>
        </div>
      }
    >
      <form id={CONTACT_FORM_ID} action={formAction} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name" name="name" defaultValue={contact?.name ?? ""} required />
          <Field label="Title" name="title" defaultValue={contact?.title ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PhoneField label="Phone" name="phone" defaultValue={contact?.phone} />
          <Field label="Email" name="email" type="email" defaultValue={contact?.email ?? ""} />
        </div>
        <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <input type="checkbox" name="is_backhaul" defaultChecked={contact?.isBackhaul ?? false} className="h-4 w-4" />
          Backhaul contact
        </label>
      </form>
    </Modal>
  );
}

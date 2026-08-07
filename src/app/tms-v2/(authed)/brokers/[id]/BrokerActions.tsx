"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { updateBroker, archiveBroker, addBrokerContact, updateBrokerContact, deleteBrokerContact } from "@/actions/tms-v2/brokers";
import type { MutationResult } from "@/lib/demo/mutation";
import type { BrokerIdentity, BrokerContact } from "@/lib/data/broker-profile";
import { Field, FormError, FormActions } from "../../loads/_form";

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

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
    <Modal open={open} onClose={onClose} title="Edit broker">
      <form action={formAction} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="MC #" name="mc_number" defaultValue={identity.mcNumber ?? ""} />
          <Field label="DOT #" name="dot_number" defaultValue={identity.dotNumber ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Phone" name="phone" type="tel" defaultValue={identity.phone ?? ""} />
          <Field label="Email" name="email" type="email" defaultValue={identity.email ?? ""} />
        </div>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
          Status
          <select
            name="status"
            defaultValue={identity.status}
            className="h-10 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg focus:border-fg focus:outline-none"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
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
            className="rounded-md border border-line-strong bg-card px-2.5 py-2 text-[14px] text-fg focus:border-fg focus:outline-none"
          />
        </label>
        <FormError message={state.error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Save broker"}
          </Button>
        </FormActions>
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

export function ContactsSection({ brokerId, contacts }: { brokerId: string; contacts: BrokerContact[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BrokerContact | null>(null);

  const [addState, addAction, addPending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await addBrokerContact(brokerId, formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (addState.ok) {
      setAdding(false);
      router.refresh();
    }
  }, [addState.ok, router]);

  async function onDelete(contactId: string) {
    if (!confirm("Delete this contact?")) return;
    await deleteBrokerContact(contactId, brokerId);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {contacts.length === 0 ? (
        <p className="text-[13px] text-fg-muted">No contacts on file for this broker.</p>
      ) : (
        <div className="rounded-xl border border-line bg-card px-3 shadow-e1">
          {contacts.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 text-[14px] last:border-b-0">
              <div>
                <span className="font-medium text-fg">{c.name ?? "Unnamed contact"}</span>
                {c.title ? <span className="ml-2 text-fg-muted">{c.title}</span> : null}
                {c.isBackhaul ? (
                  <span className="ml-2 inline-flex items-center rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn">Backhaul</span>
                ) : null}
              </div>
              <div className="flex items-center gap-3 text-fg-muted">
                <span>{c.phone ?? "—"}</span>
                <span>{c.email ?? "—"}</span>
                <button type="button" onClick={() => setEditing(c)} className="font-medium text-accent hover:underline">
                  Edit
                </button>
                <button type="button" onClick={() => onDelete(c.id)} className="font-medium text-bad hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <form action={addAction} className="flex flex-col gap-2 rounded-md border border-line-strong bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name" name="name" required />
            <Field label="Title" name="title" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Phone" name="phone" type="tel" />
            <Field label="Email" name="email" type="email" />
          </div>
          <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
            <input type="checkbox" name="is_backhaul" className="h-4 w-4" />
            Backhaul contact
          </label>
          <FormError message={addState.error} />
          <FormActions>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)} disabled={addPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={addPending} aria-busy={addPending}>
              {addPending ? "Saving…" : "Add contact"}
            </Button>
          </FormActions>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="w-fit text-[13px] font-medium text-accent hover:underline">
          + Add contact
        </button>
      )}

      {editing ? (
        <EditContactModal brokerId={brokerId} contact={editing} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />
      ) : null}
    </div>
  );
}

function EditContactModal({
  brokerId,
  contact,
  onClose,
  onSaved,
}: {
  brokerId: string;
  contact: BrokerContact;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await updateBrokerContact(contact.id, brokerId, formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      onSaved();
      onClose();
    }
  }, [state.ok, onSaved, onClose]);

  return (
    <Modal open onClose={onClose} title="Edit contact">
      <form action={formAction} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name" name="name" defaultValue={contact.name ?? ""} required />
          <Field label="Title" name="title" defaultValue={contact.title ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Phone" name="phone" type="tel" defaultValue={contact.phone ?? ""} />
          <Field label="Email" name="email" type="email" defaultValue={contact.email ?? ""} />
        </div>
        <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <input type="checkbox" name="is_backhaul" defaultChecked={contact.isBackhaul} className="h-4 w-4" />
          Backhaul contact
        </label>
        <FormError message={state.error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Save contact"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

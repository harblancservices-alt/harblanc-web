"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { addBrokerContact, updateBrokerContact, deleteBrokerContact } from "@/actions/tms-v2/brokers";
import type { MutationResult } from "@/lib/demo/mutation";
import type { ReachContactRow } from "@/lib/data/reach-contacts";
import { Field, PhoneField, FormError, FormActions } from "../loads/_form";
import { formatPhone } from "@/lib/domain/phone";

/** Reach's Contacts management — closes the "recipients are only
 * auto-derived" gap. Legacy's own Contacts tab (ContactsTab.tsx) only
 * offers an Include toggle and punts real add/edit/delete to the Brokers
 * page ("Manage brokers →"); this reuses the SAME addBrokerContact/
 * updateBrokerContact/deleteBrokerContact actions Broker Profile's own
 * Contacts section already uses, so a contact added or edited here is a
 * real broker_contacts row, immediately picked up by buildRecipients()
 * (Reach's recipient-build logic) on the next send — no separate cache,
 * no reach-specific contacts table.
 *
 * A collapsible section, not a literal tab switcher — tms-v2's Reach page
 * deliberately dropped legacy's tabbed ReachView for "one continuous
 * flow" (see page.tsx's own header comment); this follows that same
 * house style, matching ReachSettingsForm's collapsible pattern. */
export function ContactsSection({ contacts, brokers }: { contacts: ReachContactRow[]; brokers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ReachContactRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.brokerName.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q),
    );
  }, [contacts, search]);

  async function onToggleInclude(c: ReachContactRow) {
    setTogglingId(c.id);
    setError(null);
    const fd = new FormData();
    fd.set("name", c.name);
    if (c.title) fd.set("title", c.title);
    if (c.phone) fd.set("phone", c.phone);
    if (c.email) fd.set("email", c.email);
    if (!c.isBackhaul) fd.set("is_backhaul", "on");
    const result: MutationResult = await updateBrokerContact(c.id, c.brokerId, fd);
    setTogglingId(null);
    if (!result.ok) setError(result.reason);
    router.refresh();
  }

  async function onDelete(c: ReachContactRow) {
    if (!confirm(`Delete ${c.name}? This can't be undone.`)) return;
    setDeletingId(c.id);
    setError(null);
    const result: MutationResult = await deleteBrokerContact(c.id, c.brokerId);
    setDeletingId(null);
    if (!result.ok) setError(result.reason);
    router.refresh();
  }

  return (
    <div className="border-t border-line pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[13px] font-medium text-fg-muted hover:text-fg">
        {open ? "▾" : "▸"} Contacts ({contacts.length})
      </button>

      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[13px] text-fg-muted">
            Every broker contact Reach can recipient-build from. &quot;Include&quot; is the same flag that controls whether a contact is eligible as a
            recipient — a broker with no direct email falls back to its first included contact.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, broker, or email…"
              className="h-9 w-64 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
              + Add contact
            </Button>
          </div>

          {error ? <p className="text-[13px] font-medium text-bad">{error}</p> : null}

          {filtered.length === 0 ? (
            <p className="text-[13px] text-fg-muted">No contacts match.</p>
          ) : (
            <div className="rounded-xl border border-line bg-card px-3 shadow-e1">
              {filtered.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 text-[13px] last:border-b-0">
                  <div className="min-w-0">
                    <span className="font-medium text-fg">{c.name}</span>
                    <span className="ml-2 text-fg-muted">{c.brokerName}</span>
                    {c.title ? <span className="ml-2 text-fg-subtle">{c.title}</span> : null}
                  </div>
                  <div className="flex items-center gap-3 text-fg-muted">
                    <span>{c.email ?? "—"}</span>
                    <span>{c.phone ? formatPhone(c.phone) : "—"}</span>
                    <button
                      type="button"
                      onClick={() => onToggleInclude(c)}
                      disabled={togglingId === c.id}
                      className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium disabled:opacity-50 ${
                        c.isBackhaul ? "bg-ok-bg text-ok" : "bg-elevated text-fg-muted"
                      }`}
                    >
                      {togglingId === c.id ? "…" : c.isBackhaul ? "Included" : "Excluded"}
                    </button>
                    <button type="button" onClick={() => setEditing(c)} className="font-medium text-accent hover:underline">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(c)}
                      disabled={deletingId === c.id}
                      className="font-medium text-bad hover:underline disabled:opacity-50"
                    >
                      {deletingId === c.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {adding ? <AddContactModal brokers={brokers} onClose={() => setAdding(false)} onSaved={() => router.refresh()} /> : null}
      {editing ? <EditContactModal contact={editing} onClose={() => setEditing(null)} onSaved={() => router.refresh()} /> : null}
    </div>
  );
}

type SaveState = { ok: boolean; error: string | null };

function AddContactModal({
  brokers,
  onClose,
  onSaved,
}: {
  brokers: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [brokerId, setBrokerId] = useState(brokers[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!brokerId) {
      setError("Choose a broker.");
      return;
    }
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const result: MutationResult = await addBrokerContact(brokerId, fd);
    setPending(false);
    if (result.ok) {
      onSaved();
      onClose();
    } else {
      setError(result.reason);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add contact">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
          Broker
          <select
            value={brokerId}
            onChange={(e) => setBrokerId(e.target.value)}
            className="h-10 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg focus:border-fg focus:outline-none"
          >
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name" name="name" required />
          <Field label="Title" name="title" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PhoneField label="Phone" name="phone" />
          <Field label="Email" name="email" type="email" />
        </div>
        <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <input type="checkbox" name="is_backhaul" defaultChecked className="h-4 w-4" />
          Include as a Reach recipient
        </label>
        <FormError message={error} />
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Add contact"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

function EditContactModal({ contact, onClose, onSaved }: { contact: ReachContactRow; onClose: () => void; onSaved: () => void }) {
  const [state, setState] = useState<SaveState>({ ok: false, error: null });
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState({ ok: false, error: null });
    const fd = new FormData(e.currentTarget);
    const result: MutationResult = await updateBrokerContact(contact.id, contact.brokerId, fd);
    setPending(false);
    if (result.ok) {
      onSaved();
      onClose();
    } else {
      setState({ ok: false, error: result.reason });
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit contact">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-muted">{contact.brokerName}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name" name="name" defaultValue={contact.name} required />
          <Field label="Title" name="title" defaultValue={contact.title ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PhoneField label="Phone" name="phone" defaultValue={contact.phone} />
          <Field label="Email" name="email" type="email" defaultValue={contact.email ?? ""} />
        </div>
        <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <input type="checkbox" name="is_backhaul" defaultChecked={contact.isBackhaul} className="h-4 w-4" />
          Include as a Reach recipient
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

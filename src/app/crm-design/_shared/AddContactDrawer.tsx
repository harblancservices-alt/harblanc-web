"use client";

import { useState } from "react";
import { useStore } from "../_lib/store";
import { Button, Field, INPUT } from "../_design/ui";
import { Drawer } from "../_design/Drawer";

export function AddContactDrawer({
  open,
  onClose,
  companyId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  onCreated?: (contactId: string) => void;
}) {
  const { addContact, companies } = useStore();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedCompanyId, setLinkedCompanyId] = useState(companyId ?? "");

  function submit() {
    if (!name.trim()) return;
    const contact = addContact({ companyId: linkedCompanyId || null, name: name.trim(), title, email, phone });
    setName("");
    setTitle("");
    setEmail("");
    setPhone("");
    onClose();
    onCreated?.(contact.id);
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add contact"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Add contact
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Full name">
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Title">
          <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Logistics Manager" />
        </Field>
        <Field label="Email">
          <input className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </Field>
        <Field label="Phone">
          <input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
        </Field>
        {!companyId && (
          <Field label="Company (optional)">
            <select className={INPUT} value={linkedCompanyId} onChange={(e) => setLinkedCompanyId(e.target.value)}>
              <option value="">No company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Drawer>
  );
}

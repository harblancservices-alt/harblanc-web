"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, BTN_EDIT, BTN_DANGER, BTN_NEUTRAL } from "../../_shell/ui";
import { Field, FormError, SubmitButton } from "../../_shell/form";
import { CarrierFormDialog } from "../CarrierFormDialog";
import { digitsForTel } from "../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { createCarrierContact, softDeleteCarrier } from "../../shipments/carriers-actions";
import type { CrmCarrierWithContacts } from "../../shipments/types";

/**
 * Carrier detail/edit — profile facts (edit via the shared CarrierFormDialog,
 * same form the directory's "Add carrier" uses), a contacts list, an
 * add-contact form, and soft-delete. There's no delete/edit-contact action in
 * the data layer (only createCarrierContact) — contacts here are add-only.
 */
export function CarrierDetail({ carrier }: { carrier: CrmCarrierWithContacts }) {
  const router = useRouter();
  const [deleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm(`Delete ${carrier.name}? This can't be undone from here.`)) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await softDeleteCarrier(carrier.id);
      if (result.ok) router.push("/crm/carriers");
      else setDeleteError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHead
          title={carrier.name}
          hint={carrier.status === "active" ? "Active" : "Inactive"}
          right={
            <div className="flex items-center gap-2">
              <CarrierFormDialog
                mode="edit"
                defaults={carrier}
                trigger={(open) => (
                  <button
                    type="button"
                    onClick={open}
                    className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
                  >
                    Edit
                  </button>
                )}
              />
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailFact label="MC #" value={carrier.mcNumber} />
          <DetailFact label="DOT #" value={carrier.dotNumber} />
          <DetailFact label="Equipment" value={carrier.equipment} />
          <DetailFact
            label="Phone"
            value={
              carrier.phone ? (
                <a href={`tel:${digitsForTel(carrier.phone)}`} className="text-accent hover:underline">
                  {formatPhone(carrier.phone)}
                </a>
              ) : null
            }
          />
          <DetailFact
            label="Email"
            value={
              carrier.email ? (
                <a href={`mailto:${carrier.email}`} className="text-accent hover:underline">
                  {carrier.email}
                </a>
              ) : null
            }
          />
          <DetailFact
            label="Address"
            value={
              [carrier.address, [carrier.city, carrier.state].filter(Boolean).join(", "), carrier.zip]
                .filter(Boolean)
                .join(" · ") || null
            }
          />
        </div>
        {carrier.notes && (
          <div className="border-t border-line px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-fg">{carrier.notes}</p>
          </div>
        )}
      </Card>

      <Card>
        <CardHead title="Contacts" hint={`${carrier.contacts.length} on file`} />
        <div className="divide-y divide-line p-4 pt-0">
          {carrier.contacts.length === 0 && (
            <p className="py-3 text-[13px] text-fg-subtle">No contacts yet.</p>
          )}
          {carrier.contacts.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-fg">
                  {c.name || "Unnamed contact"}
                  {c.role && <span className="ml-1.5 text-[12px] font-normal text-fg-subtle">— {c.role}</span>}
                </p>
                <p className="text-[12.5px] text-fg-muted">
                  {[c.phone ? formatPhone(c.phone) : null, c.email].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
            </div>
          ))}
          <AddCarrierContactForm carrierId={carrier.id} />
        </div>
      </Card>

      <Card className="p-4">
        <FormError message={deleteError} />
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_DANGER}`}
        >
          {deleting ? "Deleting…" : "Delete carrier"}
        </button>
      </Card>
    </div>
  );
}

function DetailFact({ label, value }: { label: string; value: ReactNode | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{label}</p>
      <p className="mt-0.5 truncate text-[13.5px] font-medium text-fg">{value || "—"}</p>
    </div>
  );
}

function AddCarrierContactForm({ carrierId }: { carrierId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-3 w-full rounded-md border border-dashed border-fg-subtle py-2 text-[12px] font-semibold text-fg-muted hover:border-accent hover:text-accent`}
      >
        + Add contact
      </button>
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createCarrierContact(carrierId, {
        name: (fd.get("name") as string)?.trim() || null,
        phone: (fd.get("phone") as string)?.trim() || null,
        email: (fd.get("email") as string)?.trim() || null,
        role: (fd.get("role") as string)?.trim() || null,
        notes: null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2.5 rounded-md border border-fg-subtle/60 bg-inset/40 p-3">
      <FormError message={error} />
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Name" name="name" />
        <Field label="Role" name="role" placeholder="e.g. Dispatch" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Phone" name="phone" type="tel" inputMode="tel" />
        <Field label="Email" name="email" type="email" inputMode="email" />
      </div>
      <div className="flex gap-2">
        <SubmitButton pending={pending}>Save contact</SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${BTN_NEUTRAL}`}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Badge, BTN_PRIMARY, EmptyState } from "../../../_shell/ui";
import { Modal } from "../../../_shell/Modal";
import { Field, SubmitButton, FormError } from "../../../_shell/form";
import { MATCH_TIER_LABEL, type ScoredMatch } from "../matching";
import { searchContactMatches, linkBolContact, createContactFromBolContact, type ContactCandidate, type BolContactRole } from "../actions";

export type BolContact = {
  id: string;
  role: BolContactRole;
  name: string | null;
  phone: string | null;
  email: string | null;
  matchedContactId: string | null;
};

const ROLE_LABEL: Record<BolContactRole, string> = {
  shipper: "Shipper contact",
  consignee: "Consignee contact",
  bill_to: "Bill-to contact",
  other: "Other contact",
};

export function ContactsSection({
  bolId,
  contacts,
  shipperAccountId,
  consigneeAccountId,
  billToAccountId,
}: {
  bolId: string;
  contacts: BolContact[];
  shipperAccountId: string | null;
  consigneeAccountId: string | null;
  billToAccountId: string | null;
}) {
  function accountForRole(role: BolContactRole): string | null {
    if (role === "shipper") return shipperAccountId;
    if (role === "consignee") return consigneeAccountId;
    if (role === "bill_to") return billToAccountId;
    return null; // "other" has no natural company on this BOL
  }

  return (
    <Card>
      <CardHead title="Contacts" hint={contacts.length ? `${contacts.length} identified` : undefined} />
      {contacts.length === 0 ? (
        <EmptyState title="No contacts identified" body="Nothing was extracted for this BOL — a contact can still be linked later if one turns up." />
      ) : (
        <ul className="flex flex-col divide-y divide-line-strong">
          {contacts.map((c) => (
            <li key={c.id} className="p-4">
              <ContactRow bolId={bolId} contact={c} accountId={accountForRole(c.role)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ContactRow({ bolId, contact, accountId }: { bolId: string; contact: BolContact; accountId: string | null }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<ScoredMatch<ContactCandidate>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!accountId || contact.matchedContactId || !contact.name?.trim()) return;
    let cancelled = false;
    void searchContactMatches(accountId, contact.name).then((res) => {
      if (!cancelled) setCandidates(res);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, contact.matchedContactId, contact.name]);

  function useExisting(contactId: string) {
    setError(null);
    startTransition(async () => {
      const res = await linkBolContact(contact.id, contactId);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function onCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const phone = String(formData.get("phone") ?? "").trim();
    formData.delete("phone");
    if (phone) formData.set("phones", JSON.stringify([{ label: "Main", number: phone }]));
    setError(null);
    startTransition(async () => {
      const res = await createContactFromBolContact(contact.id, formData);
      if (res.ok) {
        setCreateOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{ROLE_LABEL[contact.role]}</Badge>
        <p className="text-[13.5px] font-semibold text-fg">{contact.name || "—"}</p>
      </div>
      <p className="text-[12.5px] text-fg-muted">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "No phone/email extracted"}</p>

      {error && <p className="text-[12.5px] text-bad">{error}</p>}

      {contact.matchedContactId ? (
        <p className="text-[12.5px] text-ok">Linked to an existing contact.</p>
      ) : !accountId ? (
        <p className="text-[12.5px] text-fg-subtle">Resolve this side&rsquo;s company first to link or create a contact.</p>
      ) : (
        <>
          {candidates && candidates.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {candidates.map((m) => (
                <li key={m.row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line-strong px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-semibold text-fg">{m.row.name}</p>
                      <Badge tone={m.tier === "exact" ? "success" : "accent"}>{MATCH_TIER_LABEL[m.tier]}</Badge>
                    </div>
                    <p className="text-[11.5px] text-fg-muted">{[m.row.title, m.row.phone, m.row.email].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <button type="button" disabled={pending} onClick={() => useExisting(m.row.id)} className={`inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-[12px] font-bold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}>
                    Use Existing
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <button type="button" onClick={() => setCreateOpen(true)} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_PRIMARY}`}>
              Create Contact
            </button>
          </div>
        </>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} busy={pending} title="Create contact">
        <FormError message={error} />
        <form onSubmit={onCreateSubmit} className="flex flex-col gap-2">
          <Field label="Name" name="name" defaultValue={contact.name} required autoFocus />
          <Field label="Phone" name="phone" defaultValue={contact.phone} />
          <Field label="Email" name="email" defaultValue={contact.email} />
          <SubmitButton pending={pending}>Create contact</SubmitButton>
        </form>
      </Modal>
    </div>
  );
}

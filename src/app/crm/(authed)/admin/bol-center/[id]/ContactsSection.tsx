"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHead, Badge, BTN_EDIT, BTN_SUCCESS, EmptyState } from "../../../_shell/ui";
import { resolveBolContact, type BolContactRole } from "../actions";

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
  contacts,
  shipperAccountId,
  consigneeAccountId,
  billToAccountId,
}: {
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
              <ContactRow contact={c} accountId={accountForRole(c.role)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Shows the contact the BOL already gave us — name/phone/email, right
 * there. One button: search the real matcher, link a confident existing
 * contact under the resolved company (never a duplicate) or create one
 * straight from these exact fields — no pre-filled form to confirm. Never
 * orphaned: requires this side's company to already be resolved.
 */
function ContactRow({ contact, accountId }: { contact: BolContact; accountId: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [matchedContactId, setMatchedContactId] = useState(contact.matchedContactId);

  function onAddContact() {
    setError(null);
    startTransition(async () => {
      const res = await resolveBolContact(contact.id);
      if (res.ok) {
        setMatchedContactId(res.contactId);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{ROLE_LABEL[contact.role]}</Badge>
          <p className="truncate text-[13.5px] font-semibold text-fg">{contact.name || "—"}</p>
        </div>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "No phone/email extracted"}</p>
        {error && <p className="mt-1 text-[12.5px] text-bad">{error}</p>}
        {!matchedContactId && !accountId && (
          <p className="mt-1 text-[12px] text-fg-subtle">Resolve this side&rsquo;s company first.</p>
        )}
      </div>
      <div className="shrink-0">
        {matchedContactId ? (
          <Link href={`/crm/contacts/${matchedContactId}`} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_EDIT}`}>
            View Contact →
          </Link>
        ) : (
          <button
            type="button"
            disabled={pending || !accountId || !contact.name?.trim()}
            onClick={onAddContact}
            className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_SUCCESS}`}
          >
            {pending ? "Adding…" : "Add Contact"}
          </button>
        )}
      </div>
    </div>
  );
}

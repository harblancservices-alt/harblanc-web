"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "../../_lib/store";
import { Avatar, Badge, Button, Card, EmptyState, INPUT, PAGE_WIDTH, PageHeader, TEXT, ZEBRA } from "../../_design/ui";
import { daysAgoLabel } from "../../_lib/format";
import { IconContacts, IconPhone, IconPlus, IconSearch } from "../../_design/icons";
import { AddContactDrawer } from "../../_shared/AddContactDrawer";

export default function ContactsPage() {
  const { contacts, companies } = useStore();
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "No company";

  const filtered = useMemo(() => {
    if (!q.trim()) return contacts;
    const needle = q.trim().toLowerCase();
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle) || companyName(c.companyId).toLowerCase().includes(needle),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, q]);

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader
        title="Contacts"
        subtitle={`${contacts.length} contacts across every company.`}
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <IconPlus width={15} height={15} /> Add contact
          </Button>
        }
      />

      <Card className="mb-4 p-3">
        <label className="relative flex items-center">
          <IconSearch width={15} height={15} className="pointer-events-none absolute left-3 text-[var(--cd-text-subtle)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts…" className={`${INPUT} pl-8`} />
        </label>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<IconContacts />} title="No contacts match" body="Try a different search." />
        </Card>
      ) : (
        <Card>
          <ul className={`divide-y divide-[var(--cd-border)] ${ZEBRA}`}>
            {filtered.map((c) => (
              <li key={c.id}>
                <Link href={`/crm-design/contacts/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--cd-accent-soft)]">
                  <Avatar name={c.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-[var(--cd-text)]">
                      {c.name} {c.isDecisionMaker && <Badge tone="accent">DM</Badge>}
                    </p>
                    <p className={`truncate ${TEXT.micro} text-[var(--cd-text-muted)]`}>
                      {c.title} · {companyName(c.companyId)}
                    </p>
                  </div>
                  <span className={`hidden shrink-0 items-center gap-1 ${TEXT.micro} text-[var(--cd-text-muted)] sm:flex`}>
                    <IconPhone width={12} height={12} /> {daysAgoLabel(c.lastContactedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AddContactDrawer open={addOpen} onClose={() => setAddOpen(false)} companyId={null} />
    </div>
  );
}

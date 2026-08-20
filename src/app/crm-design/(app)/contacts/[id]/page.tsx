"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useContactRecord, useStore } from "../../../_lib/store";
import { Avatar, Badge, Breadcrumb, Button, Card, CardHead, EmptyState, PAGE_WIDTH, TEXT } from "../../../_design/ui";
import { formatDate, relativeTime } from "../../../_lib/format";
import { IconActivity, IconMail, IconPhone } from "../../../_design/icons";
import { LogActivityModal } from "../../../_shared/LogActivityModal";

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const contact = useContactRecord(params.id);
  const { companies, activities } = useStore();
  const [logOpen, setLogOpen] = useState(false);

  if (!contact) return notFound();

  const company = companies.find((c) => c.id === contact.companyId) ?? null;
  const contactActivities = activities.filter((a) => a.contactId === contact.id);

  return (
    <div className={PAGE_WIDTH}>
      <Breadcrumb
        items={[
          { label: "Contacts", href: "/crm-design/contacts" },
          { label: contact.name },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <Avatar name={contact.name} size={52} />
          <div>
            <h1 className={`${TEXT.pageTitle} text-[var(--cd-text)]`}>
              {contact.name} {contact.isDecisionMaker && <Badge tone="accent">Decision maker</Badge>}
            </h1>
            <p className={`${TEXT.body} text-[var(--cd-text-muted)]`}>
              {contact.title}
              {company && (
                <>
                  {" at "}
                  <Link href={`/crm-design/companies/${company.id}`} className="font-semibold text-[var(--cd-accent)]">
                    {company.name}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <Button variant="primary" onClick={() => setLogOpen(true)}>
          <IconActivity width={15} height={15} /> Log activity
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit">
          <CardHead title="Contact info" />
          <dl className="divide-y divide-[var(--cd-border)]">
            <Row icon={<IconPhone width={14} height={14} />} label="Phone" value={contact.phone} href={`tel:${contact.phone.replace(/\D/g, "")}`} />
            <Row icon={<IconMail width={14} height={14} />} label="Email" value={contact.email} href={`mailto:${contact.email}`} />
            <Row label="Last contacted" value={contact.lastContactedAt ? formatDate(contact.lastContactedAt) : "Never"} />
            <Row label="Next follow-up" value={contact.nextFollowupAt ? formatDate(contact.nextFollowupAt) : "None scheduled"} />
          </dl>
        </Card>

        <Card>
          <CardHead title="Activity history" />
          {contactActivities.length === 0 ? (
            <EmptyState icon={<IconActivity />} title="No activity yet" body="Calls, notes, and emails with this contact will show up here." />
          ) : (
            <ul className="divide-y divide-[var(--cd-border)]">
              {contactActivities.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <p className="text-[13.5px] font-semibold text-[var(--cd-text)]">{a.title}</p>
                  {a.body && <p className={`mt-0.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>{a.body}</p>}
                  <p className={`mt-0.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>{relativeTime(a.occurredAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <LogActivityModal open={logOpen} onClose={() => setLogOpen(false)} companyId={company?.id ?? ""} contactId={contact.id} />
    </div>
  );
}

function Row({ icon, label, value, href }: { icon?: React.ReactNode; label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <span className={`flex items-center gap-1.5 ${TEXT.micro} font-semibold text-[var(--cd-text-muted)]`}>
        {icon}
        {label}
      </span>
      {href ? (
        <a href={href} className="truncate text-[12.5px] font-medium text-[var(--cd-accent)] hover:underline">
          {value}
        </a>
      ) : (
        <span className="truncate text-[12.5px] font-medium text-[var(--cd-text)]">{value}</span>
      )}
    </div>
  );
}

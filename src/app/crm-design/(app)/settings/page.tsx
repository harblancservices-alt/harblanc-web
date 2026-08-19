"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "../../_lib/store";
import { Avatar, Button, Card, CardHead, Field, INPUT, PAGE_WIDTH, PageHeader, TEXT } from "../../_design/ui";
import { IconShield } from "../../_design/icons";

/**
 * Personal Settings — ONLY what belongs to the individual signed-in user.
 * Two fixes vs. the real CRM (see DESIGN_DECISIONS.md "Settings"):
 *   1. Name/title are now actually editable (the real CRM renders them
 *      read-only with no edit path at all — CRM_MASTER_AUDIT.md §4).
 *   2. Organization/brokerage letterhead info is READ-ONLY here with a
 *      link into Admin → Organization, where it's actually edited — moving
 *      the one owner-only edit affordance that lived in Settings into
 *      Admin, where every other owner-only control already lives.
 */
export default function SettingsPage() {
  const { currentUser } = useStore();
  const [name, setName] = useState(currentUser.name);
  const [title, setTitle] = useState(currentUser.title);
  const [saved, setSaved] = useState(false);
  const isElevated = currentUser.role === "owner" || currentUser.role === "admin";

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader title="Settings" subtitle="Your personal account." />

      <div className="flex max-w-xl flex-col gap-4">
        <Card>
          <CardHead title="Your account" />
          <div className="flex items-center gap-3 px-4 py-4">
            <Avatar name={name} size={48} />
            <div>
              <p className="text-[14px] font-semibold text-[var(--cd-text)]">{name}</p>
              <p className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>{currentUser.email}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-[var(--cd-border)] p-4">
            <Field label="Full name">
              <input className={INPUT} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
            </Field>
            <Field label="Title">
              <input className={INPUT} value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} />
            </Field>
            <Field label="Role">
              <input className={INPUT} value={currentUser.role === "owner" ? "Owner" : currentUser.role === "admin" ? "Admin" : "Sales Agent"} disabled />
            </Field>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => setSaved(true)}>
                Save changes
              </Button>
              {saved && <span className={`${TEXT.micro} text-[var(--cd-success)]`}>Saved.</span>}
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Organization / Brokerage Info" hint="Read-only here — this is the letterhead every generated document reads from." />
          <div className="px-4 py-4">
            <p className={`${TEXT.body} text-[var(--cd-text-muted)]`}>
              Hello Hotshot Logistics LLC · MC-812340 · DOT-2947710 · Odessa, TX
            </p>
            {isElevated ? (
              <Link
                href="/crm-design/admin/organization"
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--cd-admin)] hover:underline"
              >
                <IconShield width={13} height={13} /> Edit in Admin → Organization
              </Link>
            ) : (
              <p className={`mt-2 ${TEXT.micro} text-[var(--cd-text-subtle)]`}>Only an Owner or Admin can edit this.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

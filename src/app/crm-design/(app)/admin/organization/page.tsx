"use client";

import { useState } from "react";
import { Button, Card, CardHead, Field, INPUT, TEXT } from "../../../_design/ui";

/**
 * Admin → Organization — NEW screen, added to the real CRM's Admin IA. The
 * real CRM's brokerage/letterhead info was owner-editable but lived in
 * personal Settings (the ONE owner-only edit control stranded outside
 * Admin — CRM_MASTER_AUDIT.md §4/§14). This prototype moves the edit
 * capability here, alongside every other owner-only control, and leaves a
 * read-only reference card in Settings (see (app)/settings/page.tsx).
 */
export default function AdminOrganizationPage() {
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("Hello Hotshot Logistics LLC");
  const [mc, setMc] = useState("MC-812340");
  const [dot, setDot] = useState("DOT-2947710");
  const [address, setAddress] = useState("4410 W County Rd 60, Odessa, TX 79763");
  const [phone, setPhone] = useState("(432) 555-0100");
  const [email, setEmail] = useState("dispatch@hellohotshot.com");

  return (
    <Card className="max-w-2xl">
      <CardHead title="Brokerage Info" hint="The letterhead every generated Rate Confirmation / Bill of Lading reads from." />
      <div className="flex flex-col gap-4 p-5">
        <Field label="Company name">
          <input className={INPUT} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="MC #">
            <input className={INPUT} value={mc} onChange={(e) => { setMc(e.target.value); setSaved(false); }} />
          </Field>
          <Field label="DOT #">
            <input className={INPUT} value={dot} onChange={(e) => { setDot(e.target.value); setSaved(false); }} />
          </Field>
        </div>
        <Field label="Address">
          <input className={INPUT} value={address} onChange={(e) => { setAddress(e.target.value); setSaved(false); }} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input className={INPUT} value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} />
          </Field>
          <Field label="Email">
            <input className={INPUT} value={email} onChange={(e) => { setEmail(e.target.value); setSaved(false); }} />
          </Field>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="admin" onClick={() => setSaved(true)}>
            Save changes
          </Button>
          {saved && <span className={`${TEXT.micro} text-[var(--cd-success)]`}>Saved. Logged to the Activity Log.</span>}
        </div>
      </div>
    </Card>
  );
}

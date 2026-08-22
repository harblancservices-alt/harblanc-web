"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, BTN_EDIT, BTN_SUCCESS, BTN_WARNING } from "../../../_shell/ui";
import { TextRow } from "../../../_shell/compactForm";
import { MatchCandidateList } from "./MatchCandidateList";
import { searchContactMatches, linkBolContact, resolveBolContact, updateBolContactFields, type BolContactRole, type ContactCandidate } from "../actions";
import type { ScoredMatch } from "../matching";

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

/**
 * Nested under its company's CompanyRow (never a loose top-level list) — one
 * row per crm_bol_contacts record. Four real states: resolved, "needs a
 * field" (no phone AND no email — a rep can't work this contact, so that's
 * surfaced as the row's own state rather than a silent create failure later),
 * possible-matches review, or an inline create form when nothing on file is
 * a match. Every write goes through the existing resolveBolContact /
 * linkBolContact / updateBolContactFields actions — this file adds no new
 * server logic.
 */
export function ContactRow({ contact, accountId }: { contact: BolContact; accountId: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [candidates, setCandidates] = useState<ScoredMatch<ContactCandidate>[] | null>(null);
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [createOpen, setCreateOpen] = useState(false);

  const missingField = !contact.matchedContactId && !contact.phone?.trim() && !contact.email?.trim();
  const canSearch = Boolean(accountId) && Boolean(contact.name?.trim()) && !contact.matchedContactId && !missingField;

  useEffect(() => {
    if (!canSearch || !accountId || !contact.name) return;
    let cancelled = false;
    void searchContactMatches(accountId, contact.name).then((res) => {
      if (!cancelled) setCandidates(res);
    });
    return () => {
      cancelled = true;
    };
  }, [canSearch, accountId, contact.name]);

  function saveField() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", contact.name ?? "");
      fd.set("phone", phone);
      fd.set("email", email);
      const res = await updateBolContactFields(contact.id, fd);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function useCandidate(row: ContactCandidate) {
    setError(null);
    startTransition(async () => {
      const res = await linkBolContact(contact.id, row.id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function submitCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const saveRes = await updateBolContactFields(contact.id, fd);
      if (!saveRes.ok) {
        setError(saveRes.error);
        return;
      }
      const res = await resolveBolContact(contact.id);
      if (res.ok) {
        setCreateOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="rounded-md border border-line bg-inset/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{ROLE_LABEL[contact.role]}</Badge>
        <p className="truncate text-[13px] font-semibold text-fg">{contact.name || "—"}</p>
      </div>

      {error && <p className="mt-1 text-[12px] text-bad">{error}</p>}

      {contact.matchedContactId ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-[12px] text-fg-muted">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "No phone/email"}</p>
          <Link href={`/crm/contacts/${contact.matchedContactId}`} className={`inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-[12px] font-bold transition-colors ${BTN_EDIT}`}>
            View Contact →
          </Link>
        </div>
      ) : !contact.name?.trim() ? (
        <p className="mt-1.5 text-[12px] text-fg-subtle">Nothing extracted for this contact.</p>
      ) : !accountId ? (
        <p className="mt-1.5 text-[12px] text-fg-subtle">Resolve this side&rsquo;s company first.</p>
      ) : missingField ? (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-warn/40 bg-warn-bg/40 p-2.5">
          <p className="text-[11.5px] font-semibold text-warn">Needs a phone or email — a rep can&rsquo;t work this contact yet.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TextRow label="Phone" value={phone} onChange={setPhone} onBlur={() => {}} type="tel" hideLabel placeholder="Phone" />
            <TextRow label="Email" value={email} onChange={setEmail} onBlur={() => {}} type="email" hideLabel placeholder="Email" />
          </div>
          <button
            type="button"
            disabled={pending || (!phone.trim() && !email.trim())}
            onClick={saveField}
            className={`inline-flex h-7 w-fit items-center rounded-md px-2.5 text-[12px] font-bold transition-colors disabled:opacity-60 ${BTN_WARNING}`}
          >
            Save
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[12px] text-fg-muted">{[contact.phone, contact.email].filter(Boolean).join(" · ")}</p>
          {candidates === null ? (
            <p className="text-[11.5px] text-fg-subtle">Checking this company&rsquo;s contacts…</p>
          ) : candidates.length > 0 ? (
            <MatchCandidateList
              candidates={candidates}
              pending={pending}
              onUse={useCandidate}
              renderTitle={(row) => row.name}
              renderSubtitle={(row) => [row.title, row.phone, row.email].filter(Boolean).join(" · ") || "No details on file"}
            />
          ) : createOpen ? (
            <form onSubmit={submitCreate} className="flex flex-col gap-2 rounded-md border border-line-strong p-2.5">
              <input type="hidden" name="name" value={contact.name ?? ""} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <TextRow label="Phone" value={phone} onChange={setPhone} onBlur={() => {}} type="tel" />
                <TextRow label="Email" value={email} onChange={setEmail} onBlur={() => {}} type="email" />
              </div>
              <input type="hidden" name="phone" value={phone} />
              <input type="hidden" name="email" value={email} />
              <button
                type="submit"
                disabled={pending}
                className={`inline-flex h-7 w-fit items-center rounded-md px-2.5 text-[12px] font-bold transition-colors disabled:opacity-60 ${BTN_SUCCESS}`}
              >
                {pending ? "Adding…" : "Add Contact"}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className={`inline-flex h-7 w-fit items-center rounded-md px-2.5 text-[12px] font-bold transition-colors ${BTN_SUCCESS}`}
            >
              No CRM match — Add Contact
            </button>
          )}
        </div>
      )}
    </div>
  );
}

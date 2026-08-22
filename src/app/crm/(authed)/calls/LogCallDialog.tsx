"use client";

import { useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_shell/Modal";
import { Field, TextareaField, FormError, FieldLabel } from "../_shell/form";
import { CONTROL, CONTROL_SIZE, LABEL } from "../_shell/compactForm";
import { centralDayRange, centralDateKey } from "../_shell/format";
import { StickyActionBar } from "../_shell/StickyActionBar";
import { BTN_NEUTRAL } from "../_shell/ui";
import {
  phoneDigits,
  phoneMatchKey,
  findMatchingAccount,
  findMatchingContact,
  type CallDirectory,
  type DirectoryAccount,
  type DirectoryContact,
} from "../_shell/contactFields";
import { CALL_OUTCOMES } from "./outcomes";
import { logCall, getCallDirectory } from "./actions";
import { FollowupFields } from "./FollowupFields";

type FieldState = { text: string; id: string | null; autofilled: boolean };
type PhoneState = { text: string; autofilled: boolean };

type ConfirmStep =
  | { kind: "duplicate"; field: "contact"; match: DirectoryContact }
  | { kind: "duplicate"; field: "company"; match: DirectoryAccount }
  | { kind: "create"; lines: string[] };
type PendingConfirm = ConfirmStep | null;

type PhoneHit = { number: string; label: string; contact?: DirectoryContact; account?: DirectoryAccount };

function displayPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}

function phoneSuggestions(dir: CallDirectory, query: string): PhoneHit[] {
  const q = phoneDigits(query);
  if (q.length < 3) return [];
  const hits: PhoneHit[] = [];
  for (const c of dir.contacts) {
    const p = c.phones.find((p) => phoneDigits(p.number).includes(q));
    if (p) hits.push({ number: p.number, label: `${c.name}${c.accountName ? ` — ${c.accountName}` : ""}`, contact: c });
  }
  for (const a of dir.accounts) {
    const p = a.phones.find((p) => phoneDigits(p.number).includes(q));
    if (p) hits.push({ number: p.number, label: `${a.name} (company)`, account: a });
  }
  return hits.slice(0, 8);
}

function findExactPhoneHit(dir: CallDirectory, raw: string): PhoneHit | null {
  const key = phoneMatchKey(raw);
  if (key.length !== 10) return null;
  for (const c of dir.contacts) {
    const p = c.phones.find((p) => phoneMatchKey(p.number) === key);
    if (p) return { number: p.number, label: c.name, contact: c };
  }
  for (const a of dir.accounts) {
    const p = a.phones.find((p) => phoneMatchKey(p.number) === key);
    if (p) return { number: p.number, label: a.name, account: a };
  }
  return null;
}

// Positioned relative to the label+input wrapper immediately around it
// (each usage wraps just that pair in its own `relative` div), not a
// hardcoded offset tied to the whole field block's height — so it stays
// correctly anchored regardless of control size or helper-text length.
const DROPDOWN =
  "absolute left-0 top-[calc(100%+4px)] z-20 max-h-56 w-full overflow-y-auto rounded-[5px] border border-line-strong bg-card py-1 shadow-e3";
const DROPDOWN_ROW = "block w-full px-2.5 py-1.5 text-left text-[12.5px] text-fg transition-colors hover:bg-inset";

// Follow-up reminder default — tomorrow at 8:00 AM Central. A prefill only:
// the rep can still change or clear either field (FollowupFields' "Clear
// time" button and "No specific time" option are untouched), and this is
// only ever read at dialog-open time (initial useState value / resetFields),
// never re-applied on a later render, so an edit or a clear sticks.
const DEFAULT_REMINDER_TIME = "08:00";
function defaultReminderDate(): string {
  // "Tomorrow" computed against the Central calendar day, not the rep's
  // machine timezone — centralDayRange already gives Central midnight
  // (today) as a UTC instant; +24h lands within Central "tomorrow" even
  // across a DST transition (a Central civil day is never shorter than 23h,
  // so a ±1h drift from true midnight never crosses into the wrong day).
  const { startMs } = centralDayRange(new Date());
  return centralDateKey(new Date(startMs + 24 * 60 * 60 * 1000).toISOString()) ?? "";
}

/**
 * "Who did you talk to?" — logs a call against any combination of an existing
 * or brand-new contact, company, and phone number, filled in in ANY order.
 * Picking an existing record cross-autofills the others (contact → its
 * company + phone; company → its primary contact + main phone, scoped to
 * that company's contacts; a known phone → its owning contact/company); each
 * autofilled field stays editable. Creating a new contact/company runs a
 * dedupe check against the org's directory (self-fetched via
 * getCallDirectory on first open — no caller needs to pass a roster down)
 * and, if nothing looks like a duplicate, requires one extra confirming
 * click before anything is actually created — see computeNextStep. A call
 * with only a phone number (no contact/company resolved) is allowed and
 * creates nothing; the raw number is stored on crm_calls.phone so it can be
 * reconciled later.
 *
 * `accountId`/`contactId`/`phone` are OPTIONAL context hints for the call
 * sites that already know who's being called (a company profile, a contact
 * card, a specific phone-list row) — they just pre-run the same cross-autofill
 * a manual selection would, and remain fully editable.
 */
export function LogCallDialog({
  accountId = null,
  contactId = null,
  phone: phoneHint = null,
  trigger,
}: {
  accountId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const [directory, setDirectory] = useState<CallDirectory | null>(null);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [pendingHints, setPendingHints] = useState(false);

  const [contact, setContact] = useState<FieldState>({ text: "", id: null, autofilled: false });
  const [company, setCompany] = useState<FieldState>({ text: "", id: null, autofilled: false });
  const [phone, setPhone] = useState<PhoneState>({ text: "", autofilled: false });
  const [contactOpen, setContactOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const [outcome, setOutcome] = useState("");
  const [followup, setFollowup] = useState(false);
  const [reminderDate, setReminderDate] = useState(defaultReminderDate);
  const [reminderTime, setReminderTime] = useState(DEFAULT_REMINDER_TIME);

  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [dismissedContactDup, setDismissedContactDup] = useState(false);
  const [dismissedCompanyDup, setDismissedCompanyDup] = useState(false);
  const [confirmedCreate, setConfirmedCreate] = useState(false);

  // Fetch the org directory once, the first time the dialog is opened.
  useEffect(() => {
    if (!open || directory || loadingDirectory) return;
    setLoadingDirectory(true);
    getCallDirectory()
      .then((dir) => setDirectory(dir))
      .catch(() => setError("Could not load contacts/companies. Try again."))
      .finally(() => setLoadingDirectory(false));
  }, [open, directory, loadingDirectory]);

  // Apply accountId/contactId/phone hints as soon as the directory is ready.
  useEffect(() => {
    if (!pendingHints || !directory) return;
    setPendingHints(false);
    if (contactId) {
      const c = directory.contacts.find((x) => x.id === contactId);
      if (c) selectContact(c);
    } else if (accountId) {
      const a = directory.accounts.find((x) => x.id === accountId);
      if (a) selectCompany(a);
    }
    if (phoneHint) {
      setPhone((p) => (p.text ? p : { text: phoneHint, autofilled: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHints, directory]);

  function resetFields() {
    setError(null);
    setContact({ text: "", id: null, autofilled: false });
    setCompany({ text: "", id: null, autofilled: false });
    setPhone({ text: "", autofilled: false });
    setOutcome("");
    setFollowup(false);
    setReminderDate(defaultReminderDate());
    setReminderTime(DEFAULT_REMINDER_TIME);
    setPendingConfirm(null);
    setDismissedContactDup(false);
    setDismissedCompanyDup(false);
    setConfirmedCreate(false);
    setPendingHints(true);
  }

  function selectContact(c: DirectoryContact) {
    setContact({ text: c.name, id: c.id, autofilled: false });
    setDismissedContactDup(false);
    setConfirmedCreate(false);
    setPendingConfirm(null);
    if (c.accountId) {
      const acctName = c.accountName ?? directory?.accounts.find((a) => a.id === c.accountId)?.name ?? "";
      setCompany({ text: acctName, id: c.accountId, autofilled: true });
    }
    const firstPhone = c.phones[0]?.number;
    if (firstPhone) setPhone({ text: firstPhone, autofilled: true });
  }

  function selectCompany(a: DirectoryAccount) {
    setCompany({ text: a.name, id: a.id, autofilled: false });
    setDismissedCompanyDup(false);
    setConfirmedCreate(false);
    setPendingConfirm(null);

    const contactEmpty = !contact.id && !contact.text.trim();
    const phoneEmpty = !phone.text.trim();
    if (contactEmpty) {
      const primary = a.primaryContactId ? directory?.contacts.find((c) => c.id === a.primaryContactId) : null;
      if (primary) {
        setContact({ text: primary.name, id: primary.id, autofilled: true });
        const firstPhone = primary.phones[0]?.number ?? a.phones[0]?.number;
        if (firstPhone && phoneEmpty) setPhone({ text: firstPhone, autofilled: true });
      } else if (a.phones[0]?.number && phoneEmpty) {
        setPhone({ text: a.phones[0].number, autofilled: true });
      }
    }
  }

  function applyPhoneHit(hit: PhoneHit) {
    setPhone({ text: hit.number, autofilled: false });
    setPhoneOpen(false);
    if (hit.contact) {
      setContact({ text: hit.contact.name, id: hit.contact.id, autofilled: true });
      setDismissedContactDup(false);
      if (hit.contact.accountId) {
        const acctName =
          hit.contact.accountName ?? directory?.accounts.find((a) => a.id === hit.contact!.accountId)?.name ?? "";
        setCompany({ text: acctName, id: hit.contact.accountId, autofilled: true });
        setDismissedCompanyDup(false);
      }
    } else if (hit.account) {
      setCompany({ text: hit.account.name, id: hit.account.id, autofilled: true });
      setDismissedCompanyDup(false);
      if (hit.account.primaryContactId) {
        const pc = directory?.contacts.find((c) => c.id === hit.account!.primaryContactId);
        if (pc) {
          setContact({ text: pc.name, id: pc.id, autofilled: true });
          setDismissedContactDup(false);
        }
      }
    }
    setConfirmedCreate(false);
    setPendingConfirm(null);
  }

  function handlePhoneBlur() {
    setPhoneOpen(false);
    if (!directory) return;
    if (contact.id || contact.text.trim() || company.id || company.text.trim()) return;
    const hit = findExactPhoneHit(directory, phone.text);
    if (hit) applyPhoneHit(hit);
  }

  function computeNextStep(): ConfirmStep | "ready" {
    if (!directory) return "ready";
    const contactWillCreate = !contact.id && contact.text.trim().length > 0;
    const companyWillCreate = !company.id && company.text.trim().length > 0;

    if (contactWillCreate && !dismissedContactDup) {
      const m = findMatchingContact(directory.contacts, contact.text, phone.text);
      if (m) return { kind: "duplicate", field: "contact", match: m };
    }
    if (companyWillCreate && !dismissedCompanyDup) {
      const m = findMatchingAccount(directory.accounts, company.text, phone.text);
      if (m) return { kind: "duplicate", field: "company", match: m };
    }
    if ((contactWillCreate || companyWillCreate) && !confirmedCreate) {
      const lines: string[] = [];
      if (contactWillCreate && companyWillCreate) {
        lines.push(`Create contact "${contact.text.trim()}" under new company "${company.text.trim()}" and link them.`);
      } else if (contactWillCreate) {
        lines.push(
          `Create contact "${contact.text.trim()}"${company.id ? ` under ${company.text.trim()}` : " with no company"}.`,
        );
      } else if (companyWillCreate) {
        lines.push(`Create company "${company.text.trim()}".`);
      }
      return { kind: "create", lines };
    }
    return "ready";
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;

    if (!outcome) {
      setError("Pick a call outcome.");
      return;
    }
    if (!directory) {
      setError("Still loading contacts — try again in a moment.");
      return;
    }

    const step = computeNextStep();
    if (step !== "ready") {
      setPendingConfirm(step);
      if (step.kind === "create") setConfirmedCreate(true);
      return;
    }

    startTransition(async () => {
      const res = await logCall(new FormData(form));
      if (res.ok) {
        setOpen(false);
        resetFields();
        router.refresh();
      } else {
        setError(res.error);
        setConfirmedCreate(false);
      }
    });
  }

  const phoneMatches = directory && phoneOpen ? phoneSuggestions(directory, phone.text) : [];
  const contactMatches =
    directory && contactOpen && contact.text.trim()
      ? (company.id ? directory.contacts.filter((c) => c.accountId === company.id) : directory.contacts)
          .filter((c) => c.name.toLowerCase().includes(contact.text.trim().toLowerCase()))
          .slice(0, 8)
      : [];
  const companyMatches =
    directory && companyOpen && company.text.trim()
      ? directory.accounts.filter((a) => a.name.toLowerCase().includes(company.text.trim().toLowerCase())).slice(0, 8)
      : [];

  const saveLabel = pendingConfirm?.kind === "create" ? "Confirm & save call" : pending ? "Logging…" : "Save call";
  const saveGreen = pendingConfirm?.kind === "create";

  return (
    <>
      {trigger(() => {
        resetFields();
        setOpen(true);
      })}

      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="Who did you talk to?" fullScreen>
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <input type="hidden" name="outcome" value={outcome} />
          <input type="hidden" name="contact_mode" value={contact.id ? "existing" : contact.text.trim() ? "new" : "none"} />
          <input type="hidden" name="contact_id" value={contact.id ?? ""} />
          <input type="hidden" name="contact_name" value={contact.text.trim()} />
          <input type="hidden" name="account_mode" value={company.id ? "existing" : company.text.trim() ? "new" : "none"} />
          <input type="hidden" name="account_id" value={company.id ?? ""} />
          <input type="hidden" name="company_name" value={company.text.trim()} />
          <input type="hidden" name="phone" value={phone.text.trim()} />
          <input type="hidden" name="contact_force" value={dismissedContactDup ? "on" : ""} />
          <input type="hidden" name="account_force" value={dismissedCompanyDup ? "on" : ""} />

          {/* Contact */}
          <div className="flex flex-col gap-1">
            <div className="relative">
              <label className="flex flex-col gap-1">
                <span className={LABEL}>Contact</span>
                <input
                  type="text"
                  value={contact.text}
                  onChange={(e) => {
                    setContact({ text: e.target.value, id: null, autofilled: false });
                    setDismissedContactDup(false);
                    setConfirmedCreate(false);
                    setPendingConfirm(null);
                    setContactOpen(true);
                  }}
                  onFocus={() => setContactOpen(true)}
                  onBlur={() => setContactOpen(false)}
                  placeholder="Search or type a new contact name…"
                  autoComplete="off"
                  className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
                />
              </label>
              {contactOpen && contactMatches.length > 0 && (
                <ul className={DROPDOWN}>
                  {contactMatches.map((c) => (
                    <li key={c.id}>
                      <button type="button" onMouseDown={(e) => { e.preventDefault(); selectContact(c); }} className={DROPDOWN_ROW}>
                        <span className="font-medium">{c.name}</span>
                        {c.accountName && <span className="text-fg-subtle"> — {c.accountName}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {contact.autofilled ? (
              <p className="text-[11px] font-semibold text-ok">Auto-filled — edit if needed.</p>
            ) : (
              <p className="text-[11.5px] text-fg-subtle">
                {company.id && !contact.text.trim()
                  ? "Showing this company's contacts."
                  : contact.id
                    ? "Existing contact."
                    : contact.text.trim()
                      ? `No match — will create "${contact.text.trim()}" as a new contact.`
                      : "Optional — leave blank for an unlinked call."}
              </p>
            )}
          </div>

          {/* Company */}
          <div className="flex flex-col gap-1">
            <div className="relative">
              <label className="flex flex-col gap-1">
                <span className={LABEL}>Company</span>
                <input
                  type="text"
                  value={company.text}
                  onChange={(e) => {
                    setCompany({ text: e.target.value, id: null, autofilled: false });
                    setDismissedCompanyDup(false);
                    setConfirmedCreate(false);
                    setPendingConfirm(null);
                    setCompanyOpen(true);
                  }}
                  onFocus={() => setCompanyOpen(true)}
                  onBlur={() => setCompanyOpen(false)}
                  placeholder="Search or type a new company name…"
                  autoComplete="off"
                  className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
                />
              </label>
              {companyOpen && companyMatches.length > 0 && (
                <ul className={DROPDOWN}>
                  {companyMatches.map((a) => (
                    <li key={a.id}>
                      <button type="button" onMouseDown={(e) => { e.preventDefault(); selectCompany(a); }} className={DROPDOWN_ROW}>
                        {a.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {company.autofilled ? (
              <p className="text-[11px] font-semibold text-ok">Auto-filled — edit if needed.</p>
            ) : (
              <p className="text-[11.5px] text-fg-subtle">
                {company.id
                  ? "Existing company."
                  : company.text.trim()
                    ? `No match — will create "${company.text.trim()}" as a new company.`
                    : "Optional — leave blank for an unlinked call."}
              </p>
            )}
          </div>

          {/* Phone */}
          <div className="flex flex-col gap-1">
            <div className="relative">
              <label className="flex flex-col gap-1">
                <span className={LABEL}>Phone</span>
                <input
                  type="tel"
                  value={phone.text}
                  onChange={(e) => {
                    setPhone({ text: e.target.value, autofilled: false });
                    setPhoneOpen(true);
                  }}
                  onFocus={() => setPhoneOpen(true)}
                  onBlur={handlePhoneBlur}
                  placeholder="Number dialed…"
                  autoComplete="off"
                  className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
                />
              </label>
              {phoneOpen && phoneMatches.length > 0 && (
                <ul className={DROPDOWN}>
                  {phoneMatches.map((hit, i) => (
                    <li key={`${hit.number}-${i}`}>
                      <button type="button" onMouseDown={(e) => { e.preventDefault(); applyPhoneHit(hit); }} className={DROPDOWN_ROW}>
                        <span className="font-mono">{displayPhone(hit.number)}</span>
                        <span className="text-fg-subtle"> — {hit.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {phone.autofilled ? (
              <p className="text-[11px] font-semibold text-ok">Auto-filled — edit if needed.</p>
            ) : (
              <p className="text-[11.5px] text-fg-subtle">
                {phone.text.trim() && !contact.id && !company.id
                  ? "No contact/company matched — this call will be saved as an unlinked number."
                  : "Optional."}
              </p>
            )}
          </div>

          {/* Outcome */}
          <div className="flex flex-col gap-1">
            <FieldLabel required>Outcome</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {CALL_OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOutcome(o.value)}
                  className={`rounded-[5px] border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                    outcome === o.value
                      ? "border-ok bg-ok text-white"
                      : "border-fg-subtle bg-card text-fg-muted hover:bg-inset hover:text-fg"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Duration (min)" name="duration_minutes" inputMode="numeric" placeholder="e.g. 5" />
            <Field label="Summary" name="summary" placeholder="One-line recap" />
          </div>

          <TextareaField label="Notes" name="notes" placeholder="What was said, next steps…" />

          <label className="flex items-start gap-2.5 rounded-[5px] border border-fg-subtle bg-card px-2.5 py-2">
            <input
              type="checkbox"
              name="followup_required"
              checked={followup}
              onChange={(e) => setFollowup(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-fg">Follow-up required</span>
              <span className="mt-0.5 block text-[11.5px] text-fg-subtle">
                Sets a reminder that surfaces on your dashboard. Date and time are both optional.
              </span>
            </span>
          </label>

          {followup && (
            <FollowupFields
              date={reminderDate}
              time={reminderTime}
              onDateChange={setReminderDate}
              onTimeChange={setReminderTime}
            />
          )}

          {pendingConfirm?.kind === "duplicate" && (
            <div className="rounded-[5px] border border-warn/40 bg-warn-bg px-2.5 py-2 text-[12.5px]">
              <p className="font-semibold text-warn">
                {pendingConfirm.field === "contact" ? "Contact" : "Company"} already exists
              </p>
              <p className="mt-1 text-fg-muted">
                &ldquo;{pendingConfirm.match.name}&rdquo; looks like a match — link this call to it instead of creating a
                duplicate?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (pendingConfirm.field === "contact") selectContact(pendingConfirm.match as DirectoryContact);
                    else selectCompany(pendingConfirm.match as DirectoryAccount);
                  }}
                  className="rounded-[5px] border border-ok bg-ok px-2.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ok/90"
                >
                  Use existing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingConfirm.field === "contact") setDismissedContactDup(true);
                    else setDismissedCompanyDup(true);
                    setPendingConfirm(null);
                  }}
                  className={`rounded-[5px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${BTN_NEUTRAL}`}
                >
                  Create new anyway
                </button>
              </div>
            </div>
          )}

          {pendingConfirm?.kind === "create" && (
            <div className="rounded-[5px] border border-ok/40 bg-ok-bg px-2.5 py-2 text-[12.5px]">
              <p className="font-semibold text-ok">Saving will also create:</p>
              <ul className="mt-1 list-disc pl-4 text-fg-muted">
                {pendingConfirm.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="submit"
            disabled={pending || loadingDirectory}
            className={`mt-1 hidden h-9 items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold text-white transition-colors disabled:opacity-60 lg:inline-flex ${
              saveGreen ? "bg-ok hover:bg-ok/90" : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {saveLabel}
          </button>

          {/* Mobile/tablet — the Save button is pinned to the bottom of the
              full-screen sheet instead of scrolling away at the end of the
              CRM's longest form. Desktop (`lg`+) keeps the plain inline
              button above, unchanged. */}
          <div className="lg:hidden">
            <StickyActionBar>
              <button
                type="submit"
                disabled={pending || loadingDirectory}
                className={`inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-md text-[14px] font-semibold text-white transition-colors disabled:opacity-60 ${
                  saveGreen ? "bg-ok hover:bg-ok/90" : "bg-accent hover:bg-accent-hover"
                }`}
              >
                {saveLabel}
              </button>
            </StickyActionBar>
          </div>
        </form>
      </Modal>
    </>
  );
}

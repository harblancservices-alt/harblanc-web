"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BTN_NEUTRAL, BTN_ACTION, EmptyState } from "../../_shell/ui";
import { LABEL, CONTROL } from "../../_shell/form";
import { IconContacts, IconMail, IconMore, IconPhone, IconPlus } from "../../_shell/icons";
import { digitsForTel, type PhoneEntry, type LinkEntry } from "../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { ContactDialog, type ContactDefaults } from "./ContactDialog";
import { LogCallDialog } from "../../calls/LogCallDialog";
import { TaskDialog, type TaskContactOption } from "../../tasks/TaskDialog";
import { TaskRow, type CrmTaskItem } from "../../tasks/TaskRow";
import { ActivityLogSection, type CrmActivityLogItem } from "./ActivityLogSection";
import { NotesTab, type CrmNoteItem } from "./NotesTab";
import { deleteContact } from "../actions";
import type { RepOption } from "../CompanyDialog";
import { ContactAvatar } from "../../_shell/ContactAvatar";

export type CrmContact = ContactDefaults & {
  id: string;
  name: string;
  phones: PhoneEntry[];
  links: LinkEntry[];
};

const SUB_TABS = ["activity", "tasks", "notes"] as const;
type SubTab = (typeof SUB_TABS)[number];
const SUB_TAB_LABEL: Record<SubTab, string> = { activity: "Activity", tasks: "Tasks", notes: "Notes" };

/** Small "More" popover — Edit / Delete for the selected contact. Same
 * outside-click/Escape pattern as CompanyMoreMenu.tsx.
 *
 * 2026-08-10 bugfix: the popover's Edit item used to live inside
 * `{open && (...)}` — a conditional MOUNT, not just a visibility toggle. The
 * Edit button's onClick set `open` to false (closing the popover) and called
 * ContactDialog's `openDialog()` (to open its Modal) in the same handler;
 * both state updates land in the same React commit, but the popover closing
 * unmounts ContactDialog itself, destroying the "please open" state before
 * the Modal ever renders. Net effect: Edit visibly did nothing. Fix: the
 * popover panel now always stays mounted (toggled with the `hidden` class
 * instead of being removed from the tree), so ContactDialog — and its
 * Modal — survive the popover closing. */
function ContactMoreMenu({
  contact,
  accountId,
  canDelete,
  onDeleted,
}: {
  contact: CrmContact;
  accountId: string;
  canDelete: boolean;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function remove() {
    if (!window.confirm(`Are you sure you want to delete ${contact.name}? This can't be undone from here.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteContact(contact.id, accountId);
      if (res.ok) {
        setOpen(false);
        onDeleted();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-fg-subtle bg-card text-fg-muted transition-colors hover:bg-inset hover:text-fg"
      >
        <IconMore width={16} height={16} />
      </button>
      {/* Always mounted (visibility toggled via `hidden`, not a conditional
          render) — see the bugfix note above; ContactDialog must stay in the
          tree across popover open/close for its own Modal state to survive. */}
      <div className={`absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line-strong bg-card shadow-e3 ${open ? "" : "hidden"}`}>
        <ContactDialog
          accountId={accountId}
          mode="edit"
          defaults={contact}
          trigger={(openDialog) => (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openDialog();
              }}
              className="block w-full px-4 py-3 text-left text-[13px] font-semibold text-fg hover:bg-inset"
            >
              Edit
            </button>
          )}
        />
        {canDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="block w-full border-t border-line-strong px-4 py-3 text-left text-[13px] font-semibold text-bad hover:bg-bad-bg disabled:opacity-60"
          >
            {pending ? "…" : "Delete"}
          </button>
        )}
      </div>
      {error && <p className="absolute right-0 top-full mt-1 w-44 text-[11.5px] text-bad">{error}</p>}
    </div>
  );
}

/**
 * The CENTER column's default "Contacts" tab — a master-detail layout
 * (Brent's reference design). Left: search + roster (initial badge, name,
 * role/title), selectable. Right: the selected contact's own mini-profile —
 * Email/Call/More, Email/Phone rows, and an Activity/Tasks/Notes sub-tab
 * strip scoped to just that contact (client-side filtered from the SAME
 * account-wide arrays the Timeline/Tasks/Notes tabs use — no extra queries).
 * "Department"/"Reports To" from the reference aren't rendered — crm_contacts
 * has no such columns. "Emails"/"Files" sub-tabs are omitted the same way —
 * contacts don't carry their own documents or a logged-email record.
 */
export function ContactsMasterDetail({
  accountId,
  contacts,
  contactOptions,
  activityItems,
  tasks,
  notes,
  reps,
  canAssignOthers,
  canDelete,
  currentUser,
}: {
  accountId: string;
  contacts: CrmContact[];
  contactOptions: TaskContactOption[];
  activityItems: CrmActivityLogItem[];
  tasks: CrmTaskItem[];
  notes: CrmNoteItem[];
  reps: RepOption[];
  canAssignOthers: boolean;
  canDelete: boolean;
  currentUser: { id: string; label: string };
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(contacts[0]?.id ?? null);
  const [subTab, setSubTab] = useState<SubTab>("activity");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.title ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [contacts, query]);

  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const primaryPhone = selected?.phones[0] ?? null;

  const contactActivity = useMemo(
    () => (selectedId ? activityItems.filter((a) => a.contactId === selectedId) : []),
    [activityItems, selectedId],
  );
  const contactTasks = useMemo(
    () => (selectedId ? tasks.filter((t) => t.contact_id === selectedId) : []),
    [tasks, selectedId],
  );
  const contactNotes = useMemo(
    () => (selectedId ? notes.filter((n) => n.contactId === selectedId) : []),
    [notes, selectedId],
  );

  if (contacts.length === 0) {
    return (
      <EmptyState
        icon={<IconContacts />}
        title="No contacts yet"
        body="Add the people you talk to at this company."
        action={
          <ContactDialog
            accountId={accountId}
            mode="create"
            trigger={(open) => (
              <button type="button" onClick={open} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_ACTION}`}>
                <IconPlus width={14} height={14} />
                Add contact
              </button>
            )}
          />
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
      {/* Left — search + roster */}
      <div className="flex flex-col border-b border-line-strong md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <p className="text-[13px] font-bold text-fg">Contacts ({contacts.length})</p>
          <ContactDialog
            accountId={accountId}
            mode="create"
            trigger={(open) => (
              <button type="button" onClick={open} aria-label="Add contact" className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${BTN_ACTION}`}>
                <IconPlus width={14} height={14} />
              </button>
            )}
          />
        </div>
        <div className="px-4 pb-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts…"
            aria-label="Search contacts"
            className={`h-9 w-full min-w-0 ${CONTROL}`}
          />
        </div>
        <ul className="flex max-h-[480px] flex-col overflow-y-auto border-t border-line-strong">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-[13px] text-fg-muted">No matches.</li>
          ) : (
            filtered.map((c) => {
              const isSelected = c.id === selectedId;
              const cardPhone = c.phones[0] ?? null;
              return (
                <li
                  key={c.id}
                  className={`flex w-full min-w-0 items-center gap-1 border-b border-line-strong pr-2 transition-colors ${
                    isSelected ? "bg-accent/10" : "hover:bg-inset"
                  }`}
                >
                  {/* Selects the contact — a sibling of the tel:/mailto: links
                      below (not a parent), since nesting <a> inside <button>
                      is invalid HTML and would break the tap targets. */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(c.id);
                      setSubTab("activity");
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3 text-left"
                  >
                    <ContactAvatar className="h-9 w-9" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-fg">{c.name}</span>
                      {c.title && <span className="block truncate text-[11.5px] text-fg-muted">{c.title}</span>}
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    {cardPhone && (
                      <a
                        href={`tel:${digitsForTel(cardPhone.number)}`}
                        aria-label={`Call ${c.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#2563eb]/30 text-[#2563eb] transition-colors hover:bg-[#2563eb]/10"
                      >
                        <IconPhone width={14} height={14} />
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        aria-label={`Email ${c.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#2563eb]/30 text-[#2563eb] transition-colors hover:bg-[#2563eb]/10"
                      >
                        <IconMail width={14} height={14} />
                      </a>
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* Right — selected contact panel */}
      <div className="min-w-0 p-5">
        {!selected ? (
          <p className="py-10 text-center text-[13px] text-fg-muted">Select a contact.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <ContactAvatar className="h-12 w-12" />
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-bold text-fg">{selected.name}</p>
                  {selected.title && <p className="text-[13px] text-fg-muted">{selected.title}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selected.email ? (
                  <a href={`mailto:${selected.email}`} className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${BTN_ACTION}`}>
                    <IconMail width={13} height={13} />
                    Email
                  </a>
                ) : null}
                {primaryPhone ? (
                  <a href={`tel:${digitsForTel(primaryPhone.number)}`} className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${BTN_ACTION}`}>
                    <IconPhone width={13} height={13} />
                    Call
                  </a>
                ) : null}
                <LogCallDialog
                  accountId={accountId}
                  contactId={selected.id}
                  trigger={(open) => (
                    <button type="button" onClick={open} className={`inline-flex h-10 items-center rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${BTN_NEUTRAL}`}>
                      Log call
                    </button>
                  )}
                />
                <TaskDialog
                  mode="create"
                  accountId={accountId}
                  contacts={contactOptions}
                  reps={reps}
                  canAssignOthers={canAssignOthers}
                  currentUser={currentUser}
                  defaults={{ contact_id: selected.id }}
                  trigger={(open) => (
                    <button type="button" onClick={open} className={`inline-flex h-10 items-center rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${BTN_NEUTRAL}`}>
                      Add task
                    </button>
                  )}
                />
                <ContactMoreMenu
                  contact={selected}
                  accountId={accountId}
                  canDelete={canDelete}
                  onDeleted={() => setSelectedId(contacts.find((c) => c.id !== selected.id)?.id ?? null)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-line-strong pt-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Email</p>
                <p className="mt-1 text-[13.5px]">
                  {selected.email ? (
                    <a href={`mailto:${selected.email}`} className="text-accent hover:underline">
                      {selected.email}
                    </a>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Phone</p>
                <p className="mt-1 text-[13.5px]">
                  {primaryPhone ? (
                    <a href={`tel:${digitsForTel(primaryPhone.number)}`} className="font-mono text-accent hover:underline">
                      {formatPhone(primaryPhone.number)}
                    </a>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </p>
              </div>
            </div>

            <div>
              <div role="tablist" aria-label="Contact sections" className="flex gap-1 border-b border-line-strong">
                {SUB_TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={subTab === t}
                    onClick={() => setSubTab(t)}
                    className={`px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                      subTab === t ? "border-b-2 border-accent text-accent" : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    {SUB_TAB_LABEL[t]}
                  </button>
                ))}
              </div>
              <div className="pt-2">
                {subTab === "activity" && (
                  <ActivityLogSection accountId={accountId} items={contactActivity} emptyMessage="No activity with this contact yet." />
                )}
                {subTab === "tasks" && (
                  <ul className="flex flex-col gap-2 py-2">
                    {contactTasks.length === 0 ? (
                      <p className="py-6 text-center text-[13px] text-fg-muted">No tasks tied to this contact.</p>
                    ) : (
                      contactTasks.map((t) => (
                        <TaskRow key={t.id} task={t} accountId={accountId} reps={reps} contacts={contactOptions} canAssignOthers={canAssignOthers} currentUser={currentUser} />
                      ))
                    )}
                  </ul>
                )}
                {subTab === "notes" && <NotesTab accountId={accountId} contactId={selected.id} contactName={selected.name} notes={contactNotes} />}
              </div>
              <Link href={`/crm/contacts/${selected.id}`} prefetch={false} className="mt-2 inline-block text-[12.5px] font-semibold text-accent hover:underline">
                View all activity →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN_EDIT, BTN_PRIMARY, Card, CardHead, ZEBRA_ROWS } from "../../_shell/ui";
import { LABEL, CONTROL, CONTROL_SIZE } from "../../_shell/compactForm";
import { LabelPicker } from "../../_shell/LabelPicker";
import { PHONE_LABEL_PRESETS, digitsForTel, type PhoneEntry } from "../../_shell/contactFields";
import { assignCompanyPhoneToContact, createContactFromPhone } from "../actions";
import { formatPhone } from "@/lib/domain/phone";

export type StrayContactOption = { id: string; name: string };

/**
 * Company-level numbers (crm_accounts.phones) that aren't tied to a person —
 * every number here IS company-level by definition, so this section is just
 * the whole company phones list surfaced with two escape hatches: move a
 * number onto an existing contact, or spin up a brand-new contact from it.
 * Lives on the profile's Contacts tab, next to the people list it feeds.
 */
export function StrayNumbersSection({
  accountId,
  phones,
  contacts,
}: {
  accountId: string;
  phones: PhoneEntry[];
  contacts: StrayContactOption[];
}) {
  if (!phones.length) return null;

  return (
    <Card>
      <CardHead
        title="Stray numbers"
        hint="Company numbers not tied to a person — assign one to a contact or create a contact from it."
      />
      <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
        {phones.map((p) => (
          <StrayNumberRow
            key={`${p.label}:${p.number}`}
            accountId={accountId}
            phone={p}
            contacts={contacts}
          />
        ))}
      </ul>
    </Card>
  );
}

function StrayNumberRow({
  accountId,
  phone,
  contacts,
}: {
  accountId: string;
  phone: PhoneEntry;
  contacts: StrayContactOption[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState(phone.label);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "assign" | "new">("idle");
  const [targetContactId, setTargetContactId] = useState("");
  const [newName, setNewName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function toggleMode(next: "assign" | "new") {
    setError(null);
    setMode((prev) => (prev === next ? "idle" : next));
  }

  function doAssign() {
    if (!targetContactId) return;
    setError(null);
    startTransition(async () => {
      const res = await assignCompanyPhoneToContact(
        accountId,
        phone.number,
        label,
        targetContactId,
      );
      if (res.ok) {
        setMode("idle");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function doCreate() {
    if (!newName.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createContactFromPhone(accountId, {
        name: newName.trim(),
        title: newTitle.trim() || null,
        label,
        number: phone.number,
      });
      if (res.ok) {
        setMode("idle");
        setNewName("");
        setNewTitle("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`tel:${digitsForTel(phone.number)}`}
          className="shrink-0 font-mono text-[14px] font-semibold text-accent hover:underline"
        >
          {formatPhone(phone.number)}
        </a>
        <div className="w-44">
          <LabelPicker value={label} onChange={setLabel} presets={PHONE_LABEL_PRESETS} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggleMode("assign")}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
          >
            Assign to contact
          </button>
          <button
            type="button"
            onClick={() => toggleMode("new")}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
          >
            New contact from this
          </button>
        </div>
      </div>

      {error && <p className="text-[12.5px] text-bad">{error}</p>}

      {mode === "assign" && (
        <div className="flex flex-wrap items-center gap-2 bg-inset p-3">
          <select
            value={targetContactId}
            onChange={(e) => setTargetContactId(e.target.value)}
            className={`flex-1 ${CONTROL_SIZE} ${CONTROL}`}
          >
            <option value="">Select a contact…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={doAssign}
            disabled={pending || !targetContactId}
            className={`h-9 shrink-0 rounded-md px-3 text-[12.5px] font-semibold transition-colors ${BTN_PRIMARY}`}
          >
            {pending ? "…" : "Move number"}
          </button>
        </div>
      )}

      {mode === "new" && (
        <div className="flex flex-col gap-2 bg-inset p-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className={LABEL}>Name</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              className={`${CONTROL_SIZE} ${CONTROL}`}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className={LABEL}>Title</span>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className={`${CONTROL_SIZE} ${CONTROL}`}
            />
          </label>
          <button
            type="button"
            onClick={doCreate}
            disabled={pending}
            className={`h-9 shrink-0 rounded-md px-3 text-[12.5px] font-semibold transition-colors ${BTN_PRIMARY}`}
          >
            {pending ? "…" : "Create contact"}
          </button>
        </div>
      )}
    </li>
  );
}

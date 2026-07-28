"use client";

import { CONTROL, LABEL } from "../_shell/form";
import type { ParsedLeadWithMatches } from "./actions";

export type DraftLead = ParsedLeadWithMatches & {
  /** Stable client-side key — the parsed lead has no id of its own. */
  _id: string;
  /** "" = create a new company; otherwise an existing crm_accounts.id. */
  companyChoice: string;
};

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={LABEL}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`h-10 ${CONTROL}`}
      />
    </label>
  );
}

/**
 * One editable lead card in the Field Capture review step. The "Company"
 * selector drives what gets saved: pick an existing match (or force "New
 * company") and the account-level fields hide, since attaching to an
 * existing company only ever adds a contact — matching saveFieldCapture's
 * two save paths exactly, so the form never implies work it won't do.
 */
export function ReviewLeadCard({
  lead,
  onChange,
  onRemove,
}: {
  lead: DraftLead;
  onChange: (id: string, patch: Partial<DraftLead>) => void;
  onRemove: (id: string) => void;
}) {
  function set<K extends keyof DraftLead>(key: K, value: DraftLead[K]) {
    onChange(lead._id, { [key]: value } as Partial<DraftLead>);
  }

  const isNewCompany = lead.companyChoice === "";

  return (
    <div className="rounded-2xl border border-line-strong bg-card p-4 shadow-e2">
      <div className="flex items-start justify-between gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className={LABEL}>Company</span>
          <select
            value={lead.companyChoice}
            onChange={(e) => set("companyChoice", e.target.value)}
            className={`h-10 ${CONTROL}`}
          >
            <option value="">+ New company: {lead.company_name || "Unnamed"}</option>
            {lead.matches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {[m.city, m.state].filter(Boolean).length
                  ? ` (${[m.city, m.state].filter(Boolean).join(", ")})`
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onRemove(lead._id)}
          className="mt-6 shrink-0 rounded-lg border border-line-strong px-2.5 py-1.5 text-[12px] font-semibold text-fg-subtle transition-colors hover:bg-inset hover:text-fg"
        >
          Remove
        </button>
      </div>

      {isNewCompany && (
        <div className="mt-3 flex flex-col gap-3">
          <TextInput
            label="Company name"
            value={lead.company_name}
            onChange={(v) => set("company_name", v)}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput label="Website" value={lead.website} onChange={(v) => set("website", v)} />
            <TextInput label="Industry" value={lead.industry} onChange={(v) => set("industry", v)} />
          </div>
          <TextInput label="Address" value={lead.address} onChange={(v) => set("address", v)} />
          <div className="grid grid-cols-3 gap-3">
            <TextInput label="City" value={lead.city} onChange={(v) => set("city", v)} />
            <TextInput label="State" value={lead.state} onChange={(v) => set("state", v)} />
            <TextInput label="Zip" value={lead.zip} onChange={(v) => set("zip", v)} />
          </div>
          <TextInput
            label="Commodities"
            value={lead.commodities}
            onChange={(v) => set("commodities", v)}
            placeholder="e.g. steel coils, machinery"
          />
        </div>
      )}

      <div className="mt-3 border-t border-line-strong pt-3">
        <p className={`${LABEL} mb-2`}>Contact</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput
            label="Name"
            value={lead.contact_name}
            onChange={(v) => set("contact_name", v)}
          />
          <TextInput
            label="Title"
            value={lead.contact_title}
            onChange={(v) => set("contact_title", v)}
          />
          <TextInput
            label="Phone"
            type="tel"
            value={lead.contact_phone}
            onChange={(v) => set("contact_phone", v)}
          />
          <TextInput
            label="Email"
            type="email"
            value={lead.contact_email}
            onChange={(v) => set("contact_email", v)}
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Notes</span>
          <textarea
            value={lead.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            className={`resize-y py-2 leading-relaxed ${CONTROL}`}
          />
        </label>
      </div>
    </div>
  );
}

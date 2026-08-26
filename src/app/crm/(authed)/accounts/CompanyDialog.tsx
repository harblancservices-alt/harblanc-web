"use client";

import { useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "../_shell/Modal";
import {
  Field,
  SelectField,
  SubmitButton,
  FormError,
} from "../_shell/form";
import {
  SectionDivider,
  LABEL,
  CONTROL,
  CONTROL_SIZE,
  PILL,
  PILL_SIZE,
  PILL_ACTIVE,
  PILL_INACTIVE,
} from "../_shell/compactForm";
import { PhonesEditor } from "../_shell/PhonesEditor";
import { LinksEditor } from "../_shell/LinksEditor";
import { looksLikePhone, type PhoneEntry, type LinkEntry } from "../_shell/contactFields";
import { createAccount, updateAccount, deleteAccount, findPossibleDuplicates, type DuplicateMatch } from "./actions";
import { LIFECYCLE_STAGES, LIFECYCLE_LABEL, DEFAULT_LIFECYCLE } from "./lifecycle";
import { BTN_DANGER, BTN_NEUTRAL } from "../_shell/ui";

export type CompanyDefaults = {
  id?: string;
  name?: string | null;
  industry?: string | null;
  company_type?: string | null;
  email?: string | null;
  phones?: PhoneEntry[];
  links?: LinkEntry[];
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  company_size?: string | null;
  commodities?: string | null;
  annual_freight_spend?: number | null;
  revenue_potential?: number | null;
  source?: string | null;
  lifecycle_status?: string | null;
  assigned_user_id?: string | null;
  /** Folded in 2026-08-26 from the second, smaller company form
   * (CompanyProfileDialog), which owned exactly these four and nothing else.
   * One company, one edit form. */
  dba?: string | null;
  linkedin_url?: string | null;
  year_founded?: number | null;
  ownership_type?: string | null;
};

/** Freight-fit classification. A plain text column with no DB check
 * constraint, same reasoning as lifecycle's "quoted" stage (see
 * lifecycle.ts). No "Carrier" — Brent's correction, that's not a thing here. */
export const COMPANY_TYPES = ["Shipper", "Customer", "Prospect", "Vendor", "Partner", "Other"] as const;

/** Preset options for the simplified CREATE form's Industry tap-pill picker
 * (see IndustryPicker below). Plain text column, no DB check constraint —
 * same reasoning as COMPANY_TYPES. */
export const INDUSTRY_PRESETS = [
  "Manufacturing",
  "Metal / Steel",
  "Agriculture",
  "Construction",
  "Warehousing / 3PL",
  "Food & Bev",
  "Retail",
  "Other",
] as const;

export type RepOption = { id: string; label: string };

/**
 * Single-select tap-pill industry picker, used only by the simplified CREATE
 * form — same PILL/PILL_ACTIVE tap-to-select chrome as MultiSelectChips/
 * RoleControl, just single-value instead of multi. The free-text input below
 * shares state with the pills: tapping a preset fills it, typing overrides
 * whatever preset was tapped (tapping the active preset again clears it).
 */
function IndustryPicker({ name, defaultValue }: { name: string; defaultValue?: string | null }) {
  const [value, setValue] = useState(defaultValue ?? "");

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>Industry</span>
      <div className="flex flex-wrap gap-2">
        {INDUSTRY_PRESETS.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={active}
              onClick={() => setValue(active ? "" : opt)}
              className={`${PILL} ${PILL_SIZE} ${active ? PILL_ACTIVE : PILL_INACTIVE}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="…or type your own"
        className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
      />
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

/**
 * The company create/edit dialog — ONE full-field form reused for both. In
 * "create" mode it inserts and routes to the new profile; in "edit" mode it
 * updates the existing record in place. The trigger is a render prop so the
 * list (a primary "Add company" button) and the profile (a secondary "Edit"
 * button) can style their own openers while sharing this form.
 */
export function CompanyDialog({
  mode,
  reps,
  defaults,
  /** Show the destructive "Delete company" footer action — owner-only,
   * edit mode only. The server action re-checks the role regardless. */
  canDelete = false,
  /** Show the "Assigned rep" select — owner-only, edit mode only (create
   * mode's simplified form has no Assignment section at all; a new company
   * still defaults to its creator in createAccount).
   *
   * Cosmetic, exactly like canDelete: hiding the field keeps a non-admin
   * from being offered a change they're not allowed to make, but
   * updateAccount() re-checks the rule server-side and the
   * crm_accounts_guard_assignment trigger re-checks it again at the DB.
   * Non-admins change ownership through the profile's own Claim control
   * (desktop/AssignmentControl.tsx), which is the only assignment surface
   * they get. */
  canAssign = false,
  trigger,
}: {
  mode: "create" | "edit";
  reps: RepOption[];
  defaults?: CompanyDefaults;
  canDelete?: boolean;
  canAssign?: boolean;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);
  const pendingFormData = useRef<FormData | null>(null);
  const router = useRouter();

  const d = defaults ?? {};

  async function save(formData: FormData) {
    const result =
      mode === "create"
        ? await createAccount(formData)
        : await updateAccount(d.id as string, formData);

    if (result.ok) {
      setOpen(false);
      setDuplicates(null);
      if (mode === "create" && "id" in result) {
        router.push(`/crm/accounts/${result.id}`);
      } else {
        router.refresh();
      }
    } else {
      setError(result.error);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);

    if (mode !== "create") {
      startTransition(() => save(formData));
      return;
    }

    // Basic duplicate check on NEW companies only — name + phone (the
    // simplified create form has no separate email field) against existing
    // accounts (see findPossibleDuplicates). A warning, not a block: the rep
    // can always proceed via "Create anyway" below.
    pendingFormData.current = formData;
    startTransition(async () => {
      setCheckingDup(true);
      const name = String(formData.get("name") ?? "").trim();
      const contactValue = String(formData.get("contact_value") ?? "").trim();
      const phone = contactValue && looksLikePhone(contactValue) ? contactValue : null;
      const found = await findPossibleDuplicates(name, phone, null);
      setCheckingDup(false);
      if (found.length > 0) {
        setDuplicates(found);
        return;
      }
      await save(formData);
    });
  }

  function createAnyway() {
    if (!pendingFormData.current) return;
    setDuplicates(null);
    startTransition(() => save(pendingFormData.current as FormData));
  }

  function onDelete() {
    if (!d.id) return;
    if (
      !window.confirm(
        `Delete ${d.name || "this company"}? This can't be undone from here.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount(d.id as string);
      if (result.ok) {
        setOpen(false);
        router.push("/crm/accounts");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      {trigger(() => {
        setError(null);
        setDuplicates(null);
        setOpen(true);
      })}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={pending}
        title={mode === "create" ? "New company" : "Edit company"}
      >
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {mode === "create" ? (
            <div className="flex flex-col gap-3">
              <Field
                label="Company name"
                name="name"
                required
                autoFocus
                defaultValue={d.name}
              />
              <IndustryPicker name="industry" defaultValue={d.industry} />
              <Field
                label="Website or phone"
                name="contact_value"
                placeholder="e.g. acmesteel.com or (555) 123-4567"
              />
              <Field label="Address" name="address" />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <SectionDivider label="Identity" bare />
                <Field
                  label="Company name"
                  name="name"
                  required
                  autoFocus
                  defaultValue={d.name}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field label="Industry" name="industry" defaultValue={d.industry} />
                  <SelectField label="Company type" name="company_type" defaultValue={d.company_type ?? ""}>
                    <option value="">Not set</option>
                    {COMPANY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <SectionDivider label="Contact" bare />
                <Field
                  label="Company email"
                  name="email"
                  type="email"
                  inputMode="email"
                  defaultValue={d.email}
                />
                <PhonesEditor defaultValue={d.phones} />
                <LinksEditor defaultValue={d.links} />
              </div>

              <div className="flex flex-col gap-2">
                <SectionDivider label="Location" bare />
                <Field label="Address" name="address" defaultValue={d.address} />
                <div className="grid grid-cols-6 gap-2">
                  <div className="col-span-3">
                    <Field label="City" name="city" defaultValue={d.city} />
                  </div>
                  <div className="col-span-1">
                    <Field label="State" name="state" defaultValue={d.state} />
                  </div>
                  <div className="col-span-2">
                    <Field label="ZIP" name="zip" defaultValue={d.zip} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <SectionDivider label="Commercial" bare />
                <Field
                  label="Commodities hauled"
                  name="commodities"
                  placeholder="e.g. Reefer, Dry van, Flatbed"
                  defaultValue={d.commodities}
                />
                <Field
                  label="Company size"
                  name="company_size"
                  placeholder="e.g. 11–50"
                  defaultValue={d.company_size}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Annual freight spend ($)"
                    name="annual_freight_spend"
                    inputMode="decimal"
                    defaultValue={d.annual_freight_spend ?? undefined}
                  />
                  <Field
                    label="Revenue potential ($)"
                    name="revenue_potential"
                    inputMode="decimal"
                    defaultValue={d.revenue_potential ?? undefined}
                  />
                </div>
                <Field
                  label="Source"
                  name="source"
                  placeholder="e.g. Referral, Cold call, Web"
                  defaultValue={d.source}
                />
              </div>

              {/* THE SECOND FORM'S FIELDS, FOLDED IN (2026-08-26). These four
                  lived in CompanyProfileDialog, opened from the profile's own
                  "Company profile" grid — so the page had two edit forms and
                  no way to tell which one owned a given field. There is one
                  form now. */}
              <div className="flex flex-col gap-2">
                <SectionDivider label="Registered details" bare />
                <Field label="Trading name (DBA)" name="dba" defaultValue={d.dba} />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Year founded"
                    name="year_founded"
                    inputMode="numeric"
                    defaultValue={d.year_founded ?? undefined}
                  />
                  <Field label="Ownership" name="ownership_type" defaultValue={d.ownership_type} />
                </div>
                <Field
                  label="LinkedIn"
                  name="linkedin_url"
                  placeholder="linkedin.com/company/…"
                  defaultValue={d.linkedin_url}
                />
              </div>

              <div className="flex flex-col gap-2">
                <SectionDivider label="Assignment" bare />
                <div className={`grid grid-cols-1 gap-2 ${canAssign ? "sm:grid-cols-2" : ""}`}>
                  <SelectField
                    label="Lifecycle"
                    name="lifecycle_status"
                    defaultValue={d.lifecycle_status ?? DEFAULT_LIFECYCLE}
                  >
                    {LIFECYCLE_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {LIFECYCLE_LABEL[s]}
                      </option>
                    ))}
                  </SelectField>
                  {canAssign && (
                    <SelectField
                      label="Assigned rep"
                      name="assigned_user_id"
                      defaultValue={d.assigned_user_id ?? ""}
                    >
                      <option value="">Unassigned</option>
                      {reps.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </SelectField>
                  )}
                </div>
              </div>
            </>
          )}

          {duplicates && duplicates.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-warn/40 bg-warn-bg px-3.5 py-3">
              <p className="text-[13px] font-semibold text-warn">This might already be a company here:</p>
              <ul className="flex flex-col gap-1">
                {duplicates.map((m) => (
                  <li key={m.id} className="text-[12.5px] text-fg">
                    <Link href={`/crm/accounts/${m.id}`} target="_blank" className="font-semibold text-accent hover:underline">
                      {m.name}
                    </Link>{" "}
                    <span className="text-fg-muted">— matches on {m.matchedOn.join(", ")}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicates(null)}
                  className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_NEUTRAL}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createAnyway}
                  disabled={pending}
                  className="rounded-lg bg-warn px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
                >
                  Create anyway
                </button>
              </div>
            </div>
          )}

          {(!duplicates || duplicates.length === 0) && (
            <SubmitButton pending={pending} pendingLabel={checkingDup ? "Checking…" : "Saving…"}>
              {mode === "create" ? "Save company" : "Save changes"}
            </SubmitButton>
          )}

          {mode === "edit" && canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className={`rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${BTN_DANGER}`}
            >
              Delete company
            </button>
          )}
        </form>
      </Modal>
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_shell/Modal";
import {
  Field,
  SelectField,
  SubmitButton,
  FormError,
} from "../_shell/form";
import { PhonesEditor } from "../_shell/PhonesEditor";
import { LinksEditor } from "../_shell/LinksEditor";
import type { PhoneEntry, LinkEntry } from "../_shell/contactFields";
import { createAccount, updateAccount, deleteAccount } from "./actions";
import { LIFECYCLE_STAGES, LIFECYCLE_LABEL, DEFAULT_LIFECYCLE } from "./lifecycle";
import { BTN_DANGER } from "../_shell/ui";

export type CompanyDefaults = {
  id?: string;
  name?: string | null;
  industry?: string | null;
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
};

export type RepOption = { id: string; label: string };

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
  trigger,
}: {
  mode: "create" | "edit";
  reps: RepOption[];
  defaults?: CompanyDefaults;
  canDelete?: boolean;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const d = defaults ?? {};

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createAccount(formData)
          : await updateAccount(d.id as string, formData);

      if (result.ok) {
        setOpen(false);
        if (mode === "create" && "id" in result) {
          router.push(`/crm/accounts/${result.id}`);
        } else {
          router.refresh();
        }
      } else {
        setError(result.error);
      }
    });
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
          <Field
            label="Company name"
            name="name"
            required
            autoFocus
            defaultValue={d.name}
          />
          <Field label="Industry" name="industry" defaultValue={d.industry} />

          <PhonesEditor defaultValue={d.phones} />
          <LinksEditor defaultValue={d.links} />

          <Field label="Address" name="address" defaultValue={d.address} />
          <div className="grid grid-cols-6 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </div>

          <SubmitButton pending={pending}>
            {mode === "create" ? "Save company" : "Save changes"}
          </SubmitButton>

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

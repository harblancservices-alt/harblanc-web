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
import { createAccount, updateAccount } from "./actions";
import { LIFECYCLE_STAGES, LIFECYCLE_LABEL, DEFAULT_LIFECYCLE } from "./lifecycle";

export type CompanyDefaults = {
  id?: string;
  name?: string | null;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  dot_number?: string | null;
  mc_number?: string | null;
  company_size?: string | null;
  fleet_size?: number | null;
  annual_freight_spend?: number | null;
  revenue_potential?: number | null;
  current_carrier?: string | null;
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
  trigger,
}: {
  mode: "create" | "edit";
  reps: RepOption[];
  defaults?: CompanyDefaults;
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Industry" name="industry" defaultValue={d.industry} />
            <Field
              label="Phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={d.phone}
            />
          </div>
          <Field
            label="Website"
            name="website"
            placeholder="https://"
            inputMode="url"
            defaultValue={d.website}
          />

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

          <div className="grid grid-cols-2 gap-3">
            <Field label="DOT number" name="dot_number" defaultValue={d.dot_number} />
            <Field label="MC number" name="mc_number" defaultValue={d.mc_number} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Company size"
              name="company_size"
              placeholder="e.g. 11–50"
              defaultValue={d.company_size}
            />
            <Field
              label="Fleet size"
              name="fleet_size"
              inputMode="numeric"
              defaultValue={d.fleet_size ?? undefined}
            />
          </div>

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
            label="Current carrier"
            name="current_carrier"
            defaultValue={d.current_carrier}
          />
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
        </form>
      </Modal>
    </>
  );
}

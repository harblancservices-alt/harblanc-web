"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_shell/Modal";
import { Field, SubmitButton, FormError } from "../_shell/form";
import { updateBrokerProfile } from "./actions";
import type { BrokerProfile } from "../_shell/brokerProfile";

/**
 * Admin-only edit dialog for the org's broker letterhead (crm_broker_profile)
 * — company name, MC #, DOT #, address. This is the permanent source both
 * the Bill of Lading and Rate Confirmation doc headers read from, so saving
 * here updates both documents immediately.
 */
export function BrokerProfileDialog({
  profile,
  trigger,
}: {
  profile: BrokerProfile;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updateBrokerProfile(formData);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
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
        title="Edit company / brokerage info"
      >
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <Field
            label="Company name"
            name="company_name"
            required
            autoFocus
            defaultValue={profile.name}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label="MC #" name="mc_number" defaultValue={profile.mc} />
            <Field label="DOT #" name="dot_number" defaultValue={profile.dot} />
          </div>
          <Field label="Address" name="address" defaultValue={profile.address} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Phone" name="phone" defaultValue={profile.phone} />
            <Field label="Email" name="email" defaultValue={profile.email} />
          </div>

          <SubmitButton pending={pending}>Save changes</SubmitButton>
        </form>
      </Modal>
    </>
  );
}

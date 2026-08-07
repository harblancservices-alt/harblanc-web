"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { Fab } from "@/components/tms-v2/ui/Fab";
import { createBroker } from "@/actions/tms-v2/brokers";
import type { MutationResult } from "@/lib/demo/mutation";
import { Field, FormError, FormActions } from "../loads/_form";

type SaveState = { ok: boolean; error: string | null; id: string | null };
const INITIAL: SaveState = { ok: false, error: null, id: null };

/** Header button (desktop) + Fab (mobile) for a dedicated "New broker" flow
 * — closes the audit's Critical Brokers gap (create was previously only
 * possible implicitly, incompletely, via the Load form's free-text field). */
export function NewBrokerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult<{ id: string }> = await createBroker(formData);
    return result.ok ? { ok: true, error: null, id: result.data?.id ?? null } : { ok: false, error: result.reason, id: null };
  }, INITIAL);

  useEffect(() => {
    if (state.ok && state.id) {
      setOpen(false);
      router.push(`/tms-v2/brokers/${state.id}`);
    }
  }, [state.ok, state.id, router]);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} className="hidden sm:inline-flex">
        + New broker
      </Button>
      <Fab label="New broker" onClick={() => setOpen(true)} className="sm:hidden" />

      <Modal open={open} onClose={() => setOpen(false)} title="New broker">
        <form action={formAction} className="flex flex-col gap-3">
          <Field label="Name" name="name" placeholder="Broker company name" required />
          <div className="grid grid-cols-2 gap-2">
            <Field label="MC #" name="mc_number" />
            <Field label="DOT #" name="dot_number" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Phone" name="phone" type="tel" />
            <Field label="Email" name="email" type="email" />
          </div>
          <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
            <input type="checkbox" name="factoring" className="h-4 w-4" />
            Factoring
          </label>
          <FormError message={state.error} />
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? "Creating…" : "Create broker"}
            </Button>
          </FormActions>
        </form>
      </Modal>
    </>
  );
}

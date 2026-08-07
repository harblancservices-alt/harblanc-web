"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { Fab } from "@/components/tms-v2/ui/Fab";
import { createTrip } from "@/actions/tms-v2/trips";
import type { MutationResult } from "@/lib/demo/mutation";
import { Field, FormError, FormActions } from "../loads/_form";

type SaveState = { ok: boolean; error: string | null; id: string | null };
const INITIAL: SaveState = { ok: false, error: null, id: null };

/** Header button (desktop) + Fab (mobile) that opens a dedicated "New trip"
 * form — closes the audit's #1 trip gap: previously a trip could only be
 * created implicitly, incompletely, via the Load form's free-text field. */
export function NewTripButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult<{ id: string }> = await createTrip(formData);
    return result.ok ? { ok: true, error: null, id: result.data?.id ?? null } : { ok: false, error: result.reason, id: null };
  }, INITIAL);

  useEffect(() => {
    if (state.ok && state.id) {
      setOpen(false);
      router.push(`/tms-v2/trips/${state.id}`);
    }
  }, [state.ok, state.id, router]);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} className="hidden sm:inline-flex">
        + New trip
      </Button>
      <Fab label="New trip" onClick={() => setOpen(true)} className="sm:hidden" />

      <Modal open={open} onClose={() => setOpen(false)} title="New trip">
        <form action={formAction} className="flex flex-col gap-3">
          <Field label="Name" name="name" placeholder="e.g. Dallas run" required />
          <Field label="Start date" name="start_date" type="date" />
          <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
            Notes
            <textarea
              name="notes"
              rows={3}
              className="rounded-md border border-line-strong bg-card px-2.5 py-2 text-[14px] text-fg focus:border-fg focus:outline-none"
            />
          </label>
          <FormError message={state.error} />
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? "Creating…" : "Create trip"}
            </Button>
          </FormActions>
        </form>
      </Modal>
    </>
  );
}

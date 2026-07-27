"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAccount } from "./actions";
import { IconPlus } from "../_shell/icons";

/**
 * "Add company" — Phase-1 create. A lightweight modal capturing the essentials
 * and calling the createAccount server action. Deliberately simple; the full
 * company record (DOT/MC, freight spend, tags, contacts) comes in later steps.
 */
export function AddCompany() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createAccount(formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        <IconPlus width={16} height={16} />
        Add company
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl border border-line bg-card p-5 shadow-e3 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-fg">New company</h2>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="rounded-md px-2 py-1 text-[13px] font-medium text-fg-subtle hover:text-fg"
              >
                Cancel
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-3 rounded-lg border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] text-bad"
              >
                {error}
              </div>
            )}

            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <Field label="Company name" name="name" required autoFocus />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Industry" name="industry" />
                <Field label="Phone" name="phone" type="tel" />
              </div>
              <Field label="Website" name="website" placeholder="https://" />
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="City" name="city" />
                </div>
                <Field label="State" name="state" />
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                  Lifecycle
                </span>
                <select
                  name="lifecycle_status"
                  defaultValue="lead"
                  className="h-11 rounded-lg border border-line-strong bg-card px-3 text-[14px] text-fg outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <option value="lead">Lead</option>
                  <option value="prospect">Prospect</option>
                  <option value="customer">Customer</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={pending}
                className="mt-1 inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-accent text-[14px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save company"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoFocus,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="h-11 rounded-lg border border-line-strong bg-card px-3 text-[14px] text-fg outline-none focus:ring-2 focus:ring-accent/40"
      />
    </label>
  );
}

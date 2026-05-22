"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { declineEstimate } from "./actions";

const labelCls =
  "block font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase";
const inputCls =
  "mt-2 block w-full bg-neutral-900 border border-neutral-800 px-3 py-2.5 text-base text-zinc-100 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none";

export function DeclineForm({
  token,
  initialReason,
  alreadyDeclined,
}: {
  token: string;
  initialReason: string | null;
  alreadyDeclined: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<boolean>(alreadyDeclined);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await declineEstimate(token, fd);
      if (result.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(result.reason);
      }
    });
  }

  if (done) {
    return (
      <div className="border-2 border-red-800 bg-red-950/30 p-6 sm:p-8">
        <p className="font-mono text-[10px] tracking-[0.22em] text-red-300 uppercase">
          Declined
        </p>
        <h2 className="mt-3 text-2xl font-display tracking-tight text-white sm:text-3xl">
          Got it — declined.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-red-100">
          Thanks for letting dispatch know. If anything changes — timing,
          budget, lane — reply to the original quote email and we&rsquo;ll
          take another look.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label className={labelCls} htmlFor="reason">
          Quick note (optional)
        </label>
        <textarea
          id="reason"
          name="reason"
          defaultValue={initialReason ?? ""}
          rows={4}
          placeholder="Pricing? Timing? Going a different direction? Anything helps dispatch on the next one."
          className={`${inputCls} resize-y`}
        />
        <p className="mt-2 text-xs text-neutral-500">
          Skip this if you&rsquo;d rather not say. The decline goes through
          either way.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 border border-red-700 bg-red-950/30 p-4"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
          />
          <p className="text-sm leading-relaxed text-red-200">{error}</p>
        </div>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-neutral-800 pt-6 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="btn-cut inline-flex items-center justify-center bg-red-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "Submitting…" : "Confirm decline"}
        </button>
      </div>
    </form>
  );
}

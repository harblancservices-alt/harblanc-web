"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmFinalizedQuote } from "./actions";

/**
 * Single muted-green Confirm Finalized Quote button. Calls the server
 * action confirmFinalizedQuote(token) inside a useTransition. The
 * action is idempotent — re-clicking a confirmed token returns ok and
 * router.refresh() re-renders the page in its confirmed state.
 *
 * Color treatment matches the email's Confirm action band (#166534
 * green-900 / #14532d border) so the button on the customer page reads
 * as the same visual moment as the button in the inbox.
 */
export function ConfirmButton({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onConfirm() {
    if (
      !confirm(
        "Confirm this finalized rate? Dispatch will follow up to coordinate scheduling.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await confirmFinalizedQuote(token);
        if (!result.ok) {
          setError(result.reason);
          return;
        }
        router.refresh();
      } catch (e) {
        // Re-throw Next.js redirect signals so the framework can navigate
        // (e.g. session-expiry redirects to login from middleware).
        if (
          e &&
          typeof e === "object" &&
          typeof (e as { digest?: unknown }).digest === "string" &&
          ((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")
        ) {
          throw e;
        }
        setError(
          e instanceof Error
            ? e.message
            : "Could not record the confirmation. Try again or contact dispatch.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={onConfirm}
        disabled={isPending}
        className="inline-flex items-center justify-center border border-[#14532d] bg-[#166534] px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#15803d] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {isPending ? "Confirming…" : "Confirm finalized quote"}
      </button>
      {error ? (
        <p
          role="alert"
          className="font-mono text-[11px] font-semibold uppercase tracking-wide text-red-400"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

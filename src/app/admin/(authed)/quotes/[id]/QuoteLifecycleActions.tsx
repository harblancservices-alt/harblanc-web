"use client";

/**
 * Phase BUTTON-FIX-1: client wrapper around the three lifecycle
 * server actions (softDeleteQuote / restoreQuote / permanentlyDeleteQuote)
 * so we can interpose a confirm() dialog before each submit.
 *
 * The server actions themselves are passed in as already-bound props
 * (e.g. `softDeleteQuote.bind(null, row.id)`). This component does NOT
 * change action signatures, redirects, or revalidation — it only adds a
 * confirm step on the client. If the operator cancels, e.preventDefault()
 * stops the form submission and the server is never reached.
 */
export function QuoteLifecycleActions({
  isTrashed,
  softDelete,
  restore,
  permanentDelete,
}: {
  isTrashed: boolean;
  softDelete: () => Promise<void>;
  restore: () => Promise<void>;
  permanentDelete: () => Promise<void>;
}) {
  function confirmTrash(e: React.FormEvent<HTMLFormElement>) {
    if (
      !confirm(
        "Move this lead to trash? You can restore it later.",
      )
    ) {
      e.preventDefault();
    }
  }

  function confirmPermanentDelete(e: React.FormEvent<HTMLFormElement>) {
    if (
      !confirm(
        "Permanently delete this lead and all attached records? This cannot be undone.",
      )
    ) {
      e.preventDefault();
    }
  }

  if (isTrashed) {
    return (
      <>
        <form action={restore}>
          <button
            type="submit"
            className="btn-outline-cut inline-flex w-full items-center justify-center px-6 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-100 transition-colors sm:w-auto"
          >
            Restore
          </button>
        </form>
        <form action={permanentDelete} onSubmit={confirmPermanentDelete}>
          <button
            type="submit"
            className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-6 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 sm:w-auto"
          >
            Permanently delete
          </button>
        </form>
      </>
    );
  }

  return (
    <form action={softDelete} onSubmit={confirmTrash}>
      <button
        type="submit"
        className="btn-outline-cut inline-flex w-full items-center justify-center px-6 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-100 transition-colors sm:w-auto"
      >
        Move to trash
      </button>
    </form>
  );
}

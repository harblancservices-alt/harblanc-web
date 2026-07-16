"use client";

import { Button } from "@/components/ui/Button";
import { deleteLoad } from "../actions";

/** Delete (soft) a load from the top bar, with a confirm prompt. */
export function DeleteLoadButton({ loadId }: { loadId: string }) {
  return (
    <form
      action={deleteLoad.bind(null, loadId)}
      onSubmit={(e) => {
        if (!window.confirm("Delete this load? This removes it from the board.")) {
          e.preventDefault();
        }
      }}
    >
      <Button
        type="submit"
        variant="destructive-solid"
        size="sm"
        aria-label="Delete load"
        title="Delete load"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </Button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { Modal } from "../../../../_shell/Modal";
import { WhatHappened } from "./WhatHappened";
import type { QuickTask } from "../../../../admin/quick-task-actions";

type Mode = "call" | "note" | "task";

/** The heading, following the tab on screen rather than the button pressed. */
const TITLE: Record<Mode, string> = {
  call: "Log a call",
  note: "Add a note",
  task: "Add a task",
};

/**
 * LOG CALL · NOTE · TASK, from the document panel — in a CENTRED DIALOG.
 *
 * Brent was explicit that these open a modal in the middle of the screen
 * rather than the inline expansion the Overview composer uses. The reason
 * holds up: on Overview the composer is the first thing on the page and has
 * the full width; here it would have to unfold inside a 40%-wide column
 * beside a scanned document, pushing the parsed fields you are reading off
 * the screen to make room for a textarea.
 *
 * ── ONE COMPOSER, NOT TWO ─────────────────────────────────────────────
 *
 * The dialog renders the SAME WhatHappened component the Overview tab
 * does. There is no second implementation of "log a call" to keep in step,
 * no second set of outcome buttons, and a call logged from here is the same
 * crm_calls row — which is the rule calls/outcomes.ts already enforces for
 * the full dialog.
 *
 * ── WHY IT ONLY MOUNTS WHILE OPEN ─────────────────────────────────────
 *
 * FileBody keeps every tab mounted (hidden, not unmounted) so a half-typed
 * gap survives a glance at Contacts. That means the Overview composer is
 * alive the whole time you are on this tab. Mounting a second one
 * permanently would leave two components reading and writing the same
 * draft, and the follow-up detector running twice over text neither of them
 * owns. Rendering the composer only INSIDE the open dialog keeps the second
 * instance to the seconds it is actually on screen, and `draftScope` keeps
 * even that from touching the Overview draft.
 */
export function ComposerModal({
  accountId,
  contacts,
  stage,
  quickTasks,
  taskOwnerLabel,
}: {
  accountId: string;
  contacts: { id: string; name: string; phoneLabel: string | null }[];
  stage: string;
  quickTasks: QuickTask[];
  taskOwnerLabel: string | null;
}) {
  /** Which button opened it — null when shut. */
  const [mode, setMode] = useState<Mode | null>(null);
  /**
   * The tab currently showing INSIDE the dialog, which is not the same
   * thing as the button that opened it: the composer keeps its own
   * call/note/task toggle and a rep may move it after opening.
   *
   * Brent, 2026-08-31 — the heading read "Add a note" with the Log a call
   * tab selected, because the title followed the opening button and never
   * moved again. A dialog whose title disagrees with its own contents is
   * how somebody comes away believing they saved the wrong kind of thing.
   */
  const [showing, setShowing] = useState<Mode>("call");

  function open(m: Mode) {
    setMode(m);
    setShowing(m);
  }

  const BTN =
    "inline-flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-[12.5px] font-bold transition-colors";

  return (
    <>
      <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2.5">
        <button
          type="button"
          onClick={() => open("call")}
          className={`${BTN} border-accent bg-accent text-white hover:bg-accent-hover`}
        >
          Log call
        </button>
        <button
          type="button"
          onClick={() => open("note")}
          className={`${BTN} border-accent bg-card text-accent hover:bg-accent-bg`}
        >
          Note
        </button>
        <button
          type="button"
          onClick={() => open("task")}
          className={`${BTN} border-accent bg-card text-accent hover:bg-accent-bg`}
        >
          Task
        </button>
      </div>

      <Modal
        open={mode !== null}
        onClose={() => setMode(null)}
        title={TITLE[showing]}
      >
        {mode && (
          <div className="p-1">
            <WhatHappened
              accountId={accountId}
              contacts={contacts}
              stage={stage}
              quickTasks={quickTasks}
              taskOwnerLabel={taskOwnerLabel}
              initialMode={mode}
              onModeChange={setShowing}
              /* THE ENTRY BELONGS TO THE COMPANY. Brent: "they don't need
                 to link to a name. just show in the company tasks and what
                 happened notes." The Overview composer keeps its picker;
                 see WhatHappened's hideContact note for why this surface
                 in particular is the wrong place to ask. */
              hideContact
              /* Its own key — see the note above and WhatHappened's own. */
              draftScope={`${accountId}::bol`}
            />
          </div>
        )}
      </Modal>
    </>
  );
}

/**
 * WHAT THE REP TYPED, KEPT LOCALLY UNTIL IT IS SAFELY ON THE SERVER.
 *
 * Tyler lost a note on 2026-08-28: he typed it, pressed save, his session had
 * expired, and the action redirected him to the login screen. The composer
 * unmounted mid-keystroke and the text went with it. It had never left the
 * browser, so there was nothing to recover — not in the database, not in the
 * logs, nowhere.
 *
 * The composer now writes a draft as he types. It survives an unmount, a
 * navigation, a bounce to login, a crashed tab and a closed laptop, and it
 * comes back when he opens that company again.
 *
 * KEYED PER COMPANY. One shared key would hand a note about Aztec to the next
 * company opened, which is worse than losing it: a note filed against the
 * wrong customer is wrong in a way nobody notices.
 *
 * EVERY ACCESS IS GUARDED. localStorage throws outright in some browsers with
 * site data blocked, and is absent in SSR. A composer that cannot be typed
 * into because a draft could not be saved would be a worse bug than the one
 * this fixes, so every failure here is swallowed and the composer carries on.
 */

export type ComposerDraft = {
  /** Which tab the text belongs to — restoring a call note into the task
   * title would put it in the wrong field. */
  mode: "call" | "note" | "task";
  text: string;
  /** Epoch ms, so a stale draft can be aged out rather than resurfacing
   * months later next to a company somebody has since moved on from. */
  savedAt: number;
};

const PREFIX = "crm:composer-draft:";

/** A draft older than this is not offered back. Long enough to survive a
 * weekend, short enough that it is still recognisably today's work. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function draftKey(accountId: string): string {
  return `${PREFIX}${accountId}`;
}

/** Pure: is this draft worth restoring? Exported so the rule is testable
 * without a DOM. */
export function isRestorable(
  draft: ComposerDraft | null,
  nowMs: number,
  maxAgeMs: number = DRAFT_MAX_AGE_MS,
): boolean {
  if (!draft) return false;
  if (typeof draft.text !== "string" || draft.text.trim() === "") return false;
  if (typeof draft.savedAt !== "number" || !Number.isFinite(draft.savedAt)) return false;
  // A clock that moved backwards should not hide a draft written seconds ago.
  const age = nowMs - draft.savedAt;
  return age <= maxAgeMs;
}

/** Pure: parse whatever came out of storage, trusting none of it. Anything
 * unrecognisable reads as "no draft" rather than throwing into render. */
export function parseDraft(raw: string | null): ComposerDraft | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ComposerDraft>;
    if (!v || typeof v !== "object") return null;
    const mode = v.mode === "call" || v.mode === "note" || v.mode === "task" ? v.mode : null;
    if (!mode || typeof v.text !== "string") return null;
    return { mode, text: v.text, savedAt: typeof v.savedAt === "number" ? v.savedAt : 0 };
  } catch {
    return null;
  }
}

export function readDraft(accountId: string): ComposerDraft | null {
  try {
    if (typeof window === "undefined") return null;
    return parseDraft(window.localStorage.getItem(draftKey(accountId)));
  } catch {
    return null;
  }
}

export function writeDraft(accountId: string, draft: ComposerDraft): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(draftKey(accountId), JSON.stringify(draft));
  } catch {
    // Storage full, disabled, or private-mode. Nothing to do — the composer
    // still works, it just loses its safety net.
  }
}

export function clearDraft(accountId: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(draftKey(accountId));
  } catch {
    // Ignored for the same reason as writeDraft.
  }
}

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  startTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusTag } from "@/components/ui/StatusTag";
import {
  totalAlerts,
  type AlertGroup,
  type AlertGroupKey,
  type AlertItem,
} from "@/lib/dispatch/alerts";
import { dismissAlert, restoreAlert } from "./alert-actions";

/** How far left the row must travel before releasing counts as a dismiss. */
const DISMISS_THRESHOLD_PX = 88;
/** Same, rightward, for firing the quick action. */
const ACTION_THRESHOLD_PX = 88;
/** Width of the red "Ignore" panel behind the row — the resting open position. */
const REVEAL_WIDTH_PX = 96;
/** Movement past this many px is a swipe, not a tap: suppress the navigation. */
const TAP_SLOP_PX = 8;
/** How long the undo snackbar stays up. */
const UNDO_MS = 4000;
/** Slide-out/collapse duration before the row is actually removed. */
const LEAVE_MS = 220;

/**
 * `prefers-reduced-motion`, live. Subscribed rather than read once so a change
 * in OS settings takes effect without a reload, and read through
 * useSyncExternalStore so the server snapshot is a stable `false` (no
 * hydration mismatch — the server can't know the preference).
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/**
 * "Needs attention" — the dashboard's alert panel.
 *
 * Collapsed by default to a slim trip-card-chrome tab (bell + title + count
 * badge) so the dashboard opens on the work, not on a wall of warnings; tap it
 * to drop down the grouped list. Groups are themselves collapsible, so the
 * expanded state is still a short list of category headers until you open one.
 *
 * Zero alerts swaps the whole thing for the green "All clear" state.
 *
 * State is React-only and per-render (no localStorage) — an alert panel that
 * remembered being collapsed would hide new alerts, which is the one thing it
 * must never do.
 */

export function AlertsPanel({ groups }: { groups: ReadonlyArray<AlertGroup> }) {
  const [open, setOpen] = useState(false);
  // Which groups are expanded. Multiple may be open at once.
  const [openGroups, setOpenGroups] = useState<Set<AlertGroupKey>>(new Set());
  // Optimistically-dismissed keys. The server action revalidates /admin and
  // the next render drops these items for real; holding them here keeps the
  // row from flashing back in during the round trip.
  const [pendingDismissed, setPendingDismissed] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ key: string; title: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const onDismiss = useCallback((item: AlertItem) => {
    setPendingDismissed((s) => new Set(s).add(item.dismissKey));
    setUndo({ key: item.dismissKey, title: item.title });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
    startTransition(() => {
      void dismissAlert(item.dismissKey);
    });
  }, []);

  const onUndo = useCallback(() => {
    if (!undo) return;
    const { key } = undo;
    setPendingDismissed((s) => {
      const next = new Set(s);
      next.delete(key);
      return next;
    });
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    startTransition(() => {
      void restoreAlert(key);
    });
  }, [undo]);

  // Server data minus anything dismissed in this session but not yet
  // reflected. Deriving `live` this way means the badge total, the group
  // counts and the rendered rows all fall out of one filter.
  const live = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !pendingDismissed.has(i.dismissKey)),
    }))
    .filter((g) => g.items.length > 0);
  const total = totalAlerts(live);

  function toggleGroup(key: AlertGroupKey) {
    setOpenGroups((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // All clear — but keep the undo snackbar mounted, since dismissing the last
  // alert is exactly when you might want it back.
  if (total === 0) {
    return (
      <>
        <AllClear />
        <UndoBar undo={undo} onUndo={onUndo} />
      </>
    );
  }

  return (
    <div className="border-b border-line bg-canvas px-4 pb-3 pt-3 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        {/* The tab itself — trip-card chrome (rounded-lg, border-line-strong,
            bg-card, e2). Collapsed it's one row; expanded it grows the list
            inside the same card so the panel reads as a single object. */}
        <div className="overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-inset active:bg-inset"
          >
            {/* Bell — the attention animation rides on this icon only, not the
                whole card, so it stays a glance-level cue rather than a
                thrashing panel. Pauses once the panel is open (you're already
                looking at it) and under prefers-reduced-motion. */}
            <span
              aria-hidden
              className={
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bad-bg text-bad " +
                (open ? "" : "alert-bell")
              }
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M10 2a5 5 0 0 0-5 5v2.6l-1.1 2.2A1 1 0 0 0 4.8 13.3h10.4a1 1 0 0 0 .9-1.5L15 9.6V7a5 5 0 0 0-5-5zM8.2 15a1.8 1.8 0 0 0 3.6 0H8.2z" />
              </svg>
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-tight text-fg">
                Needs attention
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-fg-muted">
                {total} alert{total === 1 ? "" : "s"} ·{" "}
                {open ? "tap to collapse" : "tap to view"}
              </span>
            </span>

            {/* Count badge — the red total. */}
            <span
              className={
                "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-bad px-1.5 text-[12px] font-bold tabular-nums text-white shadow-e1 " +
                (open ? "" : "alert-badge")
              }
            >
              {total}
            </span>

            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
              className={
                "h-4 w-4 shrink-0 text-fg-subtle transition-transform " +
                (open ? "rotate-180" : "")
              }
            >
              <path
                fillRule="evenodd"
                d="M5.29 7.21a1 1 0 0 1 1.42 0L10 10.5l3.29-3.29a1 1 0 1 1 1.42 1.42l-4 4a1 1 0 0 1-1.42 0l-4-4a1 1 0 0 1 0-1.42z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {open ? (
            <div className="border-t border-line">
              {live.map((g) => (
                <AlertGroupRow
                  key={g.key}
                  group={g}
                  expanded={openGroups.has(g.key)}
                  onToggle={() => toggleGroup(g.key)}
                  onDismiss={onDismiss}
                />
              ))}

              {/* Collapse handle — pushes the panel back up from the bottom,
                  so a long expanded list doesn't force a scroll back to the
                  header to close it. */}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center gap-1.5 border-t border-line bg-inset px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted transition-colors hover:bg-card hover:text-fg"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                  className="h-3.5 w-3.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M14.71 12.79a1 1 0 0 1-1.42 0L10 9.5l-3.29 3.29a1 1 0 0 1-1.42-1.42l4-4a1 1 0 0 1 1.42 0l4 4a1 1 0 0 1 0 1.42z"
                    clipRule="evenodd"
                  />
                </svg>
                Collapse
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <UndoBar undo={undo} onUndo={onUndo} />
    </div>
  );
}

/**
 * One category: a header row carrying the label + count, which expands to the
 * individual tap-through items.
 */
function AlertGroupRow({
  group,
  expanded,
  onToggle,
  onDismiss,
}: {
  group: AlertGroup;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: (item: AlertItem) => void;
}) {
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-inset"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
          className={
            "h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform " +
            (expanded ? "rotate-90" : "")
          }
        >
          <path
            fillRule="evenodd"
            d="M7.21 4.29a1 1 0 0 1 1.42 0l5 5a1 1 0 0 1 0 1.42l-5 5a1 1 0 1 1-1.42-1.42L11.5 10 7.21 5.71a1 1 0 0 1 0-1.42z"
            clipRule="evenodd"
          />
        </svg>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg">
          {group.label}
        </span>
        <StatusTag tone={group.tone} hideDot className="shrink-0 tabular-nums">
          {group.items.length}
        </StatusTag>
      </button>

      {expanded ? (
        <div className="bg-inset">
          {group.items.map((item) => (
            <AlertItemRow key={item.dismissKey} item={item} onDismiss={onDismiss} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One alert item — a tap-through card that can be swiped left to ignore.
 *
 * Anatomy: a red "Ignore" panel pinned behind the row, and the row itself
 * translating left over it under the finger. Past DISMISS_THRESHOLD_PX the
 * release dismisses (the row slides the rest of the way out); short of it the
 * row settles at the reveal width so the Ignore button is tappable, and a
 * second tap anywhere closes it again.
 *
 * The row content is a static div with a stretched <Link> overlay rather than
 * an <a> wrapping everything — the repo's existing pattern (active loads,
 * receivables) — because the Ignore button has to sit outside the anchor to be
 * its own control instead of a navigation.
 *
 * Desktop gets the same affordance without a touchscreen: the ✕ button is
 * always present, so nothing here is touch-only.
 */
function AlertItemRow({
  item,
  onDismiss,
}: {
  item: AlertItem;
  onDismiss: (item: AlertItem) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const router = useRouter();
  const action = item.action;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const startX = useRef(0);
  // The gesture's source of truth. touchmove and touchend can fire in the same
  // frame, in which case a handler reading the `dx` STATE still sees the value
  // from the last render and misjudges the release — so the handlers read this
  // and `dx` exists only to drive the transform.
  const dxRef = useRef(0);
  const startDx = useRef(0);
  // Set once a drag passes the tap slop, so the release doesn't also navigate.
  const swiped = useRef(false);

  function moveTo(next: number) {
    dxRef.current = next;
    setDx(next);
  }

  // Pixel height captured at dismiss time. `height: auto` does not transition,
  // so the collapse has to start from a real number — the row renders once at
  // its measured height before `leaving` takes it to 0.
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  // The quick action navigates rather than mutating, so unlike dismiss there's
  // nothing to undo and no row to animate out — the alert stays put until the
  // owner actually fixes the underlying thing.
  function runAction() {
    if (!action) return;
    router.push(action.href);
  }

  function dismiss() {
    if (leaving) return;
    if (reduced) {
      // No slide-out: the row just goes, and the undo bar carries the message.
      onDismiss(item);
      return;
    }
    setLockedHeight(rowRef.current?.offsetHeight ?? 0);
    // Two frames: one to commit the explicit height, the next to start the
    // collapse from it. Collapsing in the same frame would jump.
    requestAnimationFrame(() => requestAnimationFrame(() => setLeaving(true)));
    // The actual removal is on a timer rather than `transitionend`, which
    // doesn't fire if the transition is interrupted or never starts — the
    // alert must disappear either way.
    leaveTimer.current = setTimeout(() => onDismiss(item), LEAVE_MS);
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    startX.current = t.clientX;
    startDx.current = dxRef.current;
    swiped.current = false;
    setDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    const delta = t.clientX - startX.current;
    if (Math.abs(delta) > TAP_SLOP_PX) swiped.current = true;
    // Left reveals Ignore (right edge); right reveals the quick action (left
    // edge), but only when this alert HAS one — otherwise the row is left-only
    // and a rightward drag stays pinned at 0 rather than opening onto nothing.
    // The extra 40px past the panel width is rubber-band slack.
    const max = action ? REVEAL_WIDTH_PX + 40 : 0;
    moveTo(Math.min(max, Math.max(-(REVEAL_WIDTH_PX + 40), startDx.current + delta)));
  }

  function onTouchEnd() {
    setDragging(false);
    const cur = dxRef.current;
    // Past a threshold the gesture commits: left dismisses, right fires the
    // quick action. Short of it the row rests open at the reveal width so the
    // revealed button is a real tap target.
    if (cur <= -DISMISS_THRESHOLD_PX) {
      dismiss();
      return;
    }
    if (action && cur >= ACTION_THRESHOLD_PX) {
      moveTo(0);
      runAction();
      return;
    }
    if (cur < -TAP_SLOP_PX) moveTo(-REVEAL_WIDTH_PX);
    else if (action && cur > TAP_SLOP_PX) moveTo(REVEAL_WIDTH_PX);
    else moveTo(0);
  }

  const transition = dragging || reduced ? "none" : "transform 180ms ease-out";

  return (
    <div
      ref={rowRef}
      className="relative overflow-hidden border-t border-line"
      style={
        leaving
          ? {
              height: 0,
              opacity: 0,
              transition: `height ${LEAVE_MS}ms ease-in, opacity 160ms ease-in`,
            }
          : lockedHeight != null
            ? { height: lockedHeight }
            : undefined
      }
    >
      {/* Quick-action panel on the LEFT edge, revealed by a rightward swipe.
          Accent rather than red — this one fixes the alert, it doesn't hide
          it. Only rendered when the alert actually has an action. */}
      {action ? (
        <div className="absolute inset-y-0 left-0 flex w-24 items-center justify-center bg-accent">
          <button
            type="button"
            onClick={runAction}
            aria-label={`${action.label} — ${item.title}`}
            className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-white transition-colors active:bg-accent-hover"
            tabIndex={dx > TAP_SLOP_PX ? 0 : -1}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
              <path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" />
            </svg>
            <span className="text-center font-mono text-[9.5px] font-bold uppercase leading-tight tracking-[0.06em]">
              {action.label}
            </span>
          </button>
        </div>
      ) : null}

      {/* Ignore panel, revealed as the row slides off it. */}
      <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-bad">
        <button
          type="button"
          onClick={dismiss}
          aria-label={`Ignore alert — ${item.title}`}
          className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-white transition-colors active:bg-bad/80"
          tabIndex={dx < -TAP_SLOP_PX ? 0 : -1}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]">
            Ignore
          </span>
        </button>
      </div>

      {/* The row itself — slides left over the Ignore panel. */}
      <div
        className="relative flex touch-pan-y items-start gap-3 bg-inset px-3.5 py-2.5 transition-colors hover:bg-card"
        style={
          leaving
            ? {
                transform: "translateX(-100%)",
                transition: `transform ${LEAVE_MS}ms ease-in`,
              }
            : { transform: `translateX(${dx}px)`, transition }
        }
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* Stretched link. Suppressed mid-swipe and while the row is held
            open, so a swipe never doubles as a navigation. */}
        <Link
          href={item.href}
          prefetch={false}
          aria-label={`Open — ${item.title}`}
          className="absolute inset-0 z-0"
          onClick={(e) => {
            // A swipe, or a tap while the row is held open, closes it instead
            // of navigating. The flag is consumed here rather than only reset
            // on the next touchstart — otherwise one swipe would suppress
            // every later mouse click on this row, which never gets a
            // touchstart to clear it.
            if (swiped.current || dxRef.current !== 0) {
              e.preventDefault();
              swiped.current = false;
              moveTo(0);
            }
          }}
        />

        <span className="pointer-events-none min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight text-fg">
            {item.title}
          </span>
          {item.subtitle ? (
            <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
              {item.subtitle}
            </span>
          ) : null}
          {(item.chips && item.chips.length > 0) || item.dateLabel ? (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {/* The load's date, leading the chip row — a reference marker for
                  how far back to look in the Files folder, so it's deliberately
                  unfilled and subtle next to the colored problem chips. */}
              {item.dateLabel ? (
                <span className="font-mono text-[11px] font-bold uppercase leading-none tracking-[0.06em] text-fg-subtle">
                  {item.dateLabel}
                </span>
              ) : null}
              {item.chips?.map((c) => (
                <StatusTag key={c.label} tone={c.tone}>
                  {c.label}
                </StatusTag>
              ))}
            </span>
          ) : null}
        </span>

        {item.value ? (
          <span className="pointer-events-none shrink-0 font-mono text-[12px] font-bold tabular-nums text-fg">
            {item.value}
          </span>
        ) : null}

        {/* Non-touch fallback for the quick action — the swipe-right
            equivalent, always visible so a mouse never has to swipe. */}
        {action ? (
          <button
            type="button"
            onClick={runAction}
            aria-label={`${action.label} — ${item.title}`}
            title={`${action.label} — ${item.title}`}
            className="relative z-10 shrink-0 whitespace-nowrap rounded border border-accent/40 bg-accent/15 px-1.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-accent transition-colors hover:bg-accent hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {action.label}
          </button>
        ) : null}

        {/* Non-touch fallback — a real button, above the stretched link. On a
            phone it doubles as the "I'd rather tap than swipe" path. */}
        <button
          type="button"
          onClick={dismiss}
          aria-label={`Ignore alert — ${item.title}`}
          title="Ignore this alert"
          className="relative z-10 -my-1 -mr-1 shrink-0 rounded p-1.5 text-fg-subtle transition-colors hover:bg-bad-bg hover:text-bad focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Undo snackbar — a ~4s window to take back an accidental swipe. Fixed to the
 * bottom of the viewport (above the admin bottom nav) rather than inline, so
 * it's reachable by thumb and doesn't reflow the list it's apologising for.
 */
function UndoBar({
  undo,
  onUndo,
}: {
  undo: { key: string; title: string } | null;
  onUndo: () => void;
}) {
  if (!undo) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4"
    >
      <div className="flex max-w-md items-center gap-3 rounded-lg border border-line-strong bg-card px-3.5 py-2.5 shadow-e3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-fg">
            Ignored
          </span>
          <span className="block truncate text-[11.5px] text-fg-muted">
            {undo.title}
          </span>
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded border border-line-strong bg-inset px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-fg transition-colors hover:bg-card hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Undo
        </button>
      </div>
    </div>
  );
}

/** Nothing waiting — the same friendly green banner the old alert bar used. */
function AllClear() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-ok/25 bg-ok-bg px-4 py-2">
      <span
        aria-hidden
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ok text-white shadow-sm"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3 w-3">
          <path
            fillRule="evenodd"
            d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.6a1 1 0 0 1-1.42.006l-3.5-3.5a1 1 0 1 1 1.414-1.414l2.79 2.79 6.796-6.886a1 1 0 0 1 1.414-.006z"
            clipRule="evenodd"
          />
        </svg>
      </span>
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ok">
        All clear — you&apos;re caught up
      </span>
    </div>
  );
}

import Link from "next/link";
import type { CrmActivityLogItem } from "../../ActivityLogSection";
import { FileCard, SectionHead } from "./chrome";

/**
 * PANEL 02 — NOTES & WHAT HAPPENED.
 *
 * The record of the relationship, newest first, with the most recent entry
 * given real weight and everything older set quietly beneath it.
 *
 * ── WHY THE TOP ENTRY IS DIFFERENT ────────────────────────────────────
 *
 * It is the one you are almost always here to read. Somebody rang this
 * company, wrote down what was said, and the next person to pick it up
 * needs that sentence before anything else on the page. The blue rule and
 * the tinted ground are doing one job: making the newest thing findable
 * without scanning. Every entry below it is the same shape, unstyled.
 *
 * ── TWO KINDS OF ENTRY, AND THEY LOOK DIFFERENT ON PURPOSE ────────────
 *
 * Calls and notes are things a PERSON did and wrote — they get a paragraph
 * and room to breathe. The audit events (company created, location added,
 * stage set) are things the SYSTEM recorded, and they compress to one line
 * each at the bottom. They matter for provenance and almost never for the
 * next call, so they are present and small rather than absent or equal.
 *
 * That split is not a heuristic — it is the `type` the feed already carries:
 * "call" and "note" against "activity".
 *
 * ── DATES ─────────────────────────────────────────────────────────────
 *
 * `nowMs` is threaded in from the page rather than read here. The React
 * Compiler's purity rule forbids Date.now() during render, and beyond the
 * rule it is the right thing: every relative label on this page is measured
 * against ONE instant, so two entries can never disagree about what "today"
 * means. See lib/crm/serverNow.ts.
 */

const DAY_MS = 86_400_000;

/** "Today 1:15 PM" for something from today, "Aug 22" for anything older —
 * the design's own two forms. */
function stamp(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const time = new Date(t).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
  const day = new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago",
  });
  const sameDay =
    new Date(t).toLocaleDateString("en-US", { timeZone: "America/Chicago" }) ===
    new Date(nowMs).toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  if (sameDay) return `Today ${time}`;
  if (nowMs - t < 2 * DAY_MS) return `Yesterday ${time}`;
  return day;
}

/** The middle segment of an entry's header — "call · reached", "note". */
function descriptor(item: CrmActivityLogItem): string {
  if (item.type === "call") return item.tag ? `call · ${item.tag.toLowerCase()}` : "call";
  if (item.type === "note") return "note";
  return "";
}

export function HistoryPanel({
  accountId,
  items,
  nowMs,
}: {
  accountId: string;
  items: CrmActivityLogItem[];
  nowMs: number;
}) {
  const written = items.filter((i) => i.type === "call" || i.type === "note");
  const events = items.filter((i) => i.type === "activity");

  return (
    <FileCard className="flex flex-col">
      <SectionHead
        n="02"
        title="Notes & what happened"
        action={
          items.length > 0 ? (
            <Link
              href={`/crm/accounts/${accountId}/history`}
              prefetch={false}
              className="text-[12px] text-white/60 hover:text-white hover:underline"
            >
              full history · {items.length}
            </Link>
          ) : null
        }
      />

      <div className="flex-1 px-4 py-3">
        {written.length === 0 && events.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[13px] font-bold text-fg">Nothing has happened yet</p>
            <p className="mx-auto mt-1 max-w-[36ch] text-[12px] text-fg-subtle">
              Log the first call above and it will land here.
            </p>
          </div>
        ) : null}

        {written.map((item, i) => {
          const newest = i === 0;
          const desc = descriptor(item);
          return (
            <article
              key={item.id}
              className={
                newest
                  ? "mb-3 border-l-[3px] border-accent bg-inset px-3 py-2.5"
                  : "border-t border-line py-3 first:border-t-0 first:pt-0"
              }
            >
              <p className="text-[12px] font-bold text-fg">
                {stamp(item.occurredAt, nowMs)}
                {desc && <span className="font-semibold text-fg-muted"> · {desc}</span>}
                {!newest && item.author && (
                  <span className="font-normal text-fg-subtle"> · {item.author}</span>
                )}
              </p>

              {item.body && (
                <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-[1.55] text-fg-muted">
                  {item.body}
                </p>
              )}

              {newest && item.author && (
                <p className="mt-1.5 text-[11px] text-fg-subtle">{item.author}</p>
              )}
            </article>
          );
        })}

        {events.length > 0 && (
          <div className={written.length > 0 ? "mt-2 border-t border-line pt-2" : ""}>
            {events.map((e) => (
              <p key={e.id} className="flex gap-3 py-[3px] text-[11.5px] text-fg-subtle">
                <span className="w-[88px] shrink-0 whitespace-nowrap crm-num">{stamp(e.occurredAt, nowMs)}</span>
                <span className="min-w-0 flex-1">
                  {e.title}
                  {e.body ? ` — ${e.body}` : ""}
                  {e.author ? ` · ${e.author}` : ""}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </FileCard>
  );
}

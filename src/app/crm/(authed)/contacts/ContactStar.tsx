"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setContactStarred } from "./star-actions";

/**
 * THE STAR — "this person actually gets freight moved."
 *
 * ── WHAT IT MEANS, AND WHY IT IS NOT CALLED A FAVOURITE ───────────────
 *
 * Brent, 2026-08-31: "it's hard to know who's the real boss at these
 * places. Jeff might be the owner but Rodger might be the shipper guy, so
 * Jeff doesn't care about Rodger's job — so Rodger needs the star, not
 * Jeff."
 *
 * A favourite is a preference. This is a judgement about who can get a
 * truck loaded, and it earns its keep exactly when it disagrees with the
 * job title. So the label everywhere a human can read it — tooltip, aria,
 * the Favourites filter — says "gets freight moved", never "favourite".
 *
 * ── IT IS NOT primary_contact_id ──────────────────────────────────────
 *
 * A question worth answering out loud, because two competing "most
 * important contact" flags would be a genuine mess:
 *
 *   primary_contact_id  a SLOT on crm_accounts. Exactly one per company,
 *                       and setting it displaces whoever held it. It
 *                       decides which contact the Who do I call panel
 *                       LEADS WITH. It is about ordering one panel.
 *
 *   starred_at          a PROPERTY of the person. Zero-to-many per
 *                       company, displaces nobody, and its whole value is
 *                       aggregating ACROSS companies — the fifty people in
 *                       a thousand calls who are worth keeping.
 *
 * They will usually be the same person and must not be wired together.
 * Brent's own example is a company where they differ: Jeff is the named
 * decision maker the record leads with, Rodger is the one who matters. If
 * starring set primary, starring Rodger would silently demote Jeff and
 * rearrange a panel somebody had already arranged — and the agent would
 * not have asked for that.
 *
 * The one place the star touches ordering is the ROSTER SORT: starred
 * people rise above unstarred below the hero. That is a display
 * preference, costs nothing, and overwrites no stored decision.
 *
 * ── IT HAS TO BE OBVIOUSLY A STAR ─────────────────────────────────────
 *
 * Brent: "Not a light gray star where you could barely see it on the
 * background, like a legit star, and then it turns gold if you click it."
 *
 * So the unstarred state is a SOLID mid-ink star with a visible stroke on
 * a bordered button, not a hairline outline in --line. It reads as a
 * control you can press before you know what it does. Starred fills with
 * --amber, the same gold the BOL role pills and the linked-company button
 * already use on this profile.
 */

function StarGlyph({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      /* Stroked AND filled in both states. An outline-only star at this
         size disappears against a card; the unstarred one is deliberately
         a solid shape in a muted ink so it is unmistakably a star. */
      strokeWidth={filled ? 1.5 : 1.75}
      strokeLinejoin="round"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.66l-5.9 3.1 1.12-6.57L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}

export function ContactStar({
  contactId,
  starred,
  name,
  size = "md",
}: {
  contactId: string;
  starred: boolean;
  /** Named in the tooltip and the screen-reader label, so the control says
   * whose usefulness it is recording. */
  name: string | null;
  /** "sm" for dense table rows, "md" everywhere with room. */
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  /* Optimistic: a star is a judgement somebody is making while looking at
     the row, and a half-second of nothing feels like it did not register.
     The server is still the record — a failure puts it straight back. */
  const [on, setOn] = useState(starred);

  const who = name?.trim() || "this contact";
  const label = on
    ? `${who} is marked as somebody who gets freight moved. Click to unmark.`
    : `Mark ${who} as somebody who gets freight moved`;

  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const glyph = size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={pending}
      onClick={(e) => {
        // These sit inside clickable rows and links on three surfaces.
        e.preventDefault();
        e.stopPropagation();
        const next = !on;
        setOn(next);
        start(async () => {
          const res = await setContactStarred({ contactId, starred: next });
          if (!res.ok) setOn(!next);
          router.refresh();
        });
      }}
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-60 ${
        on
          ? "border-warn bg-amber hover:bg-amber/85"
          : "border-line-strong bg-card hover:border-warn hover:bg-warn-bg"
      }`}
    >
      <StarGlyph
        filled={on}
        className={`${glyph} ${
          on
            ? // Gold fill, graphite stroke — the same pairing the role
              // pills use, so gold reads the same way across the profile.
              "fill-graphite stroke-graphite"
            : "fill-fg-muted stroke-fg-muted"
        }`}
      />
    </button>
  );
}

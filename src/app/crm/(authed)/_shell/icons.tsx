import type { SVGProps } from "react";

/**
 * CRM nav icons. Stroke-based, 24px grid, currentColor — so active/inactive
 * colour is driven entirely by the parent's text colour. Deliberately its own
 * small set (not the admin icon set) to keep the CRM self-contained.
 */
type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function IconDashboard(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function IconCompanies(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 21h18" />
      <path d="M5 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16" />
      <path d="M13 9h5a1 1 0 0 1 1 1v11" />
      <path d="M8 8h2M8 12h2M8 16h2M16 13h0M16 17h0" />
    </svg>
  );
}

export function IconContacts(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M17.5 20a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  );
}

export function IconTasks(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 11l2 2 4-4" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </svg>
  );
}

export function IconMore(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h11" />
    </svg>
  );
}

export function IconAiAgent(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="8" width="14" height="11" rx="2.5" />
      <path d="M12 8V4M9 3.5h6" />
      <circle cx="9.5" cy="13.5" r="1.25" />
      <circle cx="14.5" cy="13.5" r="1.25" />
      <path d="M3 12v3M21 12v3" />
    </svg>
  );
}

export function IconFlame(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2.5c1.2 2.6-.3 4-1.5 5.4C9 9.4 8 11 8 13a4 4 0 0 0 8 0c0-1-.4-1.8-1-2.5.3 1 .1 2-.6 2.6-.2-1.3-.8-2-1.7-2.8.4 1.6-.2 2.6-1.2 3.3-.7.5-1.5 1.2-1.5 2.4a3 3 0 0 0 6 0c0-4.5-2.7-6-4-13.5Z" />
    </svg>
  );
}

export function IconAiReview(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 11l2 2 4-4" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function IconCustomers(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3l2.4 4.86 5.36.78-3.88 3.78.92 5.34L12 15.27l-4.8 2.49.92-5.34L4.24 8.64l5.36-.78L12 3z" />
    </svg>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 4h3l1.5 5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 5 1.5v3a1.5 1.5 0 0 1-1.6 1.5A17.5 17.5 0 0 1 3 5.6 1.5 1.5 0 0 1 4.5 4Z" />
    </svg>
  );
}

export function IconNote(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 3.5h9l4 4V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14.5 3.5V8h4.5" />
      <path d="M8 12h8M8 15.5h5" />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v4M16 3v4" />
      <circle cx="8" cy="14" r="1" />
      <circle cx="12" cy="14" r="1" />
      <circle cx="16" cy="14" r="1" />
    </svg>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M19 12H5" />
      <path d="M11 18l-6-6 6-6" />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5L12 13l8.5-6.5" />
    </svg>
  );
}

export function IconMapPin(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function IconUpgrades(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 4.5h13l3 4-3 4H4Z" />
      <path d="M4 12.5v7" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 8a6 6 0 0 1 12 0v4.5l1.6 2.9a1 1 0 0 1-.9 1.6H5.3a1 1 0 0 1-.9-1.6L6 12.5Z" />
      <path d="M9.5 20a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

export function IconRateConfirmation(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 3.5h9l4 4V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14.5 3.5V8h4.5" />
      <path d="M12 10.5v7M10.2 16.3c.3.6 1 1 1.8 1 1.1 0 2-.6 2-1.5s-.9-1.3-2-1.6c-1.1-.3-2-.7-2-1.6 0-.9.9-1.5 2-1.5.8 0 1.5.4 1.8 1" />
    </svg>
  );
}

export function IconBillOfLading(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 3.5h9l4 4V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14.5 3.5V8h4.5" />
      <path d="M8 12h8M8 15h8M8 18h5" />
    </svg>
  );
}

export function IconTruck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 6h10v10H3z" />
      <path d="M13 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.75" />
      <circle cx="17" cy="18" r="1.75" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7M18 7l-.8 12.2a1.5 1.5 0 0 1-1.5 1.3H8.3a1.5 1.5 0 0 1-1.5-1.3L6 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/** Filled (not outline) 5-point star — used only by the "Active Clients" nav
 * item, which wants a solid gold star regardless of active state. Same
 * proportions as IconCustomers' outline star, rendered with a fill instead
 * of a stroke. */
export function IconStarSolid(props: IconProps) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 3l2.4 4.86 5.36.78-3.88 3.78.92 5.34L12 15.27l-4.8 2.49.92-5.34L4.24 8.64l5.36-.78L12 3z" />
    </svg>
  );
}

/** Filled (not outline) flag — used only by the "Upgrades" nav item, which
 * wants a solid red flag regardless of active state. Same pole+pennant
 * layout as IconUpgrades' outline version, rendered as solid shapes. */
export function IconFlagSolid(props: IconProps) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="3.25" y="3.5" width="1.75" height="17" rx="0.85" />
      <path d="M5 4.25h12.5a1 1 0 0 1 .78 1.62L15.7 9.5l2.58 3.13a1 1 0 0 1-.78 1.62H5V4.25Z" />
    </svg>
  );
}

/** Price-tag glyph — the Company Details card's "Tags" section header. */
export function IconTag(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M11.5 3.5H5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 .44 1.06l8 8a1.5 1.5 0 0 0 2.12 0l6.5-6.5a1.5 1.5 0 0 0 0-2.12l-8-8a1.5 1.5 0 0 0-1.06-.44Z" />
      <circle cx="8" cy="8" r="1.15" />
    </svg>
  );
}

/** Thumbtack glyph — the Notes feed's Pin toggle/action. */
export function IconPin(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14.5 3.5l6 6-3.1 3.1a2.5 2.5 0 0 0-.55 2.7l.85 2.1-9.6-9.6 2.1.85a2.5 2.5 0 0 0 2.7-.55L14.5 3.5Z" />
      <path d="M9.5 14.5L4 20" />
    </svg>
  );
}

/** Generic globe glyph — the "Website" link bubble. */
export function IconGlobe(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z" />
    </svg>
  );
}

/** Generic chain-link glyph — the fallback for any social/link bubble that
 * isn't Website/LinkedIn/Facebook/Instagram (e.g. "Load board" or a custom
 * label). Two overlapping rotated rounded rects. */
export function IconLink(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="9" width="10" height="6" rx="3" transform="rotate(-45 8 12)" />
      <rect x="11" y="9" width="10" height="6" rx="3" transform="rotate(-45 16 12)" />
    </svg>
  );
}

/** Simplified filled LinkedIn "in" mark — the LinkedIn link bubble. */
export function IconLinkedIn(props: IconProps) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="6.5" cy="7" r="1.9" />
      <rect x="4.7" y="10.2" width="3.6" height="9.8" />
      <path d="M11 10.2h3.4v1.7c.6-1.1 1.8-2 3.6-2 3.2 0 4.3 2.1 4.3 5.3V20h-3.6v-4.6c0-1.4-.5-2.4-1.8-2.4-1 0-1.6.7-1.9 1.3-.1.3-.2.7-.2 1.1V20H11V10.2Z" />
    </svg>
  );
}

/** Simplified filled Facebook "f" mark — the Facebook link bubble. */
export function IconFacebook(props: IconProps) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M14.5 21v-7.8h2.6l.4-3h-3V8.2c0-.9.2-1.5 1.5-1.5h1.6V4.1C17.3 4 16.3 4 15.2 4c-2.4 0-4 1.5-4 4.1v2.1H8.5v3h2.7V21h3.3Z" />
    </svg>
  );
}

/** Rounded-square camera glyph — the Instagram link bubble. */
export function IconInstagram(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17" cy="7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

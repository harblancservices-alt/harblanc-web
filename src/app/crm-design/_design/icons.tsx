import type { SVGProps } from "react";

/** Prototype's own minimal icon set — stroke-based, currentColor, 24px grid.
 * Intentionally not shared with, or copied line-for-line from, the real
 * CRM's icon set (src/app/crm/(authed)/_shell/icons.tsx) — kept small and
 * self-contained on purpose. */
type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const IconDashboard = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="7.5" height="8" rx="1.5" />
    <rect x="13" y="3.5" width="7.5" height="5" rx="1.5" />
    <rect x="13" y="11" width="7.5" height="9.5" rx="1.5" />
    <rect x="3.5" y="14" width="7.5" height="6.5" rx="1.5" />
  </svg>
);
export const IconBuilding = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16" />
    <path d="M13 9.5h5a1 1 0 0 1 1 1V21" />
    <path d="M8 8h2M8 12h2M8 16h2M16 13h0M16 17h0" />
    <path d="M3 21h18" />
  </svg>
);
export const IconContacts = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.3" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 4.7a3.3 3.3 0 0 1 0 6.6M17.5 20a5.4 5.4 0 0 0-3-4.8" />
  </svg>
);
export const IconActivity = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 12h4l2.5-7 4 14 2.5-7H21" />
  </svg>
);
export const IconTasks = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4" width="17" height="16" rx="2" />
    <path d="M8.5 11l2 2 4.5-4.5" />
  </svg>
);
export const IconCalendar = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);
export const IconStar = (p: P) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.3L12 15.3l-4.8 2.5.9-5.3-3.9-3.8 5.4-.8L12 3z" />
  </svg>
);
export const IconShield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5l7 2.9v5.1c0 4.6-2.98 8.36-7 9.5-4.02-1.14-7-4.9-7-9.5V6.4l7-2.9Z" />
    <path d="M9 12l2 2 4-4.5" />
  </svg>
);
export const IconSettings = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
  </svg>
);
export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4.3-4.3" />
  </svg>
);
export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconChevronDown = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const IconChevronLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
export const IconChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const IconX = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconMore = (p: P) => (
  <svg {...base(p)}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);
export const IconPhone = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 4h3l1.5 5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 5 1.5v3a1.5 1.5 0 0 1-1.6 1.5A17.5 17.5 0 0 1 3 5.6 1.5 1.5 0 0 1 4.5 4Z" />
  </svg>
);
export const IconMail = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 6.5L12 13l8.5-6.5" />
  </svg>
);
export const IconNote = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 3.5h9l4 4V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    <path d="M14.5 3.5V8h4.5M8 12h8M8 15.5h5" />
  </svg>
);
export const IconDocument = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 3.5h9l4 4V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    <path d="M14.5 3.5V8h4.5M8 12h8M8 15.5h8" />
  </svg>
);
export const IconLogout = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
    <path d="M10 17l-5-5 5-5M5 12h11" />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 13l4 4L19 7" />
  </svg>
);
export const IconAlertTriangle = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
    <path d="M12 9.5v5M12 17.5h0" />
  </svg>
);
export const IconInfo = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5h0" />
  </svg>
);
export const IconMapPin = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z" />
    <circle cx="12" cy="9" r="2.4" />
  </svg>
);
export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7M18 7l-.8 12.2a1.5 1.5 0 0 1-1.5 1.3H8.3a1.5 1.5 0 0 1-1.5-1.3L6 7" />
  </svg>
);
export const IconMenu = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
  </svg>
);
export const IconGrid = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="7" height="7" rx="1.2" />
    <rect x="13" y="4" width="7" height="7" rx="1.2" />
    <rect x="4" y="13" width="7" height="7" rx="1.2" />
    <rect x="13" y="13" width="7" height="7" rx="1.2" />
  </svg>
);
export const IconFlag = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 3.5v17" />
    <path d="M5 4.25h12.5a1 1 0 0 1 .78 1.62L15.7 9.5l2.58 3.13a1 1 0 0 1-.78 1.62H5V4.25Z" />
  </svg>
);
export const IconInbox = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 12h5l1.5 3h4l1.5-3h5" />
    <path d="M5.5 5.5h13l2 6.5v6a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 18v-6l2-6.5Z" />
  </svg>
);
export const IconCamera = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h1.8l1-2h7.4l1 2h1.8A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
    <circle cx="12" cy="13" r="3.4" />
  </svg>
);
export const IconUpload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 15.5V4M8 8l4-4 4 4" />
    <path d="M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3" />
  </svg>
);
export const IconTruck = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6.5h10v9H3z" />
    <path d="M13 10h4l3.5 3v2.5H13z" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </svg>
);
export const IconZoom = (p: P) => (
  <svg {...base(p)}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.8-4.8M8 10.5h5M10.5 8v5" />
  </svg>
);
export const IconZoomIn = (p: P) => (
  <svg {...base(p)}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.8-4.8M8 10.5h5M10.5 8v5" />
  </svg>
);
export const IconZoomOut = (p: P) => (
  <svg {...base(p)}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.8-4.8M8 10.5h5" />
  </svg>
);
/** Four corner-brackets expanding outward — "enter fullscreen." */
export const IconMaximize = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
  </svg>
);
/** Four corner-brackets pointing inward — "exit fullscreen." */
export const IconMinimize = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 4v4a1 1 0 0 1-1 1H4M15 4v4a1 1 0 0 0 1 1h4M9 20v-4a1 1 0 0 0-1-1H4M15 20v-4a1 1 0 0 1 1-1h4" />
  </svg>
);
/** Simple horizontal double-arrow — "fit to width." */
export const IconFitWidth = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="6" width="17" height="12" rx="1.5" />
    <path d="M8 12h8M8 12l1.8-1.8M8 12l1.8 1.8M16 12l-1.8-1.8M16 12l-1.8 1.8" />
  </svg>
);
/** A page silhouette fully enclosed by brackets — "fit whole page." */
export const IconFitPage = (p: P) => (
  <svg {...base(p)}>
    <rect x="7" y="3.5" width="10" height="17" rx="1.2" />
    <path d="M3.5 6V4.5A1 1 0 0 1 4.5 3.5H6M20.5 6V4.5a1 1 0 0 0-1-1H18M3.5 18v1.5a1 1 0 0 0 1 1H6M20.5 18v1.5a1 1 0 0 1-1 1H18" />
  </svg>
);
/** The Prospects nav item — same visual metaphor as the real CRM's own
 * "Prospects" icon for continuity. */
export const IconFlame = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3c1.3 2.6-.3 4-1.6 5.5C9.2 9.8 8 11.4 8 13.3a4 4 0 0 0 8 0c0-1-.4-1.9-1-2.6.3 1 .1 2-.6 2.6-.2-1.3-.8-2.1-1.7-2.9.4 1.7-.2 2.7-1.2 3.4-.7.5-1.5 1.2-1.5 2.5a3 3 0 0 0 6 0C15.9 12.4 13.5 10.8 12 3Z" />
  </svg>
);
/** A microphone — OTR's "Dispatch <company name>" verbal-intake concept. */
export const IconMic = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9 20.5h6" />
  </svg>
);

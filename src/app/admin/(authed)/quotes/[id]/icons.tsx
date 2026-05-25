import type { SVGProps } from "react";

/**
 * Shared inline SVG icons for the admin quote-detail workspace.
 * No external icon library — keep dependencies tight. Each icon
 * accepts standard SVGProps so callers can size via Tailwind h-/w-.
 *
 * Stroke width 1.75 (2 for arrows / chevrons) and round caps/joins
 * are deliberate — the slightly bolder strokes read better in the
 * industrial paperwork density we are building toward.
 */

const base = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconArrowLeft(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={1.75} {...p}>
      <path d="M19 12H5" />
      <path d="M11 18l-6 -6 6 -6" />
    </svg>
  );
}

export function IconArrowRight(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={2} {...p}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6 -6 6" />
    </svg>
  );
}

export function IconPhone(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={1.75} {...p}>
      <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />
    </svg>
  );
}

export function IconMail(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={1.75} {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6l9 -6" />
    </svg>
  );
}

export function IconPlus(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={2} {...p}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconX(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={2} {...p}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export function IconSend(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={1.75} {...p}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20 -4 -9 -9 -4z" />
    </svg>
  );
}

export function IconChevronDown(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={1.75} {...p}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function IconUser(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={1.75} {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v2" />
    </svg>
  );
}

export function IconEdit(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={1.75} {...p}>
      <path d="M4 20h4l10.5 -10.5a2.121 2.121 0 0 0 -3 -3L5 17v3" />
      <path d="M13.5 6.5l3 3" />
    </svg>
  );
}

export function IconCalendar(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={1.75} {...p}>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M4 11h16" />
    </svg>
  );
}

export function IconClock(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={1.75} {...p}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

export function IconChevronRight(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={1.75} {...p}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function IconCopy(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={1.75} {...p}>
      <rect x="9" y="9" width="11" height="11" rx="1" />
      <path d="M5 15V6a1 1 0 0 1 1 -1h9" />
    </svg>
  );
}

export function IconCheck(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={2} {...p}>
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}

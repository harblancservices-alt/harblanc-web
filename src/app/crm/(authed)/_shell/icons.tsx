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

export function IconPipeline(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="4.5" height="16" rx="1" />
      <rect x="9.75" y="4" width="4.5" height="11" rx="1" />
      <rect x="16.5" y="4" width="4.5" height="7" rx="1" />
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

export function IconReports(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16l3-4 3 2 4-6" />
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

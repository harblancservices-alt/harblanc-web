import type { ReactNode } from "react";

/**
 * Outlined line icons for the Load Board — 1.5px strokes drawn on
 * `currentColor`, so every glyph inherits whatever text color its button, pill
 * or circle already resolved to. That is what keeps them theme-safe for free:
 * there is no hard-coded fill to go invisible when the admin flips to dark.
 *
 * Same construction as the Receivables screen's icon set (commit f436561), kept
 * as its own module here because the board draws eleven of them across four
 * subcomponents. No emoji anywhere on this screen.
 */

export type IconProps = { className?: string };

function Icon({
  children,
  className = "h-4 w-4",
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export const TruckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 16V6a1 1 0 0 1 1-1h9v11M13 9h4l4 3.5V16" />
    <circle cx="7.5" cy="17.5" r="2" />
    <circle cx="17" cy="17.5" r="2" />
    <path d="M9.5 17.5H15" />
  </Icon>
);

export const DollarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v18M16 7.5C16 6 14.2 5 12 5S8 6 8 7.8s1.6 2.4 4 3 4 1.3 4 3.2S14.2 19 12 19s-4-1-4-2.5" />
  </Icon>
);

export const WalletIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1" />
    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
    <path d="M21 10h-4a2 2 0 0 0 0 4h4v-4Z" />
  </Icon>
);

export const RoadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 3 4 21M17 3l3 18M12 3v3M12 10.5v3M12 18v3" />
  </Icon>
);

export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3h3.5l1.6 4-2.2 1.4a13 13 0 0 0 6.7 6.7L16 12.9l4 1.6V18a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 5.2 2 2 0 0 1 5 3Z" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

export const FilterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);

export const ExportIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 15V3m0 0L8 7m4-4 4 4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Icon>
);

export const InvoiceIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Icon>
);

export const TimelineIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="12" r="2.5" />
    <path d="M8.5 12h7" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19.5l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 15a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10.6 4.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7 2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.7 1Z" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 12.5 5.5 5.5L20 7" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const BoxIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
    <path d="m4 7 8 4 8-4M12 11v10" />
  </Icon>
);

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Icon>
);

export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 21V4m0 0h11l-2 3.5L16 11H5" />
  </Icon>
);

export const TrendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 17l5.5-5.5 3.5 3.5L21 6" />
    <path d="M15 6h6v6" />
  </Icon>
);

export const TargetIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.5" />
  </Icon>
);

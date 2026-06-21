import type { Metadata, Viewport } from "next";
import { Public_Sans, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/site/SiteChrome";
import { company } from "@/lib/company";
import { assets } from "@/lib/assets";

// Single family across the site — Public Sans (variable font, full range).
// Body @ 400, buttons/nav @ 600 (font-semibold), headlines @ 900 (font-display).
// Operational labels use font-mono utility which keeps Public Sans but
// applies tabular figures + disables the slashed/dotted zero (see globals.css).
const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
});

// IBM Plex Mono powers every operational label / number / reference in the
// HARBLANC admin: lane numerals, REQ IDs, dispatch refs, line-item tables,
// totals, BOL numbers. Replaces the prior font-mono mapping which was just
// Public Sans with tabular figures - real monospace renders as freight
// paperwork; pseudo-mono renders as a SaaS dashboard.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// IBM Plex Sans is available for any admin surface that wants to opt out of
// Public Sans for body copy. Not wired as the default; the marketing site
// still anchors on Public Sans.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Viewport — required so mobile browsers render the page at the device's
// actual width instead of the default ~980px desktop viewport. Without
// this, pinch-zooming to fit the page on mobile reveals the body's dark
// bg-neutral-950 as a gap on the side.
//
// maximumScale: 1 + userScalable: false stop iOS Safari from auto-zooming
// into a field on focus (Brent had to pinch back out after every tap).
// The >=16px input font-size backstop in globals.css covers the same case
// for any browser that ignores user-scalable.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: `${company.legalName} \u2014 Freight, Hotshot & Equipment Hauling`,
    template: `%s \u2014 ${company.shortName}`,
  },
  description:
    "Direct dispatch motor carrier. Hotshot, expedited, equipment, and general freight hauling. Request a quote in minutes.",
  openGraph: assets.ogImage
    ? {
        images: [
          {
            url: assets.ogImage,
            width: 1200,
            height: 630,
            alt: company.legalName,
          },
        ],
      }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${publicSans.variable} ${plexMono.variable} ${plexSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-fg">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}

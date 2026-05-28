import type { Metadata } from "next";
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
      className={`${publicSans.variable} ${plexMono.variable} ${plexSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-950 text-zinc-100">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}

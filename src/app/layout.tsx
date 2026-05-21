import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
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
      className={`${publicSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-950 text-zinc-100">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

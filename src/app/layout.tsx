import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { company } from "@/lib/company";
import { assets } from "@/lib/assets";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${company.legalName} — Freight, Hotshot & Equipment Hauling`,
    template: `%s — ${company.shortName}`,
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-950 text-zinc-100">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

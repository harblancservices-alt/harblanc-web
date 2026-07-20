import type { Metadata } from "next";
import { loadAllFiles } from "@/lib/admin/files";
import { FilesView } from "./FilesView";

export const metadata: Metadata = {
  title: "Files",
  robots: { index: false, follow: false },
};

/**
 * Admin → Files. A searchable, newest-first timeline of every uploaded file
 * across the app — load documents (rate con / BOL / POD / signed BOL),
 * maintenance receipts, and customer quote/application uploads — auto-named and
 * auto-categorized so any document is findable by its (broker) load number.
 */
export default async function FilesPage({
  searchParams,
}: {
  // `?q=` seeds the search box — the hand-off target for the global search
  // palette's Files results, which link here with the file's own name.
  searchParams: Promise<{ q?: string }>;
}) {
  const [items, sp] = await Promise.all([loadAllFiles(), searchParams]);
  return <FilesView items={items} initialQuery={sp.q ?? ""} />;
}

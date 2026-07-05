import { redirect } from "next/navigation";

/**
 * Legacy route — the Quotes list moved into the Operations hub. Redirect any
 * existing bookmarks / inbound links to the matching tab. The detail
 * (quotes/[id]) and trash (quotes/trash) sub-pages are unchanged and still
 * live under this segment.
 */
export default function QuotesRedirect() {
  redirect("/admin/operations?tab=quotes");
}

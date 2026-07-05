import { redirect } from "next/navigation";

/**
 * Legacy route — the Applications list moved into the Operations hub. Redirect
 * existing bookmarks / inbound links to the matching tab. The detail
 * (applications/[id]) and trash (applications/trash) sub-pages are unchanged
 * and still live under this segment.
 */
export default function ApplicationsRedirect() {
  redirect("/admin/operations?tab=applications");
}

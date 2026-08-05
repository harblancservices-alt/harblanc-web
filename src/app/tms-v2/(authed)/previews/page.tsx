import { redirect } from "next/navigation";

/** Bare /tms-v2/previews has no content of its own — the nav links directly
 * to /previews/email and /previews/pages. Redirect here so a bookmarked or
 * typed base URL still lands somewhere useful. */
export default function PreviewsIndexRedirectPage() {
  redirect("/tms-v2/previews/email");
}

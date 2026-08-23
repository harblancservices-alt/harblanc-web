/**
 * Shared contract for the Operations → Documents packet builder: the limits
 * and the filename rule, in one plain module so the client component
 * (PacketBuilder.tsx) and the route handler (packet/route.ts) can never
 * disagree about them.
 *
 * A PLAIN module on purpose — no "use server" directive anywhere in this
 * file. A "use server" file may only export async functions, so constants
 * and types shipped from one would break the build (and have broken uploads
 * in prod before). Route handlers have no such restriction, but the client
 * must not import from a route file either, so both sides import this.
 */

/** Max documents in one compiled folder. Guards the route against an accidental
 * "select all 500" that would blow the serverless function's memory while
 * every file is held in RAM for zipping. */
export const MAX_PACKET_DOCUMENTS = 25;

/** Max combined size of the selected files, before compression. Same reason
 * as MAX_PACKET_DOCUMENTS — the zip is assembled entirely in memory. */
export const MAX_PACKET_BYTES = 40 * 1024 * 1024;

/** Max characters accepted for the packet name (the zip's filename). */
export const MAX_PACKET_NAME_LENGTH = 80;

/** Response header carrying the final, server-decided zip filename, so the
 * browser-side download uses exactly the name the server built rather than
 * re-deriving it and drifting. Readable on a same-origin fetch. */
export const PACKET_FILENAME_HEADER = "x-packet-filename";

/**
 * Filesystem-safe name for the compiled folder's zip file. Conservative
 * character set (letters, digits, dot, dash, underscore, space), so a folder
 * named "New Customer Packet / 2026" can't produce a broken
 * Content-Disposition header. Falls back to "packet" when a name reduces to
 * nothing.
 *
 * SPACES ARE KEPT (they used to be collapsed to dashes): the rep types a
 * folder name, and the file that lands in Downloads should read as that
 * name — "New Customer Packet.zip", not "New-Customer-Packet.zip". A space
 * is legal inside the quoted filename of a Content-Disposition header and
 * on every filesystem this app targets; the characters that genuinely break
 * that header (quotes, backslashes, slashes, semicolons, non-ASCII) are
 * still stripped, which is the part that actually matters.
 */
export function safePacketFileName(name: string): string {
  const slug = (name || "")
    // Whitespace collapses FIRST, before the character filter — a tab or a
    // newline pasted into the field is a word separator, and stripping it as
    // a disallowed character would silently weld "New Customer" to "Packet".
    .replace(/\s+/g, " ")
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    // Removing a character from between two spaces leaves a double space,
    // so collapse once more after the filter. Same for runs of dashes.
    .replace(/ {2,}/g, " ")
    .replace(/-+/g, "-")
    .replace(/^[-. ]+|[-. ]+$/g, "")
    .slice(0, MAX_PACKET_NAME_LENGTH)
    .trimEnd();
  return slug || "packet";
}

/**
 * De-duplicates the names of the files going INTO the zip. Original
 * filenames are kept as-is (Brent's call — a vendor packet should contain
 * the documents under the names the org knows them by); a second file with
 * a name already taken gets " (2)", " (3)", … inserted before its
 * extension, exactly like a desktop file manager.
 */
export function dedupeEntryName(name: string, taken: Set<string>): string {
  const safe = name.trim() || "document";
  if (!taken.has(safe)) {
    taken.add(safe);
    return safe;
  }
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

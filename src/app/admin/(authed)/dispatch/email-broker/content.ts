/**
 * Email-a-Broker — the message content (subject + body lines), in ONE place so
 * the live in-app preview and the actually-sent email can never drift apart.
 *
 * Pure + client-and-server safe: no DB, no "use server". send-actions.ts renders
 * these into HTML/text; EmailBrokerView renders them into the preview.
 *
 * BODY RULE: these are plain lines with no styling metadata — the renderer gives
 * the whole body ONE uniform color and size, so nothing here is bold/grey/boxed.
 */

// Fixed signature identifiers shown on the first body line.
export const MC = "1467901";
export const DOT = "3918509";
export const PHONE_DISPLAY = "(832) 445-8775";

/** The email subject — the load itself, e.g. "Dallas, TX → Atlanta, GA". */
export function subjectFor(origin: string, destination: string): string {
  return `${origin} → ${destination}`;
}

/**
 * The message body as an ordered list of plain lines. The greeting/interest line
 * leads, with the MC/DOT/phone line directly beneath it; every line is one
 * uniform text style.
 */
export function bodyLines(origin: string, destination: string): string[] {
  return [
    `Hello — I'm interested in this load: ${origin} → ${destination}`,
    `MC ${MC} · DOT ${DOT} · ${PHONE_DISPLAY}`,
    "I've got a 40' hotshot empty and ready to go.",
    "If this is still available, give me a call or reply back to this email.",
  ];
}

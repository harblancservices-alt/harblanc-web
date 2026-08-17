import { Resend } from "resend";
import { reachSignatureHtml, REACH_TEXT_SIGNATURE } from "@/lib/domain/reach/signature";
import { loadReachSettings } from "@/lib/domain/reach/queries";
import { bodyLines, subjectFor } from "@/lib/domain/load-inquiry";

/**
 * Email-a-Broker — the SEND core. One email to a single broker about one
 * specific load. Reuses the Reach Resend integration and the branded
 * signature footer (both already neutral — src/lib/domain/reach/*, no
 * admin coupling since Phase 7), but is otherwise self-contained (no
 * templates, no markets, no suppression log).
 *
 * Shared by both /admin and /tms-v2, each of which adds only its own
 * app-specific behavior on top (demo-mode gate for /admin; nothing for
 * /tms-v2, which has no demo mode) — see the two wrapper files:
 * src/app/admin/(authed)/dispatch/email-broker/send-actions.ts and
 * src/actions/tms-v2/load-inquiry.ts.
 *
 * CRITICAL email rule: every line of the message BODY is the SAME color
 * and SAME size — no bold, grey, size variation, or highlighted boxes.
 * That's guaranteed here by rendering each line as a plain <p> that
 * inherits one body style. The branded signature footer below the body
 * is the existing Reach block.
 */

/** Absolute origin for the inline signature logo (emails need absolute URLs). */
const PUBLIC_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.harblancservices.com"
).replace(/\/$/, "");

/** Replies always land in the dispatch inbox (per spec — not settings-driven). */
const REPLY_TO = "Dispatch@Harblancservices.com";

/** Where "Send test" delivers — the owner's own inbox (identical to Reach). */
const TEST_RECIPIENT = "harblancservices@gmail.com";

export type BrokerEmailInput = {
  /** Broker email address (real send only). */
  to?: string;
  origin: string;
  destination: string;
};

export type BrokerSendResult =
  | { ok: true; to: string }
  | { ok: false; reason: string };

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

/**
 * Put a display name on an address spec (same helper Reach uses so the broker
 * sees the identical sender name). `addressSpec` may be bare or "Name <addr>".
 */
function withDisplayName(name: string, addressSpec: string): string {
  const spec = addressSpec.trim();
  const n = name.trim();
  if (!n) return spec;
  const m = spec.match(/<([^>]+)>/);
  const addr = (m ? m[1] : spec).trim();
  const safe = /[",<>@]/.test(n) ? `"${n.replace(/"/g, "")}"` : n;
  return `${safe} <${addr}>`;
}

/**
 * Wrap the body lines in email HTML — one uniform text style for the whole body
 * (color:#111, font-size:15px, no per-line styling) — then append the branded
 * Reach signature footer with the logo as a plain absolute-URL <img>.
 */
function renderHtml(lines: string[]): string {
  const footer = reachSignatureHtml(`${PUBLIC_ORIGIN}/reach-logo.png`);
  const body = lines
    .map((line) => `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:20px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;font-size:15px;line-height:1.6">${body}${footer}</body></html>`;
}

/** Plain-text alternative — the body lines plus the plain-text signature. */
function renderText(lines: string[]): string {
  return `${lines.join("\n\n")}\n\n${REACH_TEXT_SIGNATURE}`;
}

/** Resolve the From (same sender/display-name Reach uses) once per send. */
async function resolveFrom(): Promise<string> {
  const fromSpec =
    process.env.RESEND_FROM_ADDRESS ??
    "Harblanc Dispatch <dispatch@harblancservices.com>";
  let name = "";
  try {
    name = (await loadReachSettings()).replyToName;
  } catch {
    // Fall back to a bare sender if settings are unavailable.
  }
  return withDisplayName(name, fromSpec);
}

function cleanLoad(input: BrokerEmailInput): { origin: string; destination: string } | null {
  const origin = (input.origin ?? "").trim();
  const destination = (input.destination ?? "").trim();
  if (!origin || !destination) return null;
  return { origin, destination };
}

/**
 * Send the load email to a single broker. Confirmed in the UI before this runs.
 */
export async function sendBrokerEmail(
  input: BrokerEmailInput,
): Promise<BrokerSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured." };

  const to = (input.to ?? "").trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return { ok: false, reason: "Enter a valid broker email address." };
  }
  const load = cleanLoad(input);
  if (!load) {
    return { ok: false, reason: "Origin and destination are both required." };
  }

  const lines = bodyLines(load.origin, load.destination);
  const from = await resolveFrom();
  const resend = new Resend(apiKey);

  try {
    const res = await resend.emails.send({
      from,
      to: [to],
      subject: subjectFor(load.origin, load.destination),
      html: renderHtml(lines),
      text: renderText(lines),
      replyTo: REPLY_TO,
    });
    if (res.error) {
      return { ok: false, reason: res.error.message ?? "Send was rejected." };
    }
    return { ok: true, to };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Send failed.",
    };
  }
}

/**
 * Send the EXACT same email to the owner's test inbox (identical behavior to
 * Reach's test send: "[TEST]" subject prefix, only ever the authorized address).
 */
export async function sendBrokerEmailTest(
  input: BrokerEmailInput,
): Promise<BrokerSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured." };

  const load = cleanLoad(input);
  if (!load) {
    return { ok: false, reason: "Origin and destination are both required." };
  }

  const lines = bodyLines(load.origin, load.destination);
  const from = await resolveFrom();
  const resend = new Resend(apiKey);

  try {
    const res = await resend.emails.send({
      from,
      to: [TEST_RECIPIENT],
      subject: `[TEST] ${subjectFor(load.origin, load.destination)}`,
      html: renderHtml(lines),
      text: renderText(lines),
      replyTo: REPLY_TO,
    });
    if (res.error) {
      return { ok: false, reason: res.error.message ?? "Send was rejected." };
    }
    return { ok: true, to: TEST_RECIPIENT };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Send failed.",
    };
  }
}

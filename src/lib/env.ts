/**
 * Server-side environment validation.
 *
 * Called from the admin dashboard loader so missing or malformed env
 * vars surface as a soft banner instead of cryptic 500s deep in the
 * workflow.
 *
 * We split required from operational:
 *   - REQUIRED — without these the app cannot run. We don't throw here
 *     because that would brick the admin shell; instead we surface
 *     them in the banner so the operator can fix them.
 *   - OPERATIONAL — needed for emails, signed URLs, the public site
 *     origin used in customer links. Missing these don't crash the app
 *     but DO degrade specific flows. The banner explains the impact.
 *
 * validateEnv() returns an array of human-readable issue strings.
 * Empty array means everything is configured.
 */

type EnvSpec = {
  name: string;
  required: boolean;
  /** Human-readable description of what breaks when this is missing. */
  impact: string;
};

const ENV_VARS: ReadonlyArray<EnvSpec> = [
  {
    name: "SUPABASE_URL",
    required: true,
    impact:
      "Supabase URL not set — the admin and quote flow cannot read or write data.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    impact:
      "Supabase service-role key not set — server actions cannot bypass RLS.",
  },
  {
    name: "RESEND_API_KEY",
    required: false,
    impact:
      "RESEND_API_KEY not set — no emails will be delivered (estimates, finalized quotes, BOLs all fail silently).",
  },
  {
    name: "RESEND_FROM_ADDRESS",
    required: false,
    impact:
      "RESEND_FROM_ADDRESS not set — emails fall back to the Resend onboarding sender; deliverability will be poor.",
  },
  {
    name: "DISPATCH_EMAIL",
    required: false,
    impact:
      "DISPATCH_EMAIL not set — customer reply-to falls back to the company default; usually fine.",
  },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    required: false,
    impact:
      "NEXT_PUBLIC_SITE_URL not set — accept/decline links and logo URLs fall back to the production hostname.",
  },
  {
    // Phase Q2: Resend webhook signing secret. When unset, the
    // /api/resend-webhook route refuses to process events (returns 503
    // with no row mutations). This is deliberate — we will not accept
    // unauthenticated webhook payloads, even from localhost, because a
    // forged bounce event could silently mark a healthy send as
    // hard-bounced and poison the operator UI.
    name: "RESEND_WEBHOOK_SECRET",
    required: false,
    impact:
      "RESEND_WEBHOOK_SECRET not set — incoming Resend webhooks (bounce/complaint events) are rejected; sent-list bounce badges will never appear.",
  },
];

/**
 * Return a list of issue strings — one per misconfigured env var.
 * Required vars always raise an issue when missing. Optional vars
 * raise a softer informational issue.
 */
export function validateEnv(): string[] {
  const issues: string[] = [];
  for (const spec of ENV_VARS) {
    const value = process.env[spec.name];
    if (!value || value.trim().length === 0) {
      issues.push(spec.impact);
    }
  }
  return issues;
}

/**
 * Stricter check — used at server boot when we want to know whether the
 * app is functionally usable. Returns false when any REQUIRED var is
 * missing. Optional vars don't influence the boolean.
 */
export function envIsHealthy(): boolean {
  for (const spec of ENV_VARS) {
    if (!spec.required) continue;
    const value = process.env[spec.name];
    if (!value || value.trim().length === 0) return false;
  }
  return true;
}

/**
 * The single list of intake sources whose released, unclaimed crm_accounts
 * rows appear in the agent claim queue (/crm/ai-agent) — the tab itself,
 * claimAiLead()'s claim guard, and the nav badge's unclaimed count all
 * import this so the three surfaces can never drift out of sync (2026-08-21:
 * broadened from AI-agent/Field-Capture-only so BOL Center and OTR released
 * companies are claimable here too).
 *
 * This list only widens WHICH intake pipelines are eligible — the real gate
 * every consumer still applies is ai_status='released' AND assigned_user_id
 * IS NULL. A manually-created company (source NULL, or a source outside
 * this list) has ai_status NULL and so never leaks in regardless of this
 * list, and a company from one of these sources that's already claimed or
 * still pending review is equally excluded by that same gate.
 */
export const CLAIMABLE_LEAD_SOURCES = ["ai_agent", "field_capture", "bol", "otr"] as const;

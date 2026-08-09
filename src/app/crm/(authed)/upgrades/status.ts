/**
 * Upgrade-request status vocabulary — deliberately its own plain module, NOT
 * declared in actions.ts. A "use server" file may only export async
 * functions at runtime (type exports are fine — they're erased at compile
 * time — but a runtime value like this const array is not); actions.ts
 * previously exported UPGRADE_STATUSES directly and it broke every action in
 * that file in production (passed tsc/next build clean, failed at runtime —
 * same class of bug as the RSC function-prop crashes, see
 * use-server-export-shape-rule). actions.ts now only IMPORTS from here.
 */
export const UPGRADE_STATUSES = ["new", "in_review", "done"] as const;
export type UpgradeStatus = (typeof UPGRADE_STATUSES)[number];

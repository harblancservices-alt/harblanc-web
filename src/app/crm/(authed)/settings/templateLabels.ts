/**
 * The two Documents-tab card labels backed by a code-generated blank PDF
 * (Bill of Lading, Rate Confirmation) rather than an admin-uploaded file —
 * split out from blankTemplates.ts so this stays a plain, dependency-free
 * module. OrgDocumentsSection.tsx ("use client") imports ONLY this file for
 * the label check; blankTemplates.ts pulls in the server-only
 * @react-pdf/renderer PDF components (which reach Node's `fs` via
 * brandLogo.ts) and must never be imported from client code — importing it
 * here broke the client bundle (Turbopack tried to resolve 'fs' for the
 * browser) even though the actual PDF-building functions were never called
 * client-side.
 */
export const GENERATED_TEMPLATE_LABELS = ["Bill of Lading", "Rate Confirmation"] as const;
export type GeneratedTemplateLabel = (typeof GENERATED_TEMPLATE_LABELS)[number];

export function isGeneratedTemplateLabel(label: string): label is GeneratedTemplateLabel {
  return (GENERATED_TEMPLATE_LABELS as readonly string[]).includes(label);
}

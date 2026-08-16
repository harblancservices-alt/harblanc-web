/**
 * The two Documents-tab card labels backed by a code-generated blank PDF
 * (Bill of Lading, Rate Confirmation) rather than an admin-uploaded file —
 * split out from blankTemplates.ts so this stays a plain, dependency-free
 * module safe to import from client code. blankTemplates.ts pulls in the
 * server-only @react-pdf/renderer PDF components (which reach Node's `fs`
 * via brandLogo.ts) and must never be imported from a "use client" file —
 * importing it directly once broke the client bundle (Turbopack tried to
 * resolve 'fs' for the browser) even though the actual PDF-building
 * functions were never called client-side.
 */
export const GENERATED_TEMPLATE_LABELS = ["Bill of Lading", "Rate Confirmation"] as const;
export type GeneratedTemplateLabel = (typeof GENERATED_TEMPLATE_LABELS)[number];

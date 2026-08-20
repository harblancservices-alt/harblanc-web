import type { Metadata } from "next";
import "./crm-design.css";
import { StoreProvider } from "./_lib/store";
import { ToastHost } from "./_design/Toast";
import { CommandPalette } from "./_design/CommandPalette";

export const metadata: Metadata = {
  title: "CRM Redesign Prototype",
  description: "Internal click-through prototype — not the production CRM.",
};

/**
 * Root layout for the isolated design prototype. Deliberately does NOT
 * import anything from src/app/crm/** — no shared components, no shared
 * CSS classes, no shared auth. This file plus crm-design.css is the entire
 * dependency surface between this prototype and the rest of the codebase.
 */
export default function CrmDesignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="crm-design">
      <StoreProvider>
        {children}
        <ToastHost />
        <CommandPalette />
      </StoreProvider>
    </div>
  );
}

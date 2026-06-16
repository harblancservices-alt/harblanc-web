"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Owns the admin theme class on the portal wrapper. React controls the
 * class (admin-light / admin-dark) directly so nothing can strip it, and
 * it re-reads on the "harblanc-theme-change" event the Settings toggle
 * fires, plus cross-tab `storage` events. The inline script in the layout
 * still sets html[data-admin-theme] for a no-flash first paint.
 */
export function ThemeShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const read = () => {
      try {
        setTheme(
          localStorage.getItem("harblanc-theme") === "dark" ? "dark" : "light",
        );
      } catch {
        /* ignore */
      }
    };
    read();
    window.addEventListener("harblanc-theme-change", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("harblanc-theme-change", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return (
    <div
      className={
        (theme === "dark" ? "admin-dark" : "admin-light") +
        " min-h-screen bg-canvas text-fg"
      }
    >
      {children}
    </div>
  );
}

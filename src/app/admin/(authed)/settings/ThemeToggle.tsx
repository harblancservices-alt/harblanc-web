"use client";

import { useEffect, useState } from "react";

/**
 * Light / Dark toggle. Persists to localStorage ('harblanc-theme') and
 * flips html[data-admin-theme] live; the inline script in the admin layout
 * re-applies it on every load (no flash).
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("harblanc-theme");
    setTheme(saved === "dark" ? "dark" : "light");
  }, []);

  function apply(next: "light" | "dark") {
    setTheme(next);
    try {
      localStorage.setItem("harblanc-theme", next);
    } catch {
      /* ignore */
    }
    const root = document.documentElement;
    if (next === "dark") root.setAttribute("data-admin-theme", "dark");
    else root.removeAttribute("data-admin-theme");
    // Tell the portal shell (ThemeShell) to re-read and swap its class.
    window.dispatchEvent(new Event("harblanc-theme-change"));
  }

  return (
    <div className="mt-4 flex gap-2">
      {(["light", "dark"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => apply(t)}
          aria-pressed={theme === t}
          className={
            "flex-1 border-2 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.18em] transition-colors sm:flex-none sm:px-6 " +
            (theme === t
              ? "border-fg bg-fg text-canvas"
              : "border-line bg-card text-fg hover:bg-elevated")
          }
        >
          {t === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}

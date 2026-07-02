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
    <div className="mt-4 inline-flex rounded-md border border-line-strong bg-inset p-0.5">
      {(["light", "dark"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => apply(t)}
          aria-pressed={theme === t}
          className={
            "rounded px-6 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] transition-colors " +
            (theme === t
              ? "bg-graphite text-white shadow-e1"
              : "text-ink-2 hover:text-ink")
          }
        >
          {t === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}

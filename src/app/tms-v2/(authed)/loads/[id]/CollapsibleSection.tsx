"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

/** Generic collapsed-by-default section for low-touch-frequency content
 * (audit's "collapsed sections" principle) — auto-expands when the page
 * loads at its own #id (a deep-linked alert). */
export function CollapsibleSection({
  id,
  title,
  defaultOpen = false,
  headerAction,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === `#${id}`) {
      setOpen(true);
    }
  }, [id]);

  return (
    <section id={id} className="scroll-mt-16 flex flex-col gap-3 border-b border-line pb-6 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[15px] font-semibold text-fg">
          <span className={`inline-block text-fg-muted transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
            ›
          </span>
          {title}
        </button>
        {headerAction}
      </div>
      {open ? children : null}
    </section>
  );
}

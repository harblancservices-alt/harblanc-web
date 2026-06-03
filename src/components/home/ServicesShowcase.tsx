"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

/**
 * ServicesShowcase — desktop-only freight-first chapter showcase.
 *
 * Mobile (<sm) renders the photo-tile stack from page.tsx; this
 * component is mounted only on sm+ via `hidden sm:block`.
 *
 *   ┌────────────────────────────────────────────────────────┐  ← rounded-lg + faint border
 *   │            [photo, edge-to-edge of wrapper]              │
 *   │            h-[600px] md:h-[680px] lg:h-[720px]          │
 *   │                                                          │
 *   │  CATEGORY TITLE                                         │ ← text-7xl at lg
 *   │  ▔▔                                                       │ ← short red separator bar
 *   │  Tighter one-sentence description.                       │ ← max-w-md, ~2 lines
 *   │                                                          │
 *   │  STEEL & PIPE │ CONSTRUCTION │ HEAVY │ EXPED │ GENERAL   │ ← nav w/ pipe separators
 *   │  ▔▔▔▔▔▔▔▔                                                 │   active = red underline
 *   └────────────────────────────────────────────────────────┘
 *
 * Interaction (all silent):
 *   - 7s auto-advance; pauses on hover and focus
 *   - keyboard ← / → cycles categories
 *   - photos crossfade 700ms ease-out
 */

type Service = {
  slug: string;
  title: string;
  description: string;
  capabilities: string;
  photoSrc: string;
};

const AUTO_MS = 7000;

/**
 * Per-photo focal points so each subject sits naturally in the crop.
 */
const focalPoint: Record<string, string> = {
  "steel-pipe": "50% 62%",
  "construction-materials": "50% 50%",
  "heavy-equipment": "55% 58%",
  expedited: "50% 65%",
  general: "50% 55%",
};

export function ServicesShowcase({ services }: { services: Service[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // Silent auto-advance
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => {
      setActive((a) => (a + 1) % services.length);
    }, AUTO_MS);
    return () => clearTimeout(t);
  }, [active, paused, services.length]);

  // Keyboard ← / →
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        setActive((a) => (a + 1) % services.length);
      }
      if (e.key === "ArrowLeft") {
        setActive((a) => (a - 1 + services.length) % services.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [services.length]);

  const svc = services[active];
  const firstSentence =
    svc.description.split(/(?<=[.!?])\s+/)[0] ?? svc.description;

  return (
    <div
      className="relative h-[720px] w-full overflow-hidden rounded-lg border border-white/10 bg-black md:h-[820px] lg:h-[880px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Photos (stacked, crossfade) */}
      {services.map((s, i) => (
        <div
          key={s.slug}
          aria-hidden={i !== active}
          className={
            "absolute inset-0 transition-opacity duration-700 ease-out " +
            (i === active ? "z-0 opacity-100" : "z-0 opacity-0")
          }
        >
          <Image
            src={s.photoSrc}
            alt=""
            fill
            sizes="(min-width: 1200px) 1200px, 100vw"
            className="object-cover"
            style={{ objectPosition: focalPoint[s.slug] ?? "50% 50%" }}
            priority={i === 0}
          />
        </div>
      ))}

      {/* Soft bottom gradient — covers ~55% for legibility */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[55%] bg-gradient-to-t from-black/90 via-black/45 to-transparent"
      />

      {/* Bottom-left overlay — title + red bar + tighter description */}
      <div className="absolute inset-x-0 bottom-16 z-20 px-8 sm:bottom-20 sm:px-10 lg:bottom-24 lg:px-14">
        <h3 className="font-display text-5xl font-black uppercase tracking-tight text-white sm:text-6xl lg:text-7xl">
          {svc.title}
        </h3>
        <div aria-hidden className="mt-4 h-[2px] w-12 bg-red-500" />
        <p className="mt-4 max-w-md text-base leading-relaxed text-white lg:text-lg">
          {firstSentence}
        </p>
      </div>

      {/* Bottom-edge nav strip — text only with thin vertical separators */}
      <nav
        aria-label="Service categories"
        className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-x-5 gap-y-2 px-8 pb-5 sm:px-10 sm:pb-6 lg:gap-x-6 lg:px-14 lg:pb-7"
      >
        {services.flatMap((s, i) => {
          const isActive = i === active;
          const button = (
            <button
              key={s.slug}
              type="button"
              onClick={() => setActive(i)}
              aria-current={isActive ? "true" : undefined}
              className={
                "relative pb-2 font-display text-sm uppercase transition-colors duration-200 sm:text-base " +
                (isActive
                  ? "font-black tracking-[0.18em] text-white"
                  : "font-bold tracking-[0.14em] text-white/35 hover:text-white")
              }
            >
              {s.title}
              <span
                aria-hidden
                className={
                  "absolute inset-x-0 bottom-0 h-[2px] bg-red-500 transition-opacity duration-300 " +
                  (isActive ? "opacity-100" : "opacity-0")
                }
              />
            </button>
          );
          if (i === services.length - 1) return [button];
          const separator = (
            <span
              key={`sep-${s.slug}`}
              aria-hidden
              className="h-4 w-px self-center bg-white/15"
            />
          );
          return [button, separator];
        })}
      </nav>
    </div>
  );
}

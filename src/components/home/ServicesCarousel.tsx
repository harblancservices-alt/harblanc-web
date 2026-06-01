"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * ServicesCarousel — homepage Services section, rebuilt as a
 * featured-tile carousel with a right-side selector.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┬───────────────────┐
 *   │ Featured tile (auto-cycling)             │ Selector          │
 *   │   - photo + scrim                        │  · Service 01     │
 *   │   - badge + counter                      │  · Service 02     │
 *   │   - title + capability strip + body      │  · Service 03     │
 *   │   - red "Quote" CTA                      │  · Service 04     │
 *   │   - dots + prev/next                     │                   │
 *   └──────────────────────────────────────────┴───────────────────┘
 *
 * Interaction model:
 *   - Autoplay: red progress bar fills over AUTOPLAY_MS, then advances
 *   - Pause: on mouse hover or keyboard focus inside the carousel
 *   - Manual: prev/next arrows on the featured tile, or click any row
 *     in the selector
 *   - Keyboard: ← / → cycle, Esc toggles pause
 *   - Accessibility: honors prefers-reduced-motion (disables both the
 *     progress animation and the autoplay timer)
 *
 * The photoSrc on each service is a placeholder pulled from the
 * operations photo library; swap in dedicated per-service freight
 * photography by editing the serviceModules array in /src/app/page.tsx.
 */
export type CarouselService = {
  slug: string;
  title: string;
  capabilities: string;
  description: string;
  photoSrc: string;
  /** Where the title/description block lives over the photo. Defaults
   *  to "bottom" (text against a bottom-up scrim). "top" mirrors the
   *  composition for photos whose subject sits low in the frame
   *  (Steel & Pipe, Heavy Equipment, General Freight). */
  textPosition?: "top" | "top-third" | "bottom";
  /** Per-slide autoplay hold. Defaults to AUTOPLAY_MS. Slides with a
   *  longer durationMs sit on screen longer before advancing — used
   *  to give text-heavy or photo-rich slides more dwell time. */
  durationMs?: number;
};

const AUTOPLAY_MS = 5000;

export function ServicesCarousel({
  services,
}: {
  services: readonly CarouselService[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Read prefers-reduced-motion at mount via a lazy initializer so we
  // never call setState inside an effect just to seed the state.
  // The effect below only subscribes to subsequent changes.
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Autoplay — single setTimeout per active slide, cleared when paused
  // or when activeIndex changes. Each slide may carry its own
  // durationMs; missing values fall back to AUTOPLAY_MS so behavior
  // for unannotated slides is unchanged.
  useEffect(() => {
    if (paused || reducedMotion || services.length <= 1) return;
    const ms = services[activeIndex]?.durationMs ?? AUTOPLAY_MS;
    const t = window.setTimeout(
      () => setActiveIndex((i) => (i + 1) % services.length),
      ms,
    );
    return () => window.clearTimeout(t);
  }, [activeIndex, paused, reducedMotion, services]);

  // Keyboard navigation while the carousel has focus.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + services.length) % services.length);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % services.length);
      } else if (e.key === "Escape") {
        setPaused((p) => !p);
      }
    }
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [services.length]);

  const active = services[activeIndex];
  if (!active) return null;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="Services carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="grid grid-cols-1 gap-4 outline-none lg:grid-cols-[1.55fr_1fr] lg:gap-5"
    >
      {/* Featured tile */}
      <div className="card-cut relative h-[380px] overflow-hidden bg-[#1a1a1c] sm:h-[460px] lg:h-[500px]">
        {/* Photos — all four are rendered as absolute layers and
            crossfaded by toggling opacity on activeIndex. No on-screen
            autoplay progress bar; the autoplay timer still runs
            silently in the background. */}
        {services.map((s, i) => (
          <Image
            key={s.slug}
            src={s.photoSrc}
            alt=""
            fill
            sizes="(min-width: 1024px) 60vw, 100vw"
            priority={i === 0}
            className={
              "object-cover brightness-95 contrast-105 transition-opacity duration-700 ease-out " +
              (i === activeIndex ? "opacity-100" : "opacity-0")
            }
          />
        ))}
        {/* Scrim — darkens the half of the tile where the title block
            sits so text stays readable against any photo subject. When
            text is anchored to the top we flip the gradient to fade
            down (dark at top → lighter at bottom). */}
        <div
          aria-hidden
          className={
            "absolute inset-0 " +
            (active.textPosition === "top" || active.textPosition === "top-third"
              ? "bg-gradient-to-b from-black/45 via-black/20 to-black/10"
              : "bg-gradient-to-t from-black/45 via-black/20 to-black/10")
          }
        />

        {/* Content — title + description. Anchored to the bottom by
            default; `textPosition: "top"` mirrors it to the top so
            low-subject photos can breathe under the type. */}
        <div
          className={
            "absolute inset-x-4 z-10 max-w-[85%] " +
            (active.textPosition === "top"
              ? "top-6 sm:top-8"
              : active.textPosition === "top-third"
                ? "top-[30%]"
                : "bottom-14")
          }
        >
          <h3 className="font-display text-2xl font-bold uppercase leading-none tracking-tight text-white sm:text-3xl lg:text-4xl">
            {active.title}
          </h3>
          <p className="mt-2 max-w-md font-mono text-[11px] leading-relaxed text-zinc-200 sm:text-xs">
            {active.description}
          </p>
        </div>

      </div>

      {/* Selector — full list of services, current one highlighted.
          h-full stretches the column to match the featured tile so the
          two halves of the carousel read as one panel; each card uses
          flex-1 below to evenly fill the remaining vertical space. */}
      <div className="flex h-full flex-col gap-1.5">
        {services.map((s, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={s.slug}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-current={isActive ? "true" : undefined}
              className={
                "btn-cut group relative flex-1 px-3.5 py-3.5 text-left transition-colors " +
                (isActive
                  ? "border-l-[4px] border-l-red-600 bg-[#dcd5c2] pl-[8px]"
                  : "border-l-[3px] border-l-black/40 bg-[#cfc6b0] pl-[9px] hover:bg-[#dcd5c2]")
              }
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={
                    "mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full " +
                    (isActive
                      ? "bg-red-600 shadow-[0_0_0_3px_rgba(220,38,38,0.25)]"
                      : "border border-black/50")
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold uppercase leading-tight text-black">
                    {s.title}
                  </p>
                  {/* Description renders only on the active card. Inactive
                      cards stay title-only so the selector column reads
                      as a clean index rather than 5 dense paragraphs. */}
                  {isActive ? (
                    <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-zinc-900">
                      {s.description}
                    </p>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

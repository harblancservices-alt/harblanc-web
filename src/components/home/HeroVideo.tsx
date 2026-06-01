"use client";

import { useEffect, useRef } from "react";

/**
 * HeroVideo — thin client wrapper around the homepage hero <video>.
 *
 * Exists only so we can set `playbackRate` after the element mounts;
 * a server component cannot reach into the DOM. Visual behavior
 * (autoplay, loop, muted, playsInline, cover positioning) is
 * identical to a bare <video> tag — this just slows the clip down
 * 25% so the freight footage reads more cinematic than dashcam.
 */
const PLAYBACK_RATE = 0.75;

export function HeroVideo({
  src,
  poster,
  className,
  style,
}: {
  src: string;
  poster?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.playbackRate = PLAYBACK_RATE;
    // Some browsers reset playbackRate on `loadeddata` — re-apply.
    const handler = () => {
      el.playbackRate = PLAYBACK_RATE;
    };
    el.addEventListener("loadeddata", handler);
    el.addEventListener("ratechange", () => {
      if (el.playbackRate !== PLAYBACK_RATE) el.playbackRate = PLAYBACK_RATE;
    });
    return () => {
      el.removeEventListener("loadeddata", handler);
    };
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      className={className}
      style={style}
    />
  );
}

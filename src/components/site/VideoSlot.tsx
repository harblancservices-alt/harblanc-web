import type { ReactNode } from "react";

export function VideoSlot({
  src,
  poster,
  aspectRatio = "16 / 9",
  className = "",
  fallback = null,
}: {
  src: string | null;
  poster?: string;
  aspectRatio?: string;
  className?: string;
  fallback?: ReactNode;
}) {
  if (!src) {
    return fallback as React.ReactElement | null;
  }
  return (
    <div
      className={`relative w-full overflow-hidden bg-neutral-900 ${className}`}
      style={{ aspectRatio }}
    >
      <video
        src={src}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

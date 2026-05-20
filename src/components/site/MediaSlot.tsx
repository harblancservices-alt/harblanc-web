import Image from "next/image";
import type { ReactNode } from "react";

export function MediaSlot({
  src,
  alt,
  aspectRatio = "16 / 9",
  position = "center center",
  overlay = false,
  overlayOpacity = 0.4,
  priority = false,
  sizes = "(min-width: 1024px) 50vw, 100vw",
  className = "",
  fallback = null,
}: {
  src: string | null;
  alt: string;
  aspectRatio?: string;
  position?: string;
  overlay?: boolean;
  overlayOpacity?: number;
  priority?: boolean;
  sizes?: string;
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
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className="object-cover"
        style={{ objectPosition: position }}
      />
      {overlay && (
        <div
          aria-hidden
          className="absolute inset-0 bg-black pointer-events-none"
          style={{ opacity: overlayOpacity }}
        />
      )}
    </div>
  );
}

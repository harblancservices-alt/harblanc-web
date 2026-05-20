import Image from "next/image";
import { assets } from "@/lib/assets";
import { company } from "@/lib/company";

type Variant = "default" | "compact" | "inverted";

function pickSource(variant: Variant): string | null {
  if (variant === "compact") {
    return assets.logoCompact ?? assets.logoPrimary;
  }
  if (variant === "inverted") {
    return assets.logoInverted ?? assets.logoPrimary;
  }
  return assets.logoPrimary;
}

export function BrandLogo({
  variant = "default",
  className = "h-9 w-auto",
  priority = false,
}: {
  variant?: Variant;
  className?: string;
  priority?: boolean;
}) {
  const src = pickSource(variant);

  if (src) {
    return (
      <Image
        src={src}
        alt={company.legalName}
        width={480}
        height={144}
        priority={priority}
        className={className}
      />
    );
  }

  // Typographic fallback — used until a logo file is wired into src/lib/assets.ts.
  return (
    <span className="flex items-center gap-3 whitespace-nowrap text-white">
      <span className="inline-block h-5 w-1.5 bg-red-600" aria-hidden />
      <span className="font-black uppercase tracking-tight text-base sm:text-lg">
        HARBLANC{" "}
        <span className="text-neutral-400 font-bold">SERVICES</span>
      </span>
    </span>
  );
}

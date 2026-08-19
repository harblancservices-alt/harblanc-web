import Link from "next/link";
import { IconChevronLeft } from "../_design/icons";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--cd-text-muted)] hover:text-[var(--cd-accent)]">
      <IconChevronLeft width={14} height={14} />
      Back to {label}
    </Link>
  );
}

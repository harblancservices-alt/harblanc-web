import { normalizeHref, type LinkEntry } from "./contactFields";

/** Read-only display of a labeled link list as clickable chips. Pure/no
 * hooks so it drops into server components (company profile's left column)
 * as-is. */
export function LinkList({ links, emptyText }: { links: LinkEntry[]; emptyText?: string }) {
  if (!links.length) {
    return emptyText ? <p className="text-[13px] text-fg-subtle">{emptyText}</p> : null;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {links.map((l, i) => (
        <li key={i}>
          <a
            href={normalizeHref(l.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-inset px-3 py-1.5 text-[12.5px] font-semibold text-accent hover:underline"
          >
            {l.label || l.url} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}

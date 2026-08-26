"use client";

import { useRouter } from "next/navigation";

/**
 * "Whose dashboard am I looking at" — owner-only, rendered beside the
 * command-centre link at the top of /crm?view=agent.
 *
 * Navigation, not state: it pushes `?view=agent&as=<id>` so the server
 * re-reads for that person. The URL is the whole selection, which means a
 * preview is shareable and survives a refresh, and there is no client copy
 * of it to drift. The server re-validates the id against the active roster
 * regardless (see AgentHome) — this control only ever offers real people,
 * but it is not what makes that true.
 */
export function AgentViewPicker({
  people,
  selected,
}: {
  people: { id: string; name: string }[];
  selected: string;
}) {
  const router = useRouter();

  if (people.length === 0) return null;

  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[12px] text-fg-muted">Viewing as</span>
      <select
        value={selected}
        onChange={(e) => router.push(`/crm?view=agent&as=${e.target.value}`)}
        className="rounded-md border border-line-strong bg-card px-2 py-1 text-[12px] font-semibold text-fg"
      >
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

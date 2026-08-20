"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead } from "../../../_shell/ui";
import { saveResearchNotes } from "../actions";

/**
 * "Research" — extra intelligence the upstream Claude session found (web
 * presence, business context, anything beyond what's printed on the BOL
 * itself). Kept in its own card, separately labeled from InformationSection's
 * "From BOL" fields, so the two are never confused about what's on the
 * document versus what was found about it.
 */
export function ResearchSection({ bolId, notes }: { bolId: string; notes: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(notes ?? "");
  const [, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await saveResearchNotes(bolId, value);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHead title="Research" hint="From the upstream research pass — not printed on the BOL itself" />
      <div className="p-4">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          placeholder="No research notes yet."
          className="h-28 w-full resize-none rounded-md border border-line-strong bg-inset p-2.5 text-[13px] text-fg outline-none focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/20"
        />
      </div>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN_PRIMARY } from "../../_shell/ui";
import { IconAiAgent } from "../../_shell/icons";
import { generateAiSuggestions } from "./ai-field-mapper";

export function GenerateSuggestionsButton({ accountId }: { accountId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await generateAiSuggestions(accountId);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_PRIMARY}`}
      >
        <IconAiAgent width={14} height={14} />
        {pending ? "Generating…" : "Generate suggestions"}
      </button>
      {error && <p className="max-w-[220px] text-right text-[11px] text-bad">{error}</p>}
    </div>
  );
}

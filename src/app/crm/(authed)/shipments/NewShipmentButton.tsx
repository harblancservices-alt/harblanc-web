"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN_PRIMARY } from "../_shell/ui";
import { FormError } from "../_shell/form";
import { IconPlus } from "../_shell/icons";
import { createShipment } from "./actions";

/**
 * Creates a shipment on click — the only place a shipment is ever created.
 * Runs createShipment() as a real Server Action invocation (event handler,
 * not render), so reloading /crm/shipments never spawns a row: nothing here
 * mutates until the button is pressed.
 */
export function NewShipmentButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await createShipment({});
      if (result.ok) router.push(`/crm/shipments/${result.id}`);
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-bold shadow-e2 transition-all hover:-translate-y-0.5 hover:shadow-e3 disabled:pointer-events-none disabled:opacity-60 ${BTN_PRIMARY}`}
      >
        <IconPlus width={16} height={16} />
        {pending ? "Creating…" : "New Shipment"}
      </button>
      {error && <FormError message={error} />}
    </div>
  );
}

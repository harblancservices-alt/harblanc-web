"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { updateReachSettings } from "@/app/admin/(authed)/dispatch/reach/actions";
import { LEVERAGES, STYLE_LABEL, type ReachSettings, type Leverage } from "@/app/admin/(authed)/dispatch/reach/types";
import { formatPhone, formatPhoneInput } from "@/lib/domain/phone";

/** Reach's own settings — truck line, reply-to identity, default style, and
 * the exact-town precision toggle. Reuses V1's updateReachSettings action
 * unchanged. */
export function ReachSettingsForm({ settings }: { settings: ReachSettings }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState(() => formatPhone(settings.phone) || settings.phone);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const res = await updateReachSettings({
      truckLine: String(fd.get("truck_line") ?? ""),
      replyToName: String(fd.get("reply_to_name") ?? ""),
      showExactTown: fd.get("show_exact_town") === "on",
      defaultLeverage: fd.get("default_leverage") as Leverage,
      replyToEmail: String(fd.get("reply_to_email") ?? ""),
      mc: String(fd.get("mc") ?? ""),
      phone: String(fd.get("phone") ?? ""),
    });
    setPending(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setError(res.reason);
    }
  }

  return (
    <div className="border-t border-line pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[13px] font-medium text-fg-muted hover:text-fg">
        {open ? "▾" : "▸"} Reach settings
      </button>
      {open ? (
        <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
              Truck line ({"{equipment}"} token)
              <input name="truck_line" defaultValue={settings.truckLine} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
              Reply-to name
              <input name="reply_to_name" defaultValue={settings.replyToName} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
              Reply-to email
              <input name="reply_to_email" type="email" defaultValue={settings.replyToEmail} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
              Default style
              <select name="default_leverage" defaultValue={settings.defaultLeverage} className="h-9 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg focus:border-fg focus:outline-none">
                {LEVERAGES.map((l) => (
                  <option key={l} value={l}>
                    {STYLE_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
              MC # (signature)
              <input name="mc" defaultValue={settings.mc} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
              Phone (signature)
              <input
                name="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                autoComplete="off"
                className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
            <input type="checkbox" name="show_exact_town" defaultChecked={settings.showExactTown} className="h-4 w-4" />
            Show precision town/distance parenthetical
          </label>
          {error ? <p className="text-[13px] font-medium text-bad">{error}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

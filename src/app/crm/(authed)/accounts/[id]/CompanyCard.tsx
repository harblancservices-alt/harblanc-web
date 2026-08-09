"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, BTN_PRIMARY, BTN_NEUTRAL } from "../../_shell/ui";
import { Field, SubmitButton, FormError, CONTROL } from "../../_shell/form";
import { PhonesEditor } from "../../_shell/PhonesEditor";
import { LinksEditor } from "../../_shell/LinksEditor";
import { PhoneList } from "../../_shell/PhoneList";
import { LinkList } from "../../_shell/LinkList";
import { IconX } from "../../_shell/icons";
import type { PhoneEntry, LinkEntry } from "../../_shell/contactFields";
import { updateAccount } from "../actions";
import type { RepOption } from "../CompanyDialog";
import { LifecycleControl } from "./LifecycleControl";
import { RepControl } from "./RepControl";
import { CommodityPhotoTiles, type CrmCommodityPhoto } from "./CommodityPhotoTiles";

function parseCommodities(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
      {children}
    </p>
  );
}

/**
 * The permanent LEFT column of the company profile — stays mounted across
 * every tab (it lives outside ProfileTabs in page.tsx, not inside it).
 * Lifecycle stage and assigned rep are always-live controls (their own
 * dedicated instant-save actions, same as before); "Edit" toggles the rest
 * of the card (name/address/phones/links/commodities) between a read-only
 * view and one inline form that saves through the shared updateAccount
 * action — no modal. Commodity photos are their own always-visible uploader
 * (upload is its own action regardless of the Edit toggle).
 */
export function CompanyCard({
  accountId,
  orgId,
  name,
  stage,
  assignedUserId,
  reps,
  address,
  city,
  state,
  zip,
  phones,
  links,
  commodities,
  photos,
}: {
  accountId: string;
  orgId: string;
  name: string;
  stage: string;
  assignedUserId: string | null;
  reps: RepOption[];
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phones: PhoneEntry[];
  links: LinkEntry[];
  commodities: string | null;
  photos: CrmCommodityPhoto[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [chips, setChips] = useState<string[]>(() => parseCommodities(commodities));
  const [chipInput, setChipInput] = useState("");
  const router = useRouter();

  // Re-sync the chip list from the latest saved value every time Edit opens
  // — local chip state otherwise wouldn't pick up a change made elsewhere
  // (e.g. the Details tab's full edit dialog) since it isn't a plain
  // uncontrolled input that remounts fresh with the form. Adjusted during
  // render (React's documented "adjusting state when a prop changes"
  // pattern) rather than in an effect, which would cost an extra render.
  const [prevEditing, setPrevEditing] = useState(editing);
  if (editing !== prevEditing) {
    setPrevEditing(editing);
    if (editing) setChips(parseCommodities(commodities));
  }

  const location = [city, state].filter(Boolean).join(", ");
  const fullAddress = [address, location, zip].filter(Boolean).join(", ");
  const viewChips = parseCommodities(commodities);

  function addChip() {
    const v = chipInput.trim();
    if (!v) return;
    setChips((prev) => (prev.some((c) => c.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]));
    setChipInput("");
  }
  function removeChip(v: string) {
    setChips((prev) => prev.filter((c) => c !== v));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("commodities", chips.join(", "));
    setError(null);
    startTransition(async () => {
      const res = await updateAccount(accountId, formData);
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHead
        title="Company"
        right={
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEditing((v) => !v);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              editing ? BTN_NEUTRAL : BTN_PRIMARY
            }`}
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        }
      />
      <div className="flex min-w-0 flex-col gap-5 p-4">
        <div>
          <SectionLabel>Lifecycle stage</SectionLabel>
          <LifecycleControl accountId={accountId} current={stage} />
        </div>

        <div>
          <SectionLabel>Assigned rep</SectionLabel>
          <RepControl accountId={accountId} current={assignedUserId} reps={reps} />
        </div>

        {editing ? (
          <form onSubmit={onSubmit} className="flex w-full min-w-0 flex-col gap-3.5">
            <FormError message={error} />

            <Field label="Company name" name="name" required defaultValue={name} />

            <Field label="Address" name="address" defaultValue={address} />
            <Field label="City" name="city" defaultValue={city} />
            <div className="flex w-full gap-2">
              <div className="w-20 shrink-0">
                <Field label="State" name="state" defaultValue={state} />
              </div>
              <div className="min-w-0 flex-1">
                <Field label="ZIP" name="zip" defaultValue={zip} />
              </div>
            </div>

            <PhonesEditor defaultValue={phones} compact />
            <LinksEditor defaultValue={links} compact />

            <div>
              <SectionLabel>Commodities</SectionLabel>
              {chips.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 border border-line-strong bg-inset py-1 pl-3 pr-1.5 text-[12.5px] font-medium text-fg"
                    >
                      {c}
                      <button
                        type="button"
                        onClick={() => removeChip(c)}
                        aria-label={`Remove ${c}`}
                        className="flex h-5 w-5 items-center justify-center text-fg-subtle hover:bg-bad-bg hover:text-bad"
                      >
                        <IconX width={11} height={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chipInput}
                  onChange={(e) => setChipInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChip();
                    }
                  }}
                  placeholder="e.g. Reefer"
                  className={`h-10 min-w-0 flex-1 ${CONTROL}`}
                />
                <button
                  type="button"
                  onClick={addChip}
                  className={`shrink-0 rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${BTN_PRIMARY}`}
                >
                  + Add
                </button>
              </div>
            </div>

            <SubmitButton pending={pending}>Save changes</SubmitButton>
          </form>
        ) : (
          <>
            <div>
              <SectionLabel>Address</SectionLabel>
              <p className={`text-[14px] ${fullAddress ? "text-fg" : "text-fg-subtle"}`}>
                {fullAddress || "—"}
              </p>
            </div>

            <div>
              <SectionLabel>Phone numbers</SectionLabel>
              <PhoneList accountId={accountId} phones={phones} emptyText="No phone numbers on file." />
            </div>

            <div>
              <SectionLabel>Links</SectionLabel>
              <LinkList links={links} emptyText="No links on file." />
            </div>

            <div>
              <SectionLabel>Commodities</SectionLabel>
              {viewChips.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {viewChips.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center border border-line-strong bg-inset px-3 py-1 text-[12.5px] font-medium text-fg"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-fg-subtle">No commodities on file.</p>
              )}
            </div>
          </>
        )}

        <div>
          <SectionLabel>Commodity photos</SectionLabel>
          <CommodityPhotoTiles accountId={accountId} orgId={orgId} photos={photos} />
        </div>
      </div>
    </Card>
  );
}

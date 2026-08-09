"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../../_shell/ui";
import { Field, SubmitButton, FormError, CONTROL } from "../../_shell/form";
import { PhonesEditor } from "../../_shell/PhonesEditor";
import { LinksEditor } from "../../_shell/LinksEditor";
import { PhoneList } from "../../_shell/PhoneList";
import { LinkList } from "../../_shell/LinkList";
import { IconX } from "../../_shell/icons";
import type { PhoneEntry, LinkEntry } from "../../_shell/contactFields";
import { updateAccount } from "../actions";
import { BackButton } from "../../_shell/BackButton";
import { ActivitySection, type CrmActivityItem } from "./ActivitySection";

function parseCommodities(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * commodities is one free-text field, but in practice it often carries a
 * handful of short tags followed by a longer researched description (e.g.
 * "Custom furniture, fixtures, lighting, and interior build-outs —
 * fabricated in-house and shipped nationwide..."). Naively comma-splitting
 * the WHOLE string into chips turns that trailing sentence into a run of
 * ugly little boxes. This walks the comma-split fragments and keeps them as
 * chips only while each one still reads like a short tag (no sentence
 * punctuation, under ~28 chars); the first fragment that doesn't qualify —
 * plus everything after it, REJOINED with ", " to restore the original
 * prose rather than leaving it comma-fragmented — becomes one clean
 * paragraph instead. A value that's all short tags (most companies) yields
 * no prose at all; a value that's pure description yields no chips at all.
 */
function splitCommodities(value: string | null): { chips: string[]; prose: string | null } {
  const parts = parseCommodities(value);
  const chips: string[] = [];
  let proseStart = -1;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length <= 28 && !/[.!?]|—/.test(part)) {
      chips.push(part);
    } else {
      proseStart = i;
      break;
    }
  }
  const prose = proseStart === -1 ? null : parts.slice(proseStart).join(", ");
  return { chips, prose };
}

function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
      {children}
    </p>
  );
}

const BAR_BACK_BTN =
  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-bar-fg/80 transition-colors hover:bg-white/10 hover:text-bar-fg";

const TAB_BTN_BASE =
  "px-3 py-1.5 text-[12.5px] font-bold transition-colors rounded-lg";

/**
 * The permanent LEFT column of the company profile — stays mounted across
 * every tab (it lives outside ProfileTabs in page.tsx, not inside it). Its
 * own black bar holds Back (left), centered Company/Activity tabs, and Edit
 * (right) — Back moved off its old standalone row into here, and lifecycle
 * stage / assigned rep moved UP to the profile's top title strip (see
 * page.tsx), so this card only carries address/phones/links/commodities
 * (Company tab) plus the relocated activity feed (Activity tab, calls +
 * events, no notes — see ActivitySection.tsx). Commodity photos moved to the
 * Details tab. "Edit" toggles the Company tab's fields between a read-only
 * view and one inline form that saves through the shared updateAccount
 * action — no modal; clicking it while on Activity switches back to Company
 * first so the form is actually visible.
 */
export function CompanyCard({
  accountId,
  fallbackHref,
  name,
  address,
  city,
  state,
  zip,
  phones,
  links,
  commodities,
  activityItems,
}: {
  accountId: string;
  fallbackHref: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phones: PhoneEntry[];
  links: LinkEntry[];
  commodities: string | null;
  activityItems: CrmActivityItem[];
}) {
  const [tab, setTab] = useState<"company" | "activity">("company");
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
  const { chips: viewChips, prose: commodityProse } = splitCommodities(commodities);

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

  function toggleEdit() {
    setError(null);
    setTab("company");
    setEditing((v) => !v);
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 border-b border-graphite-line bg-bar px-2.5 py-2.5">
        <div className="flex flex-1 justify-start">
          <BackButton fallbackHref={fallbackHref} className={BAR_BACK_BTN} />
        </div>
        <div role="tablist" aria-label="Company card sections" className="flex shrink-0 gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "company"}
            onClick={() => setTab("company")}
            className={`${TAB_BTN_BASE} ${tab === "company" ? "bg-white/15 text-bar-fg" : "text-bar-fg/60 hover:bg-white/10 hover:text-bar-fg"}`}
          >
            Company
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "activity"}
            onClick={() => setTab("activity")}
            className={`${TAB_BTN_BASE} ${tab === "activity" ? "bg-white/15 text-bar-fg" : "text-bar-fg/60 hover:bg-white/10 hover:text-bar-fg"}`}
          >
            Activity
          </button>
        </div>
        <div className="flex flex-1 justify-end">
          <button
            type="button"
            onClick={toggleEdit}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              editing
                ? "border border-white/25 bg-white/5 text-bar-fg/70 hover:bg-white/10"
                : "border border-white/25 bg-white/10 text-bar-fg hover:bg-white/20"
            }`}
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>
      </div>

      {tab === "activity" ? (
        <ActivitySection accountId={accountId} items={activityItems} />
      ) : (
        <div className="flex min-w-0 flex-col gap-5 p-4">
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
                    className="shrink-0 rounded-lg border border-accent bg-accent px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-hover"
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
                {fullAddress ? (
                  <a
                    href={mapsHref(fullAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] text-accent hover:underline"
                  >
                    {fullAddress}
                  </a>
                ) : (
                  <p className="text-[14px] text-fg-subtle">—</p>
                )}
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
                {viewChips.length > 0 && (
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
                )}
                {commodityProse && (
                  <p
                    className={`text-[13.5px] leading-relaxed text-fg-muted ${viewChips.length ? "mt-2" : ""}`}
                  >
                    {commodityProse}
                  </p>
                )}
                {!viewChips.length && !commodityProse && (
                  <p className="text-[13px] text-fg-subtle">No commodities on file.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

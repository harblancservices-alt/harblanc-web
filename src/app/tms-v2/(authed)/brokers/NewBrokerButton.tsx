"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { Button } from "@/components/tms-v2/ui/Button";
import { Fab } from "@/components/tms-v2/ui/Fab";
import { createBroker } from "@/actions/tms-v2/brokers";
import type { MutationResult } from "@/lib/demo/mutation";
import { Field, PhoneField, FormError, FormActions } from "../loads/_form";

type SaveState = { ok: boolean; error: string | null; id: string | null };
const INITIAL: SaveState = { ok: false, error: null, id: null };
const FORM_ID = "tms-v2-new-broker-form";

const TOGGLE_BASE = "px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors";

/** Compact "+ New" button (every breakpoint — the Brokers list's compact-
 * directory redesign wants it inline beside search on mobile too, not
 * just desktop) + Fab (kept per Brent's explicit ask, still mobile-only)
 * for a dedicated "New broker" flow — closes the audit's Critical Brokers
 * gap (create was previously only possible implicitly, incompletely, via
 * the Load form's free-text field).
 *
 * MC/DOT lookup (audit fix, 2026-08-08): this modal previously had plain
 * MC#/DOT# text fields with no lookup, unlike the Load form's broker
 * section — same /api/admin/fmcsa proxy, same toggle+input+button UI,
 * ported verbatim from LoadFormModal.tsx's runBrokerLookup rather than a
 * second implementation. A hit fills Name/MC/DOT/Phone here too (the Load
 * form only has a single free-text broker name field to fill; this modal
 * has real separate Name/Phone fields, so the lookup can fill both). */
export function NewBrokerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [mcNumber, setMcNumber] = useState("");
  const [dotNumber, setDotNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [lookupKind, setLookupKind] = useState<"mc" | "dot">("mc");
  const [lookupVal, setLookupVal] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult<{ id: string }> = await createBroker(formData);
    return result.ok ? { ok: true, error: null, id: result.data?.id ?? null } : { ok: false, error: result.reason, id: null };
  }, INITIAL);

  useEffect(() => {
    if (state.ok && state.id) {
      setOpen(false);
      router.push(`/tms-v2/brokers/${state.id}`);
    }
  }, [state.ok, state.id, router]);

  async function runLookup() {
    const v = lookupVal.trim();
    if (!v) return;
    setLookupLoading(true);
    setLookupMsg(null);
    try {
      const res = await fetch(`/api/admin/fmcsa?${lookupKind}=${encodeURIComponent(v)}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupMsg({ tone: "err", text: data?.error ?? "No match found." });
        return;
      }
      setName(data.name ?? data.dbaName ?? "");
      setMcNumber(data.mcNumber ?? (lookupKind === "mc" ? v : ""));
      setDotNumber(data.dotNumber ?? (lookupKind === "dot" ? v : ""));
      if (data.phone) setPhone(data.phone);
      const op = data.allowedToOperate === false ? " — NOT allowed to operate" : "";
      setLookupMsg({
        tone: data.allowedToOperate === false ? "err" : "ok",
        text: `${data.name ?? data.dbaName ?? "Found"}${op}`,
      });
    } catch {
      setLookupMsg({ tone: "err", text: "Network error reaching FMCSA." });
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} className="shrink-0">
        + New
      </Button>
      <Fab label="New broker" onClick={() => setOpen(true)} className="sm:hidden" />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New broker"
        footer={
          <div className="flex flex-col gap-2">
            <FormError message={state.error} />
            <FormActions>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" form={FORM_ID} disabled={pending} aria-busy={pending}>
                {pending ? "Creating…" : "Create broker"}
              </Button>
            </FormActions>
          </div>
        }
      >
        <form id={FORM_ID} action={formAction} className="flex flex-col gap-3">
          <Field
            label="Name"
            name="name"
            placeholder="Broker company name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />

          <div>
            <input type="hidden" name="mc_number" value={mcNumber} />
            <input type="hidden" name="dot_number" value={dotNumber} />
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-md border border-line-strong">
                {(["mc", "dot"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setLookupKind(k)}
                    className={`${TOGGLE_BASE} ${lookupKind === k ? "bg-fg text-canvas" : "bg-card text-fg-muted hover:bg-elevated"}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <input
                value={lookupVal}
                onChange={(e) => setLookupVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runLookup();
                  }
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder={lookupKind === "mc" ? "MC number" : "DOT number"}
                className="h-9 w-32 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => void runLookup()} disabled={lookupLoading || !lookupVal.trim()}>
                {lookupLoading ? "…" : "Look up"}
              </Button>
              {lookupMsg ? (
                <span className={`truncate text-[12px] ${lookupMsg.tone === "err" ? "text-bad" : "text-ok"}`}>{lookupMsg.text}</span>
              ) : mcNumber || dotNumber ? (
                <span className="truncate text-[12px] text-fg-muted">
                  MC {mcNumber || "—"} · DOT {dotNumber || "—"}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* PhoneField manages its own internal formatted-value state,
                seeded from defaultValue only on mount (see its own header
                comment) — remounting via `key` is how a lookup result gets
                pushed into it without changing that established API. */}
            <PhoneField key={phone} label="Phone" name="phone" defaultValue={phone} />
            <Field label="Email" name="email" type="email" />
          </div>
          <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
            <input type="checkbox" name="factoring" className="h-4 w-4" />
            Factoring
          </label>
        </form>
      </Modal>
    </>
  );
}

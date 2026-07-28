"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardHead } from "../_shell/ui";
import { CONTROL, FormError } from "../_shell/form";
import { Recorder } from "./Recorder";
import { ReviewLeadCard, type DraftLead } from "./ReviewLeadCard";
import { parseFieldCapture, saveFieldCapture, type SaveLeadInput } from "./actions";

type Step = "capture" | "review" | "done";

type DoneSummary = { contactsAddedToExisting: number; newCompaniesForReview: number };

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `lead-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toSaveInput(lead: DraftLead): SaveLeadInput {
  const { _id, matches, ...rest } = lead;
  void _id;
  void matches;
  return rest;
}

/**
 * Field Capture's whole client-side flow: capture -> review -> done. Kept as
 * one client component (rather than passing state between server and client
 * pieces) because the working data — the transcript, the parsed leads, and
 * every in-progress edit — only ever needs to exist in the browser until the
 * final save, so there's nothing here for a server component to usefully own.
 */
export function FieldCaptureApp() {
  const [step, setStep] = useState<Step>("capture");
  const [transcript, setTranscript] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();

  const [leads, setLeads] = useState<DraftLead[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const [summary, setSummary] = useState<DoneSummary | null>(null);

  function appendTranscript(chunk: string) {
    setTranscript((prev) => (prev.trim() ? `${prev.trim()} ${chunk}` : chunk));
  }

  function parse() {
    setParseError(null);
    startParse(async () => {
      const res = await parseFieldCapture(transcript);
      if (!res.ok) {
        setParseError(res.error);
        return;
      }
      setLeads(
        res.leads.map((lead) => ({
          ...lead,
          _id: makeId(),
          companyChoice: lead.matches[0]?.id ?? "",
        })),
      );
      setStep("review");
    });
  }

  function updateLead(id: string, patch: Partial<DraftLead>) {
    setLeads((prev) => prev.map((l) => (l._id === id ? { ...l, ...patch } : l)));
  }

  function removeLead(id: string) {
    setLeads((prev) => prev.filter((l) => l._id !== id));
  }

  function save() {
    setSaveError(null);
    startSave(async () => {
      const res = await saveFieldCapture(leads.map(toSaveInput));
      if (!res.ok) {
        setSaveError(res.error);
        return;
      }
      setSummary({
        contactsAddedToExisting: res.contactsAddedToExisting,
        newCompaniesForReview: res.newCompaniesForReview,
      });
      setStep("done");
    });
  }

  function reset() {
    setTranscript("");
    setLeads([]);
    setSummary(null);
    setParseError(null);
    setSaveError(null);
    setStep("capture");
  }

  if (step === "done" && summary) {
    return (
      <Card>
        <CardHead title="Saved" hint="Field Capture" />
        <div className="p-5">
          <p className="text-[14px] text-fg">
            Added {summary.contactsAddedToExisting}{" "}
            {summary.contactsAddedToExisting === 1 ? "contact" : "contacts"} to existing companies,{" "}
            {summary.newCompaniesForReview} new{" "}
            {summary.newCompaniesForReview === 1 ? "company" : "companies"} sent to Review.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Capture another note
            </button>
            {summary.newCompaniesForReview > 0 && (
              <Link
                href="/crm/ai-review"
                prefetch={false}
                className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-card px-4 text-[13.5px] font-semibold text-fg transition-colors hover:bg-inset"
              >
                Go to AI Review
              </Link>
            )}
            <Link
              href="/crm/accounts"
              prefetch={false}
              className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-card px-4 text-[13.5px] font-semibold text-fg transition-colors hover:bg-inset"
            >
              Go to Companies
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  if (step === "review") {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHead
            title={`Review ${leads.length} lead${leads.length === 1 ? "" : "s"}`}
            hint="Confirm each company match, edit anything, then save."
          />
          <div className="p-5">
            <FormError message={saveError} />
            {leads.length === 0 ? (
              <p className="text-[13.5px] text-fg-muted">
                Every lead was removed. Go back and record another note.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {leads.map((lead) => (
                  <ReviewLeadCard
                    key={lead._id}
                    lead={lead}
                    onChange={updateLead}
                    onRemove={removeLead}
                  />
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving || leads.length === 0}
                className="inline-flex h-11 items-center rounded-lg bg-accent px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save all"}
              </button>
              <button
                type="button"
                onClick={() => setStep("capture")}
                disabled={saving}
                className="inline-flex h-11 items-center rounded-lg border border-line-strong bg-card px-4 text-[13.5px] font-semibold text-fg transition-colors hover:bg-inset disabled:opacity-60"
              >
                Back to note
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <CardHead title="Capture a field note" hint="One note can describe multiple leads." />
      <div className="p-5">
        <FormError message={parseError} />
        <p className="mb-2 text-[12.5px] text-fg-subtle">
          Tap your keyboard&apos;s mic icon to dictate straight into the box, or use the record
          button below.
        </p>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={12}
          placeholder="e.g. Stopped by Meridian Steel on Route 9, talked to their yard manager Dave Collins, 555-0142, they move a lot of steel coils and are unhappy with their current carrier…"
          className={`w-full resize-y py-3 leading-relaxed ${CONTROL}`}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Recorder onAppend={appendTranscript} />
          <button
            type="button"
            onClick={parse}
            disabled={parsing || !transcript.trim()}
            className="inline-flex h-11 items-center rounded-lg bg-accent px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {parsing ? "Parsing…" : "Parse with AI"}
          </button>
        </div>
      </div>
    </Card>
  );
}

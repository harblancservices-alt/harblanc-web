"use client";

import { useState } from "react";
import { useStore } from "../_lib/store";
import { Button, Field, INPUT } from "../_design/ui";
import { Modal } from "../_design/Modal";
import type { ActivityKind } from "../_lib/types";

const KINDS: { key: ActivityKind; label: string }[] = [
  { key: "call", label: "Call" },
  { key: "note", label: "Note" },
  { key: "email", label: "Email" },
];

export function LogActivityModal({
  open,
  onClose,
  companyId,
  contactId = null,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  contactId?: string | null;
}) {
  const { logActivity } = useStore();
  const [kind, setKind] = useState<ActivityKind>("call");
  const [body, setBody] = useState("");

  function submit() {
    logActivity({
      kind,
      companyId,
      contactId,
      title: kind === "call" ? "Call · Logged" : kind === "email" ? "Email · Logged" : "Note",
      body: body.trim() || null,
    });
    setBody("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log activity"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Type">
          <div className="flex gap-1.5 rounded-[var(--cd-radius-sm)] border border-[var(--cd-border-strong)] bg-[var(--cd-surface-2)] p-1">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={`flex-1 rounded-[5px] py-1.5 text-[12.5px] font-semibold transition-colors ${
                  kind === k.key ? "bg-[var(--cd-surface)] text-[var(--cd-accent)] shadow-[var(--cd-shadow-sm)]" : "text-[var(--cd-text-muted)]"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Details">
          <textarea className={`${INPUT} h-24 resize-none py-2`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened?" autoFocus />
        </Field>
      </div>
    </Modal>
  );
}

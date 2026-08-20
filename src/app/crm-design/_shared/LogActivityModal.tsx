"use client";

import { useState } from "react";
import { useStore } from "../_lib/store";
import { Button, Field, INPUT, SegmentedControl } from "../_design/ui";
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
          <SegmentedControl
            mode="field"
            options={KINDS.map((k) => ({ key: k.key, label: k.label, tone: "accent" as const }))}
            active={kind}
            onChange={setKind}
          />
        </Field>
        <Field label="Details">
          <textarea className={`${INPUT} h-24 resize-none py-2`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened?" autoFocus />
        </Field>
      </div>
    </Modal>
  );
}

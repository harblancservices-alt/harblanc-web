"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "../_lib/store";
import { Button, Field, INPUT } from "../_design/ui";
import { Drawer } from "../_design/Drawer";

export function AddCompanyDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addCompany, currentUser, team } = useStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [assignedUserId, setAssignedUserId] = useState(currentUser.id);

  function submit() {
    if (!name.trim()) return;
    const company = addCompany({ name: name.trim(), industry, city, state, assignedUserId });
    setName("");
    setIndustry("");
    setCity("");
    setState("");
    onClose();
    router.push(`/crm-design/companies/${company.id}`);
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add company"
      subtitle="Creates a new lead at the New Lead stage."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Add company
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Company name">
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Panhandle Grain Cooperative" />
        </Field>
        <Field label="Industry">
          <input className={INPUT} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Agriculture" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <input className={INPUT} value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="State">
            <input className={INPUT} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} maxLength={2} />
          </Field>
        </div>
        <Field label="Assigned to">
          <select className={INPUT} value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}>
            {team.filter((m) => m.isActive).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Drawer>
  );
}

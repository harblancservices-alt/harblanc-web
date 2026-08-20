"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  ErrorState,
  Field,
  INPUT,
  LIST_HEAD_ROW,
  PAGE_WIDTH,
  PageHeader,
  ROW_HOVER,
  SkeletonRows,
  TEXT,
  ZEBRA,
} from "../../_design/ui";
import { Tabs } from "../../_design/Tabs";
import { Modal } from "../../_design/Modal";
import { Drawer } from "../../_design/Drawer";
import { useStore } from "../../_lib/store";
import { IconActivity, IconBuilding } from "../../_design/icons";

/**
 * Living style guide — every primitive in _design/ui.tsx and _design/*.tsx
 * in one place, plus the explicit empty/loading/error/toast states the
 * brief asked for as a standalone deliverable, not just embedded
 * incidentally on other pages. This page IS the visual half of "establish
 * the design system first."
 */
export default function DesignSystemPage() {
  const { pushToast } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<"one" | "two" | "three">("one");
  const [stateDemo, setStateDemo] = useState<"empty" | "loading" | "error">("empty");

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader title="Design System" subtitle="Every primitive this prototype is built from — one page, one reference." />

      <div className="flex flex-col gap-5">
        <Card>
          <CardHead title="Typography" />
          <div className="space-y-2 p-5">
            <p className={`${TEXT.pageTitle} text-[var(--cd-text)]`}>Page title — 20px / bold</p>
            <p className={`${TEXT.sectionTitle} text-[var(--cd-text)]`}>Section title — 14px / bold</p>
            <p className={`${TEXT.body} text-[var(--cd-text)]`}>Body — 13.5px, used for most reading text.</p>
            <p className={`${TEXT.label} text-[var(--cd-text-muted)]`}>Label — 11px / semibold / uppercase / secondary tier</p>
            <p className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>Micro — 11.5px, tertiary tier: genuinely optional metadata only.</p>
          </div>
        </Card>

        <Card>
          <CardHead title="Buttons" hint="One hierarchy: primary, secondary, ghost, danger, admin — nothing else." />
          <div className="flex flex-wrap items-center gap-2 p-5">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="admin">Admin</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button variant="primary" size="sm">
              Small
            </Button>
          </div>
        </Card>

        <Card>
          <CardHead title="Badges" hint="Six tones, always semantic — never a one-off color." />
          <div className="flex flex-wrap items-center gap-2 p-5">
            <Badge tone="neutral">Neutral</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="danger">Danger</Badge>
            <Badge tone="admin">Admin</Badge>
          </div>
        </Card>

        <Card>
          <CardHead title="Forms" />
          <div className="grid max-w-md grid-cols-1 gap-4 p-5">
            <Field label="Text input" hint="Every text field in the prototype uses this exact control.">
              <input className={INPUT} placeholder="Placeholder text" />
            </Field>
            <Field label="Select">
              <select className={INPUT}>
                <option>Option one</option>
                <option>Option two</option>
              </select>
            </Field>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--cd-accent)]" />
              <span className="text-[13px] text-[var(--cd-text)]">Checkbox label</span>
            </label>
          </div>
        </Card>

        <Card>
          <CardHead title="Tabs" />
          <div className="p-5">
            <Tabs
              tabs={[
                { key: "one", label: "One", count: 3 },
                { key: "two", label: "Two" },
                { key: "three", label: "Three" },
              ]}
              active={tab}
              onChange={setTab}
            />
          </div>
        </Card>

        <Card>
          <CardHead title="Table (zebra rows + hover)" hint="LIST_HEAD_ROW + ZEBRA + ROW_HOVER — shared across every CRM list." />
          <table className="w-full text-[13px]">
            <thead>
              <tr className={LIST_HEAD_ROW}>
                <th className="px-4 py-2.5">Column A</th>
                <th className="px-4 py-2.5">Column B</th>
              </tr>
            </thead>
            <tbody className={ZEBRA}>
              {[1, 2, 3].map((i) => (
                <tr key={i} className={ROW_HOVER}>
                  <td className="px-4 py-2.5 text-[var(--cd-text)]">Row {i}, cell A</td>
                  <td className="px-4 py-2.5 text-[var(--cd-text-muted)]">Row {i}, cell B</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHead title="Modal / Drawer / Toast" />
          <div className="flex flex-wrap items-center gap-2 p-5">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Open modal
            </Button>
            <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
              Open drawer
            </Button>
            <Button variant="secondary" onClick={() => pushToast("success", "Saved successfully.")}>
              Trigger success toast
            </Button>
            <Button variant="secondary" onClick={() => pushToast("info", "Heads up — informational message.")}>
              Trigger info toast
            </Button>
            <Button variant="secondary" onClick={() => pushToast("danger", "Something went wrong.")}>
              Trigger error toast
            </Button>
          </div>
        </Card>

        <Card>
          <CardHead
            title="Empty / Loading / Error states"
            right={
              <div className="flex gap-1">
                {(["empty", "loading", "error"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStateDemo(s)}
                    className={`rounded-[var(--cd-radius-sm)] px-2.5 py-1 text-[11.5px] font-semibold capitalize ${
                      stateDemo === s ? "bg-[var(--cd-accent)] text-white" : "bg-[var(--cd-surface-2)] text-[var(--cd-text-muted)]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            }
          />
          {stateDemo === "empty" && (
            <EmptyState icon={<IconBuilding />} title="No companies yet" body="Add your first company to get started." action={<Button variant="primary" size="sm">Add company</Button>} />
          )}
          {stateDemo === "loading" && <SkeletonRows rows={4} />}
          {stateDemo === "error" && <ErrorState title="Couldn't load this page" body="Something went wrong loading this data." onRetry={() => pushToast("info", "Retried.")} />}
        </Card>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Example modal"
        subtitle="Used for confirmations and short forms."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              Confirm
            </Button>
          </>
        }
      >
        <p className={`${TEXT.body} text-[var(--cd-text-muted)]`}>Modal body content goes here.</p>
      </Modal>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Example drawer"
        subtitle="Used for record previews and multi-step flows."
        footer={
          <Button variant="primary" onClick={() => setDrawerOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="flex items-center gap-2 text-[var(--cd-text-muted)]">
          <IconActivity width={16} height={16} />
          <p className={TEXT.body}>Drawer body content goes here.</p>
        </div>
      </Drawer>
    </div>
  );
}

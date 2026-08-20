"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardHead, LIST_HEAD_ROW, PAGE_WIDTH, PageHeader, ROW_HOVER, SegmentedControl, TEXT, TextLink, ZEBRA } from "../../_design/ui";
import { Tabs } from "../../_design/Tabs";
import { Modal } from "../../_design/Modal";
import { Drawer } from "../../_design/Drawer";
import {
  IconAlertTriangle,
  IconCheck,
  IconFitPage,
  IconFitWidth,
  IconFlame,
  IconMaximize,
  IconPhone,
  IconZoomIn,
  IconZoomOut,
} from "../../_design/icons";

/**
 * Interaction System reference — the visual half of CRM_INTERACTION_HIERARCHY.md
 * (repo root). Mirrors design-system/page.tsx's pattern (one page, every
 * primitive, live examples) but organized by INTERACTION MEANING instead of
 * by component — "this is a button vs. this is navigation vs. this is a
 * status" is the point, not "here is the Button component's API."
 *
 * Nothing on this page is wired to real store data and nothing here changes
 * any other screen — the "annotated BOL Center" section at the bottom is a
 * static illustrative mock, not the real bol-center/[id]/page.tsx.
 */
export default function InteractionSystemPage() {
  const [segFilter, setSegFilter] = useState<"all" | "new" | "review">("all");
  const [segField, setSegField] = useState<"high" | "medium" | "low">("high");
  const [tab, setTab] = useState<"one" | "two" | "three">("one");
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [mockRelevance, setMockRelevance] = useState<"high" | "medium" | "low">("high");

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader
        title="Interaction System"
        subtitle="Twelve levels, three underlying shapes (fill / border / bare text). The point of every example below: can you tell what happens before you click?"
      />

      {/* ── At-a-glance legend ─────────────────────────────────────── */}
      <Card className="mb-5">
        <CardHead title="At a glance" hint="The full write-up — problems, BOL Center deep audit, page-by-page matrix, rollout plan — lives in CRM_INTERACTION_HIERARCHY.md at the repo root." />
        <div className="flex flex-wrap gap-2 p-5">
          <Button variant="primary" size="sm">Primary</Button>
          <Button variant="secondary" size="sm">Secondary</Button>
          <Button variant="ghost" size="sm">Tertiary</Button>
          <Button variant="danger" size="sm">Destructive</Button>
          <IconChip icon={<IconZoomIn width={13} height={13} />} label="Icon action" />
          <span className="inline-flex items-center px-1 text-[13px] font-semibold text-[var(--cd-accent)] underline underline-offset-2">Text link</span>
          <NavChip label="Nav item" />
          <MiniTab active label="Tab" />
          <MiniSeg active label="Filter / Selector" />
          <Badge tone="accent">Badge / Status</Badge>
          <span className="inline-flex items-center rounded-[var(--cd-radius-sm)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--cd-text)] hover:bg-[var(--cd-surface-2)]">Menu action</span>
          <span className="inline-flex items-center gap-1.5 rounded-[var(--cd-radius-sm)] border border-dashed border-[var(--cd-border-strong)] px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--cd-text-muted)]">Row / Card ⤵</span>
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        {/* ── 1-3. Button weights ─────────────────────────────────── */}
        <Card>
          <CardHead title="1–3. Primary / Secondary / Tertiary action" hint="At most one Primary per view. Secondary and Tertiary are real actions — never navigation (see §7's rule below)." />
          <div className="flex flex-wrap items-center gap-2 p-5">
            <Button variant="primary">Approve</Button>
            <Button variant="secondary">Keep Researching</Button>
            <Button variant="ghost">Research First</Button>
          </div>
          <div className="border-t border-[var(--cd-border)] p-5">
            <p className={`mb-2 ${TEXT.label} text-[var(--cd-text-muted)]`}>Do vs. don&rsquo;t — navigation is never a Button</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DoDont ok={false}>
                <Button variant="secondary" size="sm">View Company →</Button>
                <span className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>Pure navigation, wearing Secondary-action weight — competes with real mutations on the same card.</span>
              </DoDont>
              <DoDont ok>
                <span className="text-[13px] font-semibold text-[var(--cd-accent)] underline underline-offset-2">View Company →</span>
                <span className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>Same destination, correctly weighted as a Text Link.</span>
              </DoDont>
            </div>
          </div>
        </Card>

        {/* ── 4. Destructive ──────────────────────────────────────── */}
        <Card>
          <CardHead title="4. Destructive action" hint="Every destructive action gets the same confirming Modal, no exceptions — Reject (BOL/OTR) now matches Suspend & Reassign's pattern exactly (Brent's call, supersedes the earlier lighter inline confirm)." />
          <div className="flex flex-wrap items-center gap-3 p-5">
            <Button variant="danger" onClick={() => setConfirmingReject(true)}>
              Reject
            </Button>
            <span className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>
              Click to see the confirming Modal — the same Cancel/Danger footer used everywhere a destructive action exists in the prototype.
            </span>
          </div>
        </Card>

        {/* ── 5. Icon action ──────────────────────────────────────── */}
        <Card>
          <CardHead title="5. Icon action" hint="Momentary, easily-reversible view-state changes. Every instance needs an aria-label; a destructive one (none exist yet) needs danger tone + a confirm step, not just an icon swap." />
          <div className="flex flex-wrap items-center gap-1.5 p-5">
            <ToolbarBtn icon={<IconZoomOut width={14} height={14} />} label="Zoom out" />
            <span className="w-11 shrink-0 text-center text-[11.5px] font-bold tabular-nums text-[var(--cd-text-muted)]">100%</span>
            <ToolbarBtn icon={<IconZoomIn width={14} height={14} />} label="Zoom in" />
            <div className="mx-0.5 h-5 w-px bg-[var(--cd-border)]" />
            <ToolbarBtn icon={<IconFitWidth width={14} height={14} />} label="Fit width" active text="Fit Width" />
            <ToolbarBtn icon={<IconFitPage width={14} height={14} />} label="Fit page" text="Fit Page" />
            <div className="mx-0.5 h-5 w-px bg-[var(--cd-border)]" />
            <ToolbarBtn icon={<IconMaximize width={14} height={14} />} label="Fullscreen" text="Fullscreen" />
          </div>
        </Card>

        {/* ── 6. Text link ────────────────────────────────────────── */}
        <Card>
          <CardHead title="6. Text link" hint="Pure navigation and disclosure toggles. Zero fill, zero border. Reference pattern: Contact detail's tel:/mailto: rows already get this right." />
          <div className="flex flex-wrap items-center gap-5 p-5">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--cd-accent)]">
              <IconPhone width={13} height={13} /> (432) 555-0143
            </span>
            <details className="text-[12.5px]">
              <summary className="cursor-pointer font-semibold text-[var(--cd-text-muted)] hover:text-[var(--cd-text)]">
                Actually matches an existing company?
              </summary>
              <p className={`mt-2 max-w-xs ${TEXT.micro} text-[var(--cd-text-muted)]`}>Disclosure toggle — also a Text Link job, not a Button.</p>
            </details>
          </div>
        </Card>

        {/* ── 7. Nav item ─────────────────────────────────────────── */}
        <Card>
          <CardHead title="7. Nav item" hint="Sidebar / bottom-bar / menu-sheet. Already the most consistent category in the prototype — no changes recommended." />
          <div className="flex flex-wrap items-center gap-2 p-5">
            <NavChip label="Dashboard" active />
            <NavChip label="Companies" />
            <NavChip label="Contacts" />
          </div>
        </Card>

        {/* ── 8. Tab ──────────────────────────────────────────────── */}
        <Card>
          <CardHead title="8. Tab" hint="Switches visible content within the page. No navigation, no mutation. The existing Tabs component already handles this consistently everywhere." />
          <div className="p-5">
            <Tabs tabs={[{ key: "one", label: "Overview" }, { key: "two", label: "Contacts", count: 4 }, { key: "three", label: "Activity" }]} active={tab} onChange={setTab} />
          </div>
        </Card>

        {/* ── 9. Filter / Segmented selector ─────────────────────── */}
        <Card>
          <CardHead title="9. Filter / Segmented selector" hint="SegmentedControl — one shared component, two honest modes (Brent's decision). Quiet when it's just a view, solid when it commits a change." />
          <div className="flex flex-col gap-4 p-5">
            <div>
              <p className={`mb-1.5 ${TEXT.label} text-[var(--cd-text-muted)]`}>mode=&quot;filter&quot; — view-only, narrows a list or switches a document page, no data changes</p>
              <SegmentedControl
                mode="filter"
                options={[
                  { key: "all", label: "All" },
                  { key: "new", label: "New" },
                  { key: "review", label: "Needs Review" },
                ]}
                active={segFilter}
                onChange={setSegFilter}
              />
            </div>
            <div>
              <p className={`mb-1.5 ${TEXT.label} text-[var(--cd-text-muted)]`}>mode=&quot;field&quot; — writes to a real record (Sales Relevance, Access Level) — the active option gets a SOLID fill, on purpose</p>
              <SegmentedControl
                mode="field"
                options={[
                  { key: "high", label: "High", tone: "success" },
                  { key: "medium", label: "Medium", tone: "warning" },
                  { key: "low", label: "Low", tone: "neutral" },
                ]}
                active={segField}
                onChange={setSegField}
              />
            </div>
            <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>
              Replaces five separate hand-rolled implementations that used to look identical regardless of
              whether they wrote data: BOL Sales Relevance, OTR Sales Relevance (was duplicated verbatim),
              Fit Width/Page, the document page switcher, and Admin&rsquo;s Access Level toggle.
            </p>
          </div>
        </Card>

        {/* ── 10. Badge / Status ─────────────────────────────────── */}
        <Card>
          <CardHead title="10. Badge / Status" hint="Passive only. Never inside a Link or a button — if it needs to be clickable, it's a Text Link in the status tone instead, not a Badge." />
          <div className="flex flex-wrap items-center gap-2 p-5">
            <Badge tone="neutral">New</Badge>
            <Badge tone="accent">AI Extracted</Badge>
            <Badge tone="warning">Needs Review</Badge>
            <Badge tone="success">Approved</Badge>
            <Badge tone="admin">Released</Badge>
            <Badge tone="danger">Rejected</Badge>
          </div>
          <div className="border-t border-[var(--cd-border)] p-5">
            <p className={`mb-2 ${TEXT.label} text-[var(--cd-text-muted)]`}>Do vs. don&rsquo;t — a status is never a link</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DoDont ok={false}>
                <Link href="#" className="pointer-events-none">
                  <Badge tone="admin">LSS-BOL-2291</Badge>
                </Link>
                <span className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>Today&rsquo;s Intelligence → Sources: identical pixels whether it&rsquo;s clickable (owner/admin) or not (agent).</span>
              </DoDont>
              <DoDont ok>
                <span className="text-[13px] font-semibold text-[var(--cd-admin)] underline underline-offset-2">LSS-BOL-2291</span>
                <span className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>Same tone, correctly weighted as a Text Link — a badge shape never silently means clickable.</span>
              </DoDont>
            </div>
          </div>
        </Card>

        {/* ── 11. Menu action ─────────────────────────────────────── */}
        <Card>
          <CardHead title="11. Menu action" hint="Plain text rows in a dropdown/overflow menu. Danger items get red text only — no red fill until hover. Reference pattern: the account menu already gets this right." />
          <div className="p-5">
            <div className="relative inline-block">
              <Button variant="secondary" size="sm" onClick={() => setMenuOpen((v) => !v)}>
                Account menu ▾
              </Button>
              {menuOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 w-52 overflow-hidden rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface)] py-1 shadow-[var(--cd-shadow-lg)]">
                  <span className="block px-3.5 py-2 text-[13px] font-medium text-[var(--cd-text)] hover:bg-[var(--cd-surface-2)]">Switch view</span>
                  <span className="block px-3.5 py-2 text-[13px] font-medium text-[var(--cd-text)] hover:bg-[var(--cd-surface-2)]">Settings</span>
                  <span className="block px-3.5 py-2 text-[13px] font-medium text-[var(--cd-danger)] hover:bg-[var(--cd-danger-soft)]">Sign out</span>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ── 12. Row / Card interaction ─────────────────────────── */}
        <Card>
          <CardHead title="12. Row / Card interaction" hint="The whole row/card is the click target, on every breakpoint — today's desktop tables only fulfill this promise from one cell." />
          <div className="p-5">
            <table className="w-full text-[13px]">
              <thead>
                <tr className={LIST_HEAD_ROW}>
                  <th className="px-4 py-2.5">Doc #</th>
                  <th className="px-4 py-2.5">Company</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className={ZEBRA}>
                <tr className={`${ROW_HOVER} cursor-pointer`}>
                  <td className="px-4 py-3 font-semibold text-[var(--cd-text)]">LSS-BOL-2291</td>
                  <td className="px-4 py-3 text-[var(--cd-text-muted)]">Lone Star Steel Fabrication</td>
                  <td className="px-4 py-3"><Badge tone="admin">Released</Badge></td>
                </tr>
              </tbody>
            </table>
            <p className={`mt-2 ${TEXT.micro} text-[var(--cd-text-muted)]`}>Whole row hovers AND whole row navigates — the hover promise is kept everywhere in the row, not just one cell.</p>
          </div>
        </Card>

        {/* ── Modal / Drawer triggers ─────────────────────────────── */}
        <Card>
          <CardHead title="Modal trigger / Drawer trigger" hint="Not a new visual style — a behavior tag on an existing Button. Modal = confirmation or short form. Drawer = multi-step, keeps your place." />
          <div className="flex flex-wrap items-center gap-2 p-5">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>Open modal</Button>
            <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
          </div>
        </Card>
      </div>

      {/* ── Annotated BOL Center mock ───────────────────────────── */}
      <div className="mt-8">
        <PageHeader
          title="Annotated BOL Center example"
          subtitle="An illustrative mock, not the real screen — bol-center/[id]/page.tsx is untouched. Every numbered element below is flagged in CRM_INTERACTION_HIERARCHY.md §4."
        />
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cd-border)] bg-[var(--cd-surface-2)] px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="text-[15px] font-bold text-[var(--cd-text)]">000025029</span>
              <Flag n={7}>
                <Badge tone="warning">Needs Review</Badge>
              </Flag>
            </div>
            <Flag n={1}>
              <Button variant="admin" size="sm">Run AI Extraction</Button>
            </Flag>
          </div>

          <div className="p-4">
            <Flag n={8} block>
              <div className={LIST_HEAD_ROW.replace("border-b", "") + " mb-2 flex items-center gap-2 rounded-[var(--cd-radius-sm)] px-3 py-2"}>
                <span className="font-semibold text-[var(--cd-text)]">PRM-BOL-7734</span>
                <IconFlame width={12} height={12} className="text-[var(--cd-accent)]" />
                <span className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>row hovers, only this text navigates →</span>
              </div>
            </Flag>

            <div className="mb-3 rounded-[var(--cd-radius-md)] border border-[var(--cd-accent)]/45 bg-[var(--cd-accent-soft)] px-4 py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--cd-accent)]">Potential new customer</p>
              <p className="text-[15px] font-bold text-[var(--cd-text)]">Permian Rig Movers LLC</p>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Flag n={2}>
                <Button variant="secondary" size="sm">Confirm as New Customer</Button>
              </Flag>
              <Flag n={3}>
                <Button variant="ghost" size="sm">Research First</Button>
              </Flag>
              <Flag n={4}>
                <TextLink>View Company →</TextLink>
              </Flag>
            </div>

            <div className="mb-3">
              <p className={`mb-1.5 ${TEXT.label} text-[var(--cd-text-muted)]`}>Sales relevance</p>
              <Flag n={5}>
                <SegmentedControl
                  mode="field"
                  options={[
                    { key: "high", label: "High", tone: "success" },
                    { key: "medium", label: "Medium", tone: "warning" },
                    { key: "low", label: "Low", tone: "neutral" },
                  ]}
                  active={mockRelevance}
                  onChange={setMockRelevance}
                />
              </Flag>
            </div>

            <div className="mb-3 flex items-center justify-between rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface-2)] px-3.5 py-3">
              <div>
                <Badge tone="accent">Shipper Contact</Badge>
                <span className="ml-2 text-[13.5px] font-semibold text-[var(--cd-text)]">Cody Branson</span>
              </div>
              <Flag n={6}>
                <label className="flex shrink-0 items-center gap-2 text-[12.5px] font-semibold text-[var(--cd-text-muted)]">
                  <input type="checkbox" checked={verified} onChange={() => setVerified((v) => !v)} className="h-4 w-4 accent-[var(--cd-success)]" />
                  <span className={verified ? "text-[var(--cd-success)]" : undefined}>{verified ? "Verified" : "Mark verified"}</span>
                </label>
              </Flag>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="admin" size="sm">Approve</Button>
              <Flag n={9}>
                <Button variant="danger" size="sm" onClick={() => setConfirmingReject(true)}>Reject</Button>
              </Flag>
            </div>
          </div>
        </Card>

        <Card className="mt-4">
          <CardHead title="Callout legend" hint="Was → is, per CRM_INTERACTION_HIERARCHY.md §4 — every item below shipped on the real BOL detail page." />
          <ul className="divide-y divide-[var(--cd-border)]">
            <LegendRow n={1} current="Primary admin-fill Button" recommended="Unchanged — correct as-is" ok />
            <LegendRow n={2} current="Secondary Button" recommended="Unchanged — correct as-is, a real mutation" ok />
            <LegendRow n={3} current="Ghost Button" recommended="Unchanged — correct as-is, optional escape hatch" ok />
            <LegendRow n={4} current="Secondary Button (same weight as #2)" recommended="Now a Text Link — pure navigation, no mutation" />
            <LegendRow n={5} current="Bespoke bordered pills, duplicated in OTR" recommended="Now SegmentedControl mode=&quot;field&quot; — one component, solid active fill" />
            <LegendRow n={6} current="Button styled like a success Badge" recommended="Now a real checkbox — no more badge costume" />
            <LegendRow n={7} current="tone=&quot;warning&quot; Badge" recommended="Unchanged — correct as-is, passive status" ok />
            <LegendRow n={8} current="Whole-row hover, one-cell navigation" recommended="Whole row is now the click target, on every breakpoint" />
            <LegendRow n={9} current="Danger Button, fired immediately" recommended="Now a confirming Modal — same Cancel/Danger pattern as Suspend & Reassign (Brent's call: destructive actions stay consistent CRM-wide)" />
          </ul>
        </Card>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Suspend user"
        subtitle="The reference example this pattern was built from — reassignment before an account is suspended."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => setModalOpen(false)}>Reassign &amp; suspend</Button>
          </>
        }
      >
        <p className={`${TEXT.body} text-[var(--cd-text-muted)]`}>
          Admin → Member detail&rsquo;s Suspend &amp; Reassign is where this Cancel/Danger footer pattern started.
          It&rsquo;s now the one confirmation shape every destructive action in the prototype uses — including
          Reject (§4 above), which used to fire immediately.
        </p>
      </Modal>

      <Modal
        open={confirmingReject}
        onClose={() => setConfirmingReject(false)}
        title="Reject this BOL?"
        subtitle="Filed, not deleted — it can be reopened from here later."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingReject(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => setConfirmingReject(false)}>Reject</Button>
          </>
        }
      >
        <p className={`${TEXT.body} text-[var(--cd-text-muted)]`}>
          Same Cancel/Danger footer as Suspend &amp; Reassign above — shipped on both BOL detail and OTR.
        </p>
      </Modal>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Example drawer"
        subtitle="Multi-step flows that keep your place — e.g. Upload BOL."
        footer={<Button variant="primary" onClick={() => setDrawerOpen(false)}>Done</Button>}
      >
        <p className={`${TEXT.body} text-[var(--cd-text-muted)]`}>Drawer body content goes here.</p>
      </Drawer>
    </div>
  );
}

function IconChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-[var(--cd-radius-sm)] border border-[var(--cd-border-strong)] bg-[var(--cd-surface)] px-2.5 text-[12.5px] font-semibold text-[var(--cd-text-muted)]">
      {icon} {label}
    </span>
  );
}

function NavChip({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--cd-radius-sm)] px-2.5 py-1.5 text-[13px] font-semibold ${
        active ? "bg-[var(--cd-accent-soft)] text-[var(--cd-accent)]" : "text-[var(--cd-text-muted)]"
      }`}
    >
      {label}
    </span>
  );
}

function MiniTab({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--cd-radius-sm)] px-2.5 py-1.5 text-[12.5px] font-bold ${
        active ? "bg-[var(--cd-surface)] text-[var(--cd-accent)] shadow-[var(--cd-shadow-sm)] ring-1 ring-[var(--cd-border-strong)]" : "text-[var(--cd-text-muted)]"
      }`}
    >
      {label}
    </span>
  );
}

function MiniSeg({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--cd-radius-sm)] border px-2.5 py-1.5 text-[12px] font-bold ${
        active ? "border-[var(--cd-admin)]/40 bg-[var(--cd-admin-soft)] text-[var(--cd-admin)]" : "border-[var(--cd-border-strong)] text-[var(--cd-text-muted)]"
      }`}
    >
      {label}
    </span>
  );
}

function ToolbarBtn({ icon, label, text, active }: { icon: React.ReactNode; label: string; text?: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`flex h-8 items-center gap-1.5 rounded-[var(--cd-radius-sm)] border px-2.5 text-[11.5px] font-semibold transition-colors ${
        active
          ? "border-[var(--cd-admin)]/40 bg-[var(--cd-admin-soft)] text-[var(--cd-admin)]"
          : "border-[var(--cd-border-strong)] bg-[var(--cd-surface)] text-[var(--cd-text-muted)] hover:bg-[var(--cd-surface-hover)]"
      }`}
    >
      {icon} {text && <span className="hidden sm:inline">{text}</span>}
    </button>
  );
}


function DoDont({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-col items-start gap-2 rounded-[var(--cd-radius-md)] border p-3.5 ${
        ok ? "border-[var(--cd-success)]/45 bg-[var(--cd-success-soft)]" : "border-[var(--cd-danger)]/45 bg-[var(--cd-danger-soft)]"
      }`}
    >
      <span className={`flex items-center gap-1.5 ${TEXT.micro} font-bold uppercase tracking-wide ${ok ? "text-[var(--cd-success)]" : "text-[var(--cd-danger)]"}`}>
        {ok ? <IconCheck width={12} height={12} /> : <IconAlertTriangle width={12} height={12} />} {ok ? "Recommended" : "Today"}
      </span>
      {children}
    </div>
  );
}

/** A small numbered callout badge pinned to the corner of whatever it wraps —
 * used only on this reference page's annotated mock, never on a real screen. */
function Flag({ n, block, children }: { n: number; block?: boolean; children: React.ReactNode }) {
  return (
    <span className={`relative ${block ? "block" : "inline-block"}`}>
      <span className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--cd-danger)] text-[10px] font-bold text-white shadow-[var(--cd-shadow-sm)]">
        {n}
      </span>
      <span className="block rounded-[var(--cd-radius-sm)] outline outline-1 outline-dashed outline-[var(--cd-danger)]/40">{children}</span>
    </span>
  );
}

function LegendRow({ n, current, recommended, ok }: { n: number; current: string; recommended: string; ok?: boolean }) {
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
          ok ? "bg-[var(--cd-success)]" : "bg-[var(--cd-danger)]"
        }`}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-[var(--cd-text)]">
          <span className="text-[var(--cd-text-muted)]">Current: </span>
          {current}
        </p>
        <p className="text-[13px] font-semibold text-[var(--cd-text)]">
          <span className="font-normal text-[var(--cd-text-muted)]">→ </span>
          {recommended}
        </p>
      </div>
    </li>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "../_lib/store";
import { Avatar, Button, INPUT, TEXT } from "../_design/ui";
import { Modal } from "../_design/Modal";
import {
  IconActivity,
  IconBuilding,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconContacts,
  IconDashboard,
  IconFlag,
  IconLogout,
  IconMore,
  IconSearch,
  IconSettings,
  IconShield,
  IconStar,
  IconTasks,
  IconX,
} from "../_design/icons";

/**
 * The redesigned navigation shell — the direct answer to CRM_MASTER_AUDIT.md
 * §1/§2/§13. Structure (see DESIGN_DECISIONS.md for the full CURRENT →
 * PROPOSED → WHY):
 *
 *   WORKSPACE (flat, one weight, one accent color) — everyone
 *   ADMIN ACCOUNT (owner/admin only) — promoted to the SAME visual weight
 *     as Workspace, not demoted into footer chrome; one dedicated --cd-admin
 *     token, not four ad hoc colors
 *   FOOTER — Settings, Send Feedback (replaces "Upgrades" as a top-level nav
 *     item), Sign out
 *
 * No per-item bespoke colors. No favorites/stars/custom colors (see audit
 * §0/§8 — that feature never existed and isn't being added). The one
 * intentional exception is Active Clients' gold icon tint, kept as a single,
 * documented brand accent — not a system.
 */

type NavItem = {
  href: string;
  label: string;
  Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  goldIcon?: boolean;
};

const WORKSPACE: NavItem[] = [
  { href: "/crm-design", label: "Dashboard", Icon: IconDashboard },
  { href: "/crm-design/companies", label: "Companies", Icon: IconBuilding },
  { href: "/crm-design/contacts", label: "Contacts", Icon: IconContacts },
  { href: "/crm-design/tasks", label: "Tasks", Icon: IconTasks },
  { href: "/crm-design/calendar", label: "Calendar", Icon: IconCalendar },
  { href: "/crm-design/active-clients", label: "Active Clients", Icon: IconStar, goldIcon: true },
  { href: "/crm-design/activities", label: "Activity Feed", Icon: IconActivity },
];

const BOTTOM_HREFS = ["/crm-design", "/crm-design/companies", "/crm-design/contacts", "/crm-design/tasks"];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/crm-design") return pathname === "/crm-design";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { currentUser, setPaletteOpen, setCurrentUserId, team } = useStore();
  const isElevated = currentUser.role === "owner" || currentUser.role === "admin";

  const [collapsed, setCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const bottomItems = useMemo(() => BOTTOM_HREFS.map((h) => WORKSPACE.find((i) => i.href === h)!), []);
  const moreItems = useMemo(() => WORKSPACE.filter((i) => !BOTTOM_HREFS.includes(i.href)), []);

  function signOut() {
    setAccountMenuOpen(false);
    router.push("/crm-design/login");
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Desktop sidebar ── */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[var(--cd-side-border)] bg-[var(--cd-side-bg)] transition-[width] duration-150 lg:flex ${
          collapsed ? "w-[76px]" : "w-[236px]"
        }`}
      >
        <div className={`flex items-center gap-2.5 px-4 pb-4 pt-4 ${collapsed ? "justify-center px-0" : ""}`}>
          <Link href="/crm-design" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--cd-radius-sm)] bg-[var(--cd-accent)] text-[15px] font-black text-white">
              H
            </span>
            {!collapsed && (
              <span className="flex flex-col leading-none">
                <span className="text-[14px] font-bold text-white">Hello Hotshot</span>
                <span className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-[var(--cd-side-text-dim)]">
                  CRM
                </span>
              </span>
            )}
          </Link>
        </div>

        <div className={`px-2 ${collapsed ? "" : "px-3"}`}>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={`flex w-full items-center gap-2.5 rounded-[var(--cd-radius-sm)] border border-[var(--cd-side-border)] bg-[var(--cd-side-bg-raised)] px-3 py-2 text-[12.5px] text-[var(--cd-side-text-dim)] transition-colors hover:text-white ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <IconSearch width={15} height={15} />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Search…</span>
                <span className="rounded border border-[var(--cd-side-border)] px-1.5 py-0.5 text-[10px]">⌘K</span>
              </>
            )}
          </button>
        </div>

        <nav className="cd-scroll mt-3 flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
          {!collapsed && (
            <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--cd-side-text-dim)]">
              Workspace
            </p>
          )}
          {WORKSPACE.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-[var(--cd-radius-sm)] px-2.5 py-2.5 text-[13.5px] font-semibold transition-colors ${
                  collapsed ? "justify-center" : ""
                } ${
                  active
                    ? "bg-[var(--cd-side-bg-raised)] text-white"
                    : "text-[var(--cd-side-text)] hover:bg-[var(--cd-side-bg-raised)] hover:text-white"
                }`}
              >
                <item.Icon
                  width={19}
                  height={19}
                  className={item.goldIcon ? "shrink-0 text-[#e3b341]" : active ? "shrink-0 text-[var(--cd-accent)]" : "shrink-0 text-[var(--cd-side-text-dim)]"}
                />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}

          {isElevated && (
            <>
              {!collapsed && (
                <p className="px-2.5 pb-1 pt-4 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--cd-side-text-dim)]">
                  Administration
                </p>
              )}
              <Link
                href="/crm-design/admin"
                title={collapsed ? "Admin Account" : undefined}
                className={`flex items-center gap-3 rounded-[var(--cd-radius-sm)] px-2.5 py-2.5 text-[13.5px] font-bold transition-colors ${
                  collapsed ? "justify-center" : ""
                } ${
                  isActivePath(pathname, "/crm-design/admin")
                    ? "bg-[var(--cd-admin-soft)] text-[var(--cd-admin)]"
                    : "text-[var(--cd-side-text)] hover:bg-[var(--cd-side-bg-raised)] hover:text-white"
                }`}
              >
                <IconShield width={19} height={19} className={`shrink-0 ${isActivePath(pathname, "/crm-design/admin") ? "text-[var(--cd-admin)]" : "text-[var(--cd-side-text-dim)]"}`} />
                {!collapsed && <span>Admin Account</span>}
              </Link>
            </>
          )}
        </nav>

        <div className="border-t border-[var(--cd-side-border)] p-2">
          <Link
            href="/crm-design/settings"
            title={collapsed ? "Settings" : undefined}
            className={`flex items-center gap-2.5 rounded-[var(--cd-radius-sm)] px-2.5 py-2 text-[12.5px] font-medium transition-colors ${
              collapsed ? "justify-center" : ""
            } ${isActivePath(pathname, "/crm-design/settings") ? "bg-[var(--cd-side-bg-raised)] text-white" : "text-[var(--cd-side-text-dim)] hover:bg-[var(--cd-side-bg-raised)] hover:text-white"}`}
          >
            <IconSettings width={16} height={16} />
            {!collapsed && "Settings"}
          </Link>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className={`flex w-full items-center gap-2.5 rounded-[var(--cd-radius-sm)] px-2.5 py-2 text-[12.5px] font-medium text-[var(--cd-side-text-dim)] transition-colors hover:bg-[var(--cd-side-bg-raised)] hover:text-white ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <IconFlag width={16} height={16} />
            {!collapsed && "Send feedback"}
          </button>

          <div className="my-2 h-px bg-[var(--cd-side-border)]" />

          <button
            type="button"
            onClick={() => setAccountMenuOpen((v) => !v)}
            className={`relative flex w-full items-center gap-2.5 rounded-[var(--cd-radius-sm)] px-2 py-2 text-left transition-colors hover:bg-[var(--cd-side-bg-raised)] ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <Avatar name={currentUser.name} size={30} />
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-white">{currentUser.name}</span>
                <span className="block truncate text-[11px] text-[var(--cd-side-text-dim)]">
                  {currentUser.role === "owner" ? "Owner" : currentUser.role === "admin" ? "Admin" : "Sales Agent"}
                </span>
              </span>
            )}
            {accountMenuOpen && (
              <div
                className="cd-animate-rise absolute bottom-full left-0 mb-2 w-56 overflow-hidden rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface)] py-1 shadow-[var(--cd-shadow-lg)]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setSwitcherOpen(true);
                  }}
                  className="block w-full px-3.5 py-2 text-left text-[13px] font-medium text-[var(--cd-text)] hover:bg-[var(--cd-surface-2)]"
                >
                  Switch view (prototype)
                </button>
                <Link
                  href="/crm-design/settings"
                  onClick={() => setAccountMenuOpen(false)}
                  className="block w-full px-3.5 py-2 text-left text-[13px] font-medium text-[var(--cd-text)] hover:bg-[var(--cd-surface-2)]"
                >
                  Settings
                </Link>
                <Link
                  href="/crm-design/design-system"
                  onClick={() => setAccountMenuOpen(false)}
                  className={`block w-full px-3.5 py-2 text-left ${TEXT.micro} text-[var(--cd-text-subtle)] hover:bg-[var(--cd-surface-2)]`}
                >
                  Design system reference
                </Link>
                <button
                  type="button"
                  onClick={signOut}
                  className="block w-full px-3.5 py-2 text-left text-[13px] font-medium text-[var(--cd-danger)] hover:bg-[var(--cd-danger-soft)]"
                >
                  Sign out
                </button>
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[var(--cd-radius-sm)] py-1.5 text-[var(--cd-side-text-dim)] transition-colors hover:bg-[var(--cd-side-bg-raised)] hover:text-white"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <IconChevronRight width={15} height={15} /> : <IconChevronLeft width={15} height={15} />}
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--cd-border)] bg-[var(--cd-surface)] px-4 lg:hidden">
        <Link href="/crm-design" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-[var(--cd-radius-sm)] bg-[var(--cd-accent)] text-[13px] font-black text-white">
            H
          </span>
          <span className="text-[13.5px] font-bold text-[var(--cd-text)]">Hello Hotshot</span>
        </Link>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--cd-text-muted)] hover:bg-[var(--cd-surface-2)]"
          aria-label="Search"
        >
          <IconSearch width={18} height={18} />
        </button>
      </div>

      <main className="min-w-0 flex-1 pb-20 pt-14 lg:pb-0 lg:pt-0">{children}</main>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[var(--cd-side-border)] bg-[var(--cd-side-bg)] pb-[env(safe-area-inset-bottom)] lg:hidden">
        {bottomItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 border-t-2 py-2.5 text-[10px] font-semibold ${
                active ? "border-[var(--cd-accent)] text-[var(--cd-accent)]" : "border-transparent text-[var(--cd-side-text-dim)]"
              }`}
            >
              <item.Icon width={19} height={19} />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMoreOpen(true)}
          className="flex flex-col items-center gap-1 border-t-2 border-transparent py-2.5 text-[10px] font-semibold text-[var(--cd-side-text-dim)]"
        >
          <IconMore width={19} height={19} />
          More
        </button>
      </nav>

      {/* ── Mobile "More" sheet ── */}
      {mobileMoreOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 lg:hidden" onClick={() => setMobileMoreOpen(false)}>
          <div
            className="cd-animate-rise max-h-[80vh] w-full overflow-y-auto rounded-t-[var(--cd-radius-lg)] border-t border-[var(--cd-side-border)] bg-[var(--cd-side-bg)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--cd-side-text-dim)]">More</span>
              <button type="button" onClick={() => setMobileMoreOpen(false)} className="text-[var(--cd-side-text-dim)]">
                <IconX width={18} height={18} />
              </button>
            </div>
            <div className="flex flex-col gap-0.5 px-3 pb-2">
              {moreItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMoreOpen(false)}
                  className={`flex items-center gap-3 rounded-[var(--cd-radius-sm)] px-3 py-2.5 text-[14px] font-semibold ${
                    isActivePath(pathname, item.href) ? "bg-[var(--cd-side-bg-raised)] text-white" : "text-[var(--cd-side-text)]"
                  }`}
                >
                  <item.Icon width={19} height={19} className={item.goldIcon ? "text-[#e3b341]" : "text-[var(--cd-side-text-dim)]"} />
                  {item.label}
                </Link>
              ))}
              {isElevated && (
                <Link
                  href="/crm-design/admin"
                  onClick={() => setMobileMoreOpen(false)}
                  className={`flex items-center gap-3 rounded-[var(--cd-radius-sm)] px-3 py-2.5 text-[14px] font-bold ${
                    isActivePath(pathname, "/crm-design/admin") ? "bg-[var(--cd-admin-soft)] text-[var(--cd-admin)]" : "text-[var(--cd-admin)]"
                  }`}
                >
                  <IconShield width={19} height={19} />
                  Admin Account
                </Link>
              )}
              <div className="my-1.5 h-px bg-[var(--cd-side-border)]" />
              <Link
                href="/crm-design/settings"
                onClick={() => setMobileMoreOpen(false)}
                className="flex items-center gap-3 rounded-[var(--cd-radius-sm)] px-3 py-2.5 text-[14px] font-semibold text-[var(--cd-side-text)]"
              >
                <IconSettings width={19} height={19} className="text-[var(--cd-side-text-dim)]" />
                Settings
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  setFeedbackOpen(true);
                }}
                className="flex items-center gap-3 rounded-[var(--cd-radius-sm)] px-3 py-2.5 text-left text-[14px] font-semibold text-[var(--cd-side-text)]"
              >
                <IconFlag width={19} height={19} className="text-[var(--cd-side-text-dim)]" />
                Send feedback
              </button>
              <button
                type="button"
                onClick={signOut}
                className="flex items-center gap-3 rounded-[var(--cd-radius-sm)] px-3 py-2.5 text-left text-[14px] font-semibold text-[var(--cd-side-text-dim)]"
              >
                <IconLogout width={19} height={19} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Persona switcher (prototype-only affordance) ── */}
      <Modal
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        title="Switch view"
        subtitle="Prototype-only — lets a reviewer compare the Sales Agent and Owner/Admin experiences without a real login."
      >
        <div className="flex flex-col gap-2">
          {team.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={!m.isActive}
              onClick={() => {
                setCurrentUserId(m.id);
                setSwitcherOpen(false);
              }}
              className={`flex items-center gap-3 rounded-[var(--cd-radius-md)] border px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                m.id === currentUser.id
                  ? "border-[var(--cd-accent)] bg-[var(--cd-accent-soft)]"
                  : "border-[var(--cd-border)] hover:bg-[var(--cd-surface-2)]"
              }`}
            >
              <Avatar name={m.name} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-[var(--cd-text)]">{m.name}</span>
                <span className={`block truncate ${TEXT.micro} text-[var(--cd-text-subtle)]`}>
                  {m.title} · {m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Sales Agent"}
                  {!m.isActive ? " · Suspended" : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* ── Send feedback (mock) ── */}
      <Modal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        title="Send feedback"
        subtitle="Replaces the old always-visible 'Upgrades' nav item — see DESIGN_DECISIONS.md."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setFeedbackOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setFeedbackOpen(false)}
            >
              Send
            </Button>
          </>
        }
      >
        <textarea
          className={`${INPUT} h-28 resize-none py-2`}
          placeholder="What should change or get fixed?"
        />
      </Modal>
    </div>
  );
}

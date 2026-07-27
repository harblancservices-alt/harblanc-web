import type { ReactNode } from "react";
import { PageShell, Card, EmptyState } from "./ui";

/**
 * Shared "coming soon" scaffold for the CRM nav destinations that are stubbed
 * in Phase 1 (Contacts, Pipeline, Tasks, Reports, Settings). Each has its own
 * route + shell chrome so the nav never 404s; the feature body lands in later
 * steps. All are still behind the CRM auth gate via the (authed) layout.
 */
export function ComingSoon({
  eyebrow,
  title,
  subtitle,
  icon,
  body,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  body: string;
}) {
  return (
    <PageShell eyebrow={eyebrow} title={title} subtitle={subtitle}>
      <Card>
        <EmptyState
          icon={icon}
          title="Coming soon"
          body={body}
          action={
            <span className="inline-flex items-center rounded-full border border-line bg-inset px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
              Phase 2
            </span>
          }
        />
      </Card>
    </PageShell>
  );
}

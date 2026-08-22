import type { ReactNode } from "react";
import { Card, CardHead, EmptyState } from "../_shell/ui";

/**
 * The placeholder panel for an Operations sub-tab that's routed and
 * navigable but not built yet (Quote Calculator, Active Loads). Shared by
 * both so the two read identically instead of each hand-rolling its own
 * "coming soon" block.
 *
 * Renders as a real Card + CardHead + EmptyState — the same chrome an
 * eventually-built panel will use — rather than a bare centered sentence, so
 * the tab already looks like part of the app. `icon` is passed in as an
 * already-rendered element (never a component reference), so this stays safe
 * to call from a Server Component.
 */
export function ComingSoonPanel({
  title,
  hint,
  headline,
  body,
  icon,
}: {
  title: string;
  hint?: string;
  headline: string;
  body: string;
  icon?: ReactNode;
}) {
  return (
    <Card>
      <CardHead title={title} hint={hint} />
      <EmptyState icon={icon} title={headline} body={body} />
    </Card>
  );
}

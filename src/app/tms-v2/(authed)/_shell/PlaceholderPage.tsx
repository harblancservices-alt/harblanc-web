import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Card } from "@/components/tms-v2/ui/Card";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";

/**
 * Shared shape for every Phase-1 placeholder route — every nav destination
 * needs to render *something* real (not a 404) before its actual page
 * shell is built in a later phase. Per v2-architecture.md §2's rule ("a
 * second page needing identical bespoke markup becomes a primitive before
 * the third page repeats it"), 15 near-identical stub pages earn this one
 * shared shell rather than hand-copied JSX per route.
 */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <PageScroll header={<PageHeader title={title} />}>
      <Card>
        <p className="text-[13px] text-fg-muted">{description}</p>
      </Card>
    </PageScroll>
  );
}

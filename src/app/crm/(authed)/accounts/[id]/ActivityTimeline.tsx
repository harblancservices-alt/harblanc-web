import { Card, CardHead } from "../../_shell/ui";
import { formatDateTime } from "../../_shell/format";
import { CRM_ACTIVITY } from "@/lib/crm/activity";

export type CrmActivity = {
  id: string;
  kind: string;
  summary: string | null;
  occurred_at: string;
  author: string | null;
};

/**
 * The company's activity timeline — a chronological, APPEND-ONLY feed of what
 * has happened (company created, stage moved, note added, contact added/edited).
 * This is the framework Step 3 extends with calls and tasks. Nothing is ever
 * removed, so the history stays complete.
 */
export function ActivityTimeline({ activities }: { activities: CrmActivity[] }) {
  return (
    <Card>
      <CardHead
        title="Activity"
        hint={activities.length ? `${activities.length} events` : undefined}
      />
      {activities.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-fg-muted">
          No activity yet. Actions on this company will appear here.
        </p>
      ) : (
        <ol className="px-5 py-4">
          {activities.map((a, i) => {
            const tone = KIND_TONE[a.kind] ?? "bg-slate";
            const last = i === activities.length - 1;
            return (
              <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                {/* rail */}
                <div className="flex flex-col items-center">
                  <span
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-card ${tone}`}
                  />
                  {!last && <span className="w-px flex-1 bg-line" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-fg">
                    {a.summary || KIND_LABEL[a.kind] || "Activity"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-fg-subtle">
                    {a.author ? `${a.author} · ` : ""}
                    {formatDateTime(a.occurred_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

const KIND_TONE: Record<string, string> = {
  [CRM_ACTIVITY.accountCreated]: "bg-steel",
  [CRM_ACTIVITY.lifecycleChanged]: "bg-ok",
  [CRM_ACTIVITY.repChanged]: "bg-slate",
  [CRM_ACTIVITY.noteAdded]: "bg-warn",
  [CRM_ACTIVITY.contactAdded]: "bg-steel",
  [CRM_ACTIVITY.contactUpdated]: "bg-slate",
};

const KIND_LABEL: Record<string, string> = {
  [CRM_ACTIVITY.accountCreated]: "Company created",
  [CRM_ACTIVITY.lifecycleChanged]: "Stage changed",
  [CRM_ACTIVITY.repChanged]: "Rep changed",
  [CRM_ACTIVITY.noteAdded]: "Note added",
  [CRM_ACTIVITY.contactAdded]: "Contact added",
  [CRM_ACTIVITY.contactUpdated]: "Contact updated",
};

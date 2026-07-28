import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, EmptyState } from "../_shell/ui";
import { IconPipeline, IconPlus } from "../_shell/icons";
import { formatMoney } from "../_shell/format";
import type { RepOption } from "../accounts/CompanyDialog";
import { DealDialog } from "./DealDialog";
import { DealCard } from "./DealCard";
import type { AccountOption, StageOption } from "./types";

export const dynamic = "force-dynamic";

type PipelineRow = { id: string; name: string; is_default: boolean };
type StageRow = { id: string; name: string; sort_order: number };
type DealRow = {
  id: string;
  name: string;
  account_id: string | null;
  stage_id: string | null;
  estimated_revenue: number | null;
  expected_close_date: string | null;
  assigned_user_id: string | null;
};

/**
 * Pipeline — a Kanban board over the caller's default crm_pipeline, columns
 * driven by crm_pipeline_stages (ordered) and cards by crm_deals within each
 * stage. RLS-scoped to the org (no dispatch table is ever touched). A brand
 * new org has no pipeline/stages yet, so every step below degrades to an
 * empty state instead of crashing.
 */
export default async function PipelinePage() {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const [pipelinesRes, accountsRes, profilesRes] = await Promise.all([
    supabase
      .from("crm_pipelines")
      .select("id, name, is_default")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1),
    supabase
      .from("crm_accounts")
      .select("id, name")
      .is("deleted_at", null)
      .order("name")
      .limit(500),
    supabase.from("crm_profiles").select("id, full_name, email, is_active"),
  ]);

  const pipeline = ((pipelinesRes.data ?? []) as PipelineRow[])[0] ?? null;

  const accounts = (accountsRes.data ?? []) as { id: string; name: string }[];
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const accountOptions: AccountOption[] = accounts.map((a) => ({ id: a.id, name: a.name }));

  const profiles = (profilesRes.data ?? []) as {
    id: string;
    full_name: string | null;
    email: string | null;
    is_active: boolean;
  }[];
  const repName = new Map(
    profiles.map((p) => [p.id, p.full_name || p.email || "Unnamed rep"]),
  );
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: p.full_name || p.email || "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  let stages: StageRow[] = [];
  let deals: DealRow[] = [];

  if (pipeline) {
    const { data: stagesData } = await supabase
      .from("crm_pipeline_stages")
      .select("id, name, sort_order")
      .eq("pipeline_id", pipeline.id)
      .order("sort_order", { ascending: true });
    stages = (stagesData ?? []) as StageRow[];

    if (stages.length > 0) {
      const stageIds = stages.map((s) => s.id);
      const { data: dealsData } = await supabase
        .from("crm_deals")
        .select(
          "id, name, account_id, stage_id, estimated_revenue, expected_close_date, assigned_user_id",
        )
        .in("stage_id", stageIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      deals = (dealsData ?? []) as DealRow[];
    }
  }

  const dealsByStage = new Map<string, DealRow[]>();
  for (const s of stages) dealsByStage.set(s.id, []);
  for (const d of deals) {
    if (!d.stage_id) continue;
    dealsByStage.get(d.stage_id)?.push(d);
  }

  const stageOptions: StageOption[] = stages.map((s) => ({ id: s.id, name: s.name }));
  const totalDeals = deals.length;

  return (
    <PageShell
      eyebrow="Deals"
      title="Pipeline"
      subtitle={
        stages.length
          ? `${totalDeals} ${totalDeals === 1 ? "deal" : "deals"} across ${stages.length} ${
              stages.length === 1 ? "stage" : "stages"
            }`
          : "Freight opportunities by stage."
      }
      actions={
        <DealDialog
          accounts={accountOptions}
          stages={stageOptions}
          reps={reps}
          pipelineId={pipeline?.id ?? null}
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              <IconPlus width={16} height={16} />
              New deal
            </button>
          )}
        />
      }
    >
      {stages.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconPipeline />}
            title={pipeline ? "No pipeline stages yet" : "No pipeline configured yet"}
            body={
              pipeline
                ? "This pipeline doesn't have any stages configured yet. Once stages exist, deals will show up here as columns."
                : "Set up a pipeline and stages to start tracking deals on a board."
            }
          />
        </Card>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const stageDeals = dealsByStage.get(stage.id) ?? [];
            const sum = stageDeals.reduce((acc, d) => acc + (d.estimated_revenue ?? 0), 0);
            return (
              <div key={stage.id} className="w-[280px] shrink-0">
                <Card className="flex h-full flex-col">
                  <div className="border-b border-line px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="min-w-0 truncate text-[13.5px] font-semibold text-fg">
                        {stage.name}
                      </h2>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-fg-subtle">
                          {stageDeals.length}
                        </span>
                        <DealDialog
                          accounts={accountOptions}
                          stages={stageOptions}
                          reps={reps}
                          pipelineId={pipeline?.id ?? null}
                          defaultStageId={stage.id}
                          trigger={(open) => (
                            <button
                              type="button"
                              onClick={open}
                              aria-label={`Add deal to ${stage.name}`}
                              className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-inset hover:text-fg"
                            >
                              <IconPlus width={14} height={14} />
                            </button>
                          )}
                        />
                      </div>
                    </div>
                    <p className="mt-0.5 font-mono text-[12px] text-fg-muted">
                      {formatMoney(sum)}
                    </p>
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5 p-3">
                    {stageDeals.length === 0 ? (
                      <p className="px-1 py-6 text-center text-[12px] text-fg-subtle">
                        No deals in this stage.
                      </p>
                    ) : (
                      stageDeals.map((d) => (
                        <DealCard
                          key={d.id}
                          deal={{
                            id: d.id,
                            name: d.name,
                            accountId: d.account_id,
                            companyName: d.account_id
                              ? accountName.get(d.account_id) ?? null
                              : null,
                            estimatedRevenue: d.estimated_revenue,
                            expectedCloseDate: d.expected_close_date,
                            ownerName: d.assigned_user_id
                              ? repName.get(d.assigned_user_id) ?? null
                              : null,
                          }}
                          stages={stageOptions}
                          currentStageId={stage.id}
                        />
                      ))
                    )}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

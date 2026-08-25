"use server";

import { revalidatePath } from "next/cache";
import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";
import { parseItemKey, type WorkSource } from "./workItem";

/**
 * Writes for the Admin → Overview assignment board.
 *
 * OWNER-ONLY. Handing another person work is an admin act, and the existing
 * task layer already refuses cross-assignment for non-owners
 * (tasks/actions.ts). Enforced here rather than only in the UI: a tampered
 * request has to be rejected, not silently narrowed.
 *
 * WHAT CAN ACTUALLY BE OWNED. Only crm_accounts has an assignee column
 * (assigned_user_id). crm_otr_entries and crm_bol_entries do not, so those
 * cannot record an owner at all. Rather than fail half a mixed selection
 * silently, assigning one of them creates an assigned crm_task — the closest
 * mechanism that already exists — so the work still reaches the person. The
 * result says exactly which of the two happened, per item.
 */

export type AssignResult =
  | { ok: true; claimed: number; tasked: number }
  | { ok: false; error: string };

export type TaskResult = { ok: true } | { ok: false; error: string };

/** Titles for the fallback task, written as the instruction an agent reads. */
const FALLBACK_TITLE: Record<Exclude<WorkSource, "prospect">, (company: string) => string> = {
  otr: (c) => `Research and release ${c} (OTR)`,
  bol: (c) => `Match the companies on the ${c} bill of lading`,
};

export async function assignWork(personId: string, keys: string[]): Promise<AssignResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Only an admin can hand out work." };
  if (!personId) return { ok: false, error: "Pick someone to assign this to." };
  if (keys.length === 0) return { ok: false, error: "Nothing is selected." };

  const supabase = await createCrmServerClient();

  // The assignee must be a real, active member of THIS org — never trust an
  // id off the wire.
  const { data: person } = await supabase
    .from("crm_profiles")
    .select("id")
    .eq("id", personId)
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (!person) return { ok: false, error: "That person isn't on this org." };

  const parsed = keys.map(parseItemKey);
  const prospectIds = parsed.filter((p) => p.source === "prospect").map((p) => p.id);
  const fallbacks = parsed.filter((p) => p.source !== "prospect");

  let claimed = 0;
  if (prospectIds.length > 0) {
    const { data, error } = await supabase
      .from("crm_accounts")
      .update({ assigned_user_id: personId })
      .in("id", prospectIds)
      .is("deleted_at", null)
      .select("id");
    if (error) return { ok: false, error: "Could not assign those companies. Please try again." };
    claimed = data?.length ?? 0;
  }

  let tasked = 0;
  if (fallbacks.length > 0) {
    // One read per source to get the names the task titles need. Two queries
    // total regardless of how many items are selected.
    const otrIds = fallbacks.filter((f) => f.source === "otr").map((f) => f.id);
    const bolIds = fallbacks.filter((f) => f.source === "bol").map((f) => f.id);

    const [otrRows, bolRows] = await Promise.all([
      otrIds.length
        ? supabase.from("crm_otr_entries").select("id, company_name").in("id", otrIds)
        : Promise.resolve({ data: [] as { id: string; company_name: string }[] }),
      bolIds.length
        ? supabase.from("crm_bol_entries").select("id, shipper_name").in("id", bolIds)
        : Promise.resolve({ data: [] as { id: string; shipper_name: string | null }[] }),
    ]);

    const nameById = new Map<string, string>();
    for (const r of otrRows.data ?? []) nameById.set(r.id as string, (r.company_name as string) || "a company");
    for (const r of bolRows.data ?? []) nameById.set(r.id as string, (r.shipper_name as string) || "a shipment");

    const rows = fallbacks.map((f) => ({
      org_id: user.orgId,
      account_id: null,
      contact_id: null,
      title: FALLBACK_TITLE[f.source as "otr" | "bol"](nameById.get(f.id) ?? "a company"),
      notes: null,
      task_type: null,
      due_at: null,
      priority: "normal",
      reminder_at: null,
      assigned_user_id: personId,
      status: "open",
    }));

    const { data, error } = await supabase.from("crm_tasks").insert(rows).select("id");
    if (error) {
      // The prospect half already landed — say so rather than reporting a
      // clean failure for a partially-applied action.
      return {
        ok: false,
        error:
          claimed > 0
            ? `Assigned ${claimed} ${claimed === 1 ? "company" : "companies"}, but could not create the tasks for the OTR/BOL items.`
            : "Could not create those tasks. Please try again.",
      };
    }
    tasked = data?.length ?? 0;
  }

  revalidatePath("/crm/admin");
  return { ok: true, claimed, tasked };
}

/** The task composer. crm_tasks carries assigned_user_id, due_at and
 * account_id, so every field on the composer persists for real. */
export async function sendTask(input: {
  title: string;
  assignedUserId: string;
  dueAt: string | null;
  accountId: string | null;
}): Promise<TaskResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner" && input.assignedUserId !== user.id) {
    return { ok: false, error: "Only an admin can assign tasks to someone else." };
  }
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the task a title." };
  if (!input.assignedUserId) return { ok: false, error: "Pick who it's for." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_tasks").insert({
    org_id: user.orgId,
    account_id: input.accountId,
    contact_id: null,
    title,
    notes: null,
    task_type: null,
    due_at: input.dueAt,
    priority: "normal",
    reminder_at: null,
    assigned_user_id: input.assignedUserId,
    status: "open",
  });

  if (error) return { ok: false, error: "Could not send the task. Please try again." };

  revalidatePath("/crm/admin");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/**
 * Update a team member's name/title/active status. Admin-only (role=owner) —
 * crm_profiles_rw's RLS only scopes rows to the org, so this app-layer check
 * is the only thing standing between "any logged-in member" and editing the
 * whole roster. Role itself is never accepted here (there's no field for it),
 * and the caller can never deactivate their OWN row through this action even
 * if a tampered request tried to — kept deliberately narrow so this can't be
 * used to grant/revoke permissions or lock the org's own admin out.
 */
export async function updateMember(
  memberId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can edit team members." };
  }

  const fullName = str(formData, "full_name");
  if (!fullName) return { ok: false, error: "Name is required." };
  const title = str(formData, "title");
  const isActive = str(formData, "is_active") === "on";

  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_profiles")
    .update({
      full_name: fullName,
      title: title || null,
      is_active: memberId === user.id ? true : isActive,
    })
    .eq("id", memberId);

  if (error) {
    return { ok: false, error: "Could not update the team member. Please try again." };
  }

  revalidatePath("/crm/settings");
  return { ok: true };
}

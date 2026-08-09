import { createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead, BTN_EDIT } from "../../_shell/ui";
import { DetailFact } from "./DetailFact";
import { CommercialDialog } from "./CommercialDialog";

function FitStars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} of 5`} className="text-[14px] tracking-wide text-warn">
      {"★".repeat(rating)}
      <span className="text-fg-subtle">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

/**
 * Details tab — "Commercial" group. Lifecycle/lead source/assigned rep/est.
 * annual spend already live on the basic DetailsSection grid; this covers
 * what's still uncaptured — fit rating, payment terms, and the incumbent
 * carrier/competitor (crm_accounts.current_carrier, which already existed
 * but wasn't surfaced anywhere in the UI until now).
 */
export async function CommercialSection({ accountId }: { accountId: string }) {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_accounts")
    .select("fit_rating, payment_terms, current_carrier, ai_confirmed_fields")
    .eq("id", accountId)
    .maybeSingle();

  const fitRating = (data?.fit_rating as number | null) ?? null;
  const paymentTerms = (data?.payment_terms as string | null) ?? null;
  const currentCarrier = (data?.current_carrier as string | null) ?? null;
  const confirmed = (data?.ai_confirmed_fields as Record<string, unknown> | null) ?? {};

  return (
    <Card>
      <CardHead
        title="Commercial"
        right={
          <CommercialDialog
            accountId={accountId}
            defaults={{ fit_rating: fitRating, payment_terms: paymentTerms, current_carrier: currentCarrier }}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
              >
                Edit
              </button>
            )}
          />
        }
      />
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
        <DetailFact
          label="Priority / fit rating"
          value={fitRating ? <FitStars rating={fitRating} /> : null}
          fromAi={!!confirmed.fit_rating}
        />
        <DetailFact label="Payment / credit terms" value={paymentTerms} fromAi={!!confirmed.payment_terms} />
        <DetailFact
          label="Incumbent carrier / competitor"
          value={currentCarrier}
          fromAi={!!confirmed.current_carrier}
        />
      </div>
    </Card>
  );
}

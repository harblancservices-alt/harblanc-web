import { D_CARD, D_H3, D_MICRO } from "./ui";

function titleCaseKey(key: string): string {
  return key.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** A value that IS a link (bare or schemed), so it can become a source chip
 * instead of a wall of raw URL text in the field grid. */
function asUrl(value: string): string | null {
  const v = value.trim();
  if (/^https?:\/\/\S+$/i.test(v)) return v;
  if (/^(www\.|[a-z0-9-]+\.[a-z]{2,})(\/\S*)?$/i.test(v) && !v.includes(" ") && !v.includes("@")) {
    return `https://${v}`;
  }
  return null;
}

/** Host without "www.", for the chip's label. */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * DESKTOP-ONLY "Enrichment data" card (design handoff §Main column) — the
 * AI-collected firmographics from crm_accounts.custom (jsonb), in a
 * 2-column field grid under a purple "AI-generated" pill and a
 * verify-before-relying caveat.
 *
 * Same data the mobile CustomFieldsCard renders, with the handoff's one real
 * improvement applied: any value that is itself a URL is lifted out of the
 * grid into a "Sources" row of clickable chips labeled by hostname, instead
 * of sitting in the body as a raw-URL wall. Purely presentational — this
 * card reads `custom` and writes nothing (nothing in the CRM writes to that
 * column yet either). Renders nothing at all when `custom` is empty, exactly
 * like CustomFieldsCard.
 *
 * The purple maps onto the CRM's existing --admin/--admin-soft tokens, not
 * the handoff's raw #6b46a8/#f1eafb.
 */
export function EnrichmentCard({ custom }: { custom: Record<string, unknown> | null }) {
  const entries = Object.entries(custom ?? {})
    .map(([k, v]) => ({ k, v: renderValue(v) }))
    .filter((e) => e.v.trim().length > 0);

  if (entries.length === 0) return null;

  const sources: { label: string; href: string }[] = [];
  const fields: { k: string; v: string }[] = [];
  for (const e of entries) {
    const url = asUrl(e.v);
    if (url) sources.push({ label: hostLabel(url), href: url });
    else fields.push(e);
  }

  return (
    <div className={`${D_CARD} p-4 px-[18px]`}>
      <div className="flex items-center gap-2">
        <h3 className={D_H3}>Enrichment data</h3>
        <span className="rounded-full bg-admin-soft px-2 py-0.5 text-[10px] font-bold text-admin">AI-generated</span>
      </div>
      <p className="mb-3 mt-1 text-[11px] font-medium text-fg-muted">Auto-collected — verify before relying on it.</p>

      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-[18px] gap-y-3">
          {fields.map((f) => (
            <div key={f.k} className="min-w-0">
              <div className={D_MICRO}>{titleCaseKey(f.k)}</div>
              <div className="mt-0.5 break-words text-[12px] leading-[1.5] text-fg">{f.v}</div>
            </div>
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <div className={`${fields.length > 0 ? "mt-3 border-t border-line pt-2.5" : ""}`}>
          <div className={`${D_MICRO} mb-1.5`}>Sources</div>
          <div className="flex flex-wrap gap-2">
            {sources.map((s, i) => (
              <a
                key={`${s.href}:${i}`}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border border-line-strong bg-inset px-2.5 py-1 text-[12px] font-semibold text-accent transition-colors hover:border-accent/40 hover:bg-accent/10"
              >
                {s.label} ↗
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

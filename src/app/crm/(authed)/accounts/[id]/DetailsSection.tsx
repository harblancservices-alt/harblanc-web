import type { ReactNode } from "react";
import { Card, CardHead } from "../../_shell/ui";
import { formatDate, formatMoney } from "../../_shell/format";
import { EditCompany } from "./EditCompany";
import { RepControl } from "./RepControl";
import type { CompanyDefaults, RepOption } from "../CompanyDialog";
import { CommodityPhotoTiles, type CrmCommodityPhoto } from "./CommodityPhotoTiles";

export type CrmDetailsTag = { id: string; label: string; color: string | null };

/**
 * DETAILS — address, website, industry, source, created/updated, company
 * type, MC/DOT (when present), assigned rep, and tags: the catch-all
 * firmographic record that doesn't belong in the operational sections above
 * it. "Edit" is the one write path — the full CompanyDialog/updateAccount —
 * so nothing here needs its own save logic; rep assignment is the one
 * exception, saved instantly via the inline RepControl (same as everywhere
 * else it appears). Always renders — a company always has at least an
 * address/created-at — unlike Company Scale, which hides outright when empty.
 */
export function DetailsSection({
  industry,
  companyType,
  email,
  annualFreightSpend,
  source,
  website,
  websiteHref,
  tags,
  fullAddress,
  dotNumber,
  mcNumber,
  addedByName,
  addedAt,
  updatedAt,
  editDefaults,
  reps,
  currentRepId,
  canDelete,
  accountId,
  orgId,
  photos,
}: {
  industry: string | null;
  companyType: string | null;
  email: string | null;
  annualFreightSpend: number | null;
  source: string | null;
  website: string | null;
  websiteHref: string | null;
  tags: CrmDetailsTag[];
  fullAddress: string | null;
  dotNumber: string | null;
  mcNumber: string | null;
  addedByName: string | null;
  addedAt: string | null;
  updatedAt: string | null;
  editDefaults: CompanyDefaults & { id: string };
  reps: RepOption[];
  currentRepId: string | null;
  canDelete: boolean;
  accountId: string;
  orgId: string;
  photos: CrmCommodityPhoto[];
}) {
  const addedLine = [addedByName, addedAt ? formatDate(addedAt) : null].filter(Boolean).join(" · ");
  const mcDot = [dotNumber ? `DOT ${dotNumber}` : null, mcNumber ? `MC ${mcNumber}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <CardHead title="Details" right={<EditCompany defaults={editDefaults} reps={reps} canDelete={canDelete} />} />
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
        <Fact label="Address" value={fullAddress} />
        <Fact
          label="Website"
          value={
            websiteHref ? (
              <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {website}
              </a>
            ) : null
          }
        />
        <Fact label="Industry" value={industry} />
        <Fact label="Company type" value={companyType} />
        <Fact
          label="Company email"
          value={email ? <a href={`mailto:${email}`} className="text-accent hover:underline">{email}</a> : null}
        />
        <Fact label="Lead source" value={source} />
        <Fact label="Est. annual freight spend" value={formatMoney(annualFreightSpend)} mono />
        <Fact label="MC / DOT" value={mcDot || null} mono />
        <Fact
          label="Assigned rep"
          value={<RepControl accountId={accountId} current={currentRepId} reps={reps} />}
        />
        <Fact
          label="Tags"
          value={
            tags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 border border-line-strong bg-inset py-0.5 pl-1.5 pr-2 text-[11.5px] font-medium text-fg"
                  >
                    <span className="h-1.5 w-1.5 shrink-0" style={{ background: t.color || "var(--fg-subtle)" }} />
                    {t.label}
                  </span>
                ))}
              </div>
            ) : null
          }
        />
        <Fact label="Added" value={addedLine || null} />
        <Fact label="Updated" value={updatedAt ? formatDate(updatedAt) : null} />
      </div>

      <div className="border-t border-line-strong p-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
          Commodity photos
        </p>
        <CommodityPhotoTiles accountId={accountId} orgId={orgId} photos={photos} />
      </div>
    </Card>
  );
}

function Fact({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  const empty = value === null || value === undefined || value === "—" || value === "";
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{label}</p>
      <p className={`mt-1 break-words text-[14px] ${empty ? "text-fg-subtle" : "text-fg"} ${mono && !empty ? "font-mono" : ""}`}>
        {empty ? "—" : value}
      </p>
    </div>
  );
}

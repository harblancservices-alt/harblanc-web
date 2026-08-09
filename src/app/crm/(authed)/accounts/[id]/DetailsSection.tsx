import type { ReactNode } from "react";
import { Card, CardHead } from "../../_shell/ui";
import { formatDate, formatMoney } from "../../_shell/format";
import { stageLabel, stageTone } from "../lifecycle";
import { EditCompany } from "./EditCompany";
import type { CompanyDefaults, RepOption } from "../CompanyDialog";
import { CommodityPhotoTiles, type CrmCommodityPhoto } from "./CommodityPhotoTiles";

export type CrmDetailsTag = { id: string; label: string; color: string | null };

/**
 * Details tab — company firmographics as a clean 2-column READ grid, plus
 * the commodity reference-photo tile grid (relocated here from the left
 * Company card — it belongs with the freight profile, not the always-visible
 * card). Firmographic fields live here (not on Overview, which is the
 * operational work surface). "Edit details" is the one write path — the full
 * CompanyDialog/updateAccount, same as everywhere else in the CRM edits a
 * company — so nothing here needs its own save logic. "Added by" resolves
 * from the account's first crm_activities row (kind=account_created) —
 * no schema needed, that row is already logged on create.
 */
export function DetailsSection({
  legalName,
  industry,
  companySize,
  annualFreightSpend,
  source,
  stage,
  website,
  websiteHref,
  tags,
  fullAddress,
  addedByName,
  addedAt,
  editDefaults,
  reps,
  canDelete,
  accountId,
  orgId,
  photos,
}: {
  legalName: string;
  industry: string | null;
  companySize: string | null;
  annualFreightSpend: number | null;
  source: string | null;
  stage: string;
  website: string | null;
  websiteHref: string | null;
  tags: CrmDetailsTag[];
  fullAddress: string | null;
  addedByName: string | null;
  addedAt: string | null;
  editDefaults: CompanyDefaults & { id: string };
  reps: RepOption[];
  canDelete: boolean;
  accountId: string;
  orgId: string;
  photos: CrmCommodityPhoto[];
}) {
  const addedLine = [addedByName, addedAt ? formatDate(addedAt) : null].filter(Boolean).join(" · ");

  return (
    <Card>
      <CardHead
        title="Details"
        right={<EditCompany defaults={editDefaults} reps={reps} canDelete={canDelete} />}
      />
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
        <Fact label="Legal name" value={legalName} />
        <Fact label="Industry" value={industry} />
        <Fact label="Company size" value={companySize} />
        <Fact label="Est. annual freight spend" value={formatMoney(annualFreightSpend)} mono />
        <Fact label="Lead source" value={source} />
        <Fact
          label="Lifecycle"
          value={
            <span
              className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-semibold ${stageTone(stage)}`}
            >
              {stageLabel(stage)}
            </span>
          }
        />
        <Fact
          label="Website"
          value={
            websiteHref ? (
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                {website}
              </a>
            ) : null
          }
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
                    <span
                      className="h-1.5 w-1.5 shrink-0"
                      style={{ background: t.color || "var(--fg-subtle)" }}
                    />
                    {t.label}
                  </span>
                ))}
              </div>
            ) : null
          }
        />
        <Fact label="Address" value={fullAddress} />
        <Fact label="Added by" value={addedLine || null} />
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-[14px] ${empty ? "text-fg-subtle" : "text-fg"} ${mono && !empty ? "font-mono" : ""}`}
      >
        {empty ? "—" : value}
      </p>
    </div>
  );
}

import { BTN_RED } from "../../_shell/ui";
import { IconPhone, IconMail, IconMapPin } from "../../_shell/icons";
import { digitsForTel } from "../../_shell/contactFields";
import { stageLabel, stageTone } from "../lifecycle";

const ACTION_BTN =
  "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors sm:flex-none sm:px-4";

/**
 * The company profile's STICKY header — name, stage pill, industry +
 * freight-fit (company_type) tags, and the three one-tap actions (Call /
 * Email / Maps). Stage color is driven by the same LIFECYCLE_TONE the
 * StageTracker chevrons use (via stageTone/stageLabel) — one source of truth
 * for stage color everywhere on the profile. Each action hides itself when
 * there's no underlying data rather than rendering a dead button.
 */
export function CompanyHeader({
  name,
  stage,
  industry,
  companyType,
  phone,
  email,
  mapsAddress,
}: {
  name: string;
  stage: string;
  industry: string | null;
  companyType: string | null;
  phone: string | null;
  email: string | null;
  mapsAddress: string | null;
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-3 border border-line-strong bg-card px-4 py-3.5 shadow-e2">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h1 className="truncate text-[18px] font-bold tracking-tight text-fg">{name}</h1>
        <span className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-semibold ${stageTone(stage)}`}>
          {stageLabel(stage)}
        </span>
        {industry && (
          <span className="inline-flex items-center bg-inset px-2.5 py-0.5 text-[11px] font-medium text-fg-muted">
            {industry}
          </span>
        )}
        {companyType && (
          <span className="inline-flex items-center bg-inset px-2.5 py-0.5 text-[11px] font-medium text-fg-muted">
            {companyType}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {phone && (
          <a href={`tel:${digitsForTel(phone)}`} className={`${ACTION_BTN} ${BTN_RED}`}>
            <IconPhone width={15} height={15} />
            Call
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className={`${ACTION_BTN} ${BTN_RED}`}>
            <IconMail width={15} height={15} />
            Email
          </a>
        )}
        {mapsAddress && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsAddress)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${ACTION_BTN} ${BTN_RED}`}
          >
            <IconMapPin width={15} height={15} />
            Map
          </a>
        )}
      </div>
    </div>
  );
}

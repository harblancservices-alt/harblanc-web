import type { ReactNode } from "react";
import { Card, CardHead } from "../../_shell/ui";
import { digitsForTel } from "../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{label}</p>
      <p className="mt-1 break-words text-[14px] text-fg">{value}</p>
    </div>
  );
}

/**
 * LEFT column — "About": name, phone (tel:), email (mailto: — company email
 * if set, else the primary contact's, resolved by page.tsx), website (opens
 * new tab), industry, address (opens Google Maps). Only rows with data
 * render — no "—" placeholders here, this card is meant to read as short and
 * scannable.
 */
export function AboutCard({
  name,
  phone,
  email,
  website,
  websiteHref,
  industry,
  fullAddress,
}: {
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  websiteHref: string | null;
  industry: string | null;
  fullAddress: string | null;
}) {
  return (
    <Card>
      <CardHead title="About" />
      <div className="flex flex-col gap-4 p-5">
        <Row label="Company name" value={name} />
        {phone && (
          <Row
            label="Phone"
            value={
              <a href={`tel:${digitsForTel(phone)}`} className="font-mono text-accent hover:underline">
                {formatPhone(phone)}
              </a>
            }
          />
        )}
        {email && (
          <Row
            label="Email"
            value={
              <a href={`mailto:${email}`} className="text-accent hover:underline">
                {email}
              </a>
            }
          />
        )}
        {websiteHref && (
          <Row
            label="Website"
            value={
              <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {website}
              </a>
            }
          />
        )}
        {industry && <Row label="Industry" value={industry} />}
        {fullAddress && (
          <Row
            label="Address"
            value={
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                {fullAddress}
              </a>
            }
          />
        )}
      </div>
    </Card>
  );
}

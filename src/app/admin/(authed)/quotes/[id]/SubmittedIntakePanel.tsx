import { formatDateFull, relativeTime } from "@/lib/admin/format";

/**
 * Submitted Intake panel — admin-side display of the customer's
 * shipment_intake row.
 *
 * Renders when the customer has SUBMITTED (status === "submitted").
 * In-progress intakes are NOT shown here — the workflow state machine
 * surfaces those separately so admin doesn't act on partial data.
 *
 * Phase J2: the panel is rendered ONLY on the Workspace tab, above the
 * estimate composer, so the operator sees the finalized operational
 * scope the moment the customer submits. (Previously also rendered on
 * the Finalized Quote tab; that duplicate was removed because the
 * finalized-quote composer prefills its Pickup/Delivery/Freight fields
 * from intake data via the server data loader, making a separate
 * read-only panel redundant on that tab.)
 *
 * Server component — no client state. The rendered output is fed
 * verbatim from the database snapshot.
 */

export type SubmittedIntakeData = {
  id: string;
  submittedAt: string;

  pickupCompany: string | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  pickupContactEmail: string | null;
  pickupAddressLine1: string | null;
  pickupAddressLine2: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupZip: string | null;
  pickupWindow: string | null;

  deliveryCompany: string | null;
  deliveryContactName: string | null;
  deliveryContactPhone: string | null;
  deliveryContactEmail: string | null;
  deliveryAddressLine1: string | null;
  deliveryAddressLine2: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryZip: string | null;
  deliveryWindow: string | null;

  commodityDetails: string | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  exactWeightLbs: number | null;

  loadingResponsibility: string | null;
  unloadingResponsibility: string | null;
  specialRequirements: string | null;

  referenceLinks: string | null;
  notes: string | null;
};

const LOADING_LABELS: Record<string, string> = {
  driver_load: "Driver loads",
  shipper_dock: "Loading dock available",
  shipper_forklift: "Forklift available on site",
  shipper_hand: "Hand load (no equipment)",
  rigging_required: "Rigging / crane required",
  other: "Other (see notes)",
};

const UNLOADING_LABELS: Record<string, string> = {
  driver_unload: "Driver unloads",
  receiver_dock: "Receiver dock available",
  receiver_forklift: "Forklift available on site",
  receiver_hand: "Hand unload (no equipment)",
  lumper: "Lumper service required",
  rigging_required: "Rigging / crane required",
  other: "Other (see notes)",
};

function joinAddress(c: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}): string[] {
  const lines: string[] = [];
  if (c.addressLine1) lines.push(c.addressLine1);
  if (c.addressLine2) lines.push(c.addressLine2);
  const cityStateParts: string[] = [];
  if (c.city) cityStateParts.push(c.city);
  if (c.state) cityStateParts.push(c.state);
  const cityState = cityStateParts.join(", ");
  if (cityState && c.zip) lines.push(`${cityState} ${c.zip}`);
  else if (cityState) lines.push(cityState);
  else if (c.zip) lines.push(c.zip);
  return lines;
}

function formatDims(intake: SubmittedIntakeData): string {
  const parts: string[] = [];
  if (intake.lengthIn !== null) parts.push(`${intake.lengthIn}"L`);
  if (intake.widthIn !== null) parts.push(`${intake.widthIn}"W`);
  if (intake.heightIn !== null) parts.push(`${intake.heightIn}"H`);
  return parts.join(" × ");
}

/**
 * Flag operational red flags surfaced by the intake. These are
 * deliberately short and scannable — Brent's eyes flick across them
 * to decide what equipment / permits / extra hands the load needs.
 */
function buildRedFlags(intake: SubmittedIntakeData): string[] {
  const flags: string[] = [];

  if (intake.loadingResponsibility === "driver_load") {
    flags.push("Driver loads");
  }
  if (intake.unloadingResponsibility === "driver_unload") {
    flags.push("Driver unloads");
  }
  if (intake.loadingResponsibility === "shipper_forklift") {
    flags.push("Forklift on pickup");
  }
  if (intake.unloadingResponsibility === "receiver_forklift") {
    flags.push("Forklift on delivery");
  }
  if (intake.loadingResponsibility === "shipper_hand") {
    flags.push("Hand load");
  }
  if (intake.unloadingResponsibility === "receiver_hand") {
    flags.push("Hand unload");
  }
  if (
    intake.loadingResponsibility === "rigging_required" ||
    intake.unloadingResponsibility === "rigging_required"
  ) {
    flags.push("Rigging / crane");
  }
  if (intake.unloadingResponsibility === "lumper") {
    flags.push("Lumper at delivery");
  }

  const sr = intake.specialRequirements?.toLowerCase() ?? "";
  if (/hazmat|hazardous|placard/.test(sr)) flags.push("Hazmat");
  if (/oversi[zs]e|over-?width|over-?length|over-?height|overdim/.test(sr)) {
    flags.push("Oversize");
  }
  if (/permit/.test(sr)) flags.push("Permits");
  if (/escort|pilot car/.test(sr)) flags.push("Escort");
  if (/tarp/.test(sr)) flags.push("Tarp");
  if (/non[- ]?running/.test(sr)) flags.push("Non-running");

  return flags;
}

export function SubmittedIntakePanel({
  intake,
}: {
  intake: SubmittedIntakeData;
}) {
  const pickupAddress = joinAddress({
    addressLine1: intake.pickupAddressLine1,
    addressLine2: intake.pickupAddressLine2,
    city: intake.pickupCity,
    state: intake.pickupState,
    zip: intake.pickupZip,
  });
  const deliveryAddress = joinAddress({
    addressLine1: intake.deliveryAddressLine1,
    addressLine2: intake.deliveryAddressLine2,
    city: intake.deliveryCity,
    state: intake.deliveryState,
    zip: intake.deliveryZip,
  });

  const dims = formatDims(intake);
  const redFlags = buildRedFlags(intake);

  const referenceLinks = (intake.referenceLinks ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return (
    <section className="border border-neutral-800 border-t-2 border-t-green-600 bg-neutral-900/40 p-5 sm:p-6">
      <header className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="font-mono text-[10px] tracking-[0.22em] text-green-400 uppercase">
          Submitted intake
        </p>
        <span
          className="font-mono text-[10px] text-neutral-500"
          title={formatDateFull(intake.submittedAt)}
        >
          {relativeTime(intake.submittedAt)} · {formatDateFull(intake.submittedAt)}
        </span>
      </header>

      {/* Operational red flags — scannable strip across the top. */}
      {redFlags.length > 0 ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {redFlags.map((f) => (
            <span
              key={f}
              className="inline-flex items-center border border-amber-700/60 bg-amber-950/30 px-2.5 py-1 font-mono text-[10px] tracking-[0.22em] text-amber-200 uppercase"
            >
              {f}
            </span>
          ))}
        </div>
      ) : null}

      {/* Pickup / Delivery two-column */}
      <div className="grid grid-cols-1 divide-y divide-neutral-800 border border-neutral-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <LocationBlock
          title="Pickup"
          company={intake.pickupCompany}
          contactName={intake.pickupContactName}
          contactPhone={intake.pickupContactPhone}
          contactEmail={intake.pickupContactEmail}
          address={pickupAddress}
          window={intake.pickupWindow}
          responsibility={intake.loadingResponsibility}
          responsibilityLabels={LOADING_LABELS}
          responsibilityCaption="Loading"
        />
        <LocationBlock
          title="Delivery"
          company={intake.deliveryCompany}
          contactName={intake.deliveryContactName}
          contactPhone={intake.deliveryContactPhone}
          contactEmail={intake.deliveryContactEmail}
          address={deliveryAddress}
          window={intake.deliveryWindow}
          responsibility={intake.unloadingResponsibility}
          responsibilityLabels={UNLOADING_LABELS}
          responsibilityCaption="Unloading"
        />
      </div>

      {/* Freight scope */}
      <div className="mt-5 border border-neutral-800 bg-neutral-950 p-4 sm:p-5">
        <p className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
          Freight scope
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          {intake.commodityDetails ? (
            <Field label="Commodity" full>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-neutral-100">
                {intake.commodityDetails}
              </p>
            </Field>
          ) : null}
          {dims ? (
            <Field label="Dimensions">
              <span className="font-mono text-base font-semibold text-white">
                {dims}
              </span>
            </Field>
          ) : null}
          {intake.exactWeightLbs !== null ? (
            <Field label="Exact weight">
              <span className="font-mono text-base font-semibold text-white">
                {intake.exactWeightLbs.toLocaleString()} lbs
              </span>
            </Field>
          ) : null}
        </dl>
        {intake.specialRequirements ? (
          <div className="mt-4 border-t border-neutral-800 pt-4">
            <p className="font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase">
              Special requirements
            </p>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-neutral-100">
              {intake.specialRequirements}
            </p>
          </div>
        ) : null}
      </div>

      {/* Notes + reference links */}
      {(intake.notes || referenceLinks.length > 0) ? (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {intake.notes ? (
            <div className="border border-neutral-800 bg-neutral-950 p-4">
              <p className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
                Notes for dispatch
              </p>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-neutral-100">
                {intake.notes}
              </p>
            </div>
          ) : null}
          {referenceLinks.length > 0 ? (
            <div className="border border-neutral-800 bg-neutral-950 p-4">
              <p className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
                Reference links
              </p>
              <ul className="mt-2 space-y-1.5">
                {referenceLinks.map((link, i) => (
                  <li key={i} className="min-w-0">
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all font-mono text-xs text-blue-300 underline-offset-4 hover:underline"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function LocationBlock({
  title,
  company,
  contactName,
  contactPhone,
  contactEmail,
  address,
  window,
  responsibility,
  responsibilityLabels,
  responsibilityCaption,
}: {
  title: string;
  company: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string[];
  window: string | null;
  responsibility: string | null;
  responsibilityLabels: Record<string, string>;
  responsibilityCaption: string;
}) {
  const phoneHref = contactPhone
    ? `tel:${contactPhone.replace(/[^\d+]/g, "")}`
    : null;
  const responsibilityLabel = responsibility
    ? (responsibilityLabels[responsibility] ?? responsibility)
    : null;

  return (
    <section className="bg-neutral-900/40 p-4 sm:p-5">
      <p className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
        {title}
      </p>
      <div className="mt-3 space-y-3">
        {company ? (
          <p className="text-base font-semibold text-white">{company}</p>
        ) : null}
        {address.length > 0 ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-neutral-200">
            {address.join("\n")}
          </p>
        ) : null}
        {contactName ? (
          <Field label="Contact" inline>
            <span className="text-sm text-neutral-200">{contactName}</span>
          </Field>
        ) : null}
        {contactPhone ? (
          <Field label="Phone" inline>
            <a
              href={phoneHref ?? "#"}
              className="font-mono text-sm text-white underline-offset-4 hover:underline"
            >
              {contactPhone}
            </a>
          </Field>
        ) : null}
        {contactEmail ? (
          <Field label="Email" inline>
            <a
              href={`mailto:${contactEmail}`}
              className="break-all text-sm text-white underline-offset-4 hover:underline"
            >
              {contactEmail}
            </a>
          </Field>
        ) : null}
        {window ? (
          <Field label="Window" inline>
            <span className="text-sm whitespace-pre-wrap text-neutral-100">{window}</span>
          </Field>
        ) : null}
        {responsibilityLabel ? (
          <Field label={responsibilityCaption} inline>
            <span className="text-sm text-neutral-100">{responsibilityLabel}</span>
          </Field>
        ) : null}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  full = false,
  inline = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div>
        <dt className="font-mono text-[9px] tracking-[0.22em] text-neutral-500 uppercase">
          {label}
        </dt>
        <dd className="mt-0.5">{children}</dd>
      </div>
    );
  }
  return (
    <div className={full ? "sm:col-span-3" : undefined}>
      <dt className="font-mono text-[9px] tracking-[0.22em] text-neutral-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

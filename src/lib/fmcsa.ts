import "server-only";

/**
 * FMCSA QCMobile API client.
 *
 * Looks up a registered company by DOT number or MC/docket number and
 * normalizes the (verbose, loosely-typed) response into the handful of
 * fields the broker form cares about: legal/DBA name, DOT + MC, phone,
 * mailing address, operating status, and broker authority.
 *
 * Docs: https://mobile.fmcsa.dot.gov/QCDevsite/docs/qcApi
 * The webKey lives in FMCSA_WEBKEY (server-only env var).
 */

const BASE = "https://mobile.fmcsa.dot.gov/qc/services";

export type FmcsaBroker = {
  name: string | null;
  dbaName: string | null;
  dotNumber: string | null;
  mcNumber: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  allowedToOperate: boolean | null;
  /** True when the company holds active broker authority. */
  brokerAuthority: boolean | null;
  authoritySummary: string | null;
};

type Json = Record<string, unknown>;

function s(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length > 0 ? t : null;
}

/** Pull `content.carrier` (single) or `content[0].carrier` (list) shapes. */
function firstCarrier(json: Json): Json | null {
  const content = json["content"];
  if (Array.isArray(content)) {
    const item = content.find(
      (c) => c && typeof c === "object" && "carrier" in c,
    ) as Json | undefined;
    if (item && item["carrier"] && typeof item["carrier"] === "object") {
      return item["carrier"] as Json;
    }
    // Some endpoints return the carrier object directly in the array.
    const direct = content[0];
    return direct && typeof direct === "object" ? (direct as Json) : null;
  }
  if (content && typeof content === "object") {
    const c = (content as Json)["carrier"];
    if (c && typeof c === "object") return c as Json;
    return content as Json;
  }
  return null;
}

async function getJson(url: string): Promise<Json | null> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    // Cache FMCSA responses for a day; this data changes slowly.
    next: { revalidate: 86_400 },
  });
  if (!res.ok) return null;
  try {
    return (await res.json()) as Json;
  } catch {
    return null;
  }
}

function key(): string {
  const k = process.env.FMCSA_WEBKEY;
  if (!k) throw new Error("FMCSA_WEBKEY is not configured.");
  return k;
}

/** Fetch broker authority status for a DOT number, if available. */
async function fetchAuthority(
  dot: string,
): Promise<{ broker: boolean | null; summary: string | null }> {
  const json = await getJson(`${BASE}/carriers/${dot}/authority?webKey=${key()}`);
  if (!json) return { broker: null, summary: null };
  const content = json["content"];
  const rec = Array.isArray(content) ? content[0] : content;
  const auth =
    rec && typeof rec === "object"
      ? ((rec as Json)["carrierAuthority"] ?? rec)
      : null;
  if (!auth || typeof auth !== "object") return { broker: null, summary: null };
  const a = auth as Json;
  // Field is typically "A" (active) / "I" (inactive) / "N" (none).
  const raw = s(a["brokerAuthority"]);
  const broker = raw ? raw.toUpperCase().startsWith("A") : null;
  const parts: string[] = [];
  if (s(a["commonAuthority"])) parts.push(`Common ${s(a["commonAuthority"])}`);
  if (s(a["contractAuthority"]))
    parts.push(`Contract ${s(a["contractAuthority"])}`);
  if (raw) parts.push(`Broker ${raw}`);
  return { broker, summary: parts.length ? parts.join(" · ") : null };
}

function normalize(carrier: Json): FmcsaBroker {
  const dot = s(carrier["dotNumber"]);
  return {
    name: s(carrier["legalName"]),
    dbaName: s(carrier["dbaName"]),
    dotNumber: dot,
    mcNumber: s(carrier["docketNumber"]) ?? s(carrier["mcNumber"]),
    phone: s(carrier["telephone"]) ?? s(carrier["phyPhone"]),
    address: s(carrier["phyStreet"]),
    city: s(carrier["phyCity"]),
    state: s(carrier["phyState"]),
    zip: s(carrier["phyZipcode"]),
    allowedToOperate: (() => {
      const v = s(carrier["allowedToOperate"]);
      return v ? v.toUpperCase().startsWith("Y") : null;
    })(),
    brokerAuthority: null,
    authoritySummary: null,
  };
}

/** Look up by DOT number. */
export async function lookupByDot(dot: string): Promise<FmcsaBroker | null> {
  const clean = dot.replace(/\D/g, "");
  if (!clean) return null;
  const json = await getJson(`${BASE}/carriers/${clean}?webKey=${key()}`);
  if (!json) return null;
  const carrier = firstCarrier(json);
  if (!carrier) return null;
  const base = normalize(carrier);
  const dotForAuth = base.dotNumber ?? clean;
  const auth = await fetchAuthority(dotForAuth);
  return { ...base, brokerAuthority: auth.broker, authoritySummary: auth.summary };
}

/** Look up by MC / docket number. */
export async function lookupByMc(mc: string): Promise<FmcsaBroker | null> {
  const clean = mc.replace(/\D/g, "");
  if (!clean) return null;
  const json = await getJson(
    `${BASE}/carriers/docket-number/${clean}?webKey=${key()}`,
  );
  if (!json) return null;
  const carrier = firstCarrier(json);
  if (!carrier) return null;
  const base = normalize(carrier);
  // Docket lookup doesn't echo the MC back; keep what the user searched.
  base.mcNumber = base.mcNumber ?? clean;
  if (base.dotNumber) {
    const auth = await fetchAuthority(base.dotNumber);
    base.brokerAuthority = auth.broker;
    base.authoritySummary = auth.summary;
  }
  return base;
}

/** Dispatch to the right lookup based on the kind the caller asked for. */
export async function lookupFmcsa(
  value: string,
  kind: "mc" | "dot",
): Promise<FmcsaBroker | null> {
  return kind === "dot" ? lookupByDot(value) : lookupByMc(value);
}

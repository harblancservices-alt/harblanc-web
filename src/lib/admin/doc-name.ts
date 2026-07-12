/**
 * Canonical document naming — ONE source of truth for what an uploaded file is
 * called. Used in three places so a file reads the same everywhere:
 *   (a) the Files timeline display (lib/admin/files.ts),
 *   (b) the load-detail Documents section display (dispatch/loads/[id]/page),
 *   (c) the STORED file_name on NEW uploads (recordLoadDocuments, the BOL sign
 *       output, and maintenance receipt uploads).
 *
 * Convention:
 *   Rate confirmation → "RC - <loadNumber> - <broker>"
 *   Bill of lading    → "BOL - <loadNumber> - <broker>"
 *   Proof of delivery → "POD - <loadNumber> - <broker>"
 *   Signed BOL        → "BOL - <loadNumber> - <broker> - signed"
 *   Maintenance receipt → "<first part name> - <date>"  (e.g. "Track bar - Jul 9")
 * With multiple of the same type on one load, the abbreviation carries a
 * 1-based upload-order number ("RC 1 - …", "RC 2 - …"); a lone one has none.
 *
 * loadNumber is the load's number (which IS the broker's own number); broker is
 * the load's broker name. Names are returned WITHOUT a file extension — callers
 * that persist a filename append the real extension via {@link withExt} so the
 * saved file keeps its true type.
 *
 * Pure module (no DB / server imports) so client, server, and actions share it.
 */

export type LoadDocKind = "rate_con" | "bol" | "pod" | "other";

const LOAD_DOC_ABBR: Record<LoadDocKind, string> = {
  rate_con: "RC",
  bol: "BOL",
  pod: "POD",
  other: "DOC",
};

/** Coerce a raw DB `kind` string to a known load-doc kind. */
export function normalizeLoadDocKind(kind: string | null | undefined): LoadDocKind {
  return kind === "rate_con" || kind === "bol" || kind === "pod" ? kind : "other";
}

function clean(s: string | null | undefined, fallback: string): string {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : fallback;
}

/**
 * Canonical name for a load document (rate con / BOL / POD / signed BOL).
 * `index`/`total` number same-type (and same signed-ness) siblings; when
 * `total` ≤ 1 the number is omitted.
 */
export function loadDocName(opts: {
  kind: LoadDocKind;
  loadNumber: string | null | undefined;
  broker: string | null | undefined;
  signed?: boolean;
  /** 1-based position among same-type, same-signedness siblings (upload order). */
  index?: number;
  /** Count of those siblings; > 1 → number the name. */
  total?: number;
}): string {
  const abbr = LOAD_DOC_ABBR[opts.kind];
  const total = opts.total ?? 1;
  const index = opts.index ?? 1;
  const num = total > 1 ? ` ${index}` : "";
  const base = `${abbr}${num} - ${clean(opts.loadNumber, "—")} - ${clean(opts.broker, "—")}`;
  return opts.signed ? `${base} - signed` : base;
}

/** Canonical name for a maintenance receipt: "<first part name> - <date>". */
export function receiptName(opts: {
  firstPartName: string | null | undefined;
  date: string | null | undefined;
}): string {
  return `${clean(opts.firstPartName, "Service")} - ${shortDate(opts.date)}`;
}

/** "Jul 9" style label; date-only values are treated as UTC to avoid tz drift. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The real extension of a filename, including the dot (e.g. ".pdf"); "" if none. */
export function fileExt(name: string | null | undefined): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec((name ?? "").trim());
  return m ? `.${m[1].toLowerCase()}` : "";
}

/**
 * A canonical `base` name with the real extension of `sourceName` re-appended,
 * capped to the 240-char storage column. Use when persisting file_name so the
 * saved file keeps its true type.
 */
export function withExt(base: string, sourceName: string | null | undefined): string {
  return `${base}${fileExt(sourceName)}`.slice(0, 240);
}

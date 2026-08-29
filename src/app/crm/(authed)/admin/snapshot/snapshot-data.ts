import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";

/**
 * SNAPSHOT — the read. There is one.
 *
 * Brent cut this feature back to its bones: "It's just a photo capture at
 * the top and then on the bottom it's just a list. That's it. It's just a
 * list of files. There's no photo preview, there's no nothing. It's just a
 * list that gets bigger as it goes. There shouldn't be any buttons besides
 * delete."
 *
 * So: no batches, no parse state, no manifest, no thumbnails, no ranges,
 * no refresh button. What was built before this was all of those things,
 * and it is gone rather than hidden behind a flag.
 *
 * ── NO SIGNED URLS, WHICH IS WHY THE WHOLE LIST CAN RENDER ────────────
 *
 * The previous version paged at sixty because the bucket is private and a
 * thumbnail needs a signed URL — signing four hundred objects to draw one
 * screen is what would have killed the page. With no previews there is
 * nothing to sign, so the list is text and four hundred rows cost nothing.
 * That is why there is no pagination control, which is just as well,
 * because a pagination control is a button and there is only one button.
 */

export const STORAGE_BUCKET = "crm-documents";

export type SnapshotRow = {
  id: string;
  /** The permanent, org-wide number Brent says out loud. Assigned once by
   * a database trigger and never recomputed — see the migration. */
  number: number;
  fileName: string;
  createdAt: string;
  /**
   * THE PARSE RESULT, or null on a photo nobody has parsed yet.
   *
   * Null is the whole flag: the list renders green only when this is
   * present. A score of 0 is a RESULT — "unreadable, got nothing" — and
   * must not be confused with "not looked at", which is why this is a
   * nullable object rather than a score defaulting to zero.
   */
  parse: {
    parsedAt: string;
    /** 0-100. See parseScore.ts for the weights. */
    score: number;
    /** Distinct phone numbers pulled off the document. */
    phones: number;
    /**
     * Companies this parse produced that are STILL LIVE.
     *
     * Counted at read time through bol_entry_id rather than stored. M8
     * Logistics was created by this very parse and soft-deleted an hour
     * later for being a broker; a stored count would still say 2. The
     * number on the card has to be the number of companies you can
     * actually go and open.
     */
    companies: number;
  } | null;
};

/**
 * Every photo, newest first.
 *
 * The cap is a runaway guard, not a page size. At four hundred a sitting
 * Brent would have to shoot for weeks to reach it, and if he ever does the
 * list is truncated rather than the page dying — but the numbers on screen
 * would stop matching what he expects, so it is worth knowing about. That
 * is what `truncated` is for.
 */
export async function listSnapshots(): Promise<{ rows: SnapshotRow[]; truncated: boolean }> {
  const supabase = await createCrmServerClient();
  const LIMIT = 2000;

  const { data } = await supabase
    .from("crm_snapshots")
    .select("id, number, file_name, created_at, parsed_at, parse_score, phone_count, bol_entry_id")
    .is("deleted_at", null)
    .order("number", { ascending: false })
    .limit(LIMIT + 1);

  const raw = (data ?? []) as {
    id: string;
    number: number;
    file_name: string;
    created_at: string;
    parsed_at: string | null;
    parse_score: number | null;
    phone_count: number | null;
    bol_entry_id: string | null;
  }[];

  const rows = raw.slice(0, LIMIT);

  /**
   * LIVE COMPANY COUNTS, for the parsed rows only.
   *
   * Two conditional round-trips, skipped entirely when nothing on the page
   * has been parsed — which is every page today bar one row. The chain is
   * snapshot -> crm_bol_entries -> matched_*_account_id -> live accounts,
   * the same path the company profile and the Linked company control use,
   * so all three agree about which companies a document produced.
   */
  const entryIds = [...new Set(rows.map((r) => r.bol_entry_id).filter((v): v is string => !!v))];

  const entries = entryIds.length
    ? ((
        await supabase
          .from("crm_bol_entries")
          .select(
            "id, matched_shipper_account_id, matched_consignee_account_id, matched_bill_to_account_id",
          )
          .in("id", entryIds)
          .is("deleted_at", null)
      ).data ?? [])
    : [];

  const entryRows = entries as {
    id: string;
    matched_shipper_account_id: string | null;
    matched_consignee_account_id: string | null;
    matched_bill_to_account_id: string | null;
  }[];

  const candidateIds = [
    ...new Set(
      entryRows
        .flatMap((e) => [
          e.matched_shipper_account_id,
          e.matched_consignee_account_id,
          e.matched_bill_to_account_id,
        ])
        .filter((v): v is string => !!v),
    ),
  ];

  const liveIds = new Set(
    candidateIds.length
      ? (
          ((
            await supabase
              .from("crm_accounts")
              .select("id")
              .in("id", candidateIds)
              .is("deleted_at", null)
          ).data ?? []) as { id: string }[]
        ).map((a) => a.id)
      : [],
  );

  const liveCountByEntry = new Map(
    entryRows.map((e) => [
      e.id,
      new Set(
        [
          e.matched_shipper_account_id,
          e.matched_consignee_account_id,
          e.matched_bill_to_account_id,
        ].filter((v): v is string => !!v && liveIds.has(v)),
      ).size,
    ]),
  );

  return {
    rows: rows.map((r) => ({
      id: r.id,
      number: r.number,
      fileName: r.file_name,
      createdAt: r.created_at,
      parse: r.parsed_at
        ? {
            parsedAt: r.parsed_at,
            score: r.parse_score ?? 0,
            phones: r.phone_count ?? 0,
            companies: r.bol_entry_id ? liveCountByEntry.get(r.bol_entry_id) ?? 0 : 0,
          }
        : null,
    })),
    truncated: raw.length > LIMIT,
  };
}

/** Snapshot sits under Admin Account, so only owners reach it. */
export async function requireSnapshotAdmin() {
  const user = await requireCrmUser();
  return { user, isOwner: user.role === "owner" };
}

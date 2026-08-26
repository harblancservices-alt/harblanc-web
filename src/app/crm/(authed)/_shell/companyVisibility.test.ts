import { describe, it, expect } from "vitest";
import { applyCompanyVisibility, type CompanyVisibility } from "./companyVisibility";

/**
 * A stand-in for the Supabase query builder that records the filters applied
 * to it. applyCompanyVisibility is structurally typed against `.eq()`/`.or()`
 * precisely so it can be exercised without a database.
 */
function fakeQuery() {
  const calls: string[] = [];
  const q = {
    calls,
    eq(column: string, value: string) {
      calls.push(`eq:${column}=${value}`);
      return q;
    },
    or(filter: string) {
      calls.push(`or:${filter}`);
      return q;
    },
  };
  return q;
}

const ME = "user-1";

function vis(over: Partial<CompanyVisibility> = {}): CompanyVisibility {
  return { restricted: true, includeUnassigned: false, userId: ME, ...over };
}

describe("applyCompanyVisibility", () => {
  it("leaves an unrestricted caller's query completely alone", () => {
    const q = fakeQuery();
    applyCompanyVisibility(q, vis({ restricted: false }));
    expect(q.calls).toEqual([]);
  });

  it("narrows a plain restricted caller to their own companies", () => {
    const q = fakeQuery();
    applyCompanyVisibility(q, vis());
    expect(q.calls).toEqual([`eq:assigned_user_id=${ME}`]);
  });

  it("widens to include unowned companies when that grant is on", () => {
    const q = fakeQuery();
    applyCompanyVisibility(q, vis({ includeUnassigned: true }));
    expect(q.calls).toEqual([`or:assigned_user_id.eq.${ME},assigned_user_id.is.null`]);
  });

  it("never widens for an unrestricted caller, grant or not", () => {
    // "Show unassigned" is meaningless once you can see everything; it must
    // not add a second filter that could accidentally narrow the query.
    const q = fakeQuery();
    applyCompanyVisibility(q, vis({ restricted: false, includeUnassigned: true }));
    expect(q.calls).toEqual([]);
  });

  it("returns the same builder so callers can keep chaining", () => {
    const q = fakeQuery();
    expect(applyCompanyVisibility(q, vis())).toBe(q);
  });
});

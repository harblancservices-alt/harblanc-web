import { describe, expect, it } from "vitest";
import { bolRole, type RoleMatch } from "./bolRole";

const ME = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER = "bbbbbbbb-0000-0000-0000-000000000002";

function row(p: Partial<RoleMatch>): RoleMatch {
  return {
    matched_shipper_account_id: null,
    matched_consignee_account_id: null,
    matched_bill_to_account_id: null,
    ...p,
  };
}

describe("bolRole", () => {
  it("calls the tendering company the shipper", () => {
    expect(bolRole(row({ matched_shipper_account_id: ME }), ME)).toBe("shipper");
  });

  it("calls the receiving company the consignee", () => {
    expect(bolRole(row({ matched_consignee_account_id: ME }), ME)).toBe("consignee");
  });

  it("calls the paying company the bill-to", () => {
    expect(bolRole(row({ matched_bill_to_account_id: ME }), ME)).toBe("bill_to");
  });

  it("does not read somebody else's match as this company's role", () => {
    // The regression this guards: a BOL where ANOTHER company is the
    // shipper and THIS one receives. Comparing truthiness instead of
    // identity would return "shipper" here and tell a warehouse it
    // tendered freight that was delivered to it.
    const r = row({ matched_shipper_account_id: OTHER, matched_consignee_account_id: ME });
    expect(bolRole(r, ME)).toBe("consignee");
  });

  it("prefers shipper when a company is both ends of its own load", () => {
    const r = row({ matched_shipper_account_id: ME, matched_consignee_account_id: ME });
    expect(bolRole(r, ME)).toBe("shipper");
  });

  it("prefers consignee over bill-to when the receiver also pays", () => {
    const r = row({ matched_consignee_account_id: ME, matched_bill_to_account_id: ME });
    expect(bolRole(r, ME)).toBe("consignee");
  });

  it("reads Snapshot #1 the way the paperwork does", () => {
    // The real row created 2026-08-28 from BOL M8LOG-LT2F-10648-LEG-2.1:
    // Solar-Link Global tendered it, M8 Logistics was billed, and the
    // document names no receiver at all.
    const solarLink = "b39176ac-c79f-426c-93b8-7645385fade8";
    const m8 = "c1d86771-29eb-474e-8dd7-79e8cbfc85e5";
    const r = row({
      matched_shipper_account_id: solarLink,
      matched_consignee_account_id: null,
      matched_bill_to_account_id: m8,
    });
    expect(bolRole(r, solarLink)).toBe("shipper");
    expect(bolRole(r, m8)).toBe("bill_to");
  });
});

/**
 * Shared shapes for the Pipeline board — the deal list/page, the New Deal
 * dialog, and each card all need the same narrow company/stage/deal views.
 */
export type AccountOption = { id: string; name: string };

export type StageOption = { id: string; name: string };

export type DealCardData = {
  id: string;
  name: string;
  accountId: string | null;
  companyName: string | null;
  estimatedRevenue: number | null;
  expectedCloseDate: string | null;
  ownerName: string | null;
};

export type BrokerProfile = {
  name: string;
  mc: string;
  dot: string;
  /** Mailing address for the broker letterhead. Empty until Brent supplies
   * one — callers must render nothing (not a placeholder) when blank. */
  address: string;
};

/**
 * Hello Hotshot's broker letterhead info — permanent, org-wide identity
 * that documents (Bill of Lading, Rate Confirmation, ...) read instead of
 * asking a rep to type it per-document. Exported as plain data for now; a
 * CRM Settings screen is planned to edit this, so keep this module's shape
 * (a single exported object of this type) stable — swapping the static
 * export for a settings-backed fetch shouldn't require touching callers.
 */
export const BROKER_PROFILE: BrokerProfile = {
  name: "Hello Hotshot",
  mc: "1336801",
  dot: "3758160",
  address: "",
};

import type { Metadata } from "next";
import { EmailBrokerView } from "./EmailBrokerView";

export const metadata: Metadata = {
  title: "Email a Broker",
  robots: { index: false, follow: false },
};

/**
 * Dispatch → Email a Broker. Quick load outreach: paste the broker's email and a
 * load line off the board, preview the email, and send one message about that
 * specific load. Separate from Backhaul Reach; reuses the Reach Resend send +
 * branded signature and the FMCSA/MC lookup for the post-send broker save.
 */
export default function EmailBrokerPage() {
  return <EmailBrokerView />;
}

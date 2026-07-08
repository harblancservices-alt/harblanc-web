import type { Metadata } from "next";
import { EmailBrokerView } from "../../../(authed)/dispatch/email-broker/EmailBrokerView";

export const metadata: Metadata = {
  title: "Email a Broker",
  robots: { index: false, follow: false },
};

/**
 * Pop-out (chrome-less) Email a Broker. Same compose tool as
 * /admin/dispatch/email-broker, rendered compact with no admin shell so it fills
 * a small floating window Brent keeps beside the load boards. Authed by the
 * (popup) layout; opened via PopoutButton's window.open().
 */
export default function EmailBrokerPopupPage() {
  return <EmailBrokerView popup />;
}

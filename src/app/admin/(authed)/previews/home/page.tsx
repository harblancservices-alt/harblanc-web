import type { Metadata } from "next";
import Home from "@/app/page";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";

/**
 * Public landing page — preview-only route.
 *
 * Renders the real Home component from src/app/page.tsx along with the
 * public Navbar and Footer, so the operator sees the page as a public
 * visitor would. The admin layout above is unavoidable since this lives
 * under /admin/(authed)/, but inside the preview iframe in
 * AdminPreviewLab the operator focuses on the page body, not the admin
 * shell wrapping it.
 *
 * No form, no submission, no destructive action lives on the home page,
 * so no <fieldset disabled> wrapper is necessary. The preview banner at
 * the top is there only so the operator can never confuse this view
 * with a real production visit.
 *
 * Loaded by the Admin Preview Lab inside an iframe at
 * /admin/previews/home. The path lives under the admin authed segment
 * so the standard requireAdmin() gate in layout.tsx guards access.
 */

export const metadata: Metadata = {
  title: "Home — preview",
  robots: { index: false, follow: false },
};

export default function HomePreviewPage() {
  return (
    <div className="bg-canvas text-fg">
      {/* Preview banner — operator-only visual marker. */}
      <div className="border-b border-red-300 bg-red-600 px-4 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white sm:py-2.5">
        Preview only &middot; no email sent &middot; no records changed
      </div>

      {/* Re-create the public site chrome inside the preview so the
          operator sees the page as a visitor would. SiteChrome in the
          root layout suppresses Navbar/Footer on any /admin route, which
          is why we mount them explicitly here. */}
      <Navbar />
      <main>
        <Home />
      </main>
      <Footer />
    </div>
  );
}

import { adminFromMiddleware } from "@/lib/admin/auth";
import { ThemeShell } from "../(authed)/_shell/ThemeShell";

/**
 * Chrome-less admin layout for POP-OUT windows.
 *
 * Same auth as the main portal (the /admin/** middleware already verified the
 * session and forwarded the identity headers, so adminFromMiddleware() gates
 * this and redirects to login if the request somehow bypassed it), but WITHOUT
 * PortalShell — no top bar, sidebar, or bottom nav. The tool renders alone,
 * filling a small floating browser window so it reads like a standalone app.
 *
 * ThemeShell + the no-flash inline script are kept so the light/dark theme and
 * the theme tokens (bg-canvas/text-fg/bg-card…) resolve exactly as in the portal.
 */
export default async function PopupAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await adminFromMiddleware();

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{var d=document.documentElement;" +
            "if(localStorage.getItem('harblanc-theme')==='dark'){d.setAttribute('data-admin-theme','dark')}else{d.removeAttribute('data-admin-theme')}" +
            "var s=parseInt(localStorage.getItem('harblanc-ui-scale'),10);" +
            "if(!s||isNaN(s)){s=100}d.style.setProperty('--admin-ui-scale',(s/100).toString());" +
            "}catch(e){}",
        }}
      />
      <ThemeShell>{children}</ThemeShell>
    </>
  );
}

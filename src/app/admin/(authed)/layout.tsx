import { adminFromMiddleware } from "@/lib/admin/auth";
import { isDemoMode } from "@/lib/admin/demo";
import { PortalShell } from "./_shell/PortalShell";
import { DemoBanner } from "./_shell/DemoBanner";

/**
 * Level 4 — admin shell layout (V3 portal).
 *
 * requireAdmin() runs once per authed request so every page underneath
 * can assume the visitor is signed in and on the allowlist. The user's
 * email is threaded down into PortalShell so the desktop sidebar foot
 * block can render it (kept inside the shell, no longer in the top bar).
 *
 * The prior top bar layout - BrandLogo + AdminNav + DispatchClock +
 * inline email + Sign out - is gone. AdminNav and DispatchClock are
 * deleted in this level. Email + Sign out live in PortalSidebar (foot
 * block) on desktop and the Settings page on mobile.
 *
 * Page bodies (Dashboard, Quotes, Applications, Previews, Settings,
 * Trash routes) render inside <main> unchanged. Visual changes to those
 * land in Levels 5-7.
 */
export default async function AuthedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await adminFromMiddleware();
  const demo = await isDemoMode();

  return (
    <>
      {/* Apply the saved theme + display prefs before paint so there's no
          flash / layout jump (theme class, orientation, UI scale). */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{var d=document.documentElement;" +
            "if(localStorage.getItem('harblanc-theme')==='dark'){d.setAttribute('data-admin-theme','dark')}else{d.removeAttribute('data-admin-theme')}" +
            "var o=localStorage.getItem('harblanc-orientation');" +
            "if(o==='portrait'||o==='landscape'){d.setAttribute('data-layout',o)}else{d.removeAttribute('data-layout')}" +
            "var s=parseInt(localStorage.getItem('harblanc-ui-scale'),10);" +
            "if(!s||isNaN(s)){s=100}d.style.setProperty('--admin-ui-scale',(s/100).toString());" +
            "}catch(e){}",
        }}
      />
      {demo ? <DemoBanner /> : null}
      <PortalShell email={user.email ?? null}>{children}</PortalShell>
    </>
  );
}

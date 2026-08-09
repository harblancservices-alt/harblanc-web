import Link from "next/link";
import { BTN_ACTION } from "../../_shell/ui";
import { BackButton } from "../../_shell/BackButton";
import { IconMail, IconPhone } from "../../_shell/icons";
import { digitsForTel } from "../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { ROLE_LABEL, ROLE_TONE, normalizeRoleCategory } from "../../accounts/[id]/roles";
import { EditContactButton } from "./ContactProfileActions";
import { ContactMoreMenu } from "./ContactMoreMenu";
import type { ContactDefaults } from "../../accounts/[id]/ContactDialog";
import type { TaskContactOption } from "../../tasks/TaskDialog";

const ACTION_BTN =
  "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors sm:flex-none sm:px-4";

/**
 * The contact profile's header — breadcrumb back to the company (or
 * Contacts when there isn't one), initials + name/title, company link,
 * role/"status" pill (crm_contacts.role_category — the closest thing a
 * contact has to a status), Edit + More (Log call/Delete), and one-tap
 * Call/Email. Same shape as the company profile's CompanyHeader.tsx, scaled
 * to a single person instead of three columns.
 */
export function ContactHeader({
  contact,
  accountId,
  accountName,
  phone,
  email,
  contactOptions,
  canDelete,
}: {
  contact: ContactDefaults & { id: string; name: string };
  accountId: string | null;
  accountName: string | null;
  phone: string | null;
  email: string | null;
  contactOptions: TaskContactOption[];
  canDelete: boolean;
}) {
  const role = normalizeRoleCategory(contact.role_category as string | null);

  return (
    <div className="flex flex-col gap-3 border border-line-strong bg-card px-4 py-3.5 shadow-e2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton fallbackHref={accountId ? `/crm/accounts/${accountId}` : "/crm/contacts"} label={accountId ? accountName || "Company" : "Contacts"} />
          <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-graphite text-[16px] font-semibold text-white">
            {contact.name.charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate text-[17px] font-bold tracking-tight text-fg">{contact.name}</h1>
              {role && (
                <span className={`inline-flex items-center px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${ROLE_TONE[role]}`}>
                  {ROLE_LABEL[role]}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[12.5px] text-fg-muted">
              {contact.title ? `${contact.title}` : null}
              {contact.title && accountId ? " · " : null}
              {accountId ? (
                <Link href={`/crm/accounts/${accountId}`} prefetch={false} className="text-accent hover:underline">
                  {accountName || "Company"}
                </Link>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ContactMoreMenu contactId={contact.id} contactName={contact.name} accountId={accountId} contactOptions={contactOptions} canDelete={canDelete} />
          <EditContactButton accountId={accountId} defaults={contact} />
        </div>
      </div>

      <div className="flex gap-2">
        {phone && (
          <a href={`tel:${digitsForTel(phone)}`} className={`${ACTION_BTN} ${BTN_ACTION}`}>
            <IconPhone width={15} height={15} />
            {formatPhone(phone)}
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className={`${ACTION_BTN} ${BTN_ACTION}`}>
            <IconMail width={15} height={15} />
            Email
          </a>
        )}
      </div>
    </div>
  );
}

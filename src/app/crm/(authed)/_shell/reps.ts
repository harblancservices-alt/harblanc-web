export type Rep = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

/**
 * Broker reps a document's "Broker Contact" can be filled in from — picked
 * by dropdown rather than typed, so the name/phone/email always match a
 * real person. Placeholder roster for now; a CRM Settings screen is
 * planned to edit this, so keep this module's shape (a single exported
 * array of this type) stable — swapping the static export for a
 * settings-backed fetch shouldn't require touching callers.
 */
export const REPS: Rep[] = [
  {
    id: "rep-1",
    firstName: "Jordan",
    lastName: "Blake",
    phone: "(000) 000-0000",
    email: "jordan@hellohotshot.com",
  },
  {
    id: "rep-2",
    firstName: "Casey",
    lastName: "Reyes",
    phone: "(000) 000-0000",
    email: "casey@hellohotshot.com",
  },
];

export function repFullName(rep: Rep): string {
  return `${rep.firstName} ${rep.lastName}`.trim();
}

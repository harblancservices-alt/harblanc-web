/**
 * WHICH NUMBERS ARE THE SWITCHBOARD.
 *
 * Audit finding 20. Every one of Metallic's six contacts shows
 * "(713) 856-9696 MAIN". That is TRUE — I checked the database, they really
 * do all carry the company's main line and nobody has a direct number — but
 * six identical numbers stacked in a column reads as a rendering bug, and
 * worse, it gives a rep no way to spot the one person who DOES have a desk
 * line when one finally appears.
 *
 * So the fix is not to the data. It is to stop drawing a shared number and
 * a direct number the same way.
 *
 * A number counts as shared when it is on more than one person at this
 * company, OR when it matches a number on the company record itself. The
 * second half matters: a company line that only one contact happens to
 * carry is still the switchboard, and without the company's own numbers
 * there is no way to know that.
 *
 * Comparison is on digits only. "(713) 856-9696", "713-856-9696" and
 * "7138569696" are one number, and the live data mixes formats.
 */

/** Digits only, so formatting can never make one number look like two. */
export function phoneKey(number: string): string {
  return (number ?? "").replace(/\D/g, "");
}

export function sharedNumbers(
  people: { phones: { number: string }[] }[],
  companyPhones: { number: string }[] = [],
): Set<string> {
  const seenOnPeople = new Map<string, number>();
  for (const person of people) {
    // A number listed twice on the SAME person is not shared — it is one
    // person's number entered twice, which says nothing about anyone else.
    const own = new Set(person.phones.map((p) => phoneKey(p.number)).filter(Boolean));
    for (const key of own) seenOnPeople.set(key, (seenOnPeople.get(key) ?? 0) + 1);
  }

  const shared = new Set<string>();
  for (const [key, count] of seenOnPeople) {
    if (count > 1) shared.add(key);
  }
  for (const phone of companyPhones) {
    const key = phoneKey(phone.number);
    // Only mark the company line as shared where somebody actually carries
    // it — otherwise nothing on screen is being disambiguated.
    if (key && seenOnPeople.has(key)) shared.add(key);
  }
  return shared;
}

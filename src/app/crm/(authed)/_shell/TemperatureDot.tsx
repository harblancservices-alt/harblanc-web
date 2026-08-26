import { TEMPERATURE_DOT, TEMPERATURE_LABEL, type Temperature } from "@/lib/crm/temperature";

/**
 * The temperature marker — one 7px dot, identical on every surface that
 * shows it: company cards, the contacts table, call rows.
 *
 * Deliberately small and deliberately silent when there is nothing to say
 * (`temp` null renders nothing). A marker that appeared on every row of every
 * list would stop being a signal and become texture.
 *
 * The meaning is in the title, not the colour alone — "cold" as a red dot
 * with no explanation is a decoration. See TEMPERATURE_LABEL.
 */
export function TemperatureDot({ temp }: { temp: Temperature | null }) {
  if (!temp) return null;
  return (
    <span
      title={TEMPERATURE_LABEL[temp]}
      aria-label={TEMPERATURE_LABEL[temp]}
      role="img"
      className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${TEMPERATURE_DOT[temp]}`}
    />
  );
}

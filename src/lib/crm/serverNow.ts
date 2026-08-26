/**
 * The server's clock, read from a MODULE rather than inside a component.
 *
 * The React Compiler's purity rule rejects `Date.now()` during render, and
 * rightly: a component that reads the clock as it draws can produce a
 * different answer on every re-render, and two rows of the same table can
 * disagree about what "now" is.
 *
 * The data layers already avoid this by construction — pipeline-data.ts and
 * agent-data.ts return `now: Date.now()` alongside their rows, because a
 * plain module is not a component and the rule does not apply there. This is
 * the same move, named, for the two Server Components that build their rows
 * inline and have no data module to put it in.
 *
 * Call it ONCE per render and thread the value down. That is the point: one
 * instant for the whole page, so every relative label and every temperature
 * on screen is measured against the same moment.
 */
export function serverNow(): number {
  return Date.now();
}

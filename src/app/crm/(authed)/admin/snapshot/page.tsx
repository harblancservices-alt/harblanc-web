import { notFound } from "next/navigation";
import { listSnapshots, requireSnapshotAdmin } from "./snapshot-data";
import { SnapshotConsole } from "./SnapshotConsole";

export const dynamic = "force-dynamic";

/**
 * SNAPSHOT — capture at the top, a list of files underneath, delete the
 * only button. Brent's scope, exactly.
 *
 * Everything the page does lives in SnapshotConsole, because the list has
 * to grow as photos save and there is no Refresh button to make that
 * happen. This file only fetches the seed rows and checks the caller.
 */
export default async function SnapshotPage() {
  const { user, isOwner } = await requireSnapshotAdmin();
  if (!isOwner) notFound();

  const { rows, truncated } = await listSnapshots();

  return <SnapshotConsole orgId={user.orgId} initial={rows} truncated={truncated} />;
}

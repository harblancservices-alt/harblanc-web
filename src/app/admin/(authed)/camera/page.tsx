import type { Metadata } from "next";
import { listBatchesWithCounts } from "@/lib/camera/batches";
import { isDemoMode } from "@/lib/admin/demo";
import { CameraBatchList } from "./CameraBatchList";

export const metadata: Metadata = {
  title: "Camera",
  robots: { index: false, follow: false },
};

export default async function CameraPage() {
  // DEMO MODE: never surface real BOL scans — show the empty state, and don't
  // query Supabase. (Capture itself is disabled by the camera actions' guards.)
  if (await isDemoMode()) return <CameraBatchList batches={[]} />;
  // Resilient: returns [] if the camera tables aren't migrated yet.
  const batches = await listBatchesWithCounts();
  return <CameraBatchList batches={batches} />;
}

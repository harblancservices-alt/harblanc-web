import type { Metadata } from "next";
import { listBatchesWithCounts } from "@/lib/camera/batches";
import { CameraBatchList } from "./CameraBatchList";

export const metadata: Metadata = {
  title: "Camera",
  robots: { index: false, follow: false },
};

export default async function CameraPage() {
  // Resilient: returns [] if the camera tables aren't migrated yet.
  const batches = await listBatchesWithCounts();
  return <CameraBatchList batches={batches} />;
}

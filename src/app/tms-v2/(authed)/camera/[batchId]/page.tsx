import { notFound } from "next/navigation";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { getCameraBatch } from "@/lib/data/camera";
import { CameraCapture } from "./CameraCapture";

export const dynamic = "force-dynamic";

/** Batch capture + review, ported from legacy's live getUserMedia shutter
 * flow (Phase 6 item 2) — capture and review share one page, matching
 * legacy's own UX (the thumbnail strip below the shutter IS the review
 * grid, with per-photo delete via the full-screen DocViewer). */
export default async function CameraBatchDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const batch = await getCameraBatch(batchId);
  if (!batch) notFound();

  return (
    <PageScroll>
      <CameraCapture batch={batch} />
    </PageScroll>
  );
}

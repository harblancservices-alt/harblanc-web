import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBatchWithPhotos } from "@/lib/camera/batches";
import { CameraCapture } from "./CameraCapture";

export const metadata: Metadata = {
  title: "Scan batch",
  robots: { index: false, follow: false },
};

export default async function CameraBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const batch = await getBatchWithPhotos(batchId);
  if (!batch) notFound();

  return <CameraCapture batch={batch} />;
}

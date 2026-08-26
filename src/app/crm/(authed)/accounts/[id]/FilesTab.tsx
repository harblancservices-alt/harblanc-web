import { BolSection, type CrmBolDocument } from "./BolSection";

/**
 * The company's paperwork — bills of lading.
 *
 * COMMODITY PHOTOS CAME OUT 2026-08-26 (Brent). The block rendered a tile
 * grid plus an "Add photo" button for crm_documents rows with
 * kind='commodity_photo'. There are ZERO such rows across all 99 companies:
 * nothing has ever been put there, so it was a permanently empty card with
 * an upload control nobody used.
 *
 * NOTHING WAS DELETED. The kind still exists, the storage bucket still
 * exists, CommodityPhotoTiles and commodity-photo-actions.ts are untouched
 * on disk, and any row that showed up would still be stored correctly. This
 * is presentation only — if photos become a real workflow the component is
 * there to re-mount.
 *
 * BolSection carries its own Card chrome (upload / view / download / delete
 * all untouched), so this is now a thin pass-through kept for one reason:
 * the profile passes panels as already-rendered nodes, and having a named
 * panel here keeps that seam where the rest of the page expects it.
 */
export function FilesTab({
  accountId,
  orgId,
  documents,
}: {
  accountId: string;
  orgId: string;
  documents: CrmBolDocument[];
}) {
  return <BolSection accountId={accountId} orgId={orgId} documents={documents} />;
}

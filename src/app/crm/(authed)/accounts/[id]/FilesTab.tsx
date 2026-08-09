import { BolSection, type CrmBolDocument } from "./BolSection";
import { CommodityPhotoTiles, type CrmCommodityPhoto } from "./CommodityPhotoTiles";

/**
 * The center panel's "Files" tab — Bills of Lading (crm_documents,
 * kind='bol') and commodity reference photos (kind='commodity_photo'), the
 * only document types this CRM has. Both components are reused unmodified;
 * BolSection carries its own Card chrome (upload/generate/view/download/
 * delete all untouched), commodity photos get a plain labeled block since
 * CommodityPhotoTiles is just a tile grid, not a Card.
 */
export function FilesTab({
  accountId,
  orgId,
  documents,
  photos,
  shipperName,
  shipperAddress,
  shipperPhone,
}: {
  accountId: string;
  orgId: string;
  documents: CrmBolDocument[];
  photos: CrmCommodityPhoto[];
  shipperName: string;
  shipperAddress: string | null;
  shipperPhone: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <BolSection
        accountId={accountId}
        orgId={orgId}
        documents={documents}
        shipperName={shipperName}
        shipperAddress={shipperAddress}
        shipperPhone={shipperPhone}
      />
      <div className="rounded-lg border border-line-strong bg-card p-5 shadow-e2">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Commodity photos</p>
        <CommodityPhotoTiles accountId={accountId} orgId={orgId} photos={photos} />
      </div>
    </div>
  );
}

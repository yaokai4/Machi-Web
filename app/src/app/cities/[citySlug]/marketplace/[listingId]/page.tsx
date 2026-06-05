import { ListingDetailPage } from "@/components/listings/ListingKit";

export default async function MarketplaceDetailPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return <ListingDetailPage listingId={listingId} />;
}

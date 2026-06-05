import { ListingDetailPage } from "@/components/listings/ListingKit";

export default async function ListingDetailRoute({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return <ListingDetailPage listingId={listingId} />;
}

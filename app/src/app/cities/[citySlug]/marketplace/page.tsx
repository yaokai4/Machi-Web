import { CityListingChannelPage } from "@/components/listings/ListingKit";

export default async function MarketplacePage({ params }: { params: Promise<{ citySlug: string }> }) {
  const { citySlug } = await params;
  return <CityListingChannelPage citySlug={citySlug} kind="marketplace" />;
}

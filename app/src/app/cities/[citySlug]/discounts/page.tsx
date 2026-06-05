import { CityListingChannelPage } from "@/components/listings/ListingKit";

export default async function DiscountsPage({ params }: { params: Promise<{ citySlug: string }> }) {
  const { citySlug } = await params;
  return <CityListingChannelPage citySlug={citySlug} kind="deals" />;
}

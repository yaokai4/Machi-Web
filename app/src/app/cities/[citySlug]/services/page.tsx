import { CityListingChannelPage } from "@/components/listings/ListingKit";

export default async function ServicesPage({ params }: { params: Promise<{ citySlug: string }> }) {
  const { citySlug } = await params;
  return <CityListingChannelPage citySlug={citySlug} kind="services" />;
}

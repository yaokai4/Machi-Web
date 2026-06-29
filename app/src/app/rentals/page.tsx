import { CityListingChannelPage } from "@/components/listings/ListingKit";

// Cross-city (nationwide) housing index — no city pre-selected. Users can
// narrow by city/area via the in-page filters. Mirrors /cities/[citySlug]/rentals.
export default function RentalsIndexPage() {
  return <CityListingChannelPage kind="rentals" />;
}

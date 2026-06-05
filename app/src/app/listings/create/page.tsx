import { CreateListingPage } from "@/components/listings/ListingKit";
import { RouteFallback } from "@/components/design/RouteFallback";
import { Suspense } from "react";

export default async function CreateListingRoute({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; city?: string }>;
}) {
  const params = await searchParams;
  return (
    <Suspense fallback={<RouteFallback title="正在打开发布页" rows={4} />}>
      <CreateListingPage initialType={params.type} initialCitySlug={params.city} />
    </Suspense>
  );
}

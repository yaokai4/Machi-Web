import { Suspense } from "react";
import { AdminListingsPage } from "@/components/listings/ListingKit";
import { RouteFallback } from "@/components/design/RouteFallback";

export default function AdminMarketplaceRoute() {
  return (
    <Suspense fallback={<RouteFallback title="正在加载二手审核" rows={4} />}>
      <AdminListingsPage initialType="secondhand" />
    </Suspense>
  );
}

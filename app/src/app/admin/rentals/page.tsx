import { Suspense } from "react";
import { AdminListingsPage } from "@/components/listings/ListingKit";
import { RouteFallback } from "@/components/design/RouteFallback";

export default function AdminRentalsRoute() {
  return (
    <Suspense fallback={<RouteFallback title="正在加载房源审核" rows={4} />}>
      <AdminListingsPage initialType="rental" />
    </Suspense>
  );
}

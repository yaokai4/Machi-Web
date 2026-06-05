import { Suspense } from "react";
import { MyListingsPage } from "@/components/listings/ListingKit";
import { RouteFallback } from "@/components/design/RouteFallback";

export default function MyListingsRoute() {
  return (
    <Suspense fallback={<RouteFallback title="正在加载我的发布" />}>
      <MyListingsPage />
    </Suspense>
  );
}

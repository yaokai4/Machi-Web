import { Suspense } from "react";
import { MyListingsPage } from "@/components/listings/ListingKit";
import { RouteFallback } from "@/components/design/RouteFallback";

export default function MySavedListingsRoute() {
  return (
    <Suspense fallback={<RouteFallback title="正在加载我的收藏" />}>
      <MyListingsPage saved />
    </Suspense>
  );
}

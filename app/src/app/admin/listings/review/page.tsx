import { Suspense } from "react";
import { AdminListingsPage } from "@/components/listings/ListingKit";
import { RouteFallback } from "@/components/design/RouteFallback";

export default function AdminListingsReviewRoute() {
  return (
    <Suspense fallback={<RouteFallback title="正在加载待审核内容" rows={4} />}>
      <AdminListingsPage initialStatus="pending_review" />
    </Suspense>
  );
}

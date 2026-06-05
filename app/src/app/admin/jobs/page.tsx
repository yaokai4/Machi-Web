import { Suspense } from "react";
import { AdminListingsPage } from "@/components/listings/ListingKit";
import { RouteFallback } from "@/components/design/RouteFallback";

export default function AdminJobsRoute() {
  return (
    <Suspense fallback={<RouteFallback title="正在加载招聘审核" rows={4} />}>
      <AdminListingsPage initialType="job,hiring" />
    </Suspense>
  );
}

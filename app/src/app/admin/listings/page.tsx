import { Suspense } from "react";
import { AdminListingsPage } from "@/components/listings/ListingKit";
import { RouteFallback } from "@/components/design/RouteFallback";

export default async function AdminListingsRoute({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; verification_status?: string }>;
}) {
  const params = await searchParams;
  return (
    <Suspense fallback={<RouteFallback title="正在加载审核后台" rows={4} />}>
      <AdminListingsPage
        initialType={params.type}
        initialStatus={params.status}
        initialVerificationStatus={params.verification_status}
      />
    </Suspense>
  );
}

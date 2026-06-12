import { BusinessPublicPage } from "@/components/listings/BusinessDirectory";

export const metadata = {
  title: "商家主页 | Machi",
};

export default async function BusinessProfilePage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return <BusinessPublicPage businessId={businessId} />;
}

import { BusinessDirectoryPage } from "@/components/listings/BusinessDirectory";

export const metadata = {
  title: "认证商家 | Machi",
  description: "浏览资质审核通过的本地商家、旅行服务方和生活服务者。",
};

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city } = await searchParams;
  return <BusinessDirectoryPage citySlug={city} />;
}

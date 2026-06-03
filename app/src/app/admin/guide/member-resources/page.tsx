import { GuideProductsAdminPage } from "@/components/guide/GuideProductAdminKit";

export default function AdminGuideMemberResourcesPage() {
  return (
    <GuideProductsAdminPage
      initialFilters={{ isMemberIncluded: "1", isService: "0" }}
      title="会员专属资料"
      subtitle="只展示 is_member_included=true 且非服务类的数字资料；价格、权限和状态仍由同一商品表维护。"
    />
  );
}

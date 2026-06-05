import { redirect } from "next/navigation";

export default function MarketplaceCreateAlias() {
  redirect("/listings/create?type=secondhand");
}

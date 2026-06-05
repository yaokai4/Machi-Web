import { redirect } from "next/navigation";

export default function RentalsCreateAlias() {
  redirect("/listings/create?type=rental");
}

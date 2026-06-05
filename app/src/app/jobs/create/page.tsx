import { redirect } from "next/navigation";

export default function JobsCreateAlias() {
  redirect("/listings/create?type=job");
}

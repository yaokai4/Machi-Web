import { redirect } from "next/navigation";

// Old news detail pages are retired. Send any /news/:id link to the Guide home.
export default function NewsDetailRedirectPage() {
  redirect("/guide");
}

import { redirect } from "next/navigation";

// The old crawler "资讯" surface has been retired and replaced by Machi Guide.
// Keep the route working by redirecting to /guide.
export default function NewsRedirectPage() {
  redirect("/guide");
}

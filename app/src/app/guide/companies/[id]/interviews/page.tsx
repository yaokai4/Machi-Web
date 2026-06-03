import { redirect } from "next/navigation";

export default async function GuideCompanyInterviewsAlias({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/guide/companies/${encodeURIComponent(id)}/reviews`);
}

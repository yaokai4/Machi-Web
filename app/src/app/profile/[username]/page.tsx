import { redirect } from "next/navigation";

export default async function ProfileAliasPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  redirect(`/u/${encodeURIComponent(username)}`);
}

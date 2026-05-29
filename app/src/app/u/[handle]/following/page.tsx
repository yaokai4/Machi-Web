"use client";

import { useParams } from "next/navigation";
import { RelationshipList } from "@/components/profile/RelationshipList";

export default function FollowingPage() {
  const params = useParams<{ handle: string }>();
  const handle = (params?.handle || "").replace(/^@/, "");
  return <RelationshipList handle={handle} kind="following" />;
}

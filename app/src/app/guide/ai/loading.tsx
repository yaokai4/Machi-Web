import { AppShellSkeleton } from "@/components/shell/AppShellSkeleton";

// Chat-shaped skeleton so navigating into Machi AI doesn't flash the parent
// guide grid skeleton before snapping to the chat layout.
export default function Loading() {
  return <AppShellSkeleton variant="machiAI" />;
}

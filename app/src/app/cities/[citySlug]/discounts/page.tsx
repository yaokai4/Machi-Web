import { permanentRedirect } from "next/navigation";

// `discounts` and `deals` rendered identical content (kind="deals"). `deals`
// is the canonical channel slug used everywhere in-app; redirect the legacy
// `discounts` alias to it so inbound links keep working without duplication.
export default async function DiscountsPage({ params }: { params: Promise<{ citySlug: string }> }) {
  const { citySlug } = await params;
  permanentRedirect(`/cities/${citySlug}/deals`);
}

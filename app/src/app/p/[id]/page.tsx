// Server component wrapper for the post detail page. Emits Open Graph +
// Twitter meta tags via generateMetadata so links unfurl with author +
// preview text on iMessage / Slack / Twitter / WeChat etc. The interactive
// page itself lives in the client component below.

import type { Metadata } from "next";
import PostPageClient from "./PostPageClient";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.KAIX_API_BASE || "http://127.0.0.1:8787";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://machicity.com";

interface FetchedPost {
  content?: string;
  author?: { display_name?: string; handle?: string } | null;
  media?: Array<{ url: string; type: string }>;
}

async function fetchPost(id: string): Promise<FetchedPost | null> {
  try {
    const res = await fetch(`${API_BASE}/api/posts/${encodeURIComponent(id)}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.post ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchPost(id);
  // Fetch failed / post gone: fall back to the site-wide defaults from the
  // root layout instead of throwing.
  if (!post) return {};
  const author = post.author?.display_name || "Machi";
  const handle = post.author?.handle ? `@${post.author.handle}` : "";
  const text = (post.content || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const title = `${author} ${handle ? `(${handle}) ` : ""}— Machi`;
  const description = text || "在 Machi 上看看这条帖子。";
  const url = `${SITE}/p/${id}`;
  const image = post.media?.find((m) => m.type === "image")?.url;
  const imageUrl = image ? (image.startsWith("http") ? image : `${SITE}${image}`) : `${SITE}/icon.svg`;
  return {
    // `absolute` keeps the exact "<author> — Machi" title without the root
    // layout's "%s | Machi" template appending a second suffix.
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      images: [imageUrl],
      siteName: "Machi",
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function PostDetailRoute() {
  return <PostPageClient />;
}

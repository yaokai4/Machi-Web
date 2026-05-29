// Server component that emits Open Graph + Twitter meta tags for an
// individual post page, so links unfurl with author + preview text on
// iMessage / Slack / Twitter / WeChat etc.

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

export default async function Head({ params }: { params: { id: string } }) {
  const post = await fetchPost(params.id);
  const author = post?.author?.display_name || "Machi";
  const handle = post?.author?.handle ? `@${post.author.handle}` : "";
  const text = (post?.content || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const title = `${author} ${handle ? `(${handle}) ` : ""}— Machi`;
  const description = text || "在 Machi 上看看这条帖子。";
  const url = `${SITE}/p/${params.id}`;
  const image = post?.media?.find((m) => m.type === "image")?.url;
  const imageUrl = image ? (image.startsWith("http") ? image : `${SITE}${image}`) : `${SITE}/icon.svg`;
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:type" content="article" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content="Machi" />
      <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      <link rel="canonical" href={url} />
    </>
  );
}

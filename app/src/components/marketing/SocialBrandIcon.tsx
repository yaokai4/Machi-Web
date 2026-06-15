import { siInstagram, siTiktok, siX, siXiaohongshu, siYoutube, type SimpleIcon } from "simple-icons";

export type SocialBrand = "x" | "instagram" | "tiktok" | "youtube" | "linkedin" | "xiaohongshu" | "douyin";

type SocialBrandIconProps = {
  brand: SocialBrand;
  className?: string;
};

const simpleIcons: Partial<Record<SocialBrand, SimpleIcon>> = {
  x: siX,
  instagram: siInstagram,
  tiktok: siTiktok,
  youtube: siYoutube,
  xiaohongshu: siXiaohongshu,
  douyin: siTiktok,
};

const labels: Record<SocialBrand, string> = {
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  xiaohongshu: "小红书",
  douyin: "抖音",
};

const linkedinPath =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.063 2.063 0 1 1 0-4.126 2.063 2.063 0 0 1 0 4.126zM6.995 20.452H3.674V9h3.321v11.452z";

export function SocialBrandIcon({ brand, className }: SocialBrandIconProps) {
  const icon = simpleIcons[brand];
  const label = labels[brand];

  if (brand === "instagram") {
    return (
      <IconFrame className={className} label={label}>
        <defs>
          <linearGradient id="machi-social-instagram" x1="0" x2="36" y1="36" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f58529" />
            <stop offset="0.38" stopColor="#dd2a7b" />
            <stop offset="0.72" stopColor="#8134af" />
            <stop offset="1" stopColor="#515bd4" />
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="10" fill="url(#machi-social-instagram)" />
        <BrandPath path={icon?.path} />
      </IconFrame>
    );
  }

  if (brand === "tiktok" || brand === "douyin") {
    return (
      <IconFrame className={className} label={label}>
        <rect width="36" height="36" rx="10" fill="#0b0b12" />
        <BrandPath path={icon?.path} color="#25F4EE" transform="translate(6.8 8.5) scale(0.86)" />
        <BrandPath path={icon?.path} color="#FE2C55" transform="translate(8.6 6.9) scale(0.86)" />
        <BrandPath path={icon?.path} transform="translate(7.7 7.7) scale(0.86)" />
      </IconFrame>
    );
  }

  if (brand === "linkedin") {
    return (
      <IconFrame className={className} label={label}>
        <rect width="36" height="36" rx="10" fill="#0A66C2" />
        <path d={linkedinPath} fill="white" transform="translate(6 6) scale(1)" />
      </IconFrame>
    );
  }

  const background: Record<Exclude<SocialBrand, "instagram" | "tiktok" | "douyin" | "linkedin">, string> = {
    x: "#000000",
    youtube: "#FF0000",
    xiaohongshu: "#FF2442",
  };

  return (
    <IconFrame className={className} label={label}>
      <rect width="36" height="36" rx="10" fill={background[brand]} />
      <BrandPath path={icon?.path} />
    </IconFrame>
  );
}

function IconFrame({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  return (
    <svg
      aria-label={label}
      className={className}
      focusable="false"
      role="img"
      viewBox="0 0 36 36"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

function BrandPath({
  path,
  color = "white",
  transform = "translate(7.7 7.7) scale(0.86)",
}: {
  path?: string;
  color?: string;
  transform?: string;
}) {
  if (!path) return null;
  return <path d={path} fill={color} transform={transform} />;
}

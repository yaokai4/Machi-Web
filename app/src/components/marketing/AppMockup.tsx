import {
  BriefcaseBusiness,
  Flame,
  Handshake,
  Home,
  KeyRound,
  MapPin,
  Newspaper,
  Search,
  ShoppingBag,
  Utensils,
  UserRoundPlus,
} from "lucide-react";
import { HeatBadge } from "./HeatBadge";
import { BrandText } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

// Quick-entry tiles use lower-saturation pastel washes so they read
// the same as the iOS KX channel grid (low-saturation chips, soft
// rounded backgrounds). Avoid loud primary colors.
const quickMeta = [
  { icon: Newspaper, color: "bg-blue-50 text-blue-700" },
  { icon: KeyRound, color: "bg-cyan-50 text-cyan-700" },
  { icon: ShoppingBag, color: "bg-amber-50 text-amber-700" },
  { icon: Home, color: "bg-yellow-50 text-yellow-700" },
  { icon: BriefcaseBusiness, color: "bg-purple-50 text-purple-700" },
  { icon: UserRoundPlus, color: "bg-violet-50 text-violet-700" },
  { icon: Handshake, color: "bg-emerald-50 text-emerald-700" },
  { icon: Utensils, color: "bg-rose-50 text-rose-700" },
];

const cardTones = ["bg-yellow-50 text-yellow-700", "bg-rose-50 text-rose-700", "bg-violet-50 text-violet-700"];

// iPhone 15 Pro Max physical aspect ratio is 1290×2796 (~1:2.167).
// Body frame including bezels reads ~1:2.05 — we use 1:2.07 so the
// Dynamic Island has breathing room. `aspect-ratio` keeps the
// proportion stable across viewports. Bezel is intentionally thin
// (1.5px on the inner ring, 2px outer pad) so the device feels light
// and lets the screen content carry the brand.
export function AppMockup() {
  const { copy } = useMarketingI18n();

  return (
    <div className="relative mx-auto w-[min(72vw,272px)] sm:w-[min(60vw,290px)] lg:w-[min(86vw,318px)]">
      {/* Soft halo behind the device — uses a token-driven mc-device-halo
          plus a couple of subtle blue-violet blooms to match the page's mesh.
          No warm tones here on purpose; warmth lives only in the trending card. */}
      <div className="mc-device-halo" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-8 top-10 -z-10 h-32 w-32 rounded-full bg-indigo-400/25 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-8 bottom-20 -z-10 h-36 w-36 rounded-full bg-sky-400/22 blur-3xl" aria-hidden="true" />

      <div className="mc-float relative aspect-[1/2.07]">
        {/* Outer body — thin matte bezel + a much lighter shadow so
            the device floats over the page mesh instead of stamping it. */}
        <div className="absolute inset-0 rounded-[46px] bg-gradient-to-b from-slate-900 to-slate-950 p-[4px] shadow-[0_22px_60px_-30px_rgba(15,23,42,0.45),0_4px_18px_-10px_rgba(99,102,241,0.25)] ring-1 ring-white/10">
          {/* Dynamic Island — smaller, less aggressive */}
          <div className="absolute left-1/2 top-2 z-20 flex h-[22px] w-[88px] -translate-x-1/2 items-center justify-end rounded-full bg-[#04060c] px-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-700 ring-1 ring-slate-600/60" />
          </div>

          {/* Inner screen — neutral light surface (mirrors iOS systemGroupedBackground). */}
          <div className="absolute inset-[5px] overflow-hidden rounded-[42px] bg-[#F4F6FA]">
            {/* Top gradient wash — soft brand tint, not a hard color block */}
            <div className="absolute inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_20%_0%,rgba(105,82,255,0.20),transparent_50%),radial-gradient(circle_at_80%_10%,rgba(0,194,255,0.18),transparent_45%)]" />

            <div className="relative h-full overflow-hidden px-4 pb-5 pt-11">
              {/* Bottom fade so trimmed content doesn't end on a hard line */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-[#F4F6FA] via-[#F4F6FA]/85 to-transparent" />

              {/* ─── Header row ─── */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10.5px] font-black uppercase tracking-[0.14em] text-indigo-600">
                    <BrandText>Machi</BrandText>
                  </p>
                  <h3 className="mt-0.5 text-[19px] font-black leading-tight text-slate-950">
                    {copy.appMockup.title}
                  </h3>
                </div>
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-500 shadow-lg shadow-indigo-500/25 ring-1 ring-white/40" />
              </div>

              {/* ─── City tag ─── */}
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.3)] ring-1 ring-slate-200/80">
                <MapPin className="h-3.5 w-3.5 text-indigo-600" />
                {copy.appMockup.region}
              </div>

              {/* ─── Search ─── */}
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 text-[12px] font-semibold text-slate-400 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.25)] ring-1 ring-slate-200/75">
                <Search className="h-3.5 w-3.5" />
                <span className="truncate">{copy.appMockup.search}</span>
              </div>

              {/* ─── Quick channels ─── */}
              <div className="mt-3 grid grid-cols-4 gap-2">
                {copy.appMockup.quickEntries.map((label, index) => {
                  const entry = quickMeta[index];
                  const Icon = entry.icon;
                  return (
                    <div key={label} className="rounded-[14px] bg-white p-2 text-center shadow-[0_4px_12px_-8px_rgba(15,23,42,0.22)] ring-1 ring-slate-100">
                      <span className={`mx-auto inline-flex h-7 w-7 items-center justify-center rounded-xl ${entry.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <p className="mt-1 truncate text-[9.5px] font-bold text-slate-700">{label}</p>
                    </div>
                  );
                })}
              </div>

              {/* ─── City Trending — dark hero card ─── */}
              <section className="mt-3 rounded-[22px] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-3.5 text-white shadow-[0_18px_44px_-26px_rgba(15,23,42,0.95)] ring-1 ring-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-white/60">{copy.appMockup.hotSubtitle}</p>
                    <h4 className="mt-0.5 text-base font-black">{copy.appMockup.hotTitle}</h4>
                  </div>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/15 text-orange-300 ring-1 ring-orange-300/20">
                    <Flame className="h-4 w-4 fill-orange-400 text-orange-400" />
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {copy.appMockup.hotItems.map((item, index) => (
                    <div key={item} className="flex items-center gap-2 rounded-xl bg-white/[0.08] px-2.5 py-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-slate-950">
                        {index + 1}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-[11px] font-bold">{item}</p>
                      <HeatBadge className="bg-orange-400/10 text-orange-200 ring-orange-300/20">
                        {index === 0 ? "56K" : index === 1 ? "39K" : "22K"}
                      </HeatBadge>
                    </div>
                  ))}
                </div>
              </section>

              {/* ─── Card preview — one is enough to feel real ─── */}
              <div className="mt-3 space-y-3">
                {copy.appMockup.cards.slice(0, 1).map((card, index) => (
                  <article key={card.title} className="rounded-[20px] bg-white p-3.5 shadow-[0_8px_22px_-14px_rgba(15,23,42,0.3)] ring-1 ring-slate-100">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cardTones[index]}`}>{card.type}</span>
                      <span className="text-[10px] font-semibold text-slate-400">{card.place}</span>
                      <span className="ml-auto">
                        <HeatBadge>{card.heat}</HeatBadge>
                      </span>
                    </div>
                    <h5 className="mt-2 text-[13px] font-black leading-snug text-slate-950">{card.title}</h5>
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-slate-200 to-slate-100" />
                      <div className="h-2 w-20 rounded-full bg-slate-100" />
                      <div className="h-2 w-8 rounded-full bg-slate-100" />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

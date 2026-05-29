"use client";

import { AnnouncementSection } from "./AnnouncementSection";
import { BrandIntroSection } from "./BrandIntroSection";
import { BrandStorySection } from "./BrandStorySection";
import { BusinessSection } from "./BusinessSection";
import { CityShowcaseSection } from "./CityShowcaseSection";
import { DownloadCTA } from "./DownloadCTA";
import { FAQSection } from "./FAQSection";
import { FeatureChannelGrid } from "./FeatureChannelGrid";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { HeroSection } from "./HeroSection";
import { LanguageSection } from "./LanguageSection";
import { MarketingMotion } from "./MarketingMotion";
import { SafetySection } from "./SafetySection";
import { TrendingSection } from "./TrendingSection";
import { UseCaseSection } from "./UseCaseSection";

// Section order intentionally follows the marketing IA brief:
// Hero → What is Machi → Core use cases → City experience → Trending →
// Multilingual → Safety → Business → Updates → Waitlist → FAQ.
// Each section keeps the same export name & features as before — only
// ordering changes, no behaviour or routing is removed.
export function MarketingPageContent() {
  return (
    <>
      <MarketingMotion />
      <Header />
      <HeroSection />
      <BrandIntroSection />
      <BrandStorySection />
      <UseCaseSection />
      <FeatureChannelGrid />
      <CityShowcaseSection />
      <TrendingSection />
      <LanguageSection />
      <SafetySection />
      <BusinessSection />
      <AnnouncementSection />
      <DownloadCTA />
      <FAQSection />
      <Footer />
    </>
  );
}

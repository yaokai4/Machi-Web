"use client";

import { AnnouncementSection } from "./AnnouncementSection";
import { BrandIntroSection } from "./BrandIntroSection";
import { BrandStorySection } from "./BrandStorySection";
import { BusinessSection } from "./BusinessSection";
import { CityPulseSection } from "./CityPulseSection";
import { FAQSection } from "./FAQSection";
import { FeatureChannelGrid } from "./FeatureChannelGrid";
import { Footer } from "./Footer";
import { FounderSection } from "./FounderSection";
import { GuideSection } from "./GuideSection";
import { Header } from "./Header";
import { HeroSection } from "./HeroSection";
import { LanguageSection } from "./LanguageSection";
import { MarketingMotion } from "./MarketingMotion";
import { SafetySection } from "./SafetySection";
import { SocialConnectionSection } from "./SocialConnectionSection";
import { WhyMachiSection } from "./WhyMachiSection";

export function MarketingPageContent() {
  return (
    <>
      <MarketingMotion />
      <Header />
      <HeroSection />
      <BrandIntroSection />
      <CityPulseSection />
      <GuideSection />
      <SocialConnectionSection />
      <FeatureChannelGrid />
      <WhyMachiSection />
      <BrandStorySection />
      <FounderSection />
      <LanguageSection />
      <SafetySection />
      <BusinessSection />
      <AnnouncementSection />
      <FAQSection />
      <Footer />
    </>
  );
}

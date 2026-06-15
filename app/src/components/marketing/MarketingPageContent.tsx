"use client";

import { AnnouncementSection } from "./AnnouncementSection";
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
      {/* Narrative flow: value → product → guide → founder → community →
          trust → business → brand story → updates. The founder belongs
          after visitors understand the product, but before the long-form
          community and brand narrative. */}
      <WhyMachiSection />
      <CityPulseSection />
      <FeatureChannelGrid />
      <GuideSection />
      <FounderSection />
      <SocialConnectionSection />
      <SafetySection />
      <BusinessSection />
      <LanguageSection />
      <BrandStorySection />
      <AnnouncementSection />
      <FAQSection />
      <Footer />
    </>
  );
}

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
      {/* Narrative flow: value prop → live product → what you can do →
          trust → business → story/founder → FAQ. WhyMachi is the strongest
          "what is Machi" section, so it leads (the thinner, overlapping
          BrandIntro that used to sit here was folded into it). */}
      <WhyMachiSection />
      <CityPulseSection />
      <FeatureChannelGrid />
      <GuideSection />
      <SocialConnectionSection />
      <SafetySection />
      <BusinessSection />
      <LanguageSection />
      <BrandStorySection />
      <FounderSection />
      <AnnouncementSection />
      <FAQSection />
      <Footer />
    </>
  );
}

"use client";

import { BusinessSection } from "./BusinessSection";
import { CityPulseSection } from "./CityPulseSection";
import { ClosingCtaSection } from "./ClosingCtaSection";
import { FAQSection } from "./FAQSection";
import { FeatureChannelGrid } from "./FeatureChannelGrid";
import { Footer } from "./Footer";
import { FounderSection } from "./FounderSection";
import { GuideSection } from "./GuideSection";
import { Header } from "./Header";
import { HeroSection } from "./HeroSection";
import { LanguageSection } from "./LanguageSection";
import { MachiAISection } from "./MachiAISection";
import { MarketingMotion } from "./MarketingMotion";
import { SafetySection } from "./SafetySection";
import { WhyMachiSection } from "./WhyMachiSection";

export function MarketingPageContent() {
  return (
    <>
      <MarketingMotion />
      <Header />
      <HeroSection />
      {/* Narrative arc, one idea per section:
          value (why) → community proof (pulse) → product inventory
          (channels) → depth (guide, AI, languages) → the person behind
          it (founder) → trust (safety) → business → FAQ → one closing
          ask. Brand story lives on /about; announcements on /updates. */}
      <WhyMachiSection />
      <CityPulseSection />
      <FeatureChannelGrid />
      <GuideSection />
      <MachiAISection />
      <LanguageSection />
      <FounderSection />
      <SafetySection />
      <BusinessSection />
      <FAQSection />
      <ClosingCtaSection />
      <Footer />
    </>
  );
}

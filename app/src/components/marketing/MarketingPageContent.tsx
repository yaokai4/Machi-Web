"use client";

import { FAQSection } from "./FAQSection";
import { FeatureChannelGrid } from "./FeatureChannelGrid";
import { Footer } from "./Footer";
import { FounderSection } from "./FounderSection";
import { Header } from "./Header";
import { MarketingMotion } from "./MarketingMotion";
import { SafetySection } from "./SafetySection";
import { WhyMachiSection } from "./WhyMachiSection";
import { BusinessBand } from "./v2/BusinessBand";
import { ChapterNav } from "./v2/ChapterNav";
import { CityMapSection } from "./v2/CityMapSection";
import { DevPreviewHooks } from "./v2/DevPreviewHooks";
import { DualLibrarySection } from "./v2/DualLibrarySection";
import { EchoFieldCanvas } from "./v2/EchoFieldCanvas";
import { FinaleSection } from "./v2/FinaleSection";
import { HeroV2 } from "./v2/HeroV2";
import { MembershipSection } from "./v2/MembershipSection";
import { TheaterSection } from "./v2/TheaterSection";

export function MarketingPageContent() {
  return (
    <>
      <MarketingMotion />
      <DevPreviewHooks />
      <EchoFieldCanvas />
      <ChapterNav />
      <Header />
      {/* 2026-07 "Echo Theater" arc: hero over the particle archipelago →
          five re-enacted product acts (JLPT / events / rooms / workspace /
          Machi AI) → the two libraries → the 13-city map → membership +
          wallet → why-Machi contrast → founder → safety → business strip →
          FAQ → curtain call. Copy flows through useMarketingI18n so the
          admin overrides (home.*) keep applying; new-section copy lives in
          v2/theater-copy.ts following the local-copy convention. */}
      <HeroV2 />
      <TheaterSection />
      <DualLibrarySection />
      <CityMapSection />
      <MembershipSection />
      <WhyMachiSection />
      <FeatureChannelGrid />
      <FounderSection />
      <SafetySection />
      <BusinessBand />
      <FAQSection />
      <FinaleSection />
      <Footer />
    </>
  );
}

"use client";

import { ChevronDown } from "lucide-react";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

export function FAQSection() {
  const { copy } = useMarketingI18n();
  // Free SEO surface: mirror the visible accordion as FAQPage JSON-LD.
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <section id="faq" className="px-5 py-14 sm:px-6 lg:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <div className="mx-auto max-w-[920px]">
        <div className="mc-reveal text-center">
          <p className="mc-eyebrow">{copy.faqSection.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
            <BrandPhrase text={copy.faqSection.title} />
          </h2>
        </div>

        <div className="mt-10 space-y-3">
          {copy.faqs.map(([question, answer], index) => (
            <details
              key={`${index}-${question.slice(0, 24)}`}
              className="mc-reveal group rounded-[22px] border border-white/70 bg-white/85 p-5 shadow-[0_14px_44px_-40px_rgba(15,23,42,0.55)] backdrop-blur transition open:bg-white open:shadow-[0_18px_54px_-38px_rgba(15,23,42,0.65)] dark:border-white/10 dark:bg-white/[0.04] dark:open:bg-white/[0.07]"
              open={index === 0}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-black text-slate-950 sm:text-lg dark:text-white">
                <span>
                  <BrandPhrase text={question} />
                </span>
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180 dark:text-slate-500"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-4 text-[15px] leading-7 text-slate-600 dark:text-slate-300">
                <BrandPhrase text={answer} />
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

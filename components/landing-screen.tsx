"use client";

import { useEffect, useRef } from "react";
import "./landing/landing.css";
import { LandingFeatures, LandingMoments } from "./landing/features";
import { LandingFooter } from "./landing/footer";
import {
  LandingHero,
  LandingLiveActivity,
  LandingNav,
  LandingPreview,
  LandingStats,
  LandingTicker,
} from "./landing/hero";
import { LandingCta, LandingPricing } from "./landing/pricing";
import { LandingTestimonials } from "./landing/testimonials";

export default function LandingScreen() {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? h.scrollTop / max : 0;
      if (progressRef.current) progressRef.current.style.width = `${Math.min(1, Math.max(0, pct)) * 100}%`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll("[data-anim]");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const el = e.target as HTMLElement;
          const delay = el.dataset.delay ?? "0";
          el.style.transitionDelay = `${delay}s`;
          el.classList.add("lp-visible");
          io.unobserve(el);
        }
      });
    }, { threshold: 0.1 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp">
      <div className="lp-scroll-bar" ref={progressRef} />

      <LandingNav />

      <main id="landing-main" tabIndex={-1}>
        <LandingHero />
        <LandingTicker />
        <LandingPreview />
        <LandingStats />
        <LandingLiveActivity />
        <LandingFeatures />
        <LandingMoments />
        <LandingTestimonials />
        <LandingPricing />
        <LandingCta />
      </main>

      <LandingFooter />
    </div>
  );
}

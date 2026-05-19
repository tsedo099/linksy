"use client";

import Link from "next/link";
import { AV, IcArrow, IcCheck } from "./shared";

export function LandingPricing() {
  return (
    <section className="lp-section">
      <div className="lp-section-inner">
        <div className="lp-section-header">
          <p className="lp-section-label">Pricing</p>
          <h2 className="lp-section-h">Simple, <span className="lp-grad-text">honest pricing</span></h2>
          <p className="lp-section-sub lp-section-sub--center">Start free. Upgrade when you need more. No hidden fees, ever.</p>
        </div>
        <div className="lp-plans lp-plans--two">

          <div className="lp-plan" data-anim data-delay="0">
            <div className="lp-plan-top">
              <p className="lp-plan-name">Free</p>
              <div className="lp-plan-price"><span className="lp-plan-amount">$0</span><span className="lp-plan-per">/mo</span></div>
              <p className="lp-plan-desc">Everything you need to get started and stay connected.</p>
            </div>
            <Link href="/register" className="lp-plan-btn lp-plan-btn--soft">Get started free</Link>
            <ul className="lp-plan-feats">
              {["Unlimited posts & stories","Photos, video & DMs","Basic AI caption help","Explore feed","Standard notifications"].map(f => (
                <li key={f} className="lp-plan-feat"><IcCheck />  {f}</li>
              ))}
            </ul>
          </div>

          <div className="lp-plan lp-plan--pro" data-anim data-delay="0.1">
            <div className="lp-plan-badge">Most popular</div>
            <div className="lp-plan-top">
              <p className="lp-plan-name">Pro</p>
              <div className="lp-plan-price"><span className="lp-plan-amount">$6</span><span className="lp-plan-per">/mo</span></div>
              <p className="lp-plan-desc">For creators who want reach, AI power, and verified status.</p>
            </div>
            <Link href="/register" className="lp-plan-btn lp-plan-btn--main">Start Pro</Link>
            <ul className="lp-plan-feats">
              {[
                "Creator mode + post & story boost",
                "10× higher AI token quota",
                "Verified badge on your profile",
                "Analytics dashboard (reach, top posts)",
                "Priority notifications",
                "Early access to new features",
              ].map(f => (
                <li key={f} className="lp-plan-feat"><IcCheck /> {f}</li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </section>
  );
}

export function LandingCta() {
  return (
    <section className="lp-cta-section">
      <div className="lp-cta-sparks" aria-hidden="true">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="lp-spark" style={{ left: `${6 + i * 9}%`, top: `${15 + Math.sin(i * 1.3) * 55}%`, animationDelay: `${i * .28}s`, animationDuration: `${1.6 + i * .18}s` }}/>
        ))}
      </div>
      <div className="lp-cta-inner" data-anim>
        <div className="lp-cta-glow" />
        <p className="lp-section-label">Join today</p>
        <h2 className="lp-cta-h">Ready to feel <span className="lp-grad-text">closer?</span></h2>
        <p className="lp-cta-sub">Sign up in under a minute. No credit card. 100% free, forever.</p>
        <div className="lp-cta-btns">
          <Link href="/register" className="lp-btn-main lp-btn-main--lg">
            Get started free <IcArrow />
          </Link>
          <Link href="/login" className="lp-btn-soft lp-btn-soft--lg">Sign in</Link>
        </div>
        <div className="lp-proof lp-cta-proof">
          <div className="lp-proof-stack">
            {AV.map(([a, b], i) => (
              <div key={i} className="lp-proof-av" style={{ background: `linear-gradient(135deg,${a},${b})`, marginLeft: i ? "-8px" : 0 }}>
                {["M","B","S","N","D"][i]}
              </div>
            ))}
          </div>
          <span className="lp-proof-txt">12,000+ people already joined</span>
        </div>
      </div>
    </section>
  );
}

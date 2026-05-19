"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AV,
  CountUp,
  IcArrow,
  LIVE_ACTS,
  PostCard,
} from "./shared";

export function LandingNav() {
  return (
    <>
      <nav className="lp-nav" aria-label="Primary">
        <Link href="/" className="lp-brand">
          <Image src="/psda.png" alt="Linksy logo" width={64} height={64} priority unoptimized className="lp-brand-logo" />
        </Link>
        <div className="lp-nav-r">
          <Link href="/login" className="lp-nav-ghost">Sign in</Link>
          <Link href="/register" className="lp-nav-cta">Sign up</Link>
        </div>
      </nav>

      <a href="#landing-main" className="lp-skip-link">
        Skip to main content
      </a>
    </>
  );
}

export function LandingHero() {
  return (
    <section className="lp-hero" aria-label="Introduction">
      <div className="lp-orb lp-orb-1" aria-hidden="true" />
      <div className="lp-orb lp-orb-2" aria-hidden="true" />
      <div className="lp-orb lp-orb-3" aria-hidden="true" />
      <div className="lp-hero-grid" aria-hidden="true" />

      <div className="lp-hero-copy">
        <p className="lp-eyebrow lp-hero-enter" style={{ animationDelay: "0s" }}><span className="lp-dot" />A social network built for connection</p>
        <h1 className="lp-h1 lp-hero-enter" style={{ animationDelay: "0.1s" }}>
          Stay<br />
          <span className="lp-h1-accent">connected.</span>
        </h1>
        <p className="lp-hero-sub lp-hero-enter" style={{ animationDelay: "0.22s" }}>
          A modern place to stay close to your friends, family, and community.
          Share photos, stories, and messages in one space.
        </p>
        <div className="lp-hero-btns lp-hero-enter" style={{ animationDelay: "0.34s" }}>
          <Link href="/register" className="lp-btn-main">
            Get started free <IcArrow />
          </Link>
          <Link href="/login" className="lp-btn-soft">Sign in</Link>
        </div>
        <div className="lp-proof lp-hero-enter" style={{ animationDelay: "0.44s" }}>
          <div className="lp-proof-stack">
            {AV.map(([a, b], i) => (
              <div key={i} className="lp-proof-av" style={{ background: `linear-gradient(135deg,${a},${b})`, marginLeft: i ? "-8px" : 0 }}>
                {["M", "B", "S", "N", "D"][i]}
              </div>
            ))}
          </div>
          <span className="lp-proof-txt">12,000+ people have joined</span>
        </div>
      </div>

      <div className="lp-hero-right">
        <div className="lp-float-badge">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--app-accent)"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span>2.8K</span>
        </div>

        <div className="lp-float-msg">
          <div className="lp-float-av" style={{ background: "linear-gradient(135deg,#6366f1,#a78bfa)" }}>A</div>
          <div className="lp-float-body">
            <div className="lp-float-meta">
              <span className="lp-float-name">Ariuka</span>
              <span className="lp-float-time">2h ago</span>
            </div>
            <p className="lp-float-text">Amazing weekend with amazing people! 💜</p>
            <div className="lp-typing"><span className="lp-td"/><span className="lp-td"/><span className="lp-td"/></div>
          </div>
        </div>

        <div className="lp-emoji-field" aria-hidden="true">
          {["❤️","🔥","😍","✨","💜","🎉","⭐"].map((em, i) => (
            <span key={i} className="lp-emoji-float" style={{ left: `${6 + i * 13}%`, animationDelay: `${i * .85}s`, animationDuration: `${2.8 + i * .38}s` }}>{em}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

const TICKER_ITEMS = [
  "📸 Photos","🎬 Stories","💬 Messages","🔖 Saved","🤖 AI Tools","🔥 Trending","💜 Connection","⭐ Moments","🌍 Community","✨ Discover","📲 Mobile","🎨 Create","👥 Friends","🎵 Music","🌟 Highlights",
];

export function LandingTicker() {
  return (
    <div className="lp-ticker-wrap" aria-hidden="true">
      <div className="lp-ticker-track">
        {TICKER_ITEMS.concat(TICKER_ITEMS).map((item, i) => (
          <span key={i} className="lp-ticker-item">{item}<span className="lp-ticker-sep">·</span></span>
        ))}
      </div>
    </div>
  );
}

export function LandingPreview() {
  return (
    <section className="lp-section lp-section--preview">
      <div className="lp-section-inner lp-preview-layout">
        <div className="lp-preview-copy" data-anim data-delay="0">
          <p className="lp-section-label">See it in action</p>
          <h2 className="lp-section-h">Your world,<br /><span className="lp-grad-text">beautifully shared</span></h2>
          <p className="lp-section-sub">A feed crafted for real moments. Photos, stories, and conversations — all in one elegant space built for the people you care about.</p>
          <div className="lp-preview-chips">
            {["📸 Photo posts","🎬 Stories","💬 Comments","🔖 Saved"].map(c => (
              <span key={c} className="lp-chip">{c}</span>
            ))}
          </div>
        </div>
        <div className="lp-preview-cards">
          <div className="lp-col-a" data-anim data-delay="0.1">
            <PostCard user="munkh_zul" name="Munkhzul" avIdx={0} verified location="Ulaanbaatar" time="2m ago"
              grad="linear-gradient(160deg,#1a0524,#9f1239 48%,#f97316)" emoji="🌅" src="/post1.jpg"
              caption="Summer nights 🔥 #beach #bonfire #vibes" likes={1284} comments={43} photoH={240} />
            <PostCard user="nomin_e" name="Nomin" avIdx={1} verified location="Seoul" time="18m ago"
              grad="linear-gradient(160deg,#1e1b4b,#7c3aed 48%,#db2777)" src="/HAVAR.jpg" emoji="🎨"
              caption="Late-night concept frames ✨ #design #moodboard" likes={962} comments={37} photoH={200} />
          </div>
          <div className="lp-col-b" data-anim data-delay="0.22">
            <PostCard user="bat.bold" name="Batbold" avIdx={2} location="Sunset Beach" time="14m ago"
              grad="linear-gradient(160deg,#0c1a2e,#1e3a8a 50%,#0e7490)" emoji="🌆"
              src="/5f16bd64-88a9-44da-a4df-637032d357a2.png"
              caption="London calling 🌉✨ #nightphotography" likes={3042} comments={91} saved photoH={150} />
            <PostCard user="saran_od" name="Saranoo" avIdx={3} time="1h ago"
              grad="linear-gradient(160deg,#1c0f00,#92400e 50%,#d97706)" emoji="🍵"
              src="/29a51875-76a0-4506-a231-8820c0f5a995.png"
              caption="Morning coffee + airpods = perfect start ☕🎧" likes={287} comments={18} photoH={150} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingStats() {
  return (
    <div className="lp-stats-bar" data-anim>
      {[{to:12,s:"K+",l:"Active users"},{to:3,s:"K+",l:"Posts per day"},{to:9,s:"K+",l:"Stories shared"},{to:24,s:"",l:"Countries"}].map(({ to, s, l }) => (
        <div key={l} className="lp-stat-item">
          <span className="lp-stat-n"><CountUp to={to} suffix={s} /></span>
          <span className="lp-stat-l">{l}</span>
        </div>
      ))}
    </div>
  );
}

export function LandingLiveActivity() {
  const [actIdx, setActIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActIdx(i => (i + 1) % LIVE_ACTS.length), 2600);
    return () => clearInterval(t);
  }, []);

  const act = LIVE_ACTS[actIdx];
  const pair = act ? AV[act.i] : undefined;

  return (
    <div className="lp-live-strip">
      <div className="lp-live-sweep" aria-hidden="true" />
      <span className="lp-live-label"><span className="lp-live-dot2"/>LIVE</span>
      {act && pair ? (
        <div className="lp-live-item" key={actIdx} aria-live="polite" aria-atomic="true">
          <div className="lp-live-av" style={{background:`linear-gradient(135deg,${pair[0]},${pair[1]})`}}>
            {act.av}
          </div>
          <span className="lp-live-text">{act.text}</span>
          <span className="lp-live-time">just now</span>
        </div>
      ) : null}
      <div className="lp-live-dots">
        {LIVE_ACTS.map((_, i) => (
          <span key={i} className={`lp-live-pip${i === actIdx ? " lp-live-pip--on" : ""}`}/>
        ))}
      </div>
    </div>
  );
}

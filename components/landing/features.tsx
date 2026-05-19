"use client";

import React from "react";
import { MOMENT_CARDS_RENDER, MomentCardMini } from "./shared";

const FEATURES: { grad: string; t: string; d: string; icon: React.ReactNode }[] = [
  { grad:"linear-gradient(135deg,#1e1b4b,#4c1d95)", t:"Posts & Stories", d:"Share photos, videos, and disappearing 24-hour stories. Your moments, your way.",
    icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg> },
  { grad:"linear-gradient(135deg,#0c2340,#1e3a5f)", t:"Direct Messages", d:"Private chats with emoji reactions, media sharing, and read receipts.",
    icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M8 10h8M8 14h5"/><path d="M5 3h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2Z"/></svg> },
  { grad:"linear-gradient(135deg,#1a0a2e,#3b1f6b)", t:"Smart Notifications", d:"Stay on top of every like, comment, follow, and mention — in real time.",
    icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M18 8A6 6 0 1 0 6 8c0 5.5-2.5 8-2.5 8h15S16 13.5 16 8"/><path d="M9.5 20a2.5 2.5 0 0 0 5 0"/></svg> },
  { grad:"linear-gradient(135deg,#0d1117,#1c2437)", t:"AI Assistant", d:"Generate captions, brainstorm ideas, and create content faster with built-in AI.",
    icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M12 2 13.5 8 20 9.5 13.5 11 12 17 10.5 11 4 9.5 10.5 8 12 2Z"/><path d="M19.5 14v3M21 15.5h-3"/><path d="M4.5 17v2M5.5 18h-2"/></svg> },
  { grad:"linear-gradient(135deg,#0f1923,#1a3040)", t:"Save & Collections", d:"Bookmark any post and organize saves into private collections for later.",
    icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M5 3h14a1 1 0 0 1 1 1v17l-8-4.5L4 21V4a1 1 0 0 1 1-1Z"/></svg> },
  { grad:"linear-gradient(135deg,#0a1628,#1a3050)", t:"Explore & Discover", d:"Find creators, trending topics, and communities that match your interests.",
    icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 4.5 4.5"/></svg> },
];

const FEATURE_ACTIVE_LABELS = ["11.2K","7.8K","9.1K","5.4K","6.3K","8.6K"];

export function LandingFeatures() {
  return (
    <section className="lp-section">
      <div className="lp-section-inner">
        <div className="lp-section-header">
          <p className="lp-section-label">Everything you need</p>
          <h2 className="lp-section-h">Built for <span className="lp-grad-text">real connection</span></h2>
          <p className="lp-section-sub lp-section-sub--center">Not another endless scroll. Linksy is designed to bring you closer to the people and moments that matter.</p>
        </div>
        <div className="lp-feats-grid">
          {FEATURES.map((f, i) => (
            <div key={f.t} className="lp-feat-card" data-anim data-delay={`${i * 0.08}`}>
              <div className="lp-feat-icon" style={{ background: f.grad, color: "#fff" }}>{f.icon}</div>
              <h3 className="lp-feat-t">{f.t}</h3>
              <p className="lp-feat-d">{f.d}</p>
              <div className="lp-feat-footer">
                <span className="lp-feat-active"><span className="lp-feat-pulse"/>{FEATURE_ACTIVE_LABELS[i]} active</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingMoments() {
  return (
    <section className="lp-moments">
      <div className="lp-section-inner lp-section-header" data-anim>
        <p className="lp-section-label">Community</p>
        <h2 className="lp-section-h">Real moments,<br /><span className="lp-grad-text">shared every day</span></h2>
        <p className="lp-section-sub lp-section-sub--center">Thousands of people share their stories, photos, and memories on Linksy every day.</p>
      </div>
      <div className="lp-mq-stage">
        <div className="lp-mq-row">
          <div className="lp-mq-track lp-mq-fwd">
            {[...MOMENT_CARDS_RENDER.slice(0, 8), ...MOMENT_CARDS_RENDER.slice(0, 8)].map((card, index) => (
              <MomentCardMini key={`fwd-${card.u}-${index}`} card={card} />
            ))}
          </div>
        </div>
        <div className="lp-mq-row">
          <div className="lp-mq-track lp-mq-rev">
            {[...MOMENT_CARDS_RENDER.slice(8), ...MOMENT_CARDS_RENDER.slice(8)].map((card, index) => (
              <MomentCardMini key={`rev-${card.u}-${index}`} card={card} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

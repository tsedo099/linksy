"use client";

import { Av } from "./shared";

const TESTIMONIALS = [
  { q:"Linksy finally made me feel like social media is worth it again. The feed feels personal.", name:"Munkhzul E.", role:"UX Designer", av:0 },
  { q:"I stay in touch with my whole family through Linksy. It's the only app I open every morning.", name:"Batbold N.", role:"Software Engineer", av:2 },
  { q:"The AI caption tool alone saved me hours. And the design is just stunning.", name:"Saranoo D.", role:"Content Creator", av:3 },
] as const;

const TESTIMONIAL_REACTIONS = [
  { hearts: 48, comments: 12 },
  { hearts: 31, comments: 7 },
  { hearts: 62, comments: 23 },
] as const;

export function LandingTestimonials() {
  return (
    <section className="lp-section lp-section--tint">
      <div className="lp-section-inner">
        <div className="lp-section-header">
          <p className="lp-section-label">What people say</p>
          <h2 className="lp-section-h">Loved by <span className="lp-grad-text">real people</span></h2>
        </div>
        <div className="lp-testi-grid">
          {TESTIMONIALS.map((t, i) => {
            const r = TESTIMONIAL_REACTIONS[i] ?? { hearts: 0, comments: 0 };
            return (
              <div key={i} className="lp-testi" data-anim data-delay={`${i * 0.1}`}>
                <div className="lp-testi-stars">{"★★★★★"}</div>
                <p className="lp-testi-q">
                  <span aria-hidden="true">&ldquo;</span>
                  {t.q}
                  <span aria-hidden="true">&rdquo;</span>
                </p>
                <div className="lp-testi-author">
                  <Av n={t.name} s={36} i={t.av} />
                  <div>
                    <div className="lp-testi-name">{t.name}</div>
                    <div className="lp-testi-role">{t.role}</div>
                  </div>
                </div>
                <div className="lp-testi-react">
                  <button className="lp-react-btn lp-react-btn--heart">❤️ {r.hearts}</button>
                  <button className="lp-react-btn">💬 {r.comments}</button>
                  <button className="lp-react-btn lp-react-share">↗ Share</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

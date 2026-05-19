"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export const IcCheck = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
export const IcArrow = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
export const IcVerified = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--app-accent)">
    <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
  </svg>
);
export const IcHeart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);
export const IcComment = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
export const IcBookmark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>
);

export const AV = [
  ["#6366f1","#a78bfa"],["#f59e0b","#fbbf24"],
  ["#10b981","#34d399"],["#ef4444","#f87171"],["#3b82f6","#60a5fa"],
] as const;

export function Av({ n, s = 36, i = 0, verified }: { n: string; s?: number; i?: number; verified?: boolean }) {
  const [a = "#6366f1", b = "#a78bfa"] = AV[i % AV.length] ?? [];
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{
        width: s, height: s, borderRadius: "50%",
        background: `linear-gradient(135deg,${a},${b})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: s * .38, color: "#fff",
      }}>
        {(n[0] ?? "?").toUpperCase()}
      </div>
      {verified && (
        <span style={{ position:"absolute", bottom:-1, right:-1 }}><IcVerified /></span>
      )}
    </div>
  );
}

function Photo({ g, emoji, src, h = 220 }: { g: string; emoji: string; src?: string; h?: number }) {
  if (src) {
    return (
      <div style={{ height: h, position: "relative", overflow: "hidden" }}>
        <Image
          src={src}
          alt=""
          fill
          sizes="(max-width:768px) 100vw, 50vw"
          style={{ objectFit: "cover" }}
          unoptimized={src.startsWith("/")}
        />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, transparent 60%, rgba(0,0,0,.18))",
        }} />
      </div>
    );
  }
  return (
    <div style={{
      height: h, background: g, position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E\")",
        backgroundSize: "256px 256px",
      }} />
      <div style={{
        position: "absolute", top: "-40%", left: "30%",
        width: "60%", height: "200%",
        background: "linear-gradient(180deg, rgba(255,255,255,.08) 0%, transparent 60%)",
        transform: "rotate(20deg)",
      }} />
      <span style={{ fontSize: "3.5rem", position: "relative", filter: "drop-shadow(0 4px 16px rgba(0,0,0,.4))" }}>
        {emoji}
      </span>
    </div>
  );
}

export function PostCard({
  user, name, avIdx, verified, location, time,
  grad, emoji, src, caption, likes, comments, saved, photoH,
}: {
  user: string; name: string; avIdx: number; verified?: boolean; location?: string; time: string;
  grad: string; emoji: string; src?: string; caption: string; likes: number; comments: number; saved?: boolean; photoH?: number;
}) {
  return (
    <div className="lp-pc">
      <div className="lp-pc-head">
        <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
          <div className="lp-pc-av-ring">
            <Av n={user} s={34} i={avIdx} verified={verified} />
          </div>
          <div>
            <div className="lp-pc-user">
              {name}
              {verified && <IcVerified />}
            </div>
            <div className="lp-pc-sub">{location ? `${location} · ` : ""}{time}</div>
          </div>
        </div>
        <div className="lp-pc-dots">···</div>
      </div>

      <Photo g={grad} emoji={emoji} src={src} h={photoH} />

      <div className="lp-pc-actions">
        <div style={{ display: "flex", gap: ".65rem" }}>
          <button type="button" className="lp-pc-btn lp-pc-btn--heart" aria-label="Like"><IcHeart /></button>
          <button type="button" className="lp-pc-btn" aria-label="Comment"><IcComment /></button>
        </div>
        <button type="button" className={`lp-pc-btn ${saved ? "lp-pc-btn--saved" : ""}`} aria-label="Save"><IcBookmark /></button>
      </div>

      <div className="lp-pc-likes">{likes.toLocaleString("en-US")} like</div>

      <div className="lp-pc-caption">
        <span className="lp-pc-cap-user">{user}</span> {caption}
      </div>
      <div className="lp-pc-cmts">View all {comments} comments</div>
    </div>
  );
}

export function CountUp({ to, suffix = "", duration = 1400 }: { to: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      const start = Date.now();
      const tick = () => {
        const p = Math.min((Date.now() - start) / duration, 1);
        setVal(Math.round((1 - Math.pow(1 - p, 3)) * to));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);
  return <span ref={ref}>{val}{suffix}</span>;
}

export const LIVE_ACTS = [
  { av:"M", i:0, text:"munkh_zul just posted a new photo" },
  { av:"N", i:1, text:"nomin_e liked your story" },
  { av:"B", i:2, text:"bat.bold started following you" },
  { av:"S", i:3, text:"saranoo commented: \"Love this! 💜\"" },
  { av:"D", i:4, text:"3 people reacted to your post" },
  { av:"N", i:1, text:"nomin_e shared your post to their story" },
];

export type MomentCardData = {
  em?: string;
  g: string;
  lk: string;
  src?: string;
  u: string;
  vi?: boolean;
};

const MOMENT_CARDS: MomentCardData[] = [
  { g:"linear-gradient(160deg,#17171c,#3f3f46,#0f172a)", src:"/download (3).jpg", u:"munkh_zul", lk:"1.2K", vi:true },
  { g:"linear-gradient(160deg,#0c1a2e,#1e3a8a,#0e7490)", src:"/CyberPunk.jpg", u:"bat.bold", lk:"3.0K" },
  { g:"linear-gradient(160deg,#2b1736,#b91c1c,#f97316)", src:"/12 AMAZING Places to Stay in NYC.jpg", u:"ariunaa", lk:"845" },
  { g:"linear-gradient(160deg,#1c0f00,#92400e,#d97706)", src:"/download (4).jpg", u:"enkhjin", lk:"3.8K" },
  { g:"linear-gradient(160deg,#1c0f00,#92400e,#d97706)", em:"â˜•", u:"dorj_b", lk:"445" },
  { g:"linear-gradient(160deg,#0a1628,#1a3050,#2563eb)", em:"ðŸŒŠ", u:"boldoo", lk:"2.8K" },
  { g:"linear-gradient(160deg,#1a1040,#6d28d9,#c026d3)", em:"ðŸ’œ", u:"dulguun", lk:"1.5K" },
  { g:"linear-gradient(160deg,#052e16,#166534,#16a34a)", em:"ðŸ”ï¸", u:"gantulga", lk:"1.3K" },
  { g:"linear-gradient(160deg,#1e1b4b,#7c3aed,#db2777)", em:"ðŸŽ¨", u:"nomin_e", lk:"962", vi:true },
  { g:"linear-gradient(160deg,#1c0f00,#92400e,#d97706)", em:"ðŸµ", u:"saran_od", lk:"287" },
  { g:"linear-gradient(160deg,#134e5e,#71b280)", em:"ðŸŒ¿", u:"tsetseg", lk:"1.6K" },
  { g:"linear-gradient(160deg,#2c3e50,#fd746c)", em:"ðŸŒ¸", u:"munkhuu", lk:"742" },
  { g:"linear-gradient(160deg,#0f0c29,#7c3aed)", em:"âœ¨", u:"nominchimeg", lk:"933" },
  { g:"linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)", em:"ðŸŽ­", u:"uyanga", lk:"678" },
  { g:"linear-gradient(160deg,#0d1b0a,#14532d,#166534)", em:"ðŸ¦‹", u:"narantsatsral", lk:"512" },
  { g:"linear-gradient(160deg,#200122,#6f0000)", em:"ðŸŽµ", u:"ganzorig", lk:"1.1K" },
];

function overrideMomentCard(idx: number, overrides: Partial<MomentCardData>): MomentCardData {
  const base = MOMENT_CARDS[idx];
  if (!base) throw new Error(`MOMENT_CARDS[${idx}] missing`);
  return { ...base, ...overrides };
}

export const MOMENT_CARDS_RENDER: MomentCardData[] = [
  ...MOMENT_CARDS.slice(0, 4),
  overrideMomentCard(4,  { em: undefined, g: "linear-gradient(160deg,#2b211f,#6b4f46,#c4a18a)", src: "/book-headphones.jpg" }),
  overrideMomentCard(5,  { em: undefined, g: "linear-gradient(160deg,#20171f,#5f495e,#d3a0b4)", src: "/book-flowers.jpg" }),
  overrideMomentCard(6,  { em: undefined, g: "linear-gradient(160deg,#0e1116,#6a0f1f,#f3f4f6)", src: "/red-rose.jpg" }),
  overrideMomentCard(7,  { em: undefined, g: "linear-gradient(160deg,#020617,#0f172a,#334155)", src: "/milky-way.jpg" }),
  overrideMomentCard(8,  { em: undefined, g: "linear-gradient(160deg,#101510,#31452b,#6f7f62)", src: "/rain-road.jpg" }),
  overrideMomentCard(9,  { em: undefined, g: "linear-gradient(160deg,#1b2a20,#6b5d36,#f5cf72)", src: "/river-sunset.jpg" }),
  overrideMomentCard(10, { em: undefined, g: "linear-gradient(160deg,#213147,#a8b4c7,#f3d3bd)", src: "/snow-path.jpg" }),
  overrideMomentCard(11, { em: undefined, g: "linear-gradient(160deg,#0ea5e9,#facc15,#ef4444)", src: "/ferris-wheel.jpg" }),
  overrideMomentCard(12, { em: undefined, g: "linear-gradient(160deg,#6f5368,#e9c9d5,#8d6a53)", src: "/cherry-lake.jpg" }),
  overrideMomentCard(13, { em: undefined, g: "linear-gradient(160deg,#28150f,#b66f30,#f7dd8d)", src: "/sunset-guitar.jpg" }),
  overrideMomentCard(14, { em: undefined, g: "linear-gradient(160deg,#43484f,#b6bfc8,#8a5d42)", src: "/nyc-rain-crosswalk.jpg" }),
  overrideMomentCard(15, { em: undefined, g: "linear-gradient(160deg,#271d1a,#9b5860,#d7c08a)", src: "/graffiti-alley.jpg" }),
];

export function MomentCardMini({ card }: { card: MomentCardData }) {
  return (
    <div className="lp-mc">
      <div className="lp-mc-photo" style={!card.src ? { background: card.g } : undefined}>
        {card.src ? (
          <Image
            src={card.src}
            alt=""
            fill
            sizes="185px"
            style={{ objectFit: "cover" }}
            unoptimized={card.src.startsWith("/")}
          />
        ) : (
          <span className="lp-mc-em">{card.em}</span>
        )}
      </div>
      <div className="lp-mc-foot">
        <div className="lp-mc-user">
          <div className="lp-mc-av" style={{background:card.g}}>{(card.u[0] ?? "?").toUpperCase()}</div>
          <span>{card.u}</span>
          {card.vi && <IcVerified />}
        </div>
        <span className="lp-mc-lk">â¤ {card.lk}</span>
      </div>
    </div>
  );
}

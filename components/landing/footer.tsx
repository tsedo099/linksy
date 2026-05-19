"use client";

import Image from "next/image";
import Link from "next/link";

const PRODUCT_LINKS = ["Feed","Stories","Messages","Explore","AI Tools","Saved"];
const COMPANY_LINKS = ["About","Blog","Careers","Press","Contact"];
const SOCIAL_ICONS = ["𝕏","in","ig"];

export function LandingFooter() {
  return (
    <footer className="lp-footer" role="contentinfo">
      <div className="lp-footer-inner">
        <div className="lp-footer-brand">
          <Link href="/" className="lp-footer-logo-wrap">
            <Image src="/psda.png" alt="Linksy" width={48} height={48} unoptimized />
            <span className="lp-footer-brand-name">Linksy</span>
          </Link>
          <p className="lp-footer-brand-desc">A modern social platform built for real connection — not performance.</p>
          <div className="lp-footer-socials">
            {SOCIAL_ICONS.map(s => (
              <span key={s} className="lp-footer-social">{s}</span>
            ))}
          </div>
        </div>
        <div className="lp-footer-cols">
          <div className="lp-footer-col">
            <p className="lp-footer-col-title">Product</p>
            {PRODUCT_LINKS.map(l => (
              <Link key={l} href="#" className="lp-footer-link">{l}</Link>
            ))}
          </div>
          <div className="lp-footer-col">
            <p className="lp-footer-col-title">Company</p>
            {COMPANY_LINKS.map(l => (
              <Link key={l} href="#" className="lp-footer-link">{l}</Link>
            ))}
          </div>
          <div className="lp-footer-col">
            <p className="lp-footer-col-title">Legal</p>
            <Link href="/legal/privacy" className="lp-footer-link">Privacy</Link>
            <Link href="/legal/terms" className="lp-footer-link">Terms</Link>
            <Link href="/legal/privacy#cookies" className="lp-footer-link">Cookies</Link>
            <Link href="#" className="lp-footer-link">Security</Link>
          </div>
        </div>
      </div>
      <div className="lp-footer-bottom">
        <span>© 2026 Linksy. All rights reserved.</span>
        <div className="lp-footer-bottom-r">
          <Link href="/login" className="lp-footer-link">Sign in</Link>
          <Link href="/register" className="lp-footer-link">Sign up</Link>
        </div>
      </div>
    </footer>
  );
}

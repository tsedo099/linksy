"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

function IcBack() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

const SECTIONS: Array<{ label: string; paragraphs: string[]; id?: string }> = [
  {
    label: "Overview",
    paragraphs: [
      "This Privacy Policy describes how Linksy (“we”, “us”) handles information when you use our web application. It is meant to help you understand what we store, how we use it, and what stays only on your device.",
    ],
  },
  {
    label: "What we store",
    paragraphs: [
      "To run the service, we process data you provide and activity that occurs on the platform — for example your account profile, posts, comments, follows, messages where applicable, and preferences that are synced with your account.",
    ],
  },
  {
    label: "Local preferences",
    paragraphs: [
      "Theme, language, font scale, motion settings, and some optional toggles may be stored in your browser (for example localStorage) so the interface stays consistent after refresh, even before you sign in.",
    ],
  },
  {
    label: "Cookies & similar technologies",
    id: "cookies",
    paragraphs: [
      "We use cookies and similar storage as needed to keep you signed in securely, protect the application, and remember essential choices. Some personalization features rely on local browser storage as described above.",
      "You can control cookies through your browser settings. If you disable strictly necessary cookies, parts of the site (such as staying logged in) may not work as expected.",
    ],
  },
  {
    label: "Your choices",
    paragraphs: [
      "You can review many account-related options in Settings, export or delete data where those features are available, and contact us if you need help with your information.",
    ],
  },
];

export function LegalPrivacyPage() {
  const router = useRouter();

  return (
    <div className="legal-doc">
      <header className="legal-doc-head">
        <button
          type="button"
          className="legal-doc-back"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <IcBack />
        </button>
        <h1 className="legal-doc-title">Privacy Policy</h1>
      </header>

      <div className="legal-doc-body">
        <p className="legal-doc-meta">Effective May 2026 · Linksy</p>

        {SECTIONS.map((section) => (
          <section key={section.label} id={section.id} className="legal-doc-section">
            <p className="legal-doc-label">{section.label}</p>
            <div className="legal-doc-card">
              <div className="legal-doc-card-inner">
                {section.paragraphs.map((para, i) => (
                  <p key={`${section.label}-${i}`}>{para}</p>
                ))}
              </div>
            </div>
          </section>
        ))}

        <div className="legal-doc-foot">
          <Link href="/legal/terms" className="legal-doc-foot-link">
            Terms of Service
          </Link>
          <span className="legal-doc-meta" style={{ margin: "0 0.5rem" }}>
            ·
          </span>
          <Link href="/" className="legal-doc-foot-link">
            ← Back to Linksy home
          </Link>
        </div>
      </div>
    </div>
  );
}

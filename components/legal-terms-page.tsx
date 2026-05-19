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

const SECTIONS: Array<{ label: string; paragraphs: string[] }> = [
  {
    label: "Agreement",
    paragraphs: [
      "By using Linksy, you agree to these Terms of Service and to our Privacy Policy. If you do not agree, please do not use the service.",
    ],
  },
  {
    label: "Acceptable use",
    paragraphs: [
      "Do not upload harmful, unlawful, or abusive content, impersonate others, spam, or abuse messaging, comments, or other social features. Respect intellectual property and other people’s rights.",
    ],
  },
  {
    label: "Account responsibility",
    paragraphs: [
      "You are responsible for activity on your account. Keep your password and devices secure. Notify us if you suspect unauthorized access. We may suspend accounts that violate these terms or put the community at risk.",
    ],
  },
  {
    label: "Service changes",
    paragraphs: [
      "We may modify or discontinue features with reasonable notice where practical. Continued use after changes means you accept the updated terms.",
    ],
  },
];

export function LegalTermsPage() {
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
        <h1 className="legal-doc-title">Terms of Service</h1>
      </header>

      <div className="legal-doc-body">
        <p className="legal-doc-meta">Effective May 2026 · Linksy</p>

        {SECTIONS.map((section) => (
          <section key={section.label} className="legal-doc-section">
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
          <Link href="/legal/privacy" className="legal-doc-foot-link">
            Privacy Policy
          </Link>
          <span className="legal-doc-meta" style={{ margin: "0 0.5rem" }}>
            ·
          </span>
          <Link href="/" className="legal-doc-foot-link">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

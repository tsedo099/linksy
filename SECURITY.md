# Security Policy

## Supported Versions

This project is currently in active pre-1.0 development. Only the `main`
branch (latest production deploy) receives security fixes. Earlier tags are
not patched — upgrade if you are running an older revision.

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| < main  | :x:                |

## Reporting a Vulnerability

**Please do not file public GitHub issues for security problems.** Public
issues can be indexed and acted on by attackers before we have a chance to
ship a fix.

Report privately by one of:

1. **GitHub Security Advisory** — open a private advisory at
   `Security` → `Advisories` → `Report a vulnerability` on this repo.
2. **Email** — send details to the maintainer listed in `package.json` /
   `CODEOWNERS`. Encrypt with PGP if you have a key for them; otherwise
   plain email is fine — do not include exploit payloads in subject lines.

Please include, at minimum:

- A clear description of the issue and its impact (what an attacker gains).
- Steps to reproduce, ideally against a fresh local checkout.
- The affected commit SHA or deploy URL, if known.
- Any suggested remediation.

## What to expect

- **Acknowledgement** within 3 business days.
- **Initial triage** (severity + reproduction confirmation) within 7 days.
- **Fix timeline** depends on severity:
  - Critical (RCE, auth bypass, mass PII): patched within 7 days.
  - High (account takeover for one user, privilege escalation): 14 days.
  - Medium / low: scheduled with the next release.
- **Disclosure** — we coordinate a public advisory after a fix is deployed.
  Reporter credit is offered by default unless you ask to remain anonymous.

## Scope

In scope:

- The Next.js application in this repository.
- Public APIs under `/api/*`.
- Authentication, session, and OAuth/WebAuthn flows.
- File uploads, media handling, and storage URLs.
- Payment flows (Stripe Checkout / webhooks).
- The E2EE messaging pipeline (`lib/e2ee/*`).

Out of scope:

- Third-party services we depend on (Stripe, AWS, etc.) — report directly to them.
- Findings that require physical access or a compromised user device.
- DoS via raw traffic volume (rate limiting is a known mitigation surface).
- Self-XSS that requires the victim to paste attacker-supplied JS into devtools.
- Missing security headers on endpoints where they are not load-bearing.

## Safe harbour

We will not pursue legal action against good-faith research that:

- Avoids privacy violations, data destruction, and service disruption.
- Stops at the minimum proof needed to demonstrate the issue.
- Gives us a reasonable window to remediate before public disclosure.

Thank you for helping keep Linksy users safe.

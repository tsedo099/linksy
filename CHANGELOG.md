# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches 1.0. Until then, the `Unreleased` section accumulates changes
between deploys and is renamed on each tagged release.

## [Unreleased]

### Added

- `/api/health` liveness + `/api/health/ready` readiness endpoints.
- Docker `HEALTHCHECK` instruction pointing at `/api/health`.
- `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`
  scaffolds.
- Kubernetes manifests under `deploy/k8s/` — Kustomize base
  (Deployment, Service, Ingress, HPA, ConfigMap, NetworkPolicy, PDB,
  pg-backup CronJob) plus dev / staging / prod overlays.
- Graceful shutdown coordinator (`lib/shutdown.ts`) wired into
  `instrumentation.ts`. On `SIGTERM`/`SIGINT`: `/api/health/ready` flips
  to 503 so k8s pulls the pod out of the Service immediately, all six SSE
  routes broadcast a final `shutdown` event so browser EventSources
  reconnect to a healthy pod, and the drain budget (default 20s, env
  `SHUTDOWN_DRAIN_MS`) fits inside the 30s Kubernetes grace window.
- `docs/slo.md` — service level objectives, error-budget policy, multi-burn
  alert thresholds, and the graceful-shutdown contract.
- Hardened `scripts/pg-backup.example.sh` — GPG / AES-256 encryption,
  SHA-256 checksum, S3 offsite upload, retention enforcement, Healthchecks
  ping. Restore companion + `docs/backup-and-restore.md` ops guide.
- `scripts/k6-baseline.js` — auth + browse + post load scenarios with
  weighted thresholds, plus a nightly GitHub Actions workflow
  (`.github/workflows/load-baseline.yml`) that runs the baseline against
  staging and alerts Slack on regression.
- `docs/synthetic-monitoring.md` — Better Uptime / Healthchecks /
  Checkly setup recipes, public status-page layout, and explicit notes on
  which endpoints are *not* good external-monitor targets.
- README `Environments` section covering dev → staging → prod promotion,
  prod-to-staging restore, and PII scrubbing.
- Server-Sent Events streams for the inbox (`/api/conversations/stream`)
  and per-call signalling, replacing the previous 30s polling loops.
- End-to-end encryption pipeline (`lib/e2ee/*`): Double Ratchet, safety
  numbers, AES-GCM media encryption.
- Safe Social comment-moderation system with warning escalation and
  rolling-window auto-mutes.
- Dynamic SEO metadata: `app/robots.ts`, `app/sitemap.ts`, `app/icon.tsx`,
  `app/apple-icon.tsx`, per-route `generateMetadata`.
- Stripe-backed tip flow (`POST /api/tips`) and connected-apps management
  under `/api/oauth/authorized/*`.
- Admin deletion-queue panel (`GET /api/admin/deletion-requests`) and
  unified admin UI.

### Changed

- Pinned previously floating dependencies (`next`, `react`, `react-dom`,
  `typescript`, `@types/node`, `@types/react`, `@types/react-dom`) to
  caret-ranged versions in `package.json`. Reproducible builds, no more
  surprise majors on `npm ci`.
- `instrumentation.ts`: `uncaughtException` no longer rethrows (which caused
  recursive log spam); client-disconnect errors are now swallowed and the
  rest are forwarded to Sentry.
- LCP image (`/psda.png`) now sets `loading="eager"`, `fetchPriority="high"`,
  and explicit dimensions across the shell, profile, notifications, and
  feed screens.
- SSE routes harden against client disconnects with `req.signal.aborted`
  checks, try/catch around `controller.enqueue`, and a `closed` flag so
  cleanup is idempotent.
- `.dockerignore` and `.gitignore` now exclude `*.log`, `dev-server*.log`,
  `next-dev-*.log`, tests, coverage, and editor junk.

### Fixed

- Recursive `uncaughtException` floods after SSE client disconnects
  (manifested as repeated `Error: aborted` lines in dev logs).

## [0.1.0] — TBD

Initial pre-release. To be tagged once the API surface and schema stabilise.

[Unreleased]: https://github.com/your-org/linksy/compare/HEAD...main

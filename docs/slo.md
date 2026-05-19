# Service Level Objectives (SLO) & Error Budgets

This document is the contract between Linksy operations and product. It
defines **what "the site is working" means**, what we're willing to
tolerate, and what we do when we run out of tolerance.

It is deliberately small. A single page of well-understood SLOs beats
twenty pages nobody remembers. Revisit quarterly.

## Why SLOs

- Anchor "is this an incident?" decisions in measurable thresholds, not vibes.
- Give the team a shared definition of "good enough" so we stop shipping
  features when reliability suffers and stop over-engineering when it doesn't.
- Make trade-offs explicit: a 99.95% SLO costs ~10x more in engineering
  than a 99.5% SLO. Pick the right tier.

## Terminology

- **SLI** (Service Level Indicator) — a measured quantity, e.g.
  `% of /api/feed requests returning a 2xx within 1s`.
- **SLO** (Service Level Objective) — the target value, e.g. `99.5%` over
  a 28-day rolling window.
- **Error budget** — `100% − SLO` expressed as time or events you can afford
  to be wrong. A 99.5% availability SLO yields ~3h 30m of allowed downtime
  in 28 days.
- **Burn rate** — how fast the current error rate would consume the budget
  if it continued. `1×` = on pace; `>14.4×` over an hour = page on-call.

## Tiers

| Tier      | Examples                                  | Availability target | Latency target (p95)   |
| --------- | ----------------------------------------- | ------------------- | ---------------------- |
| Critical  | login, feed, session refresh              | **99.9%** monthly   | < 800ms                |
| Standard  | post create, comment, profile read        | **99.5%** monthly   | < 1.5s                 |
| Best-effort | story view counters, dashboard analytics | **99.0%** monthly | < 3s                   |
| Notification | push delivery, email send               | **99.0%** monthly   | < 60s (90th percentile) |

"Critical" maps to user-visible flows where failure means the user *can't
use the app*. "Standard" is degraded-but-usable. "Best-effort" is what we
fix on the next sprint, not in the middle of the night.

## The seven SLOs

Each row is the contract: hit the target, or burn budget.

| #   | SLO                                                                   | SLI source                                       | Tier        |
| --- | --------------------------------------------------------------------- | ------------------------------------------------ | ----------- |
| 1   | 99.9% of `/api/auth/login` requests succeed (2xx/3xx) in < 1.2s       | Sentry transactions + structured logs            | Critical    |
| 2   | 99.9% of `/api/feed` requests succeed (2xx) in < 800ms                | Sentry transactions                              | Critical    |
| 3   | 99.5% of `POST /api/posts` requests succeed (2xx) in < 1.5s           | Sentry transactions                              | Standard    |
| 4   | 99.5% of SSE `inbox` events delivered within 5s of `publish()`        | `inbox.publish_ts` → `inbox.subscribe_ts` metric | Standard    |
| 5   | 99.0% of web-push notifications dispatched within 60s of trigger      | `lib/push` dispatcher metric                     | Notification |
| 6   | 99.0% of Stripe webhooks processed (200 to Stripe) within 5s          | route timer + Sentry transaction                 | Standard    |
| 7   | 99.9% of `/api/health/ready` probes return 200 (excludes deploys)     | external uptime monitor                          | Critical    |

## Error budget policy

The error budget is a **production resource**. Spending it is normal — that's
the point. What matters is *how* it's spent.

- **Budget healthy (< 50% consumed)** — ship freely. Risky experiments are
  fine; that's what budgets are for.
- **Budget warning (50–80% consumed)** — pause launches that need new infra
  paths (new SSE topic, new webhook source, new third-party). Hardening
  work jumps ahead of new features.
- **Budget exhausted (> 80% consumed)** — feature freeze on the affected
  surface area. The next sprint is reliability work — the team rolls back
  recent risky changes, lands missing observability, or upgrades runbooks.
- **Budget gone (> 100%)** — postmortem required; product cannot ship
  optional changes to that surface until the prior month closes green.

Critical SLOs trump standard ones — if `feed` is burning while `dashboard`
is healthy, we still freeze launches that touch the request path.

## Alert thresholds

We page on **fast burn** (a brief, severe burn that would exhaust the
budget if sustained) and ticket on **slow burn** (a steady erosion).

| Window  | Burn rate | Action                          | Examples |
| ------- | --------- | ------------------------------- | -------- |
| 5 min   | > 14.4×   | Page on-call immediately        | The login endpoint is returning 500 for everyone |
| 1 hour  | > 6×      | Page on-call                    | One region is degraded, error rate sustained at 1% |
| 6 hour  | > 3×      | Open ticket, notify channel     | A slow query is creeping above 800ms p95 |
| 24 hour | > 1×      | Slack notification, next standup | Steady background-noise errors growing |

These thresholds come from the SRE Workbook's recommended multi-window /
multi-burn-rate alerting. They keep paging proportional to the severity:
nobody gets woken up at 03:00 for a slow burn that's still inside the
weekly budget.

Configure them in Sentry:
- **Alerts → New Metric Alert**
- Metric: `failure_rate()` filtered by transaction (`http.server`) and
  endpoint tag
- Time window: 5m / 1h / 6h / 24h
- Threshold: `> SLO_threshold × burn_multiplier`
- Routing: page → PagerDuty rotation; ticket → Linear/Jira webhook

## What we do NOT SLO (and why)

Skipping is a feature of SLOs. The list of things we *don't* track is just
as important as the list we do.

- **Internal admin tools** — small audience, downtime is annoying but not
  incident-grade. Manual checking is enough.
- **Analytics dashboards (`/dashboard`)** — pure read-only aggregations.
  If they're slow, we don't get paged.
- **First-byte latency for marketing pages** — Core Web Vitals (LCP, INP)
  cover this; an SLO would duplicate that signal.
- **SSE *connection success*** — counting opens tells us almost nothing.
  We SLO event *delivery* end-to-end instead.
- **Background batch jobs (sitemap refresh, ranking recompute)** — they
  run on cron, lateness gets logged, and if they miss a day nobody on the
  outside notices. SLO would just generate paperwork.

## Measuring & reporting

- **Source of truth:** Sentry transactions tagged by route + status family,
  plus the application-level metrics emitted from `lib/push` and the
  SSE buses.
- **Dashboard:** Sentry Performance → "Linksy SLOs" workspace. Mirrored on
  the internal Grafana board (`grafana.internal/d/linksy-slo`) if Grafana
  is wired up.
- **Burn rate alerts:** Sentry Metric Alerts (see thresholds above).
- **Monthly review:** ops + product run a 30-min review on the 1st working
  day of the month. Capture decisions in this doc's changelog.

## Graceful shutdown contract

The readiness probe (`/api/health/ready`) flips to 503 the moment
`SIGTERM` lands. From that point until the pod terminates, two facts hold:

1. **No new connections** — the Service no longer routes traffic here.
2. **Open SSE streams receive a final `shutdown` event** within ~1s, so
   browser clients reconnect to a sibling pod rather than waiting on a
   half-closed socket.

Treat shutdowns as a planned drain, not an incident — they don't burn
budget unless connection cleanup exceeds the `terminationGracePeriodSeconds`
(30s) and clients see real failures.

## Postmortems

Trigger:
- Any **page** that was real (not a flap).
- Any error budget burned **>50% in a single 24h window**.
- Any customer-reported incident lasting > 15 minutes.

Format: blameless. Use the template in `docs/postmortem-template.md`
(create on first use). Aim for a draft within 48h, signed off within
one week.

## Changelog

- **2026-05** — Initial draft. Seven SLOs, multi-burn-rate alert policy,
  shutdown contract section added.

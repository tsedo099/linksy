# Linksy Alert Runbook

This is the on-call playbook. When a Sentry rule fires or a Prometheus
alert pages, find the matching section below and execute the steps in
order. Each section is structured as **Detect → Diagnose → Mitigate →
Verify**.

The companion contract is [docs/slo.md](slo.md). Every rule in this
runbook protects exactly one SLO listed there.

## How to use this document

1. Acknowledge the page in PagerDuty / Slack #incidents within 5 minutes.
2. Find the section for the firing alert (alerts are titled
   `Alert: <slug>` — the slug matches a heading here).
3. Follow the steps top-to-bottom. Do not skip the **Diagnose** step,
   even when you think you know the answer — every false-cause fix has
   cost us another budget hour.
4. If the alert is not in this runbook, escalate to the secondary on-call
   AND open a follow-up ticket to add it.

## Alert: high-5xx-rate

**Slug:** `linksy.api.high-5xx`
**Trigger:** `rate(http_requests_total{status_family="5xx"}[5m]) /
rate(http_requests_total[5m]) > 0.02` for 5 minutes (≥ 2% 5xx).
**SLO impact:** Critical-tier availability (login, feed).

### Detect
- Prometheus alert `high-5xx-rate` (paging).
- Sentry rule "5xx spike" (informational backup).

### Diagnose
1. Open the Sentry "Issues" view filtered to `level:error` last 30m —
   identify the dominant exception type.
2. Open the Grafana dashboard `linksy-overview` → "5xx by route" panel.
   Note which routes are affected.
3. Correlate with deploy history (`gh release list` or Vercel deploy
   log). Last deploy < 30m before the alert? Strong suspect.
4. Check `/api/health/ready` from outside the cluster:
   `curl -sf https://linksy.example.com/api/health/ready`. A 503 means
   the readiness probe is failing — go to **Alert: ready-probe-503**.

### Mitigate
- If a recent deploy is the suspect: **roll back** via the deploy tool.
  Do not "fix forward" during a paging incident unless the rollback
  itself is broken.
- If the dominant exception is a DB query (Prisma `P2002`, timeout,
  pool exhaustion): see **Alert: db-pool-saturated** for the standard
  query-bisection steps.
- If the dominant exception is a third-party (Stripe, Resend, FCM):
  flip the feature flag for that integration to "degraded" so the route
  short-circuits to 200 with a queued retry.

### Verify
- 5xx rate < 0.5% for 10 consecutive minutes.
- Sentry issue count for the originating release stops climbing.
- Post-mortem opened within 24h.

## Alert: ready-probe-503

**Slug:** `linksy.k8s.ready-probe-503`
**Trigger:** Probe failure count > 0 for any pod for 90s.
**SLO impact:** Critical-tier availability — k8s pulls the pod from the
Service, so users hit fewer healthy backends.

### Detect
- Prometheus alert `kube_pod_status_ready{condition="false"} > 0`.
- External uptime monitor reports 503 on `/api/health/ready`.

### Diagnose
1. `kubectl get pods -l app=linksy -o wide` — find the unhealthy pod.
2. `kubectl logs <pod> --tail=200` — look for `readiness` failure lines
   and the dependency name (db / redis / object_storage / email / push).
3. Hit `/api/health/ready` directly from a healthy pod:
   `kubectl exec <healthy-pod> -- wget -qO- http://<unhealthy>:3000/api/health/ready`.
   The JSON `checks` block points to the failing dependency.

### Mitigate
- **DB failed:** check Postgres primary status, replica lag, max
  connections (`SELECT count(*) FROM pg_stat_activity`). Restart the
  affected pod only after confirming the DB itself is healthy —
  otherwise you just churn pods against a broken upstream.
- **Redis failed:** Redis is optional for liveness but required for
  ready. If Redis is down across the cluster: page the platform team.
  Single-pod issue: restart the pod after confirming `getSharedRedis()`
  connection error in logs.
- **Object storage / email / push:** these are soft dependencies; if
  ready is returning 503 because of them, set
  `READINESS_REQUIRE_<DEP>=0` env on the deployment to downgrade them
  to advisory. Track follow-up to fix the dependency.

### Verify
- `/api/health/ready` returns 200 from outside the cluster for 5
  consecutive minutes.
- All `linksy-*` pods are `Ready` in `kubectl get pods`.

## Alert: db-pool-saturated

**Slug:** `linksy.db.pool-saturated`
**Trigger:** `prisma_pool_active / prisma_pool_size > 0.85` for 3 min.
**SLO impact:** Standard tier — write-path requests start queuing then
time out.

### Detect
- Prometheus alert `db-pool-saturated` (paging).
- Symptom: Sentry `PrismaClientKnownRequestError: P2024` (timed out
  fetching connection from pool) burst.

### Diagnose
1. Grafana → "DB / pool utilization" panel — confirm sustained high
   usage, not a 30-second spike.
2. `SELECT pid, query_start, state, query FROM pg_stat_activity
   WHERE state != 'idle' ORDER BY query_start;` from a psql session
   bound to the primary. Look for queries running > 10s.
3. If the slow queries share a route prefix (e.g. all from `/api/feed`),
   that route owns the regression.

### Mitigate
- Scale `linksy-web` deployment +50% replicas so the per-pod pool
  utilization drops below the threshold while you root-cause.
- If a single query dominates: revert the last commit that touched
  that query or its index, or hot-patch with `LIMIT` / index hint.
- If long-running queries are user-driven (e.g. `?q=` search with no
  bound): apply a temporary nginx / WAF rate-limit to that query
  string until a code fix lands.

### Verify
- Pool utilization < 60% for 10 minutes.
- p99 latency for the regressed route returns to pre-incident baseline.

## Alert: bull-queue-backlog

**Slug:** `linksy.queue.backlog`
**Trigger:** `bull_queue_depth{state="waiting"} > 1000` for 10 minutes.
**SLO impact:** Notification tier — emails / push notifications delivered
late (> 60s target).

### Detect
- Prometheus alert `bull-queue-backlog`.
- Symptom: users report no password-reset / verify email; signup funnel
  drop.

### Diagnose
1. Grafana → "BullMQ / depth" panel — confirm the backlog is growing,
   not a static one-time spike.
2. Check whether the worker process is up:
   `kubectl get pods -l app=linksy-email-worker`.
3. If the worker is up, inspect for errors:
   `kubectl logs -l app=linksy-email-worker --tail=200`.
4. Hit the SMTP / Resend status page — third-party outage will manifest
   as the worker retrying every job.

### Mitigate
- Worker down → restart it; if it crash-loops, roll back the worker
  deployment.
- Third-party outage → drain non-urgent traffic by setting
  `EMAIL_QUEUE_ENABLED=0` for marketing emails; transactional emails
  continue to retry on the queue.
- Pathological job poisoning the queue: identify by job id from logs,
  remove it with `bullmq` CLI:
  `npx bullmq remove linksy-email <jobId>`.

### Verify
- `bull_queue_depth{state="waiting"}` drops below 100 within 30 min.
- Worker logs show steady completion rate ≥ historic baseline.

## Alert: sse-disconnect-spike

**Slug:** `linksy.sse.disconnect-spike`
**Trigger:** `rate(linksy_sse_connections_open[5m])` decreases > 30%
without a deploy event.
**SLO impact:** Standard tier — feed / inbox real-time stalls.

### Detect
- Prometheus alert `sse-disconnect-spike`.
- Symptom: users see stale notification counts; "online" indicators
  stuck.

### Diagnose
1. Was there a deploy in the last 10m? Graceful shutdown drains all
   SSE streams — this is **expected** during a deploy and the alert
   should auto-recover within one Grafana refresh.
2. If no deploy: check the load balancer / ingress for idle-timeout
   misconfiguration (Linksy SSE keepalives every 15s; LB idle timeout
   must be ≥ 60s).
3. Check the SSE topic in question — `notifications.publish_total`
   should keep climbing even when connections drop, because publishers
   are independent of subscribers.

### Mitigate
- LB idle timeout regression → revert the ingress config change.
- Otherwise: it is almost always client-side (browser tab evictions on
  iOS Low Power Mode); confirm in Sentry breadcrumbs that abort comes
  from `req.signal`. No server action needed.

### Verify
- `linksy_sse_connections_open` returns to baseline.
- No clustering of disconnects from a single user-agent (which would
  indicate a client bug — file a follow-up).

## Alert: stripe-webhook-failure

**Slug:** `linksy.stripe.webhook-failure`
**Trigger:** `rate(http_requests_total{route="/api/stripe/webhook",
status_family="5xx"}[5m]) > 0` for 5 minutes.
**SLO impact:** Standard tier — subscription state drifts from Stripe.

### Detect
- Prometheus alert `stripe-webhook-failure`.
- Stripe Dashboard → Developers → Webhooks shows red retries.

### Diagnose
1. Sentry: filter to `transaction:/api/stripe/webhook` last 30m. Common
   causes: signature mismatch (token rotated), Prisma row contention,
   downstream email job rejection.
2. `STRIPE_WEBHOOK_SECRET` rotated recently? Check the secrets vault
   audit log.

### Mitigate
- Signature mismatch → restore previous secret, or update production
  secret to match the new one in Stripe. Do **not** disable signature
  verification, even temporarily.
- Idempotency conflict → safe to ignore the alert if the underlying
  state transition succeeded; Stripe will stop retrying after 3 days.

### Verify
- Webhook success rate ≥ 99% for 15 minutes.
- No Stripe events stuck in "Failed" status in the dashboard.

## Alert: high-uncaught-exception-rate

**Slug:** `linksy.sentry.uncaught-rate`
**Trigger:** Sentry rule — > 50 new events / 5 minutes on a single
issue.
**SLO impact:** Any tier (severity depends on the route).

### Detect
- Sentry alert (paging on `level:error` with grouping).

### Diagnose
1. Click into the issue. Note: release tag (top of issue) — match it
   to the deploy in the CI release notes.
2. Stack trace top frame — that file/line is your starting point.
   Source maps must be uploaded (see [next.config.ts](../next.config.ts))
   for a useful frame; if the frame is in a Webpack chunk, the build
   skipped maps — fix CI, not the issue.

### Mitigate
- Roll back if the release is the proximate cause.
- If the exception is a known third-party (e.g. Sharp / FFmpeg native
  error), set the relevant feature flag to "degraded" and ship a
  follow-up patch within the next sprint.

### Verify
- Issue stops accepting new events for 10 minutes (Sentry "resolved
  in next release" workflow).
- A test reproducer exists in `lib/` or `e2e/`.

---

## Retention cron jobs

These run on schedule and trim the append-only forensic tables so they
don't grow without bound. They are NOT pager rules — they appear here
so on-call knows where to look when a "table size" alert fires from the
DB.

| Path                                        | Default retention | Disable with                          | Schedule (UTC) |
| ------------------------------------------- | ----------------- | -------------------------------------- | -------------- |
| `/api/cron/audit-log-retention`             | 365 days          | `AUDIT_LOG_RETENTION_DAYS=0`           | `0 3 * * *`    |
| `/api/cron/login-attempt-retention`         | 90 days           | `LOGIN_ATTEMPT_RETENTION_DAYS=0`       | `15 3 * * *`   |
| `/api/cron/safety-warning-retention`        | per env           | see route                              | `30 3 * * *`   |
| `/api/cron/messages-cleanup`                | per env (DM TTL)  | n/a                                    | `*/15 * * * *` |

All routes require `Authorization: Bearer $CRON_SECRET` (or `?token=`).
Each one logs `{ scope, deleted, batches, retentionDays, cutoff }` so
Grafana / Loki can chart purge volume by day. If a purge starts deleting
zero rows when it used to delete thousands, the producer side (e.g.
`recordLoginAttempt`) is broken — investigate before assuming the cron
is healthy.

### Manual run

```sh
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  "https://linksy.example.com/api/cron/login-attempt-retention" | jq
```

### Tuning batch size

Each cron uses `DELETE … WHERE id IN (SELECT … LIMIT N)` for bounded
lock duration. Default `N=5000`. Lower it (env `*_RETENTION_BATCH`) on
small instances where a single batch grabs a noticeable lock; raise on
beefier primaries where catching up after a backlog matters more than
lock latency.

---

## When this runbook is wrong

If a step doesn't work, or a new alert fires that isn't here:

1. Mitigate first using your judgment — runbooks lag reality.
2. Within 48 hours, open a PR that adds (or fixes) the section.
3. Update [docs/slo.md](slo.md) if the underlying SLO needs to change.

Owner: platform on-call. Reviewed quarterly alongside SLOs.

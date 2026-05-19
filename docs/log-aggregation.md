# Log Aggregation

Linksy logs as one JSON-per-line on stdout — there is no in-process shipper,
no log file, no buffering layer. Everything downstream is the platform's job:
a sidecar / DaemonSet on Kubernetes, the Datadog Agent on a VM, or a hosting
provider's built-in log capture (Vercel, Fly, Render).

This document captures the contract the application produces and the three
shipper recipes the team has used in production.

## What the app emits

Every log line is a single JSON object written to stdout by `pino`
([lib/logger.ts](../lib/logger.ts)). The baseline fields are always present:

```json
{
  "level": 30,
  "time": "2026-05-14T09:01:23.456Z",
  "service": "linksy",
  "env": "production",
  "release": "8c4f1e2...",
  "requestId": "01HXY...-uuid-...",
  "userId": "ckxyz...",
  "traceparent": "00-<trace>-<span>-01",
  "scope": "http.request.finish",
  "msg": "request.finish",
  "method": "POST",
  "route": "/api/messages",
  "status": 201,
  "duration_ms": 84
}
```

- `requestId`, `userId`, and `traceparent` are injected by
  [lib/request-context.ts](../lib/request-context.ts) via the
  `withMetrics` wrapper, so they correlate logs ↔ Sentry events ↔ OTel
  traces by id.
- `release` matches `SENTRY_RELEASE` so a Sentry "release" page can
  jump straight to Loki / Datadog with `release="<sha>"` filter.
- The `scope` field is the namespace (`http.request.start`,
  `rum.web-vitals`, `xp.grant.*`, …). Use it instead of grepping `msg`.

`PINO_PRETTY=1` in local dev formats lines for human eyes; production
keeps the raw JSON.

## Recipe 1 — Kubernetes + Grafana Loki (promtail DaemonSet)

```yaml
# promtail-config.yaml (excerpt)
scrape_configs:
  - job_name: kubernetes-pods-linksy
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        regex: linksy.*
        action: keep
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
    pipeline_stages:
      - cri: {}
      - json:
          expressions:
            level: level
            requestId: requestId
            userId: userId
            scope: scope
            release: release
            traceparent: traceparent
            status: status
            route: route
      - labels:
          level:
          scope:
          release:
```

Notes:
- We promote `level`, `scope`, `release` to Loki labels (low cardinality).
  We do **not** label `userId`, `requestId`, or `traceparent` — those go
  into the log line body for filtering with `|= "requestId=..."` so we
  don't blow up Loki's index.
- `release` lets a deploy badge in Grafana split before/after a rollout.

Dashboard starters: filter to `{app="linksy", level=~"error|warn"}` and
group by `scope`. The runbook ([docs/RUNBOOK.md](RUNBOOK.md))
references these queries by name.

## Recipe 2 — Datadog Agent (autodiscovery)

Attach an annotation to the deployment:

```yaml
# linksy-web Deployment
metadata:
  annotations:
    ad.datadoghq.com/web.logs: |
      [
        {
          "source": "nodejs",
          "service": "linksy",
          "log_processing_rules": [
            { "type": "multi_line", "name": "json", "pattern": "^\\{" }
          ]
        }
      ]
```

The Agent's log pipeline auto-parses the JSON, so `requestId`, `route`,
`status`, `duration_ms` become facets immediately. Trace correlation
works because pino emits `traceparent` and Datadog's APM links log →
trace by that field.

## Recipe 3 — Direct shipping (serverless / no platform agent)

For environments where you can't run a shipper (Lambda, Cloudflare
Workers, single-VM staging), opt into a direct HTTP transport by
setting `PINO_LOKI_URL` (or implementing a similar env-gated branch in
[lib/logger.ts](../lib/logger.ts)).

This path uses pino's `transport: { target: "pino-loki" }` in a
worker thread. It is **off by default** because:
- Worker threads complicate Next.js standalone bundling.
- The shipping is best-effort — if the HTTP push fails, the line is
  lost (no on-disk buffer).
- The platform-agent path is strictly more reliable.

If you enable it, also set `PINO_LOKI_TIMEOUT=5000` and accept that
crash-loops may drop the last few seconds of logs.

## Sampling and PII

- Logger never serializes `passwordHash`, raw cookies, `Authorization`
  headers, or `email` (we only ever log `userId`). If a new field is
  added to a log line, run it through `lib/logger.ts:serialize()` first
  so an `Error` instance is shaped predictably.
- Sentry's `sendDefaultPii: false` matches this contract — keep them
  in sync when adding a new tag or context field.
- For high-volume routes (SSE heartbeats, `web-vitals` posts), gate
  `logger.info` behind a 1/10 sampler if the line is not actionable.

## Operational checks

- **Alarm:** `rate(linksy_http_requests_total{status_family="5xx"}[5m])`
  rising while logs flat → log pipeline broken. Verify the shipper pod
  is up and that the Loki / Datadog ingest endpoint is reachable.
- **Audit quarterly:** sample 20 production lines; confirm `requestId`
  is present on every request-scope line and `userId` is present on
  every authenticated-request line.

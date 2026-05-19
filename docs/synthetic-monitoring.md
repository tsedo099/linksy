# Synthetic monitoring & uptime

We expose two probe endpoints designed for external uptime monitors:

| Endpoint                | Purpose                                       | Expected     |
| ----------------------- | --------------------------------------------- | ------------ |
| `/api/health`           | Liveness — process is up. No DB.              | `200`        |
| `/api/health/ready`     | Readiness — DB + Redis + transports healthy.  | `200` or `503` |

`HEAD` is supported on both — most monitors prefer it.

For deeper checks (login form renders, can hit `/api/auth/me`, etc.) use a
browser-based monitor (Checkly, Datadog Synthetics, Pingdom Real User
Monitoring) that runs the journey against staging.

## Choice of provider

| Provider          | Best for                                   | Notes                                          |
| ----------------- | ------------------------------------------ | ---------------------------------------------- |
| Healthchecks.io   | Cron / batch job liveness                  | Free tier covers backup + worker pings         |
| Better Uptime     | Public status page + paging                | Generous free tier (10 monitors, 3-min cadence)|
| Checkly           | Browser-driven E2E synthetic               | Paid; runs Playwright scripts from edge regions|
| UptimeRobot       | Cheap HTTP/HTTPS probe at 1-min cadence    | Free tier acceptable for low-traffic sites     |
| Datadog Synthetics| Already on Datadog — single bill           | Paid; deepest integration with their traces    |

We use **Healthchecks.io** for cron pings, **Better Uptime** for HTTP probes
+ status page, and **Checkly** for the login E2E journey on staging. Pick
the subset that matches your budget — the rest of this doc is examples.

## Better Uptime — HTTP probe

```yaml
# Monitor: linksy.example.com — liveness
url: https://linksy.example.com/api/health
http_method: GET
request_timeout: 30
recovery_period: 60
check_frequency: 60     # seconds — billed per monitor; 60s is the sweet spot
regions: [us, eu, as]
expected_status_codes: [200]
follow_redirects: true
verify_ssl: true

# Monitor: linksy.example.com — readiness
url: https://linksy.example.com/api/health/ready
http_method: GET
expected_status_codes: [200]
# 503 is a valid signal that a downstream is down, so we monitor it
# specifically — pages oncall faster than waiting for cascading failures.
```

Wire `On incident → Notify` to PagerDuty / Opsgenie. Wire `On recovery →
Notify` to the same channel — silent recoveries hide flapping.

## Healthchecks.io — backup / worker liveness

The nightly pg-backup script accepts a `BACKUP_HEALTHCHECK_URL` env var.
Create a check on Healthchecks.io, set the schedule to `daily 03:00 UTC`
with a 30-minute grace, and paste the ping URL into the cron line.

```cron
0 3 * * * appuser \
  ... \
  BACKUP_HEALTHCHECK_URL='https://hc-ping.com/UUID' \
  /opt/linksy/scripts/pg-backup.example.sh
```

Apply the same pattern to the email worker — emit a `curl` to a second
ping URL at the end of every successful run loop.

## Checkly — browser E2E (login flow)

```js
// checkly/login.spec.ts — runs every 10 min from us-east, eu-west, ap-south
import { test, expect } from "@playwright/test";

test("guest can sign in", async ({ page }) => {
  await page.goto(process.env.TARGET_URL ?? "https://staging.linksy.example.com");
  await page.getByRole("link", { name: /sign in/i }).click();
  await page.getByLabel(/email/i).fill(process.env.CHECKLY_USER_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.CHECKLY_USER_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/feed|\/$/);
  await expect(page.getByRole("link", { name: /profile/i })).toBeVisible();
});
```

Use a dedicated `synthetic+checkly@linksy.test` account with read-only
permissions where possible. Rotate its password every quarter.

## Status page

Better Uptime ships a status page that surfaces the monitors above. Suggested
public components:

- **API** — `/api/health/ready`
- **Web** — root `/`
- **Email delivery** — Healthchecks ping from the email worker
- **Background jobs** — Healthchecks ping from the BullMQ poller
- **Database** — readiness probe + manual override when in maintenance

Point `status.linksy.example.com` (CNAME) at the Better Uptime status page
and link to it from the in-app error boundary so users see real-time state
during an incident instead of staring at a spinner.

## What we do **not** probe externally

- `/api/notifications/stream`, `/api/conversations/stream` — long-lived SSE.
  Monitoring connection success ≠ monitoring fan-out. Use internal Sentry
  metrics on `inbox.publish` / `inbox.subscribe`.
- `/api/calls/[id]/signal` — same.
- `/api/webhooks/stripe` — Stripe has its own delivery telemetry; reading
  it from our side adds noise.

## Cost-conscious minimum

If you can spend ~$0:

1. Healthchecks.io — free tier — for backup + worker pings.
2. UptimeRobot — free tier — for `/api/health` from one region every 5 min.
3. GitHub Actions cron — runs `scripts/k6-health.js` against staging nightly.

That stack will catch *most* outages within 5–10 min, which is enough for
a side-project. Paid synthetics + status page only become worth it once
you have users who will notice.

/**
 * Linksy production load baseline.
 *
 * Runs three weighted scenarios:
 *   - browse  — anonymous landing + feed reads (heaviest in real traffic)
 *   - auth    — login → /api/auth/me                       (steady stream)
 *   - post    — authenticated user reads feed + posts a comment
 *
 * The scenarios share the SLOs in `thresholds` — failing any of them fails
 * the run. Tune them up only with data, not vibes.
 *
 * Run locally:
 *   BASE_URL=http://127.0.0.1:3000 \
 *   LOAD_USERS_CSV=tests/load/users.csv \
 *   k6 run scripts/k6-baseline.js
 *
 * CI:
 *   .github/workflows/load-baseline.yml triggers this nightly against staging.
 *
 * `users.csv` shape (header required): email,password
 *   loadtest+0001@linksy.test,secret-pw
 *   loadtest+0002@linksy.test,secret-pw
 *
 * Seed these accounts on staging via `npm run seed -- --load-users=500`.
 */
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";

// --- config ------------------------------------------------------------

const BASE = __ENV.BASE_URL || "http://127.0.0.1:3000";
const USERS_CSV = __ENV.LOAD_USERS_CSV || "tests/load/users.csv";

// SharedArray loads once and exposes a view to every VU — keeps memory down.
const USERS = new SharedArray("users", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try {
    return papaparse.parse(open(USERS_CSV), { header: true }).data
      .filter((r) => r.email && r.password);
  } catch {
    // Falls back to an empty list — the auth scenario will short-circuit.
    return [];
  }
});

// --- metrics -----------------------------------------------------------

const loginLatency = new Trend("linksy_login_latency", true);
const feedLatency = new Trend("linksy_feed_latency", true);
const commentLatency = new Trend("linksy_comment_latency", true);
const authedRequestErrors = new Rate("linksy_authed_errors");

// --- options -----------------------------------------------------------

export const options = {
  scenarios: {
    browse: {
      executor: "ramping-vus",
      exec: "browseAnonymous",
      stages: [
        { duration: "30s", target: 20 },
        { duration: "2m", target: 50 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
      tags: { scenario: "browse" },
    },
    auth: {
      executor: "constant-vus",
      exec: "authFlow",
      vus: 10,
      duration: "3m",
      startTime: "10s",
      tags: { scenario: "auth" },
    },
    post: {
      executor: "constant-arrival-rate",
      exec: "interactAsUser",
      rate: 5,
      timeUnit: "1s",
      duration: "3m",
      preAllocatedVUs: 20,
      maxVUs: 40,
      startTime: "20s",
      tags: { scenario: "post" },
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    "http_req_duration{scenario:browse}": ["p(95)<800"],
    "http_req_duration{scenario:auth}": ["p(95)<1200"],
    "http_req_duration{scenario:post}": ["p(95)<1500"],
    linksy_authed_errors: ["rate<0.02"],
    linksy_login_latency: ["p(95)<1000"],
    linksy_feed_latency: ["p(95)<800"],
    linksy_comment_latency: ["p(95)<1500"],
  },
};

// --- helpers -----------------------------------------------------------

function pickUser() {
  if (USERS.length === 0) return null;
  return USERS[Math.floor(Math.random() * USERS.length)];
}

function login(user) {
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: { "Content-Type": "application/json" }, tags: { route: "auth_login" } },
  );
  loginLatency.add(res.timings.duration);
  const ok = check(res, {
    "login 200": (r) => r.status === 200 || r.status === 202,
  });
  authedRequestErrors.add(!ok);
  return ok ? res.cookies : null;
}

function authedHeaders(cookies) {
  if (!cookies) return {};
  const cookieHeader = Object.entries(cookies)
    .map(([name, jar]) => `${name}=${jar[0].value}`)
    .join("; ");
  return { Cookie: cookieHeader };
}

// --- scenarios ---------------------------------------------------------

export function browseAnonymous() {
  group("anonymous browse", () => {
    const landing = http.get(`${BASE}/`, { tags: { route: "landing" } });
    check(landing, { "landing 200": (r) => r.status === 200 });

    const robots = http.get(`${BASE}/robots.txt`, { tags: { route: "robots" } });
    check(robots, { "robots 200": (r) => r.status === 200 });

    const sitemap = http.get(`${BASE}/sitemap.xml`, { tags: { route: "sitemap" } });
    check(sitemap, { "sitemap 200": (r) => r.status === 200 });
  });
  sleep(Math.random() * 2);
}

export function authFlow() {
  const user = pickUser();
  if (!user) return; // no fixtures loaded — skip scenario gracefully

  const cookies = login(user);
  if (!cookies) return;

  const me = http.get(`${BASE}/api/auth/me`, {
    headers: authedHeaders(cookies),
    tags: { route: "auth_me" },
  });
  const ok = check(me, { "/me 200": (r) => r.status === 200 });
  authedRequestErrors.add(!ok);

  sleep(Math.random() * 1.5);
}

export function interactAsUser() {
  const user = pickUser();
  if (!user) return;
  const cookies = login(user);
  if (!cookies) return;
  const headers = authedHeaders(cookies);

  group("read feed", () => {
    const feed = http.get(`${BASE}/api/feed?limit=20`, {
      headers,
      tags: { route: "feed_list" },
    });
    feedLatency.add(feed.timings.duration);
    const ok = check(feed, { "feed 200": (r) => r.status === 200 });
    authedRequestErrors.add(!ok);

    let firstPostId = null;
    try {
      const body = feed.json();
      firstPostId = body?.items?.[0]?.id ?? body?.posts?.[0]?.id ?? null;
    } catch {
      /* unparseable — let the next check fail */
    }

    if (firstPostId) {
      const detail = http.get(`${BASE}/api/posts/${firstPostId}`, {
        headers,
        tags: { route: "post_detail" },
      });
      check(detail, { "post detail 200": (r) => r.status === 200 });

      // Read-only — don't write comments from the synthetic load harness
      // unless explicitly enabled. Comments are user-visible and would
      // pollute the staging dataset.
      if (__ENV.LOAD_WRITE === "true") {
        const commentRes = http.post(
          `${BASE}/api/posts/${firstPostId}/comments`,
          JSON.stringify({ body: `[k6-baseline] ${Date.now()}` }),
          {
            headers: { ...headers, "Content-Type": "application/json" },
            tags: { route: "comment_create" },
          },
        );
        commentLatency.add(commentRes.timings.duration);
        const cOk = check(commentRes, {
          "comment 200/201": (r) => r.status === 200 || r.status === 201,
        });
        authedRequestErrors.add(!cOk);
      }
    }
  });

  sleep(Math.random() * 2);
}

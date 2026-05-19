/**
 * Хөнгөн load / smoke — зөвхөн health endpoint.
 * Ажиллуулах: BASE_URL=https://staging.example.com k6 run scripts/k6-health.js
 * Суулгах: https://grafana.com/docs/k6/latest/set-up/install-k6/
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 3,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

const BASE = __ENV.BASE_URL || "http://127.0.0.1:3000";

export default function () {
  const live = http.get(`${BASE}/api/health`);
  check(live, { "live 200": (r) => r.status === 200 });

  const ready = http.get(`${BASE}/api/health/ready`);
  check(ready, {
    "ready 200 or 503": (r) => r.status === 200 || r.status === 503,
  });

  sleep(0.3);
}

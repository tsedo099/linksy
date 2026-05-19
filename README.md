# diplom (Linksy)

Next.js · PostgreSQL · Prisma олон хэрэглэгчтэй нийгмийн апп.

## Шаардлага

- Node.js **20+** (Docker болон **CI: 22**)
- npm
- PostgreSQL **16** (эсвэл доорх Docker Compose)

## Эхлэх

```bash
cp .env.example .env
```

`.env` дотор `JWT_SECRET`-ийг урт санамсаргүй утгаар (`openssl rand -base64 32`) бөглөөд `DATABASE_URL`-аа тохируулна.

### Сервергүйгээр зөвхөн Postgres (Docker)

```bash
docker compose up postgres -d
```

Дараа нь:

```bash
npm ci
npx prisma migrate deploy
npm run dev
```

Хөтчөөр нээх: [http://localhost:3000](http://localhost:3000)

### App + Postgres (бүтэн Docker)

```bash
docker compose up --build -d
```

Анх удаа схемийг тохируулах (host-оос эсвél контейнер дотор):

```bash
DATABASE_URL=postgresql://linksy:linksy123@localhost:5432/linksy npx prisma migrate deploy
```

## Скрипт

| Скрипт        | Тайлбар        |
|---------------|----------------|
| `npm run dev` | Хөгжүүлэлт     |
| `npm run build` / `npm start` | Production |
| `npm run seed` | Анхны өгөгдөл (`prisma/seed.ts`) |
| `npm run worker:email` | Имэйл дарааллын worker |

## Эрүүл мэнд (k8s / LB)

| Path | Зориулалт |
|------|-----------|
| `GET /api/health` | **Liveness** — процесс амьд эсэх |
| `GET /api/health/ready` | **Readiness** — PostgreSQL холболт |

Жишээ `readinessProbe`:

```yaml
httpGet:
  path: /api/health/ready
  port: 3000
initialDelaySeconds: 10
periodSeconds: 10
```

## CI

GitHub Actions: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — pull request / `main` дээр:

- `npx prisma generate`
- Postgres 16 service ярьж, **`prisma migrate deploy`** үндсэн ба **shadow DB** хоёрт хоёуланд нь хэрэглэнэ
- `prisma migrate diff --exit-code` — `schema.prisma` ⇆ committed migrations хоёрын **drift**-ийг илрүүлнэ
- `typecheck` + `next build`

## Database / Operations

### Connection pool

Prisma 7-ыг [`@prisma/adapter-pg`](https://www.npmjs.com/package/@prisma/adapter-pg)-ээр (node-postgres) ашиглаж байна, тиймээс `DATABASE_URL` дотор `?connection_limit=` ажиллахгүй — pool size-ыг `pg.Pool` env-үүдээр зааж өгнө ([lib/prisma.ts](lib/prisma.ts)):

| Env | Default | Тайлбар |
|-----|---------|---------|
| `DATABASE_POOL_MAX` | `10` | App instance-ын concurrent холболтын дээд хязгаар |
| `DATABASE_POOL_IDLE_TIMEOUT_MS` | `30000` | Сул холболтыг хаах хугацаа |
| `DATABASE_POOL_CONNECT_TIMEOUT_MS` | `5000` | Шинэ холболт татах timeout |

**Pool size sizing rule of thumb**

```
DATABASE_POOL_MAX ≈ (Postgres `max_connections` − admin overhead) / (app replicas)
```

`max_connections` багатай эсвэл олон replica + cron + worker давхар ашигладаг бол **PgBouncer**-ийг урд тавьж pool-ыг **жижиг** болго (5–10 per instance).

### PgBouncer / pgpool заавар

PgBouncer-ыг **transaction pooling** горимд ажиллуулсан үед prepared statement caching ажиллахгүй (statement-ууд session-д baund). Тиймээс:

```ini
# /etc/pgbouncer/pgbouncer.ini
[databases]
linksy = host=postgres port=5432 dbname=linksy

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
server_idle_timeout = 60
```

Холбохдоо app-аас 6432 порт руу заан **`?pgbouncer=true`** flag-ийг URL-д нэмэх шаардлагагүй (`@prisma/adapter-pg` нь rust query engine-г ашиглахгүй учраас) — гэхдээ ETL / migration-уудыг **шууд** Postgres (5432) рүү (PgBouncer тойруулан) илгээх ёстой:

```
DATABASE_URL=postgresql://linksy:***@pgbouncer:6432/linksy   # app instance — transaction pool
SHADOW_DATABASE_URL=postgresql://linksy:***@postgres:5432/linksy_shadow   # migrations — direct
```

`pgpool-II`-г statement-level load balancing-д ашиглах бол `pool_mode = transaction` тохируулга шаардлагагүй боловч replica routing-ыг тохируулсныг шалга.

### N+1 query audit

`PRISMA_LOG_QUERIES=true` орчинд тохируулбал Prisma бүх query-ийг `{model, op, ms}` бүтэцтэй pino-аар log хийнэ. Сэжигтэй pages-ийг гүйлгэж log дамжуулан analyzer-аар явуулна:

```bash
PRISMA_LOG_QUERIES=true npm run dev > dev.log 2>&1
# … тестлэх page-уудыг ачаалаад дараа нь:
npm run audit:n1 -- dev.log
```

Analyzer ([scripts/analyze-prisma-log.ts](scripts/analyze-prisma-log.ts)) 1 секундийн sliding window-д ижил `model.op` 5+ дахин давтагдвал N+1-ийн сэжүүртэй гэж мэдээлж, exit code `1` буцаана. Хязгаарыг `N1_WINDOW_MS` / `N1_THRESHOLD` env-ээр өөрчилнө.

### Migration shadow DB (local)

```bash
createdb -h localhost -U linksy linksy_shadow
SHADOW_DATABASE_URL=postgresql://linksy:linksy123@localhost:5432/linksy_shadow \
  npx prisma migrate dev
```

## Ажиллагаа (production зөвлөмж)

| Хэрэгсэл | Төсөл дээр |
|-----------|------------|
| Алдаа / trace | **Sentry** — `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` (`.env.example` үзнэ) |
| Лог | **pino** — `LOG_LEVEL`; JSON stdout-г CloudWatch / Datadog / Loki агентээр хураана |
| Alert | Sentry notification эсвэл uptime → PagerDuty/Opsgenie webhook |
| Нууц | Орчны хувьсагч эсвэл Vault / Doppler / AWS Secrets Manager |
| DB backup | [`scripts/pg-backup.example.sh`](scripts/pg-backup.example.sh) + [docs/backup-and-restore.md](docs/backup-and-restore.md) — encrypted, offsite, retention-managed |
| Load | [`scripts/k6-baseline.js`](scripts/k6-baseline.js) (auth + feed + post сценари), [`scripts/k6-health.js`](scripts/k6-health.js) (smoke) |
| Uptime / synthetic | [docs/synthetic-monitoring.md](docs/synthetic-monitoring.md) — Better Uptime / Checkly / Healthchecks.io жишээ + status page |
| k8s | [deploy/k8s/](deploy/k8s/) — Kustomize base + dev/staging/prod overlays |

## Environments

The project supports a three-tier deploy: **dev → staging → prod**. Each
tier is its own Kubernetes namespace, fed from a Kustomize overlay.

| Tier      | Namespace        | Host                            | Stripe  | Sentry env  | Replicas (min→max) |
| --------- | ---------------- | ------------------------------- | ------- | ----------- | ------------------ |
| dev       | `linksy-dev`     | `dev.linksy.example.com`        | test    | development | 1 → 2              |
| staging   | `linksy-staging` | `staging.linksy.example.com`    | test    | staging     | 2 → 6              |
| prod      | `linksy-prod`    | `linksy.example.com`            | live    | production  | 2 → 12             |

### Staging — purpose & workflow

Staging is the **last stop before prod**. It runs the same image, same
schema, and (where possible) production-shaped data — but with Stripe in
test mode and a separate Postgres instance. Use it to:

- Smoke-test a release candidate after merge to `main`.
- Reproduce production bugs that don't repro locally.
- Run E2E suites (`npm run test:e2e`) against a real DB + Redis.
- Validate destructive migrations on a real-shaped dataset before prod.

### Deploying

```bash
# Build + push (CI usually does this; the manual form is below)
docker build -t ghcr.io/your-org/linksy:$GIT_SHA .
docker push ghcr.io/your-org/linksy:$GIT_SHA

# Roll out to staging
cd deploy/k8s/overlays/staging
kustomize edit set image ghcr.io/your-org/linksy=ghcr.io/your-org/linksy:$GIT_SHA
kubectl apply -k .
kubectl -n linksy-staging rollout status deploy/linksy-web-staging --timeout=5m

# Diff prod before applying
kubectl diff -k deploy/k8s/overlays/prod
kubectl apply -k deploy/k8s/overlays/prod
```

### Promoting a staging build to prod

1. Confirm staging is healthy: `/api/health/ready` returns 200, error rate
   on Sentry < baseline, key flows pass on the synthetic monitor.
2. Set the same image tag in the prod overlay (`kustomize edit set image`).
3. Open a deploy PR with the kustomize diff; require one reviewer.
4. After merge, CI applies `overlays/prod` and watches the rollout.

### Seeding a staging database

```bash
# Pull a recent prod snapshot (encrypted) → restore into staging Postgres
aws s3 cp s3://linksy-prod-backups/pg/linksy_LATEST.dump.gpg /tmp/
DATABASE_URL='postgresql://...@staging-db:5432/linksy' \
  ./scripts/pg-restore.example.sh /tmp/linksy_LATEST.dump.gpg

# Then scrub PII (run after every staging refresh — script TBD)
psql "$DATABASE_URL" -f scripts/staging-pii-scrub.sql
```

PII scrubbing is mandatory: replace real emails with `staging+<id>@linksy.test`,
null out phone numbers, hash session tokens, and revoke OAuth credentials.
Never let prod data sit on staging unscrubbed.

## Push notifications

Multi-channel dispatcher: [lib/push/](lib/push/) сонгож тухайн `PushSubscription.platform` (`WEB_PUSH | FCM | APNS`)-аар нэг мэдэгдлийг бүх төхөөрөмжид fan-out хийнэ.

| Channel | Файл | Env гол |
|---------|------|---------|
| Web Push (VAPID) | [lib/push/web-push.ts](lib/push/web-push.ts) | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| FCM HTTP v1 (Android) | [lib/push/fcm.ts](lib/push/fcm.ts) | `FCM_SERVICE_ACCOUNT_JSON` *эсвэл* `FCM_PROJECT_ID` + `FCM_CLIENT_EMAIL` + `FCM_PRIVATE_KEY` |
| APNs HTTP/2 (iOS) | [lib/push/apns.ts](lib/push/apns.ts) | `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY`, `APNS_ENV` (`production`/`sandbox`) |

Хэрэв тухайн channel-ын env тохируулагдаагүй бол dispatcher тэр channel-ыг алгасна (subscription үлдэнэ, дараа нь automatically resume хийнэ).

### Категорийн mapping

[lib/push/categories.ts](lib/push/categories.ts) `NotificationKind`-ийг **alerting** vs **silent** хоёрт хуваана:

- **alerting** (`message`, `mention`, `story_collab`) — `apns-priority: 10`, FCM `HIGH`, web push `urgency: high`. Quiet hours-ыг **bypass** хийнэ.
- **silent** (`like`, `comment`, `follow`, `story`, `friend_joined`) — `apns-priority: 5`, FCM `NORMAL`, web push `urgency: low`. Хэрэглэгчийн quiet-hours window-д **алгаслана**.

Web Push-д service worker `silent: true` + `vibrate: undefined`-ээр дуу/чичиргээгүй харуулна ([public/sw.js](public/sw.js)).

### Quiet hours preference

User дээр `quietHoursStart` / `quietHoursEnd` (өдрийн минут 0..1439) ба `quietHoursTimezone` (IANA TZ) хадгалагдана. `PATCH /api/auth/me`-ээр шинэчилнэ:

```bash
curl -X PATCH /api/auth/me -H 'Content-Type: application/json' \
  -d '{"quietHoursStart":1320,"quietHoursEnd":420,"quietHoursTimezone":"Asia/Ulaanbaatar"}'
# 22:00 → 07:00 (Ulaanbaatar) silent-д хүлээгдсэн push алгасах
```

Window нь `start > end` тохиолдолд **midnight wrap** хийнэ. Алгасуулах эсэхийг [lib/push/quiet-hours.ts](lib/push/quiet-hours.ts) хэрэглэгчийн TZ-д minute-of-day тооцоолон шийднэ.

### Subscribe API

`POST /api/push/subscribe` нь **discriminated** body хүлээж авна:

```jsonc
// Web Push
{ "platform": "WEB_PUSH", "endpoint": "https://fcm.googleapis.com/wp/...", "keys": { "p256dh": "...", "auth": "..." } }
// FCM (Android native)
{ "platform": "FCM", "deviceToken": "<registration-token>" }
// APNs (iOS native)
{ "platform": "APNS", "deviceToken": "<hex-device-token>" }
```

`DELETE /api/push/subscribe` нь `endpoint` (web) **эсвэл** `platform` + `deviceToken` (native) хүлээж авна.

Channel-ын backend нь `404` / `410` / FCM `UNREGISTERED` / APNs `BadDeviceToken`-г барьж субскрипшнийг **автоматаар устгана**.

## Encrypted DMs (E2EE)

End-to-end encryption for 1:1 conversations using **Web Crypto API** + **X3DH-style key agreement** + **AES-GCM 256**. The server stores only ciphertext + public key bundles — private keys never leave the user's browser (IndexedDB).

> **⚠️ Threat-model honesty.** This is *not* the Signal Protocol. It provides confidentiality + integrity + forward secrecy *at session establishment* — but **not** per-message forward secrecy (no Double Ratchet), **not** post-compromise security, **not** multi-device, **not** key verification UX. For higher-assurance threat models, swap [lib/e2ee/client.ts](lib/e2ee/client.ts) for [@signalapp/libsignal-client](https://github.com/signalapp/libsignal). Code paths + API surfaces are isolated so the swap is self-contained.

### Архитектур

```
Client A (initiator)                Server                          Client B (responder)
    │                                  │                                   │
    │  POST /api/e2ee/keys             │                                   │
    │ ────────── publish bundle ─────► │ store identity + prekeys          │
    │                                  │                                   │
    │  GET /api/e2ee/keys/B            │                                   │
    │ ◄──── peer bundle (consume OPK)──│                                   │
    │                                  │                                   │
    │  X3DH ⇒ shared secret ⇒ HKDF ⇒ AES-GCM root key                     │
    │                                  │                                   │
    │  POST /api/messages              │                                   │
    │ ─── { ciphertext, header } ───►  │ store ciphertext, no plaintext    │
    │                                  │ ──── SSE convmsg event ────────►  │
    │                                  │                                   │  GET /api/conversations/X
    │                                  │  ◄────── ciphertext ─────────────│  acceptSession() rebuild
    │                                  │                                   │  AES-GCM decrypt → plaintext
```

### Endpoints

| Endpoint | Зориулалт |
|----------|-----------|
| `POST /api/e2ee/keys` | Identity + signed prekey + 0..100 one-time prekeys upload (rotation = full identity replace + prekey purge) |
| `GET /api/e2ee/keys` | Өөрийн bundle + үлдсэн one-time prekey count |
| `GET /api/e2ee/keys/me/status` | `hasIdentity` + remaining/consumed counts + `signedPreKeyAgeDays` |
| `GET /api/e2ee/keys/[userId]` | Peer bundle + atomically consumed one one-time prekey (race-safe transaction) |
| `PATCH /api/conversations/[id]/e2ee` | `{enabled: boolean}` — 1:1 only (group → 501), бүх member-д identity байхыг шаардана (412) |

### Server enforcement

Conversation `e2eeEnabled = true` үед [POST /api/messages](app/api/messages/route.ts):

- **Plaintext-ийг татгалзана** (400 — "This conversation requires end-to-end encrypted messages.")
- **Media URL-ийг татгалзана** (одоогоор encrypt хийгдээгүй)
- Хэрэв client плэйнтекст санамсаргүй илгээвэл `text = ""` болгоно — server-т зөвхөн ciphertext үлдэнэ
- Reply preview-г таслана (server decrypt хийж чадахгүй)

E2EE мессежийн `ciphertext`/`ciphertextHeader`/`encryptedKind` нь Message row-д хадгалагдана. Push notifications нь generic template-ээс үүсдэг учраас (зөвхөн "New message" гэх мэт) plaintext leak байхгүй.

### Client lib

[lib/e2ee/client.ts](lib/e2ee/client.ts):

```ts
import { bootstrapIdentity, initiateSession, encryptForConversation, decryptFromConversation } from "@/lib/e2ee/client";

// First mount on a new device:
const { publish } = await bootstrapIdentity();
await fetch("/api/e2ee/keys", { method: "POST", body: JSON.stringify(publish), credentials: "include" });

// When opening an E2EE conversation for the first time:
const peer = await (await fetch(`/api/e2ee/keys/${peerUserId}`, { credentials: "include" })).json();
const identity = await loadIdentity();
await initiateSession({ identity, peer: peer.bundle, conversationId });

// Send:
const { ciphertext, ciphertextHeader, encryptedKind } = await encryptForConversation({
  conversationId, plaintext,
});
await fetch("/api/messages", {
  method: "POST",
  body: JSON.stringify({ conversationId, ciphertext, ciphertextHeader, encryptedKind }),
});

// Receive (decrypt server response):
const text = await decryptFromConversation({
  conversationId, peerUserId,
  ciphertext: msg.ciphertext, ciphertextHeader: msg.ciphertextHeader, encryptedKind: msg.encryptedKind,
});
```

### Crypto suite

| Зориулалт | Algoritm |
|-----------|----------|
| Identity signing | ECDSA P-256 |
| Identity exchange / signed prekey / one-time prekeys | ECDH P-256 |
| Key derivation | HKDF-SHA-256, info=`linksy-x3dh-root-v1` |
| AEAD | AES-256-GCM, 96-bit random IV per message |

### Limitations (тодорхой)

- **No Double Ratchet** — Per-message forward secrecy байхгүй. Identity / signed-prekey хулгайлагдсан тохиолдолд тухайн сесшний бүх мессежийг decrypt хийнэ.
- **Single device per user** — Шинэ device-аас login хийвэл хуучин identity дарагдаж, өмнөх ciphertext-уудыг decrypt хийх боломжгүй болно.
- **No key verification UI** — Peer key-д TOFU (trust on first use) хандлагатай. Safety numbers / QR verification ороогүй.
- **No backup recovery** — IndexedDB цэвэрлэгдвэл бүх encrypted history алдагдана (server зөвхөн ciphertext хадгалдаг).
- **Media-г encrypt хийдэггүй** — S3 reference-үүд E2EE conversation-уудад татгалзагдана.

### Production шаардлага

1. `npx prisma migrate deploy` — `20260510170000_add_e2ee` миграц
2. UI: settings-д "Set up encrypted messaging" → `bootstrapIdentity()` ажиллуулж keys publish хийнэ
3. UI: conversation settings-д "Enable end-to-end encryption" toggle (412 алдаа гарвал peer-д identity байхгүйг харуулах)
4. UI: incoming/outgoing мессежийг `encryptedKind` талбараар таних → autodecrypt
5. Сүүлийн one-time prekey тоог дугтуйлж хянах: `< ${10}` бол `refillOneTimePreKeys()` дуудаад re-publish

## Disappearing messages

Per-conversation policy that auto-expires messages either after a fixed timer (TIMED) or after the recipient first reads them (AFTER_READ). Snapshot copied onto each `Message` row at send time so changing the conversation policy later does **not** retroactively reschedule old messages.

| Endpoint | Зориулалт |
|----------|-----------|
| `PATCH /api/conversations/[id]/disappearing` | `{mode: "OFF"|"TIMED"|"AFTER_READ", ttlSeconds?: 60..604800}` |
| `POST /api/cron/messages-cleanup` | Хугацаа дууссан мессежийг hard-delete + peer SSE refresh |

Жишээ:

```bash
# 24-hour timer (счётчик при отправке):
curl -X PATCH /api/conversations/$ID/disappearing -H 'Content-Type: application/json' \
  -d '{"mode":"TIMED","ttlSeconds":86400}'

# Snapchat-style "60 seconds after read":
curl -X PATCH /api/conversations/$ID/disappearing -H 'Content-Type: application/json' \
  -d '{"mode":"AFTER_READ","ttlSeconds":60}'

# Disable:
curl -X PATCH /api/conversations/$ID/disappearing -H 'Content-Type: application/json' \
  -d '{"mode":"OFF"}'
```

Защита (defence-in-depth):
- `expiresAt` нь `Message`-д хадгалагдсан тул GET response **серверийн талд шүүгдэнэ** — cron хоцорсон ч expired text recipient рүү очихгүй.
- `expirePolicy/expireAfterSeconds` snapshot нь хуучин policy-р илгээсэн мессежийг тэр хуучнаараа хариуцна.
- Cleanup cron хугацаандаа `delete` event publish хийгээд live UI бол refetch хийнэ.
- Production: `* * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/messages-cleanup`

## Voice / video calling (WebRTC)

1:1 болон group conversation дээр audio/video дуудлага хийх. Backend нь зөвхөн **signaling** (SDP offer/answer + ICE candidate relay) ба lifecycle-ийг хариуцна — media streams нь peer-to-peer.

### Архитектур

```
                    ┌─────────────┐  POST /api/calls            ┌─────────────┐
   initiator ──────►│  Next route │──────────► Postgres (Call) ─┘
                    └──────┬──────┘
                           │ publish state + signal events
                           ▼
                    ┌─────────────┐
                    │ Redis       │   call:state:{id}
                    │ pub/sub     │   call:signal:{id}
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐  GET /api/calls/[id]/signal (SSE)
   recipient ◄─────│  Next route │◄────── stream → EventSource → CallClient
                    └─────────────┘
```

| Endpoint | Зориулалт |
|----------|-----------|
| `POST /api/calls` | Дуудлага үүсгэх (`{conversationId, kind: AUDIO|VIDEO}`); 1:1 only (group → 501), block + message-request gate, **10/min initiator rate-limit**, alerting push, `CALL_INITIATED` audit log |
| `GET /api/calls?conversationId=...&limit=50` | Тухайн conversation-ы call history |
| `GET /api/calls/[id]` | Төлөв авах (RINGING-аас 45 секунд хэтэрсэн бол `MISSED` болгон lazy-expire) |
| `PATCH /api/calls/[id]` | `accept` / `decline` / `cancel` / `end` — `CALL_<status>` audit log + `durationSec` тооцоолно |
| `POST /api/calls/[id]/signal` | SDP offer/answer эсвэл ICE candidate relay; **240/min per-user per-call** rate-limit |
| `GET /api/calls/[id]/signal` | SSE stream (`event: state` ба `event: signal`) — өөрийн publish-ыг echo хийхгүй, 15s heartbeat |
| `GET /api/calls/ice-servers` | STUN/TURN config — TURN ephemeral бол хэрэглэгч тус бүр signed creds |
| `POST /api/cron/calls-cleanup` | Stuck call-уудыг хариуцан цэвэрлэнэ (RINGING > 45s → MISSED, ACCEPTED > 4h → ENDED), peer state events publish хийнэ |

### ICE servers

```bash
# Public STUN-аар хязгаарлагдсан тохиолдол (NAT-ийн ард ажиллахгүй):
STUN_URL=stun:stun.l.google.com:19302

# coturn деплой хийсэн тохиолдол — production:
TURN_URL=turn:turn.example.com:3478?transport=udp
TURN_STATIC_AUTH_SECRET=…           # coturn `--use-auth-secret` mode
TURN_CREDENTIAL_TTL_SECONDS=3600
```

`TURN_STATIC_AUTH_SECRET` тохируулсан үед [/api/calls/ice-servers](app/api/calls/ice-servers/route.ts) нь `username = "<expiry>:<userId>"`, `credential = HMAC-SHA1(secret, username)` гэсэн coturn-compatible ephemeral credential буцаана. Long-lived `TURN_USERNAME` + `TURN_PASSWORD`-г бас дэмжинэ.

### Client-side helper

[lib/webrtc/call-client.ts](lib/webrtc/call-client.ts) — `RTCPeerConnection`-ийг wrap хийж, SSE-ээс ирсэн SDP/ICE-ийг апply хийнэ. Жишээ ашиглалт:

```ts
import { startCall, CallClient } from "@/lib/webrtc/call-client";

// Initiator
const { client } = await startCall({
  conversationId,
  kind: "VIDEO",
  hooks: {
    onLocalStream: (s) => (localVideoEl.srcObject = s),
    onRemoteStream: (s) => (remoteVideoEl.srcObject = s),
    onStateChange: (status) => setRingState(status),
  },
});
// Recipient — UI нь incoming push-аас callId-аа авч:
const recv = new CallClient({ callId, isInitiator: false, kind: "VIDEO", ...hooks });
await recv.connect();
await recv.accept();
```

### UI

[components/call/call-surface.tsx](components/call/call-surface.tsx) — `<CallSurface mode={...} peerLabel="…" />` modal-д суулгана. Outgoing/incoming хоёр горимтой, mute / camera toggle / hangup, lifecycle pill, error display. `CallClient` болон `<video>` элементүүдийг автоматаар wire хийнэ.

### Production шаардлага

| Зүйл | Тайлбар |
|------|---------|
| Postgres migration | [prisma/migrations/20260510150000_add_calls](prisma/migrations/20260510150000_add_calls/migration.sql) deploy хийсэн байх |
| `REDIS_URL` | Олон Next.js instance ажиллуулах үед signaling fan-out шаардлагатай — Redis-гүйгээр signaling нь зөвхөн нэг процессын дотор ажиллана |
| **TURN сервер** (coturn) | NAT-ийн ард байгаа хэрэглэгчдэд P2P холбогдоход **зайлшгүй**. Local: `docker compose up coturn -d` (`docker-compose.yml`-д хүлээн авагдсан). Prod: `--use-auth-secret` mode-д ажиллуулж, `TURN_STATIC_AUTH_SECRET`-аа app-тай sync болгоно |
| Cleanup cron | `*/30 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/calls-cleanup` — RINGING/ACCEPTED stuck rows-ыг цэвэрлэх + peer state event publish |
| Push subscriptions | Incoming-call ringing нь Web Push/FCM/APNs alerting category-р явна. §2.8 push dispatcher идэвхтэй байх |
| `runtime` | `/api/calls/*` бүгд `runtime: "nodejs"` — Edge runtime SSE backpressure / `http2`-д тохирохгүй |
| Group calls | Одоогоор 1:1 only (POST 501). Group support нь SFU (LiveKit / mediasoup) шаардлагатай — дараагийн ажил |

## Лиценз

Хувийн төсөл (`private`).

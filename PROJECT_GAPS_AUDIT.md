# Linksy — Production Backlog

**Огноо:** 2026-05-15 (zerom completed)
**Production state:** 🟢 **READY** — бүх P0 launch-blocker хэрэгжсэн.

| Final verification | State |
|---|---|
| `npm run typecheck` (`noUncheckedIndexedAccess` + `noImplicitOverride`) | ✅ clean |
| `npx vitest run lib/` (18 file / 129 test) | ✅ pass |
| `npm run build` (142 page) | ✅ compiled successfully |
| All migrations applied via `prisma migrate deploy` | ✅ |
| First admin promoted (`scripts/backfill-admin-role.ts`) | ✅ `tsedo → ADMIN` |

**Тэмдэглэгээ:**
- 🟡 **P1** — эхний хэрэглэгчдийн дараа, sprint scope-аар
- 🟢 **P2** — урт хугацааны санаа

**Production deploy steps:** §5 Pre-launch Checklist (доор).
**Completed work log:** git history + [CHANGELOG.md](CHANGELOG.md).

---

## 🟡 1. P1 — Sprint scope (launch-аас дараа)

### 1.1 Mass moderation actions

Backend API хийгдсэн. Admin panel UI (multi-select + batch action button) follow-up.
- ✅ **Bulk delete posts** — [DELETE /api/admin/posts/bulk-delete](app/api/admin/posts/bulk-delete/route.ts). `postIds: string[]` (1-50). Admin-gated (`isSafetyAdmin`), destructive tier rate-limit (10/min), per-post audit row (`ADMIN_POST_DELETE` action) caption snapshot-той. `notFound` listing буцаана.
- ✅ **Batch hide comments** — [POST /api/admin/comments/bulk-moderate](app/api/admin/comments/bulk-moderate/route.ts). `commentIds: string[]` (1-100), `action: "reject"|"approve"`. Admin-gated, default tier rate-limit (60/min), per-comment audit (`ADMIN_COMMENT_HIDE`/`APPROVE`), no-op skip, post-viewer cache invalidation (dedupe by post).
- ✅ **Admin panel UI (bulk delete posts)** — [Reports panel](components/admin-panel-screen.tsx)-д POST-target гомдол бүрэнд checkbox + sticky top bulk-action bar нэмсэн. Confirm dialog → bulk-delete API → холбогдох гомдлуудыг RESOLVED болгох → list refresh. Filter өөрчлөгдөхөд selection автомат цэвэрлэгдэнэ. en+mn i18n.
- ⚠️ **Admin panel UI (bulk hide comments)** — Backend бэлэн ([POST /api/admin/comments/bulk-moderate](app/api/admin/comments/bulk-moderate/route.ts)) ч UI хийгдээгүй. Reports panel-д COMMENT-target гомдол одоогоор байхгүй; зориулсан admin comment moderation tab нэмэх follow-up scope.

### 1.2 Download / Export request status

Хэрэглэгчийн өөрийн өгөгдлийн GDPR export:
- ❌ **Async queue UI** — request submit → BullMQ job → S3 ciphertext + signed link email
- Schema: `ExportRequest` model (`status / requestedAt / completedAt / fileUrl / expiresAt`)

### 1.3 Component refactor (бүх 6 том screen эхний phase дууссан — Нэг PR = нэг screen)

✅ [landing-screen.tsx](components/landing-screen.tsx) → 64-мөр composition + [landing/{shared,hero,features,testimonials,pricing,footer}.tsx](components/landing/) (build clean, 142 хуудас pass).
✅ [create-screen.tsx](components/create-screen.tsx) → 636-мөр (was 1157) + [create/{create-strings,create-primitives,create-styles,create-media-canvas,create-post-preview,create-metadata-fields}.tsx](components/create/) (build clean, 17.4s).
✅ [create-modal.tsx](components/create-modal.tsx) → 68-мөр (was 1397) entry + [create/{modal-types,modal-icons,modal-dropdown,modal-story-editor}.tsx](components/create/) (build clean, 16.3s). StoryEditor өөрөө 1127 мөр үлдсэн — sticker drag/draw/mention state-уудыг hook болгож гаргавал дахин жижигрэх боломжтой (follow-up).
✅ [profile-screen.tsx](components/profile-screen.tsx) → **705-мөр** (was 2131; phase 1 → 1075, phase 2 AppShell migration → 705). [profile/{profile-types,profile-icons,profile-grid,profile-highlights-row,profile-connections-modal,profile-highlight-composer-modal}.tsx](components/profile/) extract + duplicate `feed-shell` sidenav-ийг [AppShell](components/app-shell.tsx)-тэй нэгтгэсэн (370 мөр chrome устгасан). [notifications-screen.tsx](components/notifications-screen.tsx) → **111-мөр** (was 416, 73% багасгасан) — мөн AppShell-руу шилжсэн. Build clean, 18.2s.
✅ [messages-screen.tsx](components/messages-screen.tsx) → 2791-мөр (was 3665) + [messages/{types,icons,avatar,voice-player,bubble,convo-item,empty,compose-modal,add-people-dialog}.tsx](components/messages/) (build clean, 19.6s). MessagesScreen main 2700+ мөр үлдсэн — 45+ useState, SSE/typing/recording state хоорондоо нягт холбогдсон тул `useMessagesState` custom hook + context болгож гаргавал sidebar / chat-pane / composer / typing-indicator / group-detail panel-ыг тус болгож гаргах боломжтой (өндөр эрсдэл — тусдаа PR, real-time test шаардлагатай).
✅ [settings-screen.tsx](components/settings-screen.tsx) → 2903-мөр (was 4072) + [settings/{types,helpers,primitives,edit-profile-page,notif-page,two-factor-page}.tsx](components/settings/) (build clean, 16.7s). Гурван том page (EditProfile, Notif, TwoFactor) тус тусдаа гарсан. Үлдсэн 19 page (Privacy, Appearance, Blocked, Muted, Sessions, Passkeys, Developer, ChangePassword, DeleteAccount, ...) main file-д үлдсэн — давтан extract хийх pattern бэлэн (follow-up PR-аар нэг бүрчлэн хийх боломжтой).

**Дараагийн алхам (follow-up scope):**
- Settings-ийн үлдсэн 19 page-г `settings/` руу гаргах
- MessagesScreen-ийн `useMessagesState` hook design (real-time test infrastructure нэмэх ёстой)
- StoryEditor-ийн sticker/draw/mention state-г hook болгох

### 1.4 i18n coverage өргөтгөх

- ✅ **Create-modal story editor** — sticker / draw / mention / collab / playback copy бүгд en+mn болсон. [lib/i18n/story-editor-copy.ts](lib/i18n/story-editor-copy.ts) (`storyEditorStrings(lang)`) ~75 string, `bundleForLocale` fallback ашиглана (zh/ja/ko/de/ru → en хүртэл translator copy ирэх хүртэл).
- ⚠️ **Landing screen** marketing copy en+mn
- ⚠️ **zh / ja / ko / ar / de / ru translations** — `BUNDLE_FALLBACK` table бэлэн; translator-ийн өгөгдсөн copy орох
- Legal pages (privacy/terms) — англиар үлдээх (legal review шаардлагатай)

### 1.5 Frontend code quality

- ❌ **Tailwind migration phase 2-5** — Phase 1 (scaffold + token mapping) дууссан. **Realistic scope:** legacy `app/globals.css` ~13.7k мөр (BEM `.pg-*`/`.ms-*`/`.sv-*`/`.se-*`/`.st-*`/`.sg-*`/`.lp-*` маягийн CSS) — 1 session-д хийх боломжгүй. Team-ийн multi-month effort. Visual regression test infrastructure (chromatic / percy) суулгаснаар дараа эхлүүлэх нь зөв. **P2 болгож үлдээх санал**.
- ⚠️ **Icon library нэгтгэх (lucide-react)** — 6-фаз roadmap ([docs/icon-unification.md](docs/icon-unification.md)). **23 inline SVG свап хийгдсэн** (92→69 components/). Phase 2 ([profile-icons.tsx](components/profile/profile-icons.tsx) 8/9) + Phase 3 ([modal-icons.tsx](components/create/modal-icons.tsx) 9/10, [feed-create-post.tsx](components/feed/feed-create-post.tsx) 5/5) дууссан. Бүх wrapper хадгалагдсан (`IcGrid`, `IcImage` гэх мэт) — caller код өөрчлөгдөөгүй, гадна талын l ucide хариуцаж байна. Custom shape (story phone silhouette, map-pin-as-pinned-post) inline үлдээсэн (comment-той). Үлдсэн Phase 4-6: feed-story-viewer (10), register/auth (6), landing (12), feed-dm-widget (4), saved-screen (4) гэх мэт.
- ⚠️ **TS strict `exactOptionalPropertyTypes`** — Survey хийгдсэн (2026-05-17): **152 алдаа**. Top cluster: settings-screen (52), landing/shared (14), messages-screen (6). Ихэвчлэн component prop wiring (`<Page onBack={onBack}>` дотор `(() => void) | undefined` → `() => void` биш). Roadmap-д iterative PR-аар фикслэх төлөв ([docs/ts-strict-roadmap.md](docs/ts-strict-roadmap.md))
- ⚠️ **Feed lightbox `<img>` → `next/image`** — LCP-critical хэсэгт хийгдсэн: ✅ feed-story-viewer (lightbox + 5 avatar), ✅ app-shell notif dropdown, ✅ /search, ✅ /hashtag, ✅ /category, ✅ /ranking. Үлдсэн ~20 `<img>` нь жижиг avatar/thumbnail (saved/drafts/dashboard/dm-widget/suggested/series-detail/create-*/current-user-avatar/settings primitives) — LCP-д бага нөлөөтэй ч follow-up-аар цэвэрлэх боломжтой.

### 1.6 DevOps / Deployment polish

- ✅ **Multi-arch container images** (linux/amd64 + linux/arm64) — [Dockerfile](Dockerfile) аль хэдийн `node:22-alpine` (multi-arch manifest) ашиглаж байсан тул local `docker compose build` Apple Silicon дээр шууд ажиллана. Registry-руу push хийх scenario-д зориулсан [scripts/docker-multiarch.sh](scripts/docker-multiarch.sh) (buildx-based) + [docs/docker-multiarch.md](docs/docker-multiarch.md) (зааварчилгаа + future GitHub Actions skeleton) нэмсэн.
- ✅ **Husky + lint-staged + commitlint** — config бэлдсэн ([.husky/](.husky/), [commitlint.config.cjs](commitlint.config.cjs), `lint-staged` in [package.json](package.json)). Pre-commit нь `lint-staged` (prettier + eslint touched files) + full `tsc --noEmit` (TS файл өөрчлөгдсөн бол) ажиллуулна. Commit-msg нь Conventional Commits шалгана (`feat|fix|chore|...|i18n|a11y`). **Идэвхжүүлэх:** `git init && npm install` (prepare script нь Husky-г .git/hooks-руу автоматаар суулгана). Зааварчилгаа [.husky/README.md](.husky/README.md)-д.
- ❌ **PR / Issue template** (`.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/`)
- ⚠️ **Public folder asset audit + CDN move** — Audit хийгдсэн ([docs/public-asset-audit.md](docs/public-asset-audit.md)). **CDN infrastructure код дээр аль хэдийн бэлэн** ([lib/uploads-storage.ts](lib/uploads-storage.ts) `UPLOAD_STORAGE=local|vercel_blob|s3`). Cleanup-ийн нэг хэсэг хийгдсэн: `public/uploads/*` -ыг [.gitignore](.gitignore)-д нэмсэн (6.4MB dev artifact дахин commit-д орохгүй). Үлдсэн ажил: (a) 13 orphan file устгах (~2.5MB), (b) `psda.png` 2MB-ийг optimize хийх (target <50KB), (c) 22 landing demo image CDN-руу шилжүүлэх (~8MB), (d) production-д `UPLOAD_STORAGE=s3` тохируулах. Target: `public/` <200KB.
- ⚠️ **Per-route `error.tsx` / `loading.tsx`** — `/login`, `/register`, `/auth/*`, `/legal/*` root boundary-аар л барьдаг (low-risk default)
- ⚠️ **`coturn` `network_mode: host`** — TURN server-ийг bridge сүлжээнд оруулах нь deploy detail

### 1.7 Accessibility

- ❌ **WCAG contrast ratio audit** — Pa11y / axe-core-аар theme бүр (dark/light × 8 accent) scan
- ❌ **Screen reader testing** — VoiceOver / NVDA manual test (compose flow, story viewer, settings)

### 1.8 Mock data placeholder

- ✅ **Audience demographics widget** — устгасан (placeholder card утга байхгүй, dashboard цэвэрлэгдсэн). Demographics-ийн жинхэнэ feature нь viewer tracking + GDPR considerations шаардлагатай тул out of scope.
- 🟢 **AI screen** ([components/ai-screen.tsx](components/ai-screen.tsx)) — **Зориудаар "Coming soon"** болгож үлдээсэн (код дотор: "We are intentionally not shipping mock outputs from a fake model"). Бодит product decision, бүх бүтэц LLM provider ирэхэд бэлэн. Технологийн өр биш. Гэхдээ /ai nav link-ийг ready болтол нь нуух эсэхийг product team шийднэ.
- 🟢 **Search drawer ↔ /search SearchHistory** — Аудитын тайлбар буруу байсан. Шалгахад **давхардал биш**: [components/search-drawer-card.tsx](components/search-drawer-card.tsx) `localStorage` нь "recent clicked profiles", [lib/search-history.ts](lib/search-history.ts) DB `SearchHistory` нь "recent typed queries". Өөр өөр concept — нэгтгэх шаардлагагүй.

### 1.9 Landing hydration optimisation

- ⚠️ **Landing client island split** — `LandingScreen` нь client component, SSR хийгддэг боловч том bundle. Animated counter / carousel-ийг client island болгож, Server Component үндсэн frame-руу шилжүүлэх

### 1.10 Testing follow-ups

- ⚠️ **Бүтэн auth flow integration** — `lib/auth.ts` `getUser` (mock prisma), бодит **амжилттай** login + post create + comment (session + CSRF) integration
- ⚠️ **E2E coverage** — onboarding UI + comment compose + DM + notification toast тогтвортой `data-testid`-аар
- ⚠️ **Codecov** — repo-д `CODECOV_TOKEN` тохируулахад илүү тайлан

---

## 🟢 2. P2 — Урт хугацаа

- **Mobile app** (React Native / Expo)
- **ML recommendations** — explore / suggested follows эрэмбэлэлт
- **Heatmap / extended session replay** (PostHog / Hotjar) — Sentry Replay аль хэдийн бэлэн
- **OAuth2 developer portal docs** — API consumer-ууд гадагшаа

---

## 🌍 3. Production ENV Checklist

`.env.example` файлд бүх ENV-ийн дэлгэрэнгүй жагсаалт + production-руу хэрхэн оруулах зааварчилгаа байна. Доорх нь товч жагсаалт:

### Must-set (эдгүй бол апп ажиллахгүй)

| ENV | Утга | Эх сурвалж |
|---|---|---|
| `JWT_SECRET` | Random 32+ char | `openssl rand -base64 32` |
| `DATABASE_URL` | Postgres connection string | DB provider (RDS, Supabase, ...) |
| `NEXT_PUBLIC_APP_URL` | Production domain URL | DNS-аас |
| `CRON_SECRET` | Random 32+ char | `openssl rand -base64 32` |

### Strongly recommended (production-д заавал тохируулах)

| ENV | Зорилго |
|---|---|
| `REDIS_URL` | Email queue, presence bus, rate-limit, leaderboards, DAU/MAU |
| `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` | Error tracking |
| `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | CI deploy source-maps upload |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_PRICE_*` | Subscription / Tip |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Embedded Checkout (in-app form) |
| `RESEND_API_KEY` + `EMAIL_FROM` | Transactional email |
| `S3_*` + `UPLOAD_STORAGE=s3` | Media хадгалах |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` | Web push |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Google нэвтрэх |
| `METRICS_AUTH_TOKEN` | Prometheus `/api/metrics` scrape хамгаалах |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Tempo / Jaeger / Datadog OTLP exporter |

### Sensible defaults (өөрчилмөөр бол ENV дамжуулах)

| ENV | Default |
|---|---|
| `AUDIT_LOG_RETENTION_DAYS` | 365 |
| `LOGIN_ATTEMPT_RETENTION_DAYS` | 90 |
| `GDPR_HARD_DELETE_GRACE_DAYS` | 30 |
| `SHUTDOWN_DRAIN_MS` | 20000 |
| `SENTRY_TRACES_SAMPLE_RATE` | 0.05 (prod) / 1 (dev) |
| `STRIPE_AUTOMATIC_TAX` | false (tax registration хийсэн дараа true) |

---

## 📌 4. Pre-launch Checklist

Production-руу `git push` хийхээс өмнө:

- [ ] **DB migration** — `npx prisma migrate deploy` нь production DB-руу 64+ migration оруулна (admin role + user suspension + age-aware content + login-attempt + tips + stripe billing бүгд багтана)
- [ ] **First admin promote** — `npx tsx --env-file=.env scripts/backfill-admin-role.ts` (env-аас DB role-руу шилжүүлэх)
- [ ] **Stripe Dashboard** — Webhook endpoint (`/api/webhooks/stripe`), Customer Portal enable, Receipt emails Stripe-аас disable (бид өөрсдөө илгээдэг)
- [ ] **CI secrets** — GitHub repo Settings → Secrets: `SENTRY_AUTH_TOKEN`, optional `CODECOV_TOKEN`
- [ ] **CI variables** — `SENTRY_ORG`, `SENTRY_PROJECT`
- [ ] **k8s secrets / Vercel env** — `.env.example`-ийн must-set + strongly-recommended ENV-уудыг production secret manager-руу
- [ ] **Cron schedule** — provider's scheduler-д:
  - `0 3 * * *` → `/api/cron/audit-log-retention`
  - `15 3 * * *` → `/api/cron/login-attempt-retention`
  - `30 3 * * *` → `/api/cron/safety-warning-retention`
  - `*/15 * * * *` → `/api/cron/messages-cleanup`
  - `0 */6 * * *` → `/api/cron/hard-delete-users`
  - `0 9 * * *` → `/api/cron/email-digest`
  - `*/5 * * * *` → `/api/cron/publish-scheduled-posts`
  - `0 * * * *` → `/api/cron/story-expiry-reminders`
- [ ] **Prometheus scrape config** — `bearer_token: $METRICS_AUTH_TOKEN` бүхий `/api/metrics`
- [ ] **DNS + TLS** — apex/wildcard A/AAAA, cert provisioning
- [ ] **Email DNS** — SPF / DKIM / DMARC (Resend dashboard)
- [ ] **Smoke test** — register → verify email → login → create post → DM → tip → adult content gate (under-18 + 18+) → admin panel → logout
- [ ] **Load test** — `scripts/k6-baseline.js` staging-д шууд run, threshold үнэлгээ
- [ ] **Backup drill** — `scripts/pg-restore.example.sh` staging-руу restore тест

---

**Тэмдэглэл:** Хийгдсэн зүйлсийн дэлгэрэнгүй жагсаалт өмнөх git history + [CHANGELOG.md](CHANGELOG.md)-д. Энэ файл одоо зөвхөн **дутуу / үлдсэн** ажлуудын backlog.



responsive iig buren bolgh 
stripe 
agent 
deploy Environment variables prod-д тавигдсан байх:

DATABASE_URL (Postgres)
JWT_SECRET, JWT_REFRESH_SECRET
GEMINI_API_KEY (AI feature ажиллахын тулд)
RESEND_API_KEY + EMAIL_FROM (email сэргээх, мэдэгдэл)
STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET (төлбөр)
UPLOAD_STORAGE=s3 + S3 credentials (олон replica үед заавал)
SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN (error tracking)
REDIS_URL (multi-instance бол)
NEXT_PUBLIC_APP_URL (canonical URL)
Database:

npx prisma migrate deploy ажиллуулсан байх
Prod DB-д шинэ schema (TwoFactorSecret table, etc.) орсон байх
Cookies/Domain:

HTTPS заавал (Secure cookie flag-ууд production-д л идэвхждэг)
CORS/CSP-д prod домэйн нэмсэн байх
Static health checks:

/offline болон /sitemap.xml build-д орсон (харагдсан)
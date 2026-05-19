# Secrets rotation runbook (Linksy)

Зорилго: `JWT_SECRET` болон бусад нууцыг аюулгүй, төлөвлөгөөтэй солих. Энэ төсөлд access JWT нь **15 мин**, refresh нь **opaque cookie + Postgres** ([lib/jwt.ts](../lib/jwt.ts), [lib/refresh-session.ts](../lib/refresh-session.ts)).

---

## 1. JWT_SECRET — чухал тэмдэглэл

- **Access JWT** (`linksy_token`) зөвхөн `JWT_SECRET`-аар гаргагдаж/баталгаажна. Нууц солигдвол **хуучин access токен бүгд хүчингүй** болно.
- **Refresh токен** JWT биш тул `JWT_SECRET`-аас үл хамаарна. Хэрэглэгчид `linksy_refresh` хүчинтэй байвал дараагийн API дуудлагаар [getUser](../lib/auth.ts) refresh-ээр **шинэ access** гаргаж өгнө (шинэ нууцтай).
- **2FA challenge** JWT мөн ижил `JWT_SECRET` ашиглана ([signTwoFactorChallenge](../lib/jwt.ts)). Нууц солих үед идэвхтэй 2FA урсгал алдаа өгч болно — хэрэглэгч дахин нэвтэрнэ.
- `getJwtSecret()` нь процессын **анхны уншилтыг кэшилдэг** — `.env` өөрчилсөн ч **процесс дахин эхлүүлэхгүйгээр** шинэ нууц ажиллахгүй.

**Дүгнэлт:** Ихэнх хэрэглэгчид **бүрэн downtime шаардахгүй**; гэхдээ бүх app instance **нэгэн зэрэг** шинэ нууцтай байх ёстой (доор).

---

## 2. Олон replica / load balancer — яагаад «нэгэн зэрэг» вэ?

Ижил ачааллын доор хуучин `JWT_SECRET`-тай pod болон шинэ нууцтай pod холилдвол:

- Хэрэглэгч хуучин access-аар шинэ pod руу орвол **401**.
- Дараагийн хүсэлт хуучин pod руу орвол **амжилттай** гэх мэт **тогтворгүй** дүр зураг гарна.

**Шийдэл:** Rolling deploy-ийн оронд **бүх replica-д нэгэн зэрэг** шинэ орчин оруулна:

- **Kubernetes:** `kubectl rollout restart deployment/...` эсвэл шинэ ReplicaSet бүрэн бэлэн болсны дараа хуучин pod-уудыг хурдан солих (strategies: `Recreate` эсвэл blue/green **нэг нууцтай** хоёр хувилбар).
- **Docker Compose / single host:** контейнерүүдийг нэг командаар дахин асаана.
- **Vercel / PaaS:** нэг deployment = бүх функц ижил env — ихэвчлэн автоматаар зөв.

---

## 3. Төлөвлөгөөт JWT_SECRET солих (бага саатал)

### 3.1 Өмнө нь

1. **Цонх сонгох:** access token хамгийн ихдээ **15 мин** ([ACCESS_MAX_AGE_SEC](../lib/auth-cookies.ts)) — шинэ хэрэглэгчийн урсгал багасах цаг (жишээ шөнө/амралт).
2. Шинэ утга үүсгэх: `openssl rand -base64 48` (эсвэл 32+ байт).
3. Secret manager / CI-д шинэ утгыг **хадгалах**, Git-д битгий оруулна.
4. (Сонголтот) Хэрэглэгчдэд «нэвтрэлт түр саатах боломжтой» мэдэгдэл.

### 3.2 Солих алхам

1. Орчинд `JWT_SECRET` = **шинэ** утга (хуучин устгана эсвэл түүхэнд үлдээн зөвхөн шинийг идэвхжүүлнэ).
2. **Бүх** Next.js / Node процессийг **нэгэн зэрэг** дахин эхлүүлнэ (бүх replica ижил env).
3. Шалгах: нэвтрэлт, `/api/auth/me`, refresh (access дууссаны дараа) ажиллаж байгаа эсэх.

### 3.3 Дараа нь

1. Хуучин `JWT_SECRET`-ыг secret manager-аас **архивлаад устгах** (шаардлагатай бол).
2. Инцидент биш бол бүх session цуцлах шаардлагагүй — хэрэглэгчид refresh-ээр шинэ access авна.

---

## 4. Аюулгүй байдлын инцидент (compromise)

Хэрэв `JWT_SECRET` алдсан гэж үзвэл:

1. **Шууд** шинэ `JWT_SECRET` гаргаж, **§3.2**-ийн дагуу бүх инстанс дээр нэвтрүүлнэ.
2. (Зөвлөмж) **Бүх session + refresh цуцлах:** Postgres дээр `Session` / `RefreshToken` устгах эсвэл `revokedAt` тохируулах — бүх хэрэглэгч дахин нэвтэрнэ. SQL жишээ (удирдлагаар баталгаажуулсны дараа):

   ```sql
   -- Жишээ: бүх refresh хүчингүй болгох (аппын логикт тохируулан нарийвчилна)
   UPDATE "RefreshToken" SET "revokedAt" = NOW() WHERE "revokedAt" IS NULL;
   ```

3. Хэрэглэгчдэд нууц солихыг зөвлөнө.

---

## 5. Downtime бүсэд солих (хатуу цонх)

Дараах тохиолдолд **түр maintenance** зөвтэй:

- Олон кластер / төвөгтэй сүлжээнд «нэгэн зэрэг» солих амжилтгүй.
- Session бүгдийг цэвэрлэх шаардлагатай инцидент.
- Миграци + нууц зэрэг нэг дор хийх.

**Алхам:**

1. Maintenance горим (reverse proxy / static хуудас): «Түр засварлаж байна».
2. Хэрэглэгчийн идэвхтэй холболтыг багасгах (сонголтот).
3. `JWT_SECRET` (ба шаардлагатай бусад env) шинэчилнэ.
4. Бүх апп instance дахин эхлүүлнэ.
5. Health: `/api/health`, `/api/health/ready`.
6. Maintenance хаана.

---

## 6. Бусад нууцууд (товч)

| Нууц | Солиход анхаарах |
|------|-------------------|
| `DATABASE_URL` | Connection pool, migration, **богино саатал**; read replica бол тусад нь төлөвлөгөө. |
| `CRON_SECRET` | Шинэ утга → cron job-ийн `Authorization` header шинэчлэх. Хуучин хэвээр үлдээвэл зөвхөн хуучин header ажиллана. |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard-оос endpoint бүрт **өөрийн** signing secret; солисон ч webhook дахин тохируулах. |
| `REDIS_URL` | Pub/sub/SSE түр сална; Redis солиход бүх app дахин холбогдоно. |
| VAPID / FCM / APNS | Push дахин бүртгэх / клиент subscribe шаардлагатай болж болно. |

---

## 7. Холбоотой файлууд

- [lib/jwt.ts](../lib/jwt.ts) — `JWT_SECRET`, access + 2FA challenge.
- [lib/auth-cookies.ts](../lib/auth-cookies.ts) — access/refresh max-age.
- [.env.example](../.env.example) — env жагсаалт.

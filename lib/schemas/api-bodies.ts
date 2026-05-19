import { z } from "zod";
import { isAppLanguage } from "@/lib/language";
import { newPasswordSchema } from "@/lib/password-policy";

export const loginBodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const registerBodySchema = z.object({
  username: z.string().min(1),
  email: z.string().min(1),
  password: newPasswordSchema,
  displayName: z.string().min(1),
  preferredLanguage: z
    .string()
    .optional()
    .refine((value) => value === undefined || isAppLanguage(value), { message: "Invalid language." }),
  /** Client sends `Intl.DateTimeFormat().resolvedOptions().timeZone` for default quiet hours. */
  timezone: z.string().min(1).max(64).optional(),
  /**
   * Date of birth (ISO YYYY-MM-DD). Required at signup but **not** age-gated:
   * any year is accepted as long as it's between 1900 and today. The value
   * exists only to drive adult-content visibility (see `lib/age.ts`).
   */
  birthDate: z
    .string()
    .min(1)
    .refine(
      (value) => {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return false;
        if (d.getTime() > Date.now()) return false;
        if (d.getUTCFullYear() < 1900) return false;
        return true;
      },
      { message: "Invalid birthDate." },
    ),
  /** Self-declared gender. Maps 1:1 to the Prisma `UserGender` enum. */
  gender: z.enum(["FEMALE", "MALE", "NON_BINARY", "UNDISCLOSED"]),
});

export const requestResetBodySchema = z.object({
  email: z.string().min(1),
});

export const verifyEmailBodySchema = z.object({
  token: z.string().min(1),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  newPassword: newPasswordSchema,
});

export const changePasswordBodySchema = z.object({
  /** Required when the account already has a password; omit for Google-only accounts setting a first password. */
  currentPassword: z.string().optional(),
  newPassword: newPasswordSchema,
});

export const twoFactorVerifyBodySchema = z.object({
  code: z.string().min(1),
  challengeToken: z.string().min(1).optional(),
});

export const twoFactorBackupCodesBodySchema = z.object({
  code: z.string().min(1),
});

export const twoFactorDisableBodySchema = z.object({
  code: z.string().min(1),
});

export const passkeyRegistrationVerifySchema = z.object({
  challengeToken: z.string().min(1),
  response: z.unknown(),
  name: z.string().max(80).optional(),
});

export const passkeyAuthenticationOptionsSchema = z.object({
  usernameOrEmail: z.string().min(1).max(240).optional(),
  challengeToken: z.string().min(1).optional(),
});

export const passkeyAuthenticationVerifySchema = z.object({
  challengeToken: z.string().min(1),
  response: z.unknown(),
});

export const passkeyUpdateSchema = z.object({
  name: z.string().max(80).nullable().optional(),
});

const oauthScopeSchema = z.enum([
  "profile:read",
  "posts:read",
  "posts:write",
  "media:upload",
  "notifications:read",
]);

export const oauthApplicationCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional(),
  homepageUrl: z.string().url().optional().or(z.literal("")),
  redirectUris: z.array(z.string().url()).min(1).max(10),
  scopes: z.array(oauthScopeSchema).min(1).max(10),
  clientType: z.enum(["CONFIDENTIAL", "PUBLIC"]).optional(),
});

export const oauthApplicationUpdateSchema = oauthApplicationCreateSchema.partial().extend({
  revoked: z.boolean().optional(),
});

export const oauthAuthorizeSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  response_type: z.literal("code"),
  scope: z.string().optional(),
  state: z.string().max(1024).optional(),
  code_challenge: z.string().min(43).max(128).optional(),
  code_challenge_method: z.enum(["S256", "plain"]).optional(),
});

export const oauthConsentSchema = oauthAuthorizeSchema.extend({
  action: z.enum(["approve", "deny"]),
});

export const oauthTokenSchema = z.object({
  grant_type: z.enum(["authorization_code", "refresh_token"]),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  code: z.string().optional(),
  redirect_uri: z.string().url().optional(),
  code_verifier: z.string().min(43).max(128).optional(),
  refresh_token: z.string().optional(),
});

export const mePatchSchema = z.object({
  avatarUrl: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  displayName: z.string().optional(),
  /** Legacy: category picks removed — if sent, clears stored preferences. */
  categories: z.unknown().optional(),
  preferredCategories: z.unknown().optional(),
  showFollowers: z.boolean().optional(),
  showFollowing: z.boolean().optional(),
  allowMessageRequests: z.boolean().optional(),
  allowGroupInvites: z.boolean().optional(),
  allowStoryReplies: z.boolean().optional(),
  defaultAllowComments: z.boolean().optional(),
  defaultHideLikes: z.boolean().optional(),
  preferredLanguage: z
    .string()
    .optional()
    .refine((value) => value === undefined || isAppLanguage(value), { message: "Invalid language." }),
  /** Minute-of-day (0..1439) inclusive start of the quiet-hours window. `null` clears it. */
  quietHoursStart: z.number().int().min(0).max(1439).nullable().optional(),
  /** Minute-of-day (0..1439) exclusive end of the quiet-hours window. `null` clears it. */
  quietHoursEnd: z.number().int().min(0).max(1439).nullable().optional(),
  /** IANA timezone the window is anchored to (e.g. `Asia/Ulaanbaatar`). `null` clears it. */
  quietHoursTimezone: z.string().min(1).max(64).nullable().optional(),
  /**
   * Self-declared date of birth. **Not required to create an account** — used
   * only to gate how adult-content messages are rendered (under-18: server
   * redacts; 18+ or unset: client confirm dialog). Accepts ISO-8601 date
   * strings (YYYY-MM-DD). `null` clears the stored value.
   */
  birthDate: z
    .string()
    .nullable()
    .optional()
    .refine(
      (value) => {
        if (value === undefined || value === null || value === "") return true;
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return false;
        if (d.getTime() > Date.now()) return false; // future dates rejected
        if (d.getUTCFullYear() < 1900) return false; // sanity bound
        return true;
      },
      { message: "Invalid birthDate (use YYYY-MM-DD, not in the future)." },
    ),
  /** Skip the "show adult content?" reveal dialog (adults only). Default false. */
  autoRevealAdultContent: z.boolean().optional(),
});

export const meDeleteBodySchema = z.object({
  confirmation: z.string().min(1),
});

export const notificationPrefsPutSchema = z
  .object({
    prefs: z.record(z.string(), z.unknown()).optional(),
    digest: z.object({ cadence: z.string() }).optional(),
  })
  .refine((b) => b.prefs != null || b.digest != null, { message: "Provide prefs and/or digest." });

export const notificationsReadSchema = z.object({
  ids: z.array(z.string()).optional(),
});

export const commentCreateSchema = z.object({
  text: z.string(),
});

export const moderationPreviewSchema = z.object({
  text: z.string().max(2000),
});

export const postCreateSchema = z
  .object({
    mediaUrls: z.array(z.string()).optional(),
    /** Optional per-item descriptions for screen readers (may be empty strings). */
    mediaAltTexts: z.array(z.string()).max(20).optional(),
    caption: z.string().max(2200).optional(),
    location: z.string().optional(),
    audience: z.string().optional(),
    poll: z.unknown().optional(),
    scheduledAt: z.string().optional(),
    allowComments: z.boolean().optional(),
    hideLikes: z.boolean().optional(),
    /** Co-author usernames (lowercase match); max 5; only existing non-deactivated users, excludes self. */
    collaboratorUsernames: z.array(z.string().min(1).max(32)).max(5).optional(),
    moderateComments: z.boolean().optional(),
    seriesId: z.string().min(1).optional(),
    newSeriesTitle: z.string().min(1).max(200).optional(),
    /** Optional BCP-47 short tag; otherwise detected from caption on the server. */
    captionLang: z.enum(["en", "mn", "zh", "ja", "ko", "de", "ru"]).optional(),
    /**
     * Author's explicit "contains adult content" toggle. Server ORs this with
     * the keyword scorer; either source flags the post. Under-18 authors are
     * rejected at the API layer regardless of which source set it.
     */
    containsAdultContent: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const urls = (data.mediaUrls ?? []).filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
    const alts = data.mediaAltTexts ?? [];
    if (alts.length > urls.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Too many alt entries for the number of media items.",
        path: ["mediaAltTexts"],
      });
      return;
    }
    alts.forEach((a, i) => {
      const t = (a ?? "").trim();
      if (t.length > 2000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Alt text must be 2000 characters or less.",
          path: ["mediaAltTexts", i],
        });
      }
    });
  });

export const commentModerateSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

export const postSeriesCreateSchema = z.object({
  title: z.string().min(1).max(200),
});

export const postSeriesUpdateSchema = z.object({
  title: z.string().min(1).max(200),
});

export const postSeriesReorderSchema = z.object({
  orderedPostIds: z.array(z.string().min(1)).min(1).max(200),
});

export const postDraftUpsertSchema = z.object({
  caption: z.string().max(2200).optional().nullable(),
  mediaUrls: z.array(z.string().min(1)).max(20).optional(),
  mediaAltTexts: z.array(z.string()).max(20).optional(),
  audience: z.enum(["PUBLIC", "FRIENDS", "CLOSE_CIRCLE"]).optional(),
});

export const messageCreateSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().optional(),
  mediaUrl: z.string().nullable().optional(),
  replyToId: z.string().nullable().optional(),
  /** When the conversation has E2EE enabled, send a ciphertext blob instead of `text`. */
  ciphertext: z.string().min(1).max(64 * 1024).optional(),
  ciphertextHeader: z.string().min(1).max(8 * 1024).optional(),
  encryptedKind: z.string().min(1).max(64).optional(),
  /**
   * Sender's explicit "this message contains adult content" toggle. The server
   * ORs this with the keyword scorer in `lib/adult-content.ts`; either signal
   * sets `Message.containsAdultContent = true` and gates rendering on the
   * recipient side.
   */
  containsAdultContent: z.boolean().optional(),
});

export const conversationBlockSchema = z.object({
  blocked: z.boolean().optional(),
});

export const conversationCreateSchema = z.object({
  targetUserId: z.string().optional(),
  userIds: z.array(z.string()).optional(),
  name: z.string().optional(),
  isGroup: z.boolean().optional(),
  storyReply: z.boolean().optional(),
});

export const conversationAcceptSchema = z.object({
  conversationId: z.string().min(1),
});

export const memberRoleSchema = z.object({
  role: z.string().min(1),
});

export const conversationPinSchema = z.object({
  messageId: z.string().optional(),
});

export const typingSchema = z.object({
  typing: z.boolean().optional(),
});

export const messageEditSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const messageReactSchema = z.object({
  emoji: z.string().trim().min(1).max(20),
});

export const storyReactSchema = z.object({
  emoji: z.string().trim().min(1).max(20),
});

export const pollVoteSchema = z.object({
  optionIndex: z.number().int().min(0),
});

export const storyCreateSchema = z.object({
  mediaUrl: z.string().optional(),
  /** Required when uploading a photo/video (not for gradient-only stories). */
  mediaAlt: z.string().max(2000).optional(),
  caption: z.string().optional(),
  audience: z.string().optional(),
  poll: z.unknown().optional(),
  location: z.string().optional(),
  music: z.unknown().optional(),
  mentionedUserIds: z.array(z.string()).optional(),
  collaboratorIds: z.array(z.string()).optional(),
  playbackMode: z.string().optional(),
  /** Same semantics as `postCreateSchema.containsAdultContent`. */
  containsAdultContent: z.boolean().optional(),
});

export const storyHighlightSchema = z.object({
  highlightId: z.string().optional(),
  title: z.unknown().optional(),
  setAsCover: z.boolean().optional(),
});

export const highlightCreateSchema = z.object({
  title: z.string(),
  storyIds: z.array(z.string()),
  coverStoryId: z.string().optional(),
  coverUrl: z.string().optional(),
});

export const reportBodySchema = z.object({
  reason: z.string().optional(),
  details: z.string().optional(),
});

export const muteUserSchema = z.object({
  muted: z.boolean().optional(),
  mutePosts: z.boolean().optional(),
  muteStories: z.boolean().optional(),
  /** When true, suppress in-app + push notifications from this user (messages / requests still allowed). */
  muteNotifications: z.boolean().optional(),
});

export const targetIdBodySchema = z.object({
  targetId: z.string().min(1),
});

export const connectionsDeleteSchema = z.object({
  type: z.enum(["followers", "following"]),
  targetId: z.string().min(1),
});

const webPushSubscribeSchema = z.object({
  platform: z.literal("WEB_PUSH").default("WEB_PUSH"),
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const nativePushSubscribeSchema = z.object({
  platform: z.enum(["FCM", "APNS"]),
  /** FCM registration token / APNs device token (hex). */
  deviceToken: z.string().min(8).max(4096),
});

export const pushSubscribeSchema = z.union([webPushSubscribeSchema, nativePushSubscribeSchema]);

export const postShareSchema = z.object({
  /** Optional inline comment (quote-share). Omit for a plain repost. */
  comment: z.string().trim().min(1).max(500).optional(),
});

export const verificationRequestSchema = z.object({
  category: z.enum(["CREATOR", "BUSINESS", "PUBLIC_FIGURE", "GOVERNMENT", "JOURNALIST", "OTHER"]),
  reason: z.string().trim().min(20).max(2000),
  supportingUrls: z.array(z.string().url()).max(5).optional(),
});

export const feedbackSchema = z.object({
  category: z.enum(["BUG", "FEATURE_REQUEST", "PRAISE", "COMPLAINT", "OTHER"]),
  message: z.string().trim().min(10).max(4000),
  /** Page path the user submitted from (no query string — strip on the client). */
  contextUrl: z.string().max(500).optional(),
  appVersion: z.string().max(64).optional(),
});

export const callStartSchema = z.object({
  conversationId: z.string().min(1),
  kind: z.enum(["AUDIO", "VIDEO"]),
});

export const callActionSchema = z.union([
  z.object({
    action: z.enum(["accept", "decline", "cancel", "end"]),
  }),
  z.object({
    action: z.literal("attach-recording"),
    recordingUrl: z.string().min(1).max(1024),
    recordingMimeType: z.string().min(1).max(128),
    recordingDurationSec: z.number().int().min(1).max(60 * 60 * 6),
  }),
]);

export const callSignalPostSchema = z.object({
  kind: z.enum(["offer", "answer", "ice-candidate"]),
  /** Opaque WebRTC payload — server only relays it. */
  payload: z.unknown(),
});

export const disappearingPolicySchema = z
  .object({
    mode: z.enum(["OFF", "TIMED", "AFTER_READ"]),
    /** TTL in seconds, 60..604800. Required when mode != OFF. */
    ttlSeconds: z.number().int().min(60).max(7 * 24 * 60 * 60).nullable().optional(),
  })
  .refine(
    (b) => b.mode === "OFF" || (typeof b.ttlSeconds === "number" && b.ttlSeconds >= 60),
    { message: "ttlSeconds is required when enabling disappearing messages." },
  );

// --- E2EE ---------------------------------------------------------------

/**
 * Base64-encoded SPKI / signature blobs from the client. Length-bounded
 * defensively — Web Crypto P-256 SPKI is ~91 bytes (122 base64 chars), and
 * ECDSA P-256 raw signatures are 64 bytes (88 base64 chars), so 256 chars
 * comfortably accommodates both with future-proof padding.
 */
const e2eeBase64 = z.string().min(40).max(256).regex(/^[A-Za-z0-9+/=_-]+$/);

const e2eePreKeySchema = z.object({
  keyId: z.number().int().min(0).max(2 ** 31 - 1),
  publicKey: e2eeBase64,
});

export const e2eePublishKeysSchema = z.object({
  identitySigningKey: e2eeBase64,
  identityExchangeKey: e2eeBase64,
  signedPreKey: z.object({
    keyId: z.number().int().min(0).max(2 ** 31 - 1),
    publicKey: e2eeBase64,
    /** ECDSA signature over the signed prekey, base64. */
    signature: e2eeBase64,
    createdAt: z.string().datetime().optional(),
  }),
  /** Initial pool of one-time prekeys. Capped to 100 per request. */
  oneTimePreKeys: z.array(e2eePreKeySchema).min(0).max(100),
});

export const e2eeConversationFlagSchema = z.object({
  enabled: z.boolean(),
});

/**
 * Ciphertext attached to a message when the conversation has E2EE enabled.
 * `text` should be empty or "🔒"; server enforces and replaces with "" so
 * search/notifications never leak any plaintext.
 */
export const e2eeCiphertextSchema = z.object({
  ciphertext: z.string().min(1).max(64 * 1024),
  /** JSON string carrying ephemeral pub key, prekey id, IV, etc. */
  ciphertextHeader: z.string().min(1).max(8 * 1024),
  encryptedKind: z.string().min(1).max(64),
});

export const pushUnsubscribeSchema = z
  .object({
    endpoint: z.string().url().optional(),
    platform: z.enum(["WEB_PUSH", "FCM", "APNS"]).optional(),
    deviceToken: z.string().min(1).optional(),
  })
  .refine((b) => Boolean(b.endpoint || (b.platform && b.platform !== "WEB_PUSH" && b.deviceToken)), {
    message: "Provide either `endpoint` (web push) or `platform` + `deviceToken` (native).",
  });

export const billingCheckoutBodySchema = z.object({
  /** Stripe Price ID to subscribe to (e.g. `price_123`). */
  priceId: z.string().min(1).max(120),
  /** Optional override for the post-checkout redirect (must be same-origin). */
  successPath: z.string().min(1).max(256).optional(),
  cancelPath: z.string().min(1).max(256).optional(),
  /**
   * Checkout UI mode:
   *   - "hosted"   (default) → return `{ url }`, client does `window.location.href = url`
   *   - "embedded"           → return `{ clientSecret }`, client mounts `<EmbeddedCheckout>`
   *     inside the app for a fully in-app payment experience.
   */
  uiMode: z.enum(["hosted", "embedded"]).optional(),
});

const TIP_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "MNT"] as const;

export const tipCreateBodySchema = z.object({
  /** Recipient user ID. */
  toUserId: z.string().min(1).max(64),
  /** Smallest-currency-unit amount (cents for USD). Caps prevent abuse / fat-finger mistakes. */
  amount: z.number().int().min(50).max(50_000_00),
  currency: z.enum(TIP_CURRENCIES).default("USD"),
  message: z.string().trim().max(200).optional(),
});

export const webVitalSchema = z.object({
  /** Metric short name as emitted by the `web-vitals` package. */
  name: z.enum(["CLS", "FCP", "FID", "INP", "LCP", "TTFB"]),
  /** Metric value in the unit defined by the spec (ms for everything except CLS, which is unitless). */
  value: z.number().finite().min(0).max(600_000),
  /** Bucket assigned by `web-vitals` based on Core Web Vitals thresholds. */
  rating: z.enum(["good", "needs-improvement", "poor"]),
  /** Stable id from `web-vitals` so duplicate reports of the same metric can be deduped downstream. */
  id: z.string().min(1).max(120),
  /** `navigate`, `reload`, `back-forward`, `back-forward-cache`, `prerender`, or `restore`. */
  navigationType: z.string().min(1).max(40).optional(),
  /** Path the metric was observed on; we strip query string + hash on the client to avoid PII. */
  path: z.string().min(1).max(500),
  /** Client-side device hints (UA Client Hints when available; falls back to UA parsing). */
  device: z
    .object({
      /** Coarse device class: `mobile`, `tablet`, `desktop`. */
      kind: z.enum(["mobile", "tablet", "desktop"]).optional(),
      /** Effective network type from `navigator.connection.effectiveType`. */
      effectiveType: z.enum(["slow-2g", "2g", "3g", "4g"]).optional(),
      /** Estimated downlink in Mbps from `navigator.connection.downlink`. */
      downlinkMbps: z.number().finite().min(0).max(10_000).optional(),
      /** Round-trip time in ms from `navigator.connection.rtt`. */
      rttMs: z.number().finite().min(0).max(60_000).optional(),
      /** `navigator.deviceMemory` in GB. */
      deviceMemoryGb: z.number().finite().min(0).max(64).optional(),
      /** `navigator.hardwareConcurrency` (logical CPU cores). */
      hardwareConcurrency: z.number().int().min(0).max(2048).optional(),
    })
    .optional(),
});

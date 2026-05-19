import jwt from "jsonwebtoken";

let cachedSecret: string | null = null;

function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  cachedSecret = "__dev_only_insecure_jwt_secret__";
  console.warn("[jwt] JWT_SECRET is not set; using an insecure development default");
  return cachedSecret;
}

export type JwtPayload = {
  userId: string;
  username: string;
  email: string;
  sessionId?: string;
};

export type TwoFactorChallengePayload = {
  userId: string;
  purpose: "2fa";
};

export type WebAuthnChallengePayload = {
  userId?: string;
  challenge: string;
  purpose: "webauthn-registration" | "webauthn-authentication";
};

/** Short-lived access JWT (defaults to 15 minutes). Refresh via `linksy_refresh` cookie. */
export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "15m" });
}

/** @deprecated Use signAccessToken; kept for callers that previously used signToken. */
export function signToken(payload: JwtPayload): string {
  return signAccessToken(payload);
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

export function verifyToken(token: string): JwtPayload | null {
  return verifyAccessToken(token);
}

export function signTwoFactorChallenge(userId: string): string {
  return jwt.sign({ userId, purpose: "2fa" }, getJwtSecret(), { expiresIn: "5m" });
}

export function verifyTwoFactorChallenge(token: string): TwoFactorChallengePayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as TwoFactorChallengePayload;
    if (payload.purpose !== "2fa") return null;
    return payload;
  } catch {
    return null;
  }
}

export function signWebAuthnChallenge(payload: WebAuthnChallengePayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "5m" });
}

export function verifyWebAuthnChallenge(
  token: string,
  purpose: WebAuthnChallengePayload["purpose"],
): WebAuthnChallengePayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as WebAuthnChallengePayload;
    if (payload.purpose !== purpose || !payload.challenge) return null;
    return payload;
  } catch {
    return null;
  }
}

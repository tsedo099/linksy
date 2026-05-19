"use client";

import Link from "next/link";
import { ThemeLogo } from "@/components/theme-logo";
import { UiButton } from "@/components/ui/button";
import { useLanguagePreferences } from "@/components/language-provider";
import { persistPasswordHealthFromLogin } from "@/components/password-health-banner";
import { authUiStrings } from "@/lib/i18n/global-ui-strings";
import { loginFormSchema, type LoginFormValues } from "@/lib/schemas/login-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";

export function LoginScreen() {
  const router = useRouter();
  const { language } = useLanguagePreferences();
  const a = useMemo(() => authUiStrings(language), [language]);
  const {
    control,
    handleSubmit,
    formState: { errors },
    getValues,
    reset,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error")?.trim();
    if (!code) return;

    const messages: Record<string, string> = {
      oauth_state: a.oauthState,
      oauth_google: a.oauthGoogle,
      oauth_email: a.oauthEmail,
      account_closed: a.accountClosed,
      oauth_mismatch: a.oauthMismatch,
      google_not_configured: a.googleNotConfigured,
      google_2fa: a.google2fa,
    };
    setStatus(messages[code] ?? a.signInFailed);
    window.history.replaceState(null, "", "/login");
  }, [a]);

  const submitLogin = handleSubmit(async (form) => {
    setStatus("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error ?? a.somethingWrong);
        return;
      }

      if (data?.requires2FA && data?.challengeToken) {
        // Persist now so the banner shows once 2FA verify lands on /home.
        persistPasswordHealthFromLogin(data?.passwordHealth);
        setChallengeToken(data.challengeToken);
        setTwoFactorCode("");
        return;
      }

      persistPasswordHealthFromLogin(data?.passwordHealth);
      router.push("/home");
    } catch {
      setStatus(a.connectionFailed);
    } finally {
      setLoading(false);
    }
  });

  const handleTwoFactorSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");

    const code = twoFactorCode.trim();
    const validTotp = /^\d{6}$/.test(code);
    const validBackup = /^[A-Za-z2-9-]{10,12}$/.test(code);
    if (!validTotp && !validBackup) {
      setStatus(a.totpInvalid);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data?.error ?? a.couldNotVerify);
        return;
      }

      router.push("/home");
    } catch {
      setStatus(a.connectionFailed);
    } finally {
      setLoading(false);
    }
  };

  const signInWithPasskey = async (mode: "passwordless" | "2fa") => {
    setStatus("");
    setLoading(true);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const optionsRes = await fetch("/api/auth/passkeys/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "2fa"
            ? { challengeToken }
            : { usernameOrEmail: getValues("email")?.trim() || undefined },
        ),
      });
      const optionsData = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsData?.error ?? "Could not start passkey sign-in.");

      const assertion = await startAuthentication({ optionsJSON: optionsData.options });
      const verifyRes = await fetch("/api/auth/passkeys/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: optionsData.challengeToken, response: assertion }),
      });
      const verifyData = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok) throw new Error(verifyData?.error ?? "Could not verify passkey.");
      router.push("/home");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Passkey sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const cancelTwoFactor = () => {
    setChallengeToken(null);
    setTwoFactorCode("");
    setStatus("");
    reset();
  };

  return (
    <div className="page-shell">
      <main className="page-main">
        <section className="brand-panel">
          <div className="brand-glow brand-glow-left" />
          <div className="brand-glow brand-glow-right" />

          <div className="brand-content">
            <div className="social-scene">
              <div className="avatar-bubble avatar-bubble-1">
                <span>AR</span>
              </div>
              <div className="avatar-bubble avatar-bubble-2">
                <span>NM</span>
              </div>
              <div className="avatar-bubble avatar-bubble-3">
                <span>TK</span>
              </div>
              <div className="avatar-bubble avatar-bubble-4">
                <span>LU</span>
              </div>

              <div className="notif-bubble chat-bubble-1">
                <div className="notif-avatar">R</div>
                <div className="notif-content">
                  <div className="notif-header">
                    <span className="notif-name">Rina</span>
                    <span className="notif-time">now</span>
                  </div>
                  <p className="notif-message">See you at the meetup tonight?</p>
                </div>
              </div>

              <div className="chat-bubble chat-bubble-2">
                <p>Group chat is active</p>
                <div className="typing-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>

              <div className="logo-image-shell">
                <ThemeLogo darkSrc="/psda.png" lightSrc="/psda.png" alt="Linksy logo" width={380} height={380} className="logo-image" priority />
              </div>
            </div>

            <div className="hero-copy">
              <h1>{a.brandTitle}</h1>
              <div className="tagline-rotator">
                <span className="tagline-word">{a.tagline1}</span>
                <span className="tagline-word">{a.tagline2}</span>
                <span className="tagline-word">{a.tagline3}</span>
                <span className="tagline-word">{a.tagline4}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="login-panel">
          <div className="login-card">
            <div className="login-copy">
              <h2>{challengeToken ? a.twoFactorTitle : a.welcomeBack}</h2>
              {challengeToken ? (
                <p className="login-subcopy">
                  {a.twoFactorSub}
                </p>
              ) : null}
            </div>

            {challengeToken ? (
              <form className="login-form" onSubmit={handleTwoFactorSubmit}>
                <div className="field-group">
                  <label htmlFor="totp">{a.authCodeLabel}</label>
                  <div className="input-shell">
                    <input
                      id="totp"
                      name="totp"
                      type="text"
                      inputMode="text"
                      autoComplete="one-time-code"
                      maxLength={12}
                      placeholder={a.authCodePh}
                      value={twoFactorCode}
                      onChange={(event) => setTwoFactorCode(event.target.value)}
                    />
                  </div>
                </div>

                <UiButton type="submit" disabled={loading}>
                  {loading ? a.verifying : a.verify}
                </UiButton>

                <button
                  type="button"
                  className="social-button"
                  onClick={() => signInWithPasskey("2fa")}
                  disabled={loading}
                >
                  <span>Use passkey instead</span>
                </button>

                <button
                  type="button"
                  className="ghost-link"
                  onClick={cancelTwoFactor}
                  disabled={loading}
                >
                  {a.differentAccount}
                </button>
              </form>
            ) : (
              <form className="login-form" onSubmit={submitLogin}>
                <div className="field-group">
                  <label htmlFor="email">{a.emailLabel}</label>
                  <div className="input-shell">
                    <Controller
                      name="email"
                      control={control}
                      render={({ field }) => (
                        <input
                          id="email"
                          autoComplete="username"
                          type="text"
                          placeholder={a.emailPh}
                          name={field.name}
                          ref={field.ref}
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                        />
                      )}
                    />
                    <Mail className="input-icon" aria-hidden strokeWidth={1.8} />
                  </div>
                  {errors.email ? <p className="field-error">{errors.email.message}</p> : null}
                </div>

                <div className="field-group">
                  <div className="field-header">
                    <label htmlFor="password">{a.passwordLabel}</label>
                    <Link href="/auth/forgot-password" className="ghost-link">
                      {a.forgot}
                    </Link>
                  </div>
                  <div className="input-shell">
                    <Controller
                      name="password"
                      control={control}
                      render={({ field }) => (
                        <input
                          id="password"
                          autoComplete="current-password"
                          type={showPassword ? "text" : "password"}
                          placeholder={a.passwordPh}
                          name={field.name}
                          ref={field.ref}
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                        />
                      )}
                    />
                    <button
                      aria-label={showPassword ? a.hidePassword : a.showPassword}
                      className="icon-button"
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? <EyeOff className="input-icon" strokeWidth={1.8} /> : <Eye className="input-icon" strokeWidth={1.8} />}
                    </button>
                  </div>
                  {errors.password ? <p className="field-error">{errors.password.message}</p> : null}
                </div>

                <UiButton type="submit" disabled={loading}>
                  {loading ? a.signingIn : a.signIn}
                </UiButton>
              </form>
            )}

            {challengeToken ? null : (
              <>
                <div className="divider-row">
                  <span />
                  <p>{a.orContinue}</p>
                  <span />
                </div>

                <div className="social-grid">
                  <button
                    className="social-button"
                    type="button"
                    onClick={() => {
                      window.location.href = "/api/auth/google";
                    }}
                  >
                    <GoogleIcon />
                    <span>{a.google}</span>
                  </button>
                  <button
                    className="social-button"
                    type="button"
                    onClick={() => signInWithPasskey("passwordless")}
                    disabled={loading}
                  >
                    <span>Passkey</span>
                  </button>
                </div>

                <p className="signup-copy">
                  {a.newTo}{" "}
                  <Link href="/register" className="signup-link">
                    {a.createAccount}
                  </Link>
                </p>
              </>
            )}

            {status ? <p className="status-banner">{status}</p> : null}
          </div>
        </section>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="social-icon" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.04 5.04 0 0 1-2.21 3.31v2.77h3.57a10.97 10.97 0 0 0 3.28-8.09Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77a6.58 6.58 0 0 1-3.71 1.06c-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09A6.63 6.63 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l4.66-2.84Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A10.99 10.99 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
        fill="#EA4335"
      />
    </svg>
  );
}


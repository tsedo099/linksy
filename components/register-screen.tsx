"use client";

import Link from "next/link";
import { ThemeLogo } from "@/components/theme-logo";
import { useLanguagePreferences } from "@/components/language-provider";
import { authUiStrings, feedChromeStrings } from "@/lib/i18n/global-ui-strings";
import { registerFormSchema, type RegisterFormValues } from "@/lib/schemas/register-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

export function RegisterScreen() {
  const router = useRouter();
  const { language } = useLanguagePreferences();
  const a = useMemo(() => authUiStrings(language), [language]);
  const fc = useMemo(() => feedChromeStrings(language), [language]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      displayName: "",
      username: "",
      email: "",
      password: "",
      birthDate: "",
      gender: "UNDISCLOSED",
    },
  });
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = handleSubmit(async (form) => {
    setStatus("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          preferredLanguage: language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const bag = data?.issues as
          | { fieldErrors?: { password?: string[] }; formErrors?: string[] }
          | undefined;
        const pwdErr = bag?.fieldErrors?.password?.[0];
        const formErr = bag?.formErrors?.[0];
        setStatus(pwdErr || formErr || data?.error || a.somethingWrong);
        return;
      }

      router.push("/home");
    } catch {
      setStatus(a.connectionFailed);
    } finally {
      setLoading(false);
    }
  });

  return (
    <div className="page-shell">
      <main className="page-main">
        <section className="brand-panel">
          <div className="brand-glow brand-glow-left" />
          <div className="brand-glow brand-glow-right" />

          <div className="brand-content">
            <div className="social-scene">
              <div className="avatar-bubble avatar-bubble-1"><span>AR</span></div>
              <div className="avatar-bubble avatar-bubble-2"><span>NM</span></div>
              <div className="avatar-bubble avatar-bubble-3"><span>TK</span></div>
              <div className="avatar-bubble avatar-bubble-4"><span>LU</span></div>

              <div className="notif-bubble chat-bubble-1">
                <div className="notif-avatar">R</div>
                <div className="notif-content">
                  <div className="notif-header">
                    <span className="notif-name">Rina</span>
                    <span className="notif-time">now</span>
                  </div>
                  <p className="notif-message">Are you joining the meetup tonight?</p>
                </div>
              </div>

              <div className="chat-bubble chat-bubble-2">
                <p>Group chat is active</p>
                <div className="typing-dots" aria-hidden="true">
                  <span /><span /><span />
                </div>
              </div>

              <div className="logo-image-shell">
                <ThemeLogo darkSrc="/psda.png" lightSrc="/psda.png" alt="Linksy logo" width={380} height={380} className="logo-image" priority />
              </div>
            </div>

            <div className="hero-copy">
              <h1>{a.brandTitle}</h1>
              <div className="tagline-rotator">
                <span className="tagline-word">{fc.registerTagline1}</span>
                <span className="tagline-word">{fc.registerTagline2}</span>
                <span className="tagline-word">{fc.registerTagline3}</span>
                <span className="tagline-word">{fc.registerTagline4}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="login-panel">
          <div className="login-card">
            <Link
              href="/login"
              className="ghost-link"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                marginBottom: "0.8rem",
                fontSize: "0.85rem",
              }}
              aria-label="Back to login"
            >
              ← {a.signInLink}
            </Link>
            <div className="login-copy">
              <h2>{a.registerTitle}</h2>
            </div>

            <form className="login-form" onSubmit={onSubmit}>
              <div className="field-group">
                <label htmlFor="displayName">{a.displayNameLabel}</label>
                <div className="input-shell">
                  <input
                    id="displayName"
                    autoComplete="name"
                    type="text"
                    {...register("displayName")}
                  />
                  <PersonIcon />
                </div>
                {errors.displayName ? <p className="field-error">{errors.displayName.message}</p> : null}
              </div>

              <div className="field-group">
                <label htmlFor="username">{a.usernameLabel}</label>
                <div className="input-shell">
                  <input
                    id="username"
                    autoComplete="username"
                    type="text"
                    {...register("username")}
                  />
                  <AtIcon />
                </div>
                {errors.username ? <p className="field-error">{errors.username.message}</p> : null}
              </div>

              <div className="field-group">
                <label htmlFor="email">{a.emailAddressLabel}</label>
                <div className="input-shell">
                  <input
                    id="email"
                    autoComplete="email"
                    type="email"
                    {...register("email")}
                  />
                  <MailIcon />
                </div>
                {errors.email ? <p className="field-error">{errors.email.message}</p> : null}
              </div>

              <div className="field-group">
                <label htmlFor="password">{a.passwordLabel}</label>
                <div className="input-shell">
                  <input
                    id="password"
                    autoComplete="new-password"
                    type={showPassword ? "text" : "password"}
                    {...register("password")}
                  />
                  <button
                    aria-label={showPassword ? a.hidePassword : a.showPassword}
                    className="icon-button"
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {errors.password ? <p className="field-error">{errors.password.message}</p> : null}
              </div>

              <div className="field-group">
                <label htmlFor="birthDate">{a.birthDateLabel ?? "Date of birth"}</label>
                <div className="input-shell">
                  <input
                    id="birthDate"
                    autoComplete="bday"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    min="1900-01-01"
                    {...register("birthDate")}
                  />
                </div>
                {errors.birthDate ? <p className="field-error">{errors.birthDate.message}</p> : null}
              </div>

              <div className="field-group">
                <label htmlFor="gender">{a.genderLabel ?? "Gender"}</label>
                <div className="input-shell">
                  <select id="gender" {...register("gender")}>
                    <option value="UNDISCLOSED">{a.genderUndisclosed ?? "Prefer not to say"}</option>
                    <option value="FEMALE">{a.genderFemale ?? "Female"}</option>
                    <option value="MALE">{a.genderMale ?? "Male"}</option>
                    <option value="NON_BINARY">{a.genderNonBinary ?? "Non-binary"}</option>
                  </select>
                </div>
                {errors.gender ? <p className="field-error">{errors.gender.message}</p> : null}
              </div>

              {status ? <p className="field-error" style={{ textAlign: "center" }}>{status}</p> : null}

              <button className="primary-button" type="submit" disabled={loading}>
                {loading ? a.creatingAccount : a.signUp}
              </button>
            </form>

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
                <RegisterGoogleIcon />
                <span>{a.google}</span>
              </button>
            </div>

            <p className="signup-copy">
              {a.alreadyHave}{" "}
              <Link href="/login" className="signup-link">
                {a.signInLink}
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function RegisterGoogleIcon() {
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

function PersonIcon() {
  return (
    <svg aria-hidden="true" className="input-icon" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function AtIcon() {
  return (
    <svg aria-hidden="true" className="input-icon" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg aria-hidden="true" className="input-icon" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6.75h16v10.5H4z" />
      <path d="M4 8l8 6 8-6" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="input-icon" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="3.25" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" className="input-icon" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 6.4A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a18.7 18.7 0 0 1-3 3.8" />
      <path d="M14.8 14.8A3.2 3.2 0 0 1 9.2 9.2" />
      <path d="M6.3 6.4A18.5 18.5 0 0 0 2.5 12s3.5 6 9.5 6a10.8 10.8 0 0 0 4.1-.8" />
    </svg>
  );
}

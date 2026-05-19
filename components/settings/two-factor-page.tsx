"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { QRCodeSVG } from "qrcode.react";
import { twoFactorVerifyFormSchema, type TwoFactorVerifyFormValues } from "@/lib/schemas/settings-forms";
import type { ProfileUser, ToastHandler } from "./types";
import { Card, CardLabel, Page } from "./primitives";

export function TwoFactorPage({
  me,
  onBack,
  onProfileUpdated,
  onToast,
}: {
  me: ProfileUser | null;
  onBack?: () => void;
  onProfileUpdated: (user: ProfileUser) => void;
  onToast: ToastHandler;
}) {
  const enabled = Boolean(me?.twoFactorEnabled);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [remainingBackupCodes, setRemainingBackupCodes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const codeForm = useForm<TwoFactorVerifyFormValues>({
    resolver: zodResolver(twoFactorVerifyFormSchema),
    defaultValues: { code: "" },
    mode: "onChange",
  });
  const code = codeForm.watch("code");
  const codeErr = codeForm.formState.errors.code?.message;

  function sanitizeCode(value: string) {
    return value.replace(/\D/g, "").slice(0, 6);
  }

  async function requireValidCode(): Promise<string | null> {
    const ok = await codeForm.trigger();
    if (!ok) {
      onToast("error", codeForm.formState.errors.code?.message ?? "Enter the 6-digit authenticator code.");
      return null;
    }
    return codeForm.getValues("code");
  }

  function clearCode() {
    codeForm.reset({ code: "" });
  }

  async function refreshMe() {
    try {
      const [res, backupRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/auth/2fa/backup-codes"),
      ]);
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { user?: ProfileUser } | null;
        if (data?.user) onProfileUpdated(data.user);
      }
      if (backupRes.ok) {
        const backupData = (await backupRes.json().catch(() => null)) as { remaining?: number } | null;
        if (typeof backupData?.remaining === "number") {
          setRemainingBackupCodes(backupData.remaining);
        }
      } else {
        setRemainingBackupCodes(null);
      }
    } catch {
      // best effort
    }
  }

  async function startSetup() {
    if (busy) return;
    setBusy(true);
    clearCode();
    setBackupCodes(null);
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { secret?: string; otpauthUrl?: string; error?: string }
        | null;

      if (!res.ok || !data?.secret || !data?.otpauthUrl) {
        throw new Error(data?.error ?? "Could not start setup.");
      }

      setSetup({ secret: data.secret, otpauthUrl: data.otpauthUrl });
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not start setup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    if (busy) return;
    const verified = await requireValidCode();
    if (verified == null) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verified }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; backupCodes?: string[] } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not verify the code.");

      onToast("success", "Two-factor authentication enabled.");
      setSetup(null);
      clearCode();
      setBackupCodes(Array.isArray(data?.backupCodes) ? data.backupCodes : null);
      setRemainingBackupCodes(Array.isArray(data?.backupCodes) ? data.backupCodes.length : null);
      await refreshMe();
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not verify the code.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy) return;
    const verified = await requireValidCode();
    if (verified == null) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verified }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not disable two-factor.");

      onToast("success", "Two-factor authentication disabled.");
      clearCode();
      setBackupCodes(null);
      setRemainingBackupCodes(null);
      await refreshMe();
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not disable two-factor.");
    } finally {
      setBusy(false);
    }
  }

  function copySecret() {
    if (!setup?.secret) return;
    navigator.clipboard?.writeText(setup.secret).then(
      () => onToast("success", "Secret copied to clipboard."),
      () => onToast("error", "Could not copy the secret."),
    );
  }

  async function regenerateBackupCodes() {
    if (busy) return;
    const verified = await requireValidCode();
    if (verified == null) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/backup-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verified }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; backupCodes?: string[] } | null;
      if (!res.ok || !Array.isArray(data?.backupCodes)) {
        throw new Error(data?.error ?? "Could not regenerate backup codes.");
      }
      setBackupCodes(data.backupCodes);
      setRemainingBackupCodes(data.backupCodes.length);
      onToast("success", "Backup codes regenerated.");
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not regenerate backup codes.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (enabled) {
      refreshMe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (enabled) {
    return (
      <Page title="Two-factor authentication" onBack={onBack}>
        <Card>
          <div className="sg-copy-card">
            <p>
              Two-factor authentication is <strong>on</strong>. You will be asked for a 6-digit
              code from your authenticator app every time you sign in.
            </p>
          </div>
        </Card>

        <Card>
          <div className="sg-copy-card">
            <p>
              Recovery codes remaining: <strong>{remainingBackupCodes ?? "..."}</strong>.
              Each backup code can be used once if you lose access to your authenticator app.
            </p>
          </div>
        </Card>

        {backupCodes && backupCodes.length > 0 ? (
          <Card>
            <div className="sg-2fa-backups">
              {backupCodes.map((backupCode) => (
                <code key={backupCode} className="sg-2fa-backup-code">{backupCode}</code>
              ))}
            </div>
          </Card>
        ) : null}

        <CardLabel label="Turn off" />
        <Card>
          <div className="sg-field">
            <span className="sg-field-lbl">Authentication code</span>
            <input
              className="sg-field-in"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(event) =>
                codeForm.setValue("code", sanitizeCode(event.target.value), { shouldValidate: true })
              }
              aria-invalid={Boolean(codeErr) || undefined}
            />
            {codeErr ? <p className="sg-field-error" role="alert">{codeErr}</p> : null}
          </div>
        </Card>
        <button type="button" className="sg-primary-btn sg-primary-btn--secondary" onClick={regenerateBackupCodes} disabled={busy}>
          {busy ? "Working..." : "Regenerate backup codes"}
        </button>
        <button type="button" className="sg-primary-btn" onClick={disable} disabled={busy}>
          {busy ? "Disabling..." : "Disable two-factor"}
        </button>
      </Page>
    );
  }

  if (setup) {
    return (
      <Page title="Two-factor authentication" onBack={onBack}>
        <CardLabel label="Step 1 - Scan the QR code with your authenticator" />
        <Card>
          <div className="sg-copy-card">
            <p>
              Open Google Authenticator, Authy, or any TOTP app, tap <em>+ Add account &gt; Scan a QR code</em>,
              and point the camera at the QR below. If you can&apos;t scan, paste the secret key instead.
            </p>
          </div>
        </Card>

        <Card>
          <div className="sg-2fa-qr-wrap">
            <div className="sg-2fa-qr">
              <QRCodeSVG
                value={setup.otpauthUrl}
                size={196}
                bgColor="#ffffff"
                fgColor="#0a0612"
                level="M"
                marginSize={2}
              />
            </div>
          </div>
          <div className="sg-2fa-secret" style={{ marginTop: "0.75rem" }}>
            <code className="sg-2fa-code">{setup.secret}</code>
            <button type="button" className="sg-session-btn" onClick={copySecret}>
              Copy
            </button>
          </div>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.72rem", color: "var(--muted)" }}>
            Can&apos;t scan? Open your authenticator, choose <em>Enter setup key</em>, and paste the secret above.
          </p>
        </Card>

        <CardLabel label="Step 2 - Enter the code" />
        <Card>
          <div className="sg-field">
            <span className="sg-field-lbl">Authentication code</span>
            <input
              className="sg-field-in"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(event) =>
                codeForm.setValue("code", sanitizeCode(event.target.value), { shouldValidate: true })
              }
              aria-invalid={Boolean(codeErr) || undefined}
            />
            {codeErr ? <p className="sg-field-error" role="alert">{codeErr}</p> : null}
          </div>
        </Card>
        <button type="button" className="sg-primary-btn" onClick={confirmSetup} disabled={busy}>
          {busy ? "Verifying..." : "Verify and enable"}
        </button>
        {backupCodes && backupCodes.length > 0 ? (
          <Card>
            <div className="sg-2fa-backups">
              {backupCodes.map((backupCode) => (
                <code key={backupCode} className="sg-2fa-backup-code">{backupCode}</code>
              ))}
            </div>
          </Card>
        ) : null}
      </Page>
    );
  }

  return (
    <Page title="Two-factor authentication" onBack={onBack}>
      <Card>
        <div className="sg-copy-card">
          <p>
            Add an extra step to sign-in. After your password, Linksy will ask for a 6-digit code
            from an authenticator app like Google Authenticator or Authy.
          </p>
        </div>
      </Card>
      <button type="button" className="sg-primary-btn" onClick={startSetup} disabled={busy}>
        {busy ? "Starting..." : "Enable two-factor"}
      </button>
    </Page>
  );
}

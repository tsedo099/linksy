"use client";

import { registerAndSubscribePush, unregisterPush } from "@/lib/push-client";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { quietHoursFormSchema, type QuietHoursFormValues } from "@/lib/schemas/settings-forms";
import type { DigestCadence, ServerDigestState, ServerNotifPrefs, ToastHandler } from "./types";
import {
  DEFAULT_NOTIF_PREFS,
  DEFAULT_QH_END,
  DEFAULT_QH_START,
  DIGEST_OPTIONS,
  formatLastSent,
  minutesToTimeInput,
  parseTimeInput,
  useStoredState,
} from "./helpers";
import { Card, CardLabel, IcCheck, Page, Row, Toggle } from "./primitives";

export function NotifPage({ onBack, onToast }: { onBack?: () => void; onToast: ToastHandler }) {
  const [delivery, setDelivery] = useStoredState("linksy-settings-notifications", {
    push: true,
  });
  const [pushMeta, setPushMeta] = useState<{ configured: boolean; publicKey: string | null }>({
    configured: false,
    publicKey: null,
  });
  const [pushBusy, setPushBusy] = useState(false);
  const [prefs, setPrefs] = useState<ServerNotifPrefs>(DEFAULT_NOTIF_PREFS);
  const [digest, setDigest] = useState<ServerDigestState>({ cadence: "off", lastSentAt: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof ServerNotifPrefs | null>(null);
  const [savingDigest, setSavingDigest] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [qhLoading, setQhLoading] = useState(true);
  const [qhSaving, setQhSaving] = useState(false);

  const quietHoursForm = useForm<QuietHoursFormValues>({
    resolver: zodResolver(quietHoursFormSchema),
    defaultValues: {
      enabled: false,
      start: minutesToTimeInput(DEFAULT_QH_START),
      end: minutesToTimeInput(DEFAULT_QH_END),
      timezone: "UTC",
    },
    mode: "onBlur",
  });
  const qhEnabled = quietHoursForm.watch("enabled");
  const qhTimezoneErr = quietHoursForm.formState.errors.timezone?.message;
  const qhEndErr = quietHoursForm.formState.errors.end?.message;

  const tzChoices = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone").sort((a, b) => a.localeCompare(b));
    } catch {
      return ["UTC", "Asia/Ulaanbaatar"];
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/push/public-key")
      .then((response) => response.json())
      .then((data: { enabled?: boolean; publicKey?: string | null }) => {
        if (!alive) return;
        const pk = typeof data.publicKey === "string" ? data.publicKey.trim() : null;
        setPushMeta({ configured: Boolean(data.enabled && pk), publicKey: pk });
      })
      .catch(() => {
        if (alive) setPushMeta({ configured: false, publicKey: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/user/notification-prefs")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load notification preferences.")))
      .then((data: { prefs?: ServerNotifPrefs; digest?: ServerDigestState }) => {
        if (!alive) return;
        if (data.prefs) setPrefs({ ...DEFAULT_NOTIF_PREFS, ...data.prefs });
        if (data.digest && (DIGEST_OPTIONS.some((option) => option.value === data.digest!.cadence))) {
          setDigest({
            cadence: data.digest.cadence,
            lastSentAt: data.digest.lastSentAt ?? null,
          });
        }
      })
      .catch((error) => {
        if (alive) onToast("error", error instanceof Error ? error.message : "Could not load notification preferences.");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [onToast]);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: {
          user?: {
            quietHoursStart?: number | null;
            quietHoursEnd?: number | null;
            quietHoursTimezone?: string | null;
          };
        } | null) => {
          if (!alive || !data?.user) return;
          const u = data.user;
          const s = u.quietHoursStart;
          const e = u.quietHoursEnd;
          const tz = u.quietHoursTimezone;
          const valid =
            typeof s === "number" &&
            typeof e === "number" &&
            typeof tz === "string" &&
            tz.length > 0 &&
            s !== e;
          quietHoursForm.reset(
            valid
              ? {
                  enabled: true,
                  start: minutesToTimeInput(s),
                  end: minutesToTimeInput(e),
                  timezone: tz,
                }
              : {
                  enabled: false,
                  start: minutesToTimeInput(DEFAULT_QH_START),
                  end: minutesToTimeInput(DEFAULT_QH_END),
                  timezone:
                    typeof tz === "string" && tz
                      ? tz
                      : Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
          );
        },
      )
      .finally(() => {
        if (alive) setQhLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [quietHoursForm]);

  async function persistQuietHours(values: QuietHoursFormValues): Promise<boolean> {
    if (qhSaving) return false;
    setQhSaving(true);
    try {
      const body = values.enabled
        ? {
            quietHoursStart: parseTimeInput(values.start),
            quietHoursEnd: parseTimeInput(values.end),
            quietHoursTimezone: values.timezone,
          }
        : { quietHoursStart: null, quietHoursEnd: null, quietHoursTimezone: null };
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Could not save quiet hours.");
      onToast("success", values.enabled ? "Quiet hours saved." : "Quiet hours turned off.");
      return true;
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not save quiet hours.");
      return false;
    } finally {
      setQhSaving(false);
    }
  }

  async function onToggleQuietHours(next: boolean) {
    const prev = quietHoursForm.getValues("enabled");
    quietHoursForm.setValue("enabled", next, { shouldDirty: true });
    const ok = await persistQuietHours({ ...quietHoursForm.getValues(), enabled: next });
    if (!ok) quietHoursForm.setValue("enabled", prev);
  }

  const saveQuietHoursWindow = quietHoursForm.handleSubmit(async (values) => {
    if (!values.enabled) return;
    await persistQuietHours(values);
  });

  async function togglePushDelivery() {
    if (pushBusy) return;
    if (delivery.push) {
      setPushBusy(true);
      try {
        await unregisterPush();
        setDelivery((current) => ({ ...current, push: false }));
        onToast("success", "Push notifications turned off.");
      } catch (error) {
        onToast("error", error instanceof Error ? error.message : "Could not turn off push.");
      } finally {
        setPushBusy(false);
      }
      return;
    }
    if (!pushMeta.configured || !pushMeta.publicKey) {
      onToast(
        "error",
        "Push is not configured on this server (set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY).",
      );
      return;
    }
    setPushBusy(true);
    try {
      await registerAndSubscribePush(pushMeta.publicKey);
      setDelivery((current) => ({ ...current, push: true }));
      onToast("success", "Push notifications enabled for this browser.");
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not enable push.");
    } finally {
      setPushBusy(false);
    }
  }

  async function togglePref(key: keyof ServerNotifPrefs) {
    if (saving) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    try {
      const response = await fetch("/api/user/notification-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs: next }),
      });
      const data = await response.json().catch(() => null) as { prefs?: ServerNotifPrefs; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Could not save preference.");
      if (data?.prefs) setPrefs({ ...DEFAULT_NOTIF_PREFS, ...data.prefs });
    } catch (error) {
      setPrefs((current) => ({ ...current, [key]: !current[key] }));
      onToast("error", error instanceof Error ? error.message : "Could not save preference.");
    } finally {
      setSaving(null);
    }
  }

  async function changeDigest(cadence: DigestCadence) {
    if (savingDigest || cadence === digest.cadence) return;
    const previous = digest;
    setDigest({ ...digest, cadence });
    setSavingDigest(true);
    try {
      const response = await fetch("/api/user/notification-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest: { cadence } }),
      });
      const data = await response.json().catch(() => null) as { digest?: ServerDigestState; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Could not save digest preference.");
      if (data?.digest) {
        setDigest({
          cadence: data.digest.cadence,
          lastSentAt: data.digest.lastSentAt ?? null,
        });
      }
      onToast("success", cadence === "off" ? "Digest emails turned off." : `Digest set to ${cadence}.`);
    } catch (error) {
      setDigest(previous);
      onToast("error", error instanceof Error ? error.message : "Could not save digest preference.");
    } finally {
      setSavingDigest(false);
    }
  }

  async function sendDigestNow() {
    if (sendingNow) return;
    setSendingNow(true);
    try {
      const response = await fetch("/api/user/notification-prefs/digest-now", { method: "POST" });
      const data = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Could not send the digest.");
      onToast("success", data?.message ?? "Digest sent. Check your inbox.");
      setDigest((current) => ({ ...current, lastSentAt: new Date().toISOString() }));
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not send the digest.");
    } finally {
      setSendingNow(false);
    }
  }

  return (
    <Page title="Notifications" onBack={onBack}>
      <CardLabel label="Delivery methods" />
      <Card>
        <Row
          label={pushBusy ? "Push notifications…" : "Push notifications"}
          desc={
            pushMeta.configured
              ? "Browser alerts via Web Push (register this device)"
              : "Unavailable until VAPID keys are set on the server"
          }
          right={<Toggle on={delivery.push} onChange={() => void togglePushDelivery()} disabled={pushBusy} />}
        />
      </Card>

      <CardLabel label="Push quiet hours" />
      <Card>
        <Row
          label={qhLoading || qhSaving ? "Night window…" : "Limit low-priority push"}
          desc="Likes, follows, and similar alerts stay quiet during this window in your chosen timezone. Messages, mentions, and DMs still come through."
          right={
            <Toggle
              on={qhEnabled}
              onChange={() => void onToggleQuietHours(!qhEnabled)}
              disabled={qhLoading || qhSaving || loading}
            />
          }
        />
        {qhEnabled ? (
          <form className="field-group" onSubmit={saveQuietHoursWindow} noValidate>
            <div className="sg-field">
              <span className="sg-field-lbl">From</span>
              <input
                type="time"
                className="sg-field-in"
                disabled={qhSaving}
                {...quietHoursForm.register("start")}
              />
            </div>
            <div className="sg-field">
              <span className="sg-field-lbl">Until</span>
              <input
                type="time"
                className="sg-field-in"
                disabled={qhSaving}
                aria-invalid={Boolean(qhEndErr) || undefined}
                {...quietHoursForm.register("end")}
              />
              {qhEndErr ? <p className="sg-field-error" role="alert">{qhEndErr}</p> : null}
            </div>
            <div className="sg-field">
              <span className="sg-field-lbl">Timezone</span>
              <select
                className="sg-field-in"
                disabled={qhSaving}
                aria-invalid={Boolean(qhTimezoneErr) || undefined}
                {...quietHoursForm.register("timezone")}
              >
                {tzChoices.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              {qhTimezoneErr ? <p className="sg-field-error" role="alert">{qhTimezoneErr}</p> : null}
            </div>
            <button type="submit" className="sg-primary-btn" disabled={qhSaving}>
              {qhSaving ? "Saving…" : "Save quiet hours"}
            </button>
          </form>
        ) : null}
      </Card>

      <CardLabel label="Email digest" />
      <Card>
        <div className="sg-theme-grid" role="group" aria-label="Email digest cadence">
          {DIGEST_OPTIONS.map((option) => {
            const active = digest.cadence === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`sg-theme-opt${active ? " sg-theme-opt--on" : ""}`}
                onClick={() => changeDigest(option.value)}
                disabled={savingDigest || loading}
                aria-pressed={active}
              >
                <span className="sg-theme-opt-title">{option.label}</span>
                <span className="sg-theme-opt-sub">{option.desc}</span>
                {active ? <span className="sg-theme-tick"><IcCheck /></span> : null}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <Row label="Last digest sent" desc={formatLastSent(digest.lastSentAt)} />
        <Row
          label={sendingNow ? "Sending sample…" : "Send a sample digest"}
          desc="Receive a preview email at your verified address"
          onClick={sendDigestNow}
        />
      </Card>

      <CardLabel label={loading ? "Notify me for (loading...)" : "Notify me for"} />
      <Card>
        <Row label="Likes" right={<Toggle on={prefs.like} onChange={() => togglePref("like")} />} />
        <Row label="Comments" right={<Toggle on={prefs.comment} onChange={() => togglePref("comment")} />} />
        <Row label="Follows" right={<Toggle on={prefs.follow} onChange={() => togglePref("follow")} />} />
        <Row label="Mentions" right={<Toggle on={prefs.mention} onChange={() => togglePref("mention")} />} />
        <Row label="Stories" right={<Toggle on={prefs.story} onChange={() => togglePref("story")} />} />
        <Row label="Messages" right={<Toggle on={prefs.message} onChange={() => togglePref("message")} />} />
        <Row label="Contact joins" right={<Toggle on={prefs.friendJoined} onChange={() => togglePref("friendJoined")} />} />
      </Card>
    </Page>
  );
}

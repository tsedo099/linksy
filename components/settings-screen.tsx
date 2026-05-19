"use client";

import { CreatorToggle } from "@/components/CreatorToggle";
import { useLanguagePreferences } from "@/components/language-provider";
import { useThemePreferences } from "@/components/theme-provider";
import { LANGUAGE_OPTIONS, parseAppLanguage, type AppLanguage } from "@/lib/language";
import { settingsContentStrings, settingsSidebarStrings } from "@/lib/i18n/global-ui-strings";
import type { AccentColor, FontScale, MotionPreference, ThemeMode } from "@/lib/theme";
import { FONT_SCALE_OPTIONS, MOTION_PREF_OPTIONS } from "@/lib/theme";
import { displayMediaSrc } from "@/lib/media";
import {
  changePasswordFormSchema,
  setFirstPasswordFormSchema,
  deleteAccountFormSchema,
  type ChangePasswordFormValues,
  type DeleteAccountFormValues,
} from "@/lib/schemas/settings-forms";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AVATAR_IMAGE_MAX_SIZE,
  AVATAR_IMAGE_TYPES,
  type BlockedUser,
  type MutedUser,
  type PageKey,
  type ProfileUser,
  type ToastHandler,
  type ToastState,
} from "@/components/settings/types";
import {
  describeUserAgent,
  formatLastSent,
  formatRelativeTime,
  formatUploadSize,
  OAUTH_SCOPE_CHOICES,
  useStoredState,
  useStoredToggleList,
} from "@/components/settings/helpers";
import {
  AvatarPreview,
  Card,
  CardLabel,
  EmptyStateCard,
  IcBack,
  IcBan,
  IcBell,
  IcCamera,
  IcCard,
  IcChevron,
  IcCheck,
  IcGlobe,
  IcHelp,
  IcImage,
  IcInfo,
  IcLock,
  IcLogout,
  IcMail,
  IcMsg,
  IcMute,
  IcPalette,
  IcSearch,
  IcShield,
  IcTag,
  IcTrash,
  IcUser,
  IcZap,
  Page,
  Row,
  Toggle,
} from "@/components/settings/primitives";
import { EditProfilePage } from "@/components/settings/edit-profile-page";
import { NotifPage } from "@/components/settings/notif-page";
import { TwoFactorPage } from "@/components/settings/two-factor-page";

// Icons, UI atoms, types, helpers, and page components moved to components/settings/*.

// Types, helpers, UI atoms moved to components/settings/{types,helpers,primitives}.tsx

function PrivacyPage({
  me,
  onBack,
  onNavigate,
  onProfileUpdated,
  onToast,
}: {
  me: ProfileUser | null;
  onBack?: () => void;
  onNavigate: (page: PageKey) => void;
  onProfileUpdated: (user: ProfileUser) => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const [settings, setSettings] = useStoredState("linksy-settings-privacy", {
    activity: false,
    profilePublic: true,
    sensitive: true,
    tagging: true,
  });
  const [savingKey, setSavingKey] = useState<
    "showFollowers" | "showFollowing" | "defaultAllowComments" | "defaultHideLikes" | null
  >(null);

  const toggle = (key: keyof typeof settings) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  };

  async function toggleAccountPrivacy(key: "showFollowers" | "showFollowing") {
    if (!me || savingKey) return;

    const next = !me[key];
    const previous = me;
    setSavingKey(key);
    onProfileUpdated({ ...me, [key]: next });

    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; user?: ProfileUser } | null;

      if (!response.ok || !data?.user) {
        throw new Error(data?.error ?? "Could not save privacy setting.");
      }

      onProfileUpdated(data.user);
      onToast("success", "Privacy setting updated.");
    } catch (error) {
      onProfileUpdated(previous);
      onToast("error", error instanceof Error ? error.message : "Could not save privacy setting.");
    } finally {
      setSavingKey(null);
    }
  }

  async function togglePostPrivacyDefault(key: "defaultAllowComments" | "defaultHideLikes") {
    if (!me || savingKey) return;

    const next = !me[key];
    const previous = me;
    setSavingKey(key);
    onProfileUpdated({ ...me, [key]: next });

    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; user?: ProfileUser } | null;

      if (!response.ok || !data?.user) {
        throw new Error(data?.error ?? "Could not save posting default.");
      }

      onProfileUpdated(data.user);
      onToast("success", "Posting default saved.");
    } catch (error) {
      onProfileUpdated(previous);
      onToast("error", error instanceof Error ? error.message : "Could not save posting default.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Page title="Privacy" onBack={onBack}>
      <CardLabel label="Profile" />
      <Card>
        <Row
          label="Public profile"
          desc="Anyone can view your profile"
          right={<Toggle on={settings.profilePublic} onChange={() => toggle("profilePublic")} />}
        />
        <Row
          label="Show followers list"
          desc="Allow others to view who follows you"
          right={<Toggle on={Boolean(me?.showFollowers)} onChange={() => toggleAccountPrivacy("showFollowers")} />}
        />
        <Row
          label="Show following list"
          desc="Allow others to view who you follow"
          right={<Toggle on={Boolean(me?.showFollowing)} onChange={() => toggleAccountPrivacy("showFollowing")} />}
        />
        <Row
          label="Activity status"
          desc="Let others see when you are online"
          right={<Toggle on={settings.activity} onChange={() => toggle("activity")} />}
        />
        <Row
          label="Allow tags on posts"
          right={<Toggle on={settings.tagging} onChange={() => toggle("tagging")} />}
        />
        <Row
          label="Filter sensitive content"
          desc="Blur content that may be inappropriate"
          right={<Toggle on={settings.sensitive} onChange={() => toggle("sensitive")} />}
        />
      </Card>

      <CardLabel label="Security" />
      <Card>
        <Row label="Change password" icon={IcLock} onClick={() => onNavigate("change-password")} />
        <Row
          label="Two-factor authentication"
          icon={IcShield}
          desc={me?.twoFactorEnabled ? "On" : "Off"}
          onClick={() => onNavigate("two-factor")}
        />
        <Row label="Passkeys" icon={IcShield} desc="Passwordless sign-in" onClick={() => onNavigate("passkeys")} />
        <Row label="Login activity" icon={IcShield} onClick={() => onNavigate("sessions")} />
        <Row label="Security overview" icon={IcShield} onClick={() => onNavigate("security-overview")} />
      </Card>

      <CardLabel label="Account" />
      <Card>
        <Row
          label="Comments on new posts"
          desc="You can override this each time you create a post."
          right={
            <Toggle
              on={me?.defaultAllowComments !== false}
              onChange={() => togglePostPrivacyDefault("defaultAllowComments")}
              disabled={!me || savingKey !== null}
            />
          }
        />
        <Row
          label="Hide likes on new posts"
          desc="Like counts stay visible to you only; others see a placeholder."
          right={
            <Toggle
              on={Boolean(me?.defaultHideLikes)}
              onChange={() => togglePostPrivacyDefault("defaultHideLikes")}
              disabled={!me || savingKey !== null}
            />
          }
        />
        <Row label="Developer apps" icon={IcZap} desc="OAuth clients and API scopes" onClick={() => onNavigate("developer")} />
        <Row label="Download my data" icon={IcShield} onClick={() => onNavigate("export-data")} />
        <Row label="Deactivate account" icon={IcBan} onClick={() => onNavigate("deactivate-account")} />
        <Row label="Delete account" icon={IcTrash} danger onClick={() => onNavigate("delete-account")} />
      </Card>
    </Page>
  );
}

function AppearancePage({ onBack }: { onBack?: () => void }) {
  const {
    accent,
    fontScale,
    motionPref,
    motionResolved,
    ready,
    setAccent,
    setFontScale,
    setMotionPref,
    setTheme,
    theme,
  } = useThemePreferences();

  const accents = [
    { key: "purple", hex: "#C084FC" },
    { key: "indigo", hex: "#6366F1" },
    { key: "blue", hex: "#3B82F6" },
    { key: "green", hex: "#22C55E" },
    { key: "orange", hex: "#F97316" },
    { key: "yellow", hex: "#CA8A04" },
    { key: "black", hex: "#0F172A" },
    { key: "white", hex: "#FFFFFF" },
  ] as const satisfies ReadonlyArray<{ hex: string; key: AccentColor }>;

  return (
    <Page title="Appearance" onBack={onBack}>
      <CardLabel label="Theme" />
      <Card>
        <div className="sg-theme-grid">
          {(["dark", "light"] as const satisfies readonly ThemeMode[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`sg-theme-opt${theme === option ? " sg-theme-opt--on" : ""}`}
              onClick={() => setTheme(option)}
            >
              <div className={`sg-theme-thumb sg-theme-thumb--${option}`}>
                <div className="sg-th-bar" />
                <div className="sg-th-bar sg-th-bar--sm" />
              </div>
              <span>{option === "dark" ? "Dark" : "Light"}</span>
              {theme === option ? <span className="sg-theme-tick"><IcCheck /></span> : null}
            </button>
          ))}
        </div>
      </Card>

      <CardLabel label="Accent color" />
      <Card>
        <div className="sg-swatches">
          {accents.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={`sg-swatch${accent === entry.key ? " sg-swatch--on" : ""}${entry.key === "white" ? " sg-swatch--light" : ""}`}
              style={{ background: entry.hex }}
              onClick={() => setAccent(entry.key)}
              aria-label={`${entry.key} accent`}
            >
              {accent === entry.key ? <IcCheck /> : null}
            </button>
          ))}
        </div>
      </Card>

      <CardLabel label="Font size" />
      <Card>
        <div className="sg-theme-grid" role="group" aria-label="Font size">
          {FONT_SCALE_OPTIONS.map((option) => {
            const active = fontScale === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`sg-theme-opt${active ? " sg-theme-opt--on" : ""}`}
                onClick={() => setFontScale(option.value as FontScale)}
                disabled={!ready}
                aria-pressed={active}
              >
                <span
                  className="sg-theme-opt-title"
                  style={{ fontSize: `${Math.max(0.85, option.percent / 100)}rem` }}
                >
                  {option.label}
                </span>
                <span className="sg-theme-opt-sub">{option.description}</span>
                {active ? <span className="sg-theme-tick"><IcCheck /></span> : null}
              </button>
            );
          })}
        </div>
      </Card>

      <CardLabel label="Motion" />
      <Card>
        <div className="sg-theme-grid" role="group" aria-label="Motion preference">
          {MOTION_PREF_OPTIONS.map((option) => {
            const active = motionPref === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`sg-theme-opt${active ? " sg-theme-opt--on" : ""}`}
                onClick={() => setMotionPref(option.value as MotionPreference)}
                disabled={!ready}
                aria-pressed={active}
              >
                <span className="sg-theme-opt-title">{option.label}</span>
                <span className="sg-theme-opt-sub">{option.description}</span>
                {active ? <span className="sg-theme-tick"><IcCheck /></span> : null}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <Row
          label="Currently active"
          desc={
            motionResolved === "reduced"
              ? motionPref === "system"
                ? "Reduced motion (matching your OS setting)"
                : "Reduced motion"
              : motionPref === "system"
                ? "Full motion (matching your OS setting)"
                : "Full motion"
          }
        />
      </Card>
    </Page>
  );
}

function SimpleTogglePage({
  onBack,
  items,
  storageKey,
  title,
}: {
  onBack?: () => void;
  items: Array<{ label: string; desc?: string }>;
  storageKey: string;
  title: string;
}) {
  const [values, setValues] = useStoredToggleList(storageKey, items.length);

  return (
    <Page title={title} onBack={onBack}>
      <Card>
        {items.map((item, index) => (
          <Row
            key={`${item.label}-${index}`}
            label={item.label}
            desc={item.desc}
            right={
              <Toggle
                on={values[index] ?? false}
                onChange={() => setValues((current) => current.map((value, currentIndex) => currentIndex === index ? !value : value))}
              />
            }
          />
        ))}
      </Card>
    </Page>
  );
}

type MessagePreferenceKey = "allowMessageRequests" | "allowGroupInvites" | "allowStoryReplies";

function MessageSettingsPage({
  me,
  onBack,
  onProfileUpdated,
  onToast,
}: {
  me: ProfileUser | null;
  onBack?: () => void;
  onProfileUpdated: (user: ProfileUser) => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const [savingKey, setSavingKey] = useState<MessagePreferenceKey | null>(null);

  async function togglePreference(key: MessagePreferenceKey) {
    if (!me || savingKey) return;

    const next = !me[key];
    const previous = me;
    setSavingKey(key);
    onProfileUpdated({ ...me, [key]: next });

    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; user?: ProfileUser } | null;

      if (!response.ok || !data?.user) {
        throw new Error(data?.error ?? "Could not save message setting.");
      }

      onProfileUpdated(data.user);
      onToast("success", "Message setting updated.");
    } catch (error) {
      onProfileUpdated(previous);
      onToast("error", error instanceof Error ? error.message : "Could not save message setting.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Page title="Messages and replies" onBack={onBack}>
      <Card>
        <Row
          label="Allow message requests"
          desc="People you do not follow can start a request"
          right={<Toggle on={Boolean(me?.allowMessageRequests)} onChange={() => togglePreference("allowMessageRequests")} />}
        />
        <Row
          label="Allow group invites"
          desc="Other people can add you to group chats"
          right={<Toggle on={Boolean(me?.allowGroupInvites)} onChange={() => togglePreference("allowGroupInvites")} />}
        />
        <Row
          label="Allow story replies"
          desc="People who can view your stories can reply"
          right={<Toggle on={Boolean(me?.allowStoryReplies)} onChange={() => togglePreference("allowStoryReplies")} />}
        />
      </Card>
    </Page>
  );
}

function EmptyListPage({
  title,
  onBack,
  copy,
}: {
  title: string;
  onBack?: () => void;
  copy: string;
}) {
  return (
    <Page title={title} onBack={onBack}>
      <EmptyStateCard
        icon={<IcInfo />}
        title={`No ${title.toLowerCase()} yet`}
        copy={copy}
      />
    </Page>
  );
}

function BlockedPage({
  onBack,
  onToast,
}: {
  onBack?: () => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    fetch("/api/user/blocked")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load blocked users.")))
      .then((data: { users?: BlockedUser[] }) => {
        if (alive) setBlockedUsers(data.users ?? []);
      })
      .catch((error) => {
        if (alive) onToast("error", error instanceof Error ? error.message : "Could not load blocked users.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [onToast]);

  async function unblock(user: BlockedUser) {
    if (actionId) return;
    setActionId(user.id);

    try {
      const response = await fetch(`/api/users/${user.id}/block`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Could not unblock this user.");

      setBlockedUsers((current) => current.filter((item) => item.id !== user.id));
      onToast("success", `${user.displayName || user.username} unblocked.`);
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not unblock this user.");
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <Page title="Blocked" onBack={onBack}>
        <EmptyStateCard icon={<IcInfo />} title="Loading blocked users" copy="Checking your blocked list." />
      </Page>
    );
  }

  if (blockedUsers.length === 0) {
    return (
      <EmptyListPage
        title="Blocked"
        onBack={onBack}
        copy="People you block will show up here when you add them."
      />
    );
  }

  return (
    <Page title="Blocked" onBack={onBack}>
      <Card>
        <div className="sg-blocked-list">
          {blockedUsers.map((user) => (
            <div key={user.id} className="sg-blocked-row">
              <AvatarPreview avatarUrl={user.avatarUrl} displayName={user.displayName || user.username} className="sg-blocked-avatar" />
              <div className="sg-blocked-meta">
                <span className="sg-blocked-name">{user.displayName || user.username}</span>
                <span className="sg-blocked-sub">@{user.username}</span>
              </div>
              <button
                type="button"
                className="sg-unblock-btn"
                disabled={actionId === user.id}
                onClick={() => unblock(user)}
              >
                {actionId === user.id ? "Saving..." : "Unblock"}
              </button>
            </div>
          ))}
        </div>
      </Card>
    </Page>
  );
}

type CloseCircleMember = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
};

function CloseCirclePage({
  onBack,
  onToast,
}: {
  onBack?: () => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const [members, setMembers] = useState<CloseCircleMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CloseCircleMember[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/close-circle")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Could not load close circle.")))
      .then((data: { members?: CloseCircleMember[] }) => {
        if (alive) setMembers(data.members ?? []);
      })
      .catch((error) => {
        if (alive) onToast("error", error instanceof Error ? error.message : "Could not load close circle.");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [onToast]);

  // Debounced username search — same pattern AddPeopleDialog uses.
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        if (!r.ok) { setSearchResults([]); return; }
        const data = await r.json() as { users?: CloseCircleMember[] };
        const existingIds = new Set(members.map((m) => m.id));
        setSearchResults((data.users ?? []).filter((u) => !existingIds.has(u.id)));
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, members]);

  async function add(user: CloseCircleMember) {
    if (actionId) return;
    setActionId(user.id);
    try {
      const r = await fetch("/api/close-circle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: user.id }),
      });
      const data = await r.json().catch(() => null) as { error?: string } | null;
      if (!r.ok) throw new Error(data?.error ?? "Could not add this person.");
      setMembers((cur) => [...cur, user]);
      setSearchResults((cur) => cur.filter((u) => u.id !== user.id));
      onToast("success", `${user.displayName || user.username} added to close circle.`);
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not add this person.");
    } finally {
      setActionId(null);
    }
  }

  async function remove(user: CloseCircleMember) {
    if (actionId) return;
    setActionId(user.id);
    try {
      const r = await fetch("/api/close-circle", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: user.id }),
      });
      const data = await r.json().catch(() => null) as { error?: string } | null;
      if (!r.ok) throw new Error(data?.error ?? "Could not remove this person.");
      setMembers((cur) => cur.filter((m) => m.id !== user.id));
      onToast("success", `${user.displayName || user.username} removed from close circle.`);
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not remove this person.");
    } finally {
      setActionId(null);
    }
  }

  return (
    <Page title="Close circle" onBack={onBack}>
      <Card>
        <p style={{ marginTop: 0, color: "var(--app-text-muted)", fontSize: "0.875rem" }}>
          Only people in your close circle can see posts you share with the Close Circle audience.
        </p>
        <input
          type="search"
          placeholder="Search by username…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "0.6rem 0.85rem",
            borderRadius: 10,
            border: "1px solid var(--app-border)",
            background: "var(--app-card-soft, var(--app-card))",
            color: "var(--app-text)",
            fontSize: "0.92rem",
            marginTop: "0.75rem",
          }}
        />
        {searchQuery.trim() && (
          <div className="sg-blocked-list" style={{ marginTop: "0.75rem" }}>
            {searching && <div style={{ padding: "0.5rem", color: "var(--app-text-muted)", fontSize: "0.85rem" }}>Searching…</div>}
            {!searching && searchResults.length === 0 && (
              <div style={{ padding: "0.5rem", color: "var(--app-text-muted)", fontSize: "0.85rem" }}>No matches.</div>
            )}
            {searchResults.map((user) => (
              <div key={user.id} className="sg-blocked-row">
                <AvatarPreview avatarUrl={user.avatarUrl} displayName={user.displayName || user.username} className="sg-blocked-avatar" />
                <div className="sg-blocked-meta">
                  <span className="sg-blocked-name">{user.displayName || user.username}</span>
                  <span className="sg-blocked-sub">@{user.username}</span>
                </div>
                <button
                  type="button"
                  className="sg-unblock-btn"
                  disabled={actionId === user.id}
                  onClick={() => add(user)}
                >
                  {actionId === user.id ? "Adding…" : "Add"}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ marginTop: 0, fontSize: "0.95rem" }}>
          Your close circle ({members.length})
        </h3>
        {loading ? (
          <p style={{ color: "var(--app-text-muted)", fontSize: "0.85rem" }}>Loading…</p>
        ) : members.length === 0 ? (
          <p style={{ color: "var(--app-text-muted)", fontSize: "0.85rem" }}>
            No one added yet. Search above to add people.
          </p>
        ) : (
          <div className="sg-blocked-list">
            {members.map((user) => (
              <div key={user.id} className="sg-blocked-row">
                <AvatarPreview avatarUrl={user.avatarUrl} displayName={user.displayName || user.username} className="sg-blocked-avatar" />
                <div className="sg-blocked-meta">
                  <span className="sg-blocked-name">{user.displayName || user.username}</span>
                  <span className="sg-blocked-sub">@{user.username}</span>
                </div>
                <button
                  type="button"
                  className="sg-unblock-btn"
                  disabled={actionId === user.id}
                  onClick={() => remove(user)}
                >
                  {actionId === user.id ? "Removing…" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}

function MutedPage({
  onBack,
  onToast,
}: {
  onBack?: () => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const [mutedUsers, setMutedUsers] = useState<MutedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    fetch("/api/user/muted")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load muted users.")))
      .then((data: { users?: MutedUser[] }) => {
        if (alive) setMutedUsers(data.users ?? []);
      })
      .catch((error) => {
        if (alive) onToast("error", error instanceof Error ? error.message : "Could not load muted users.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [onToast]);

  async function unmute(user: MutedUser) {
    if (actionId) return;
    setActionId(user.id);

    try {
      const response = await fetch(`/api/users/${user.id}/mute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted: false }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Could not unmute this user.");

      setMutedUsers((current) => current.filter((item) => item.id !== user.id));
      onToast("success", `${user.displayName || user.username} unmuted.`);
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not unmute this user.");
    } finally {
      setActionId(null);
    }
  }

  async function toggleMuteFlag(user: MutedUser, key: "mutePosts" | "muteStories" | "muteNotifications") {
    if (actionId) return;
    setActionId(user.id);
    const next = { ...user, [key]: !user[key] };

    try {
      const response = await fetch(`/api/users/${user.id}/mute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          muted: true,
          mutePosts: next.mutePosts,
          muteStories: next.muteStories,
          muteNotifications: next.muteNotifications,
        }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Could not update mute settings.");

      setMutedUsers((current) => current.map((item) => item.id === user.id ? next : item));
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not update mute settings.");
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <Page title="Muted accounts" onBack={onBack}>
        <EmptyStateCard icon={<IcInfo />} title="Loading muted users" copy="Checking your muted list." />
      </Page>
    );
  }

  if (mutedUsers.length === 0) {
    return (
      <EmptyListPage
        title="Muted accounts"
        onBack={onBack}
        copy="People you mute will show up here when you add them."
      />
    );
  }

  return (
    <Page title="Muted accounts" onBack={onBack}>
      <Card>
        <div className="sg-blocked-list">
          {mutedUsers.map((user) => (
            <div key={user.id} className="sg-blocked-row sg-muted-row">
              <AvatarPreview avatarUrl={user.avatarUrl} displayName={user.displayName || user.username} className="sg-blocked-avatar" />
              <div className="sg-blocked-meta">
                <span className="sg-blocked-name">{user.displayName || user.username}</span>
                <span className="sg-blocked-sub">@{user.username}</span>
                <div className="sg-muted-flags">
                  <button
                    type="button"
                    className={`sg-muted-chip${user.mutePosts ? " sg-muted-chip--on" : ""}`}
                    onClick={() => toggleMuteFlag(user, "mutePosts")}
                    disabled={actionId === user.id}
                    title="Mute posts"
                  >
                    Posts {user.mutePosts ? "muted" : "shown"}
                  </button>
                  <button
                    type="button"
                    className={`sg-muted-chip${user.muteStories ? " sg-muted-chip--on" : ""}`}
                    onClick={() => toggleMuteFlag(user, "muteStories")}
                    disabled={actionId === user.id}
                    title="Mute stories"
                  >
                    Stories {user.muteStories ? "muted" : "shown"}
                  </button>
                  <button
                    type="button"
                    className={`sg-muted-chip${user.muteNotifications ? " sg-muted-chip--on" : ""}`}
                    onClick={() => toggleMuteFlag(user, "muteNotifications")}
                    disabled={actionId === user.id}
                    title="Mute notifications from this account (messages still allowed)"
                  >
                    Alerts {user.muteNotifications ? "muted" : "on"}
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="sg-unblock-btn"
                disabled={actionId === user.id}
                onClick={() => unmute(user)}
              >
                {actionId === user.id ? "Saving..." : "Unmute"}
              </button>
            </div>
          ))}
        </div>
      </Card>
    </Page>
  );
}

function LanguagePage({
  onBack,
  me,
  onProfileUpdated,
  onToast,
}: {
  onBack?: () => void;
  me: ProfileUser | null;
  onProfileUpdated: (user: ProfileUser) => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const { language, setLanguage } = useLanguagePreferences();
  const sb = useMemo(() => settingsSidebarStrings(language), [language]);
  const languages = LANGUAGE_OPTIONS.map((o) => ({ key: o.value, label: o.label }));

  async function persistChoice(next: AppLanguage) {
    setLanguage(next);
    if (!me) {
      return;
    }
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLanguage: next }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; user?: ProfileUser } | null;
      if (!response.ok || !data?.user) {
        throw new Error(data?.error ?? sb.couldNotSaveLanguage);
      }
      const u = data.user;
      onProfileUpdated({
        ...me,
        ...u,
        defaultAllowComments: u.defaultAllowComments !== false,
        defaultHideLikes: Boolean(u.defaultHideLikes),
        preferredLanguage: parseAppLanguage(
          (u as { preferredLanguage?: string }).preferredLanguage,
        ),
      });
      onToast("success", sb.languageSaved);
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : sb.couldNotSaveLanguage);
    }
  }

  return (
    <Page title={sb.languagePageTitle} onBack={onBack}>
      <Card>
        {languages.map((entry) => (
          <Row
            key={entry.key}
            label={entry.label}
            onClick={() => persistChoice(entry.key)}
            right={
              language === entry.key ? (
                <span className="sg-inline-accent">
                  <IcCheck />
                </span>
              ) : undefined
            }
          />
        ))}
      </Card>
    </Page>
  );
}

function HelpPage({
  onBack,
  onNavigate,
  sidebar,
  content,
}: {
  onBack?: () => void;
  onNavigate: (page: PageKey) => void;
  sidebar: ReturnType<typeof settingsSidebarStrings>;
  content: ReturnType<typeof settingsContentStrings>;
}) {
  const router = useRouter();

  return (
    <Page title={sidebar.itemHelp} onBack={onBack}>
      <Card>
        <Row label={content.helpRowHelpCenter} icon={IcHelp} onClick={() => onNavigate("help-center")} />
        <Row label={content.helpRowPrivacyPolicy} icon={IcLock} onClick={() => router.push("/legal/privacy")} />
        <Row label={content.helpRowTerms} icon={IcInfo} onClick={() => router.push("/legal/terms")} />
        <Row label={content.helpRowCookiePolicy} icon={IcInfo} onClick={() => onNavigate("cookie-policy")} />
        <Row label={content.helpRowContactSupport} icon={IcMail} onClick={() => onNavigate("contact-support")} />
      </Card>
      <p className="sg-version">Linksy v0.1.0</p>
    </Page>
  );
}

function TextPage({
  title,
  onBack,
  sections,
}: {
  title: string;
  onBack?: () => void;
  sections: Array<{ heading: string; body: string }>;
}) {
  return (
    <Page title={title} onBack={onBack}>
      {sections.map((section) => (
        <div key={section.heading} className="sg-copy-block">
          <CardLabel label={section.heading} />
          <Card>
            <div className="sg-copy-card">
              <p>{section.body}</p>
            </div>
          </Card>
        </div>
      ))}
    </Page>
  );
}

function ContactSupportPage({
  onBack,
  content,
}: {
  onBack?: () => void;
  content: ReturnType<typeof settingsContentStrings>;
}) {
  return (
    <Page title={content.contactSupportTitle} onBack={onBack}>
      <Card>
        <Row
          icon={IcMail}
          label={content.contactEmailRow}
          desc={content.contactEmailDesc}
          onClick={() => {
            window.location.href = "mailto:support@linksy.app?subject=Linksy%20Support";
          }}
        />
      </Card>
      <Card>
        <div className="sg-copy-card">
          <p>{content.contactSupportHint}</p>
        </div>
      </Card>
    </Page>
  );
}

type SessionRow = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  current: boolean;
};


function SessionsPage({
  onBack,
  onToast,
}: {
  onBack?: () => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    fetch("/api/user/sessions")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load sessions.")))
      .then((data: { sessions?: SessionRow[] }) => {
        if (alive) setSessions(data.sessions ?? []);
      })
      .catch((error) => {
        if (alive) onToast("error", error instanceof Error ? error.message : "Could not load sessions.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [onToast]);

  async function revoke(session: SessionRow) {
    if (actionId) return;
    setActionId(session.id);

    try {
      const response = await fetch(`/api/user/sessions/${session.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as { error?: string; current?: boolean } | null;
      if (!response.ok) throw new Error(data?.error ?? "Could not revoke this session.");

      if (data?.current) {
        onToast("success", "Signed out from this device.");
        router.push("/login");
        return;
      }

      setSessions((current) => current.filter((item) => item.id !== session.id));
      onToast("success", "Session signed out.");
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not revoke this session.");
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <Page title="Login activity" onBack={onBack}>
        <EmptyStateCard icon={<IcInfo />} title="Loading sessions" copy="Checking your active devices." />
      </Page>
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyListPage
        title="Login activity"
        onBack={onBack}
        copy="Active sign-ins to your account will show up here."
      />
    );
  }

  return (
    <Page title="Login activity" onBack={onBack}>
      <CardLabel label="Where you are signed in" />
      <Card>
        <div className="sg-sessions-list">
          {sessions.map((session) => {
            const { device, browser } = describeUserAgent(session.userAgent);
            return (
              <div key={session.id} className="sg-session-row">
                <span className="sg-session-ic"><IcShield /></span>
                <div className="sg-session-meta">
                  <span className="sg-session-name">
                    {device} Â· {browser}
                    {session.current ? <span className="sg-session-tag">This device</span> : null}
                  </span>
                  <span className="sg-session-sub">
                    {session.ipAddress ?? "Unknown IP"} Â· Active {formatRelativeTime(session.lastActiveAt)}
                  </span>
                </div>
                <button
                  type="button"
                  className="sg-session-btn"
                  disabled={actionId === session.id}
                  onClick={() => revoke(session)}
                >
                  {actionId === session.id ? "Saving..." : session.current ? "Sign out" : "Revoke"}
                </button>
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <div className="sg-copy-card">
          <p>
            See a sign-in you do not recognize? Revoke it here and then change your password.
          </p>
        </div>
      </Card>
    </Page>
  );
}

type PasskeyRow = {
  id: string;
  name: string | null;
  transports: string[];
  backedUp: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

function PasskeysPage({
  onBack,
  onToast,
}: {
  onBack?: () => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadPasskeys() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/passkeys");
      const data = (await res.json().catch(() => null)) as { credentials?: PasskeyRow[]; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not load passkeys.");
      setPasskeys(data?.credentials ?? []);
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not load passkeys.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPasskeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addPasskey() {
    if (busy) return;
    setBusy(true);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const optionsRes = await fetch("/api/auth/passkeys/register/options", { method: "POST" });
      const optionsData = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsData?.error ?? "Could not start passkey setup.");

      const registration = await startRegistration({ optionsJSON: optionsData.options });
      const verifyRes = await fetch("/api/auth/passkeys/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken: optionsData.challengeToken,
          response: registration,
          name: "Passkey",
        }),
      });
      const verifyData = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok) throw new Error(verifyData?.error ?? "Could not verify passkey.");
      onToast("success", "Passkey added.");
      await loadPasskeys();
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not add passkey.");
    } finally {
      setBusy(false);
    }
  }

  async function renamePasskey(passkey: PasskeyRow) {
    const name = window.prompt("Passkey name", passkey.name ?? "Passkey");
    if (name == null) return;
    try {
      const res = await fetch(`/api/auth/passkeys/${passkey.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not rename passkey.");
      onToast("success", "Passkey renamed.");
      await loadPasskeys();
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not rename passkey.");
    }
  }

  async function revokePasskey(passkey: PasskeyRow) {
    if (!window.confirm("Remove this passkey? You can add it again later.")) return;
    try {
      const res = await fetch(`/api/auth/passkeys/${passkey.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not remove passkey.");
      onToast("success", "Passkey removed.");
      await loadPasskeys();
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not remove passkey.");
    }
  }

  return (
    <Page title="Passkeys" onBack={onBack}>
      <Card>
        <div className="sg-copy-card">
          <p>
            Passkeys let you sign in with Face ID, Windows Hello, a password manager, or a hardware
            security key. They can also be used instead of an authenticator code during two-factor sign-in.
          </p>
        </div>
      </Card>
      <button type="button" className="sg-primary-btn" onClick={addPasskey} disabled={busy}>
        {busy ? "Opening passkey prompt..." : "Add passkey"}
      </button>

      <CardLabel label="Your passkeys" />
      <Card>
        {loading ? (
          <div className="sg-copy-card"><p>Loading passkeys...</p></div>
        ) : passkeys.length === 0 ? (
          <div className="sg-copy-card"><p>No passkeys added yet.</p></div>
        ) : (
          <div className="sg-sessions-list">
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="sg-session-row">
                <div className="sg-session-main">
                  <strong>{passkey.name || "Passkey"}</strong>
                  <span>
                    Added {new Date(passkey.createdAt).toLocaleDateString()} Â· Last used{" "}
                    {passkey.lastUsedAt ? new Date(passkey.lastUsedAt).toLocaleDateString() : "never"}
                  </span>
                  <span>{passkey.backedUp ? "Synced passkey" : "Device-bound passkey"}</span>
                </div>
                <div className="sg-session-actions">
                  <button type="button" className="sg-session-btn" onClick={() => renamePasskey(passkey)}>
                    Rename
                  </button>
                  <button type="button" className="sg-session-btn sg-session-btn--danger" onClick={() => revokePasskey(passkey)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}

type OAuthAppRow = {
  id: string;
  clientId: string;
  clientType: "CONFIDENTIAL" | "PUBLIC";
  name: string;
  description: string | null;
  homepageUrl: string | null;
  redirectUris: string[];
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
};


function DeveloperPage({
  onBack,
  onToast,
}: {
  onBack?: () => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const [apps, setApps] = useState<OAuthAppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    redirectUri: "",
    scopes: ["profile:read"] as string[],
    clientType: "CONFIDENTIAL" as "CONFIDENTIAL" | "PUBLIC",
  });

  async function loadApps() {
    setLoading(true);
    try {
      const res = await fetch("/api/developer/oauth-apps");
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not load OAuth apps.");
      setApps(data?.applications ?? []);
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not load OAuth apps.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createApp() {
    if (busy) return;
    if (!form.name.trim() || !form.redirectUri.trim()) {
      onToast("error", "Enter an app name and redirect URI.");
      return;
    }
    setBusy(true);
    setNewSecret(null);
    try {
      const res = await fetch("/api/developer/oauth-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          redirectUris: [form.redirectUri],
          scopes: form.scopes,
          clientType: form.clientType,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not create OAuth app.");
      setNewSecret(data?.clientSecret ?? null);
      setForm({ name: "", redirectUri: "", scopes: ["profile:read"], clientType: "CONFIDENTIAL" });
      onToast("success", "OAuth app created.");
      await loadApps();
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not create OAuth app.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeApp(app: OAuthAppRow) {
    if (!window.confirm(`Revoke ${app.name}? All tokens for this app will stop working.`)) return;
    try {
      const res = await fetch(`/api/developer/oauth-apps/${app.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not revoke app.");
      onToast("success", "OAuth app revoked.");
      await loadApps();
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not revoke app.");
    }
  }

  function toggleScope(scope: string) {
    setForm((current) => {
      const has = current.scopes.includes(scope);
      const scopes = has
        ? current.scopes.filter((item) => item !== scope)
        : [...current.scopes, scope];
      return { ...current, scopes: scopes.length ? scopes : ["profile:read"] };
    });
  }

  return (
    <Page title="Developer apps" onBack={onBack}>
      <Card>
        <div className="sg-copy-card">
          <p>Create OAuth apps for third-party integrations. Secrets are shown once and stored hashed.</p>
        </div>
      </Card>

      <CardLabel label="Create app" />
      <Card>
        <div className="sg-field">
          <span className="sg-field-lbl">App name</span>
          <input className="sg-field-in" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </div>
        <div className="sg-field">
          <span className="sg-field-lbl">Redirect URI</span>
          <input className="sg-field-in" placeholder="https://example.com/oauth/callback" value={form.redirectUri} onChange={(event) => setForm({ ...form, redirectUri: event.target.value })} />
        </div>
        <div className="sg-field">
          <span className="sg-field-lbl">Client type</span>
          <select className="sg-field-in" value={form.clientType} onChange={(event) => setForm({ ...form, clientType: event.target.value as "CONFIDENTIAL" | "PUBLIC" })}>
            <option value="CONFIDENTIAL">Confidential</option>
            <option value="PUBLIC">Public with PKCE</option>
          </select>
        </div>
        <div className="sg-copy-card">
          {OAUTH_SCOPE_CHOICES.map((scope) => (
            <label key={scope} className="sg-check-row">
              <input type="checkbox" checked={form.scopes.includes(scope)} onChange={() => toggleScope(scope)} />
              <span>{scope}</span>
            </label>
          ))}
        </div>
      </Card>
      <button type="button" className="sg-primary-btn" onClick={createApp} disabled={busy}>
        {busy ? "Creating..." : "Create OAuth app"}
      </button>
      {newSecret ? (
        <Card>
          <div className="sg-copy-card">
            <p>Copy this client secret now. It will not be shown again.</p>
            <code className="sg-2fa-code">{newSecret}</code>
          </div>
        </Card>
      ) : null}

      <CardLabel label="Registered apps" />
      <Card>
        {loading ? (
          <div className="sg-copy-card"><p>Loading apps...</p></div>
        ) : apps.length === 0 ? (
          <div className="sg-copy-card"><p>No OAuth apps yet.</p></div>
        ) : (
          <div className="sg-sessions-list">
            {apps.map((app) => (
              <div key={app.id} className="sg-session-row">
                <div className="sg-session-main">
                  <strong>{app.name}</strong>
                  <span>{app.clientId}</span>
                  <span>{app.clientType} Â· {app.scopes.join(" ")}</span>
                  <span>{app.redirectUris.join(", ")}</span>
                </div>
                <div className="sg-session-actions">
                  {app.revokedAt ? (
                    <span className="sg-muted-chip">Revoked</span>
                  ) : (
                    <button type="button" className="sg-session-btn sg-session-btn--danger" onClick={() => revokeApp(app)}>
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}

function SecurityOverviewPage({ onBack }: { onBack?: () => void }) {
  return (
    <Page title="Security overview" onBack={onBack}>
      <CardLabel label="Available now" />
      <Card>
        <Row icon={IcLock} label="Password changes" desc="You can update your password from this screen at any time." />
        <Row icon={IcShield} label="Protected session" desc="Your session stays behind the secure account token used by this build." />
      </Card>

      <CardLabel label="Not in this build" />
      <Card>
        <div className="sg-copy-card">
          <p>
            Passkeys are available for passwordless sign-in and can be used during two-factor
            challenges. Keep authenticator backup codes stored somewhere safe for account recovery.
          </p>
        </div>
      </Card>
    </Page>
  );
}

function ChangePasswordPage({
  me,
  onBack,
  onToast,
}: {
  me: ProfileUser | null;
  onBack?: () => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const oauthOnly = Boolean(me && me.hasPassword === false);
  const schema = oauthOnly ? setFirstPasswordFormSchema : changePasswordFormSchema;
  const resolver = useMemo(() => zodResolver(schema), [schema]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues | (Omit<ChangePasswordFormValues, "currentPassword"> & { currentPassword?: string })>({
    resolver: resolver as never,
    defaultValues: oauthOnly
      ? { newPassword: "", confirmPassword: "" }
      : { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const [saving, setSaving] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true);

    try {
      const body = oauthOnly
        ? { newPassword: values.newPassword }
        : {
            currentPassword: (values as ChangePasswordFormValues).currentPassword,
            newPassword: values.newPassword,
          };
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Could not update the password.");
      }

      reset();
      onToast("success", data?.message ?? "Password updated.");
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not update the password.");
    } finally {
      setSaving(false);
    }
  });

  return (
    <Page title={oauthOnly ? "Set password" : "Change password"} onBack={onBack}>
      <Card>
        {oauthOnly ? (
          <p className="sg-copy-card" style={{ marginBottom: "1rem" }}>
            You signed up with Google. Add a password if you want to sign in with email as well.
          </p>
        ) : null}
        {!oauthOnly ? (
          <div className="sg-field">
            <span className="sg-field-lbl">Current password</span>
            <input
              className="sg-field-in"
              type="password"
              autoComplete="current-password"
              placeholder="Enter current password"
              {...register("currentPassword" as "currentPassword")}
            />
            {errors.currentPassword ? <p className="field-error">{errors.currentPassword.message}</p> : null}
          </div>
        ) : null}
        <div className="sg-field">
          <span className="sg-field-lbl">New password</span>
          <input
            className="sg-field-in"
            type="password"
            autoComplete="new-password"
            placeholder="8+ chars: upper, lower, number & symbol"
            {...register("newPassword")}
          />
          {errors.newPassword ? <p className="field-error">{errors.newPassword.message}</p> : null}
        </div>
        <div className="sg-field">
          <span className="sg-field-lbl">Confirm new password</span>
          <input
            className="sg-field-in"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword ? <p className="field-error">{errors.confirmPassword.message}</p> : null}
        </div>
      </Card>
      <button type="button" className="sg-primary-btn" onClick={onSubmit} disabled={saving}>
        {saving ? "Updating..." : oauthOnly ? "Save password" : "Update password"}
      </button>
    </Page>
  );
}

function DeleteAccountPage({
  me,
  onBack,
  onToast,
}: {
  me: ProfileUser | null;
  onBack?: () => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const form = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountFormSchema),
    defaultValues: { confirmation: "" },
    mode: "onBlur",
  });
  const confirmationErr = form.formState.errors.confirmation?.message;

  const onSubmit = form.handleSubmit(async (values) => {
    if (!me) {
      onToast("error", "Your account is still loading.");
      return;
    }
    if (values.confirmation.trim() !== me.username) {
      form.setError("confirmation", {
        type: "manual",
        message: "Type your username exactly to confirm.",
      });
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch("/api/auth/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: values.confirmation }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Could not delete the account.");
      }

      onToast("success", data?.message ?? "Account deleted.");
      router.replace("/register");
      router.refresh();
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not delete the account.");
    } finally {
      setDeleting(false);
    }
  });

  return (
    <Page title="Delete account" onBack={onBack}>
      <form onSubmit={onSubmit} noValidate>
        <Card>
          <div className="sg-copy-card">
            <p>
              This permanently removes your account, posts, comments, follows, and saved items.
              Type <strong>{me?.username ?? "your username"}</strong> to confirm.
            </p>
          </div>
          <div className="sg-field">
            <span className="sg-field-lbl">Confirm username</span>
            <input
              className="sg-field-in"
              placeholder={me?.username ?? "username"}
              autoComplete="off"
              aria-invalid={Boolean(confirmationErr) || undefined}
              {...form.register("confirmation")}
            />
            {confirmationErr ? <p className="sg-field-error" role="alert">{confirmationErr}</p> : null}
          </div>
        </Card>
        <button
          type="submit"
          className="sg-primary-btn sg-primary-btn--danger"
          disabled={deleting}
        >
          {deleting ? "Deleting..." : "Delete account"}
        </button>
      </form>
    </Page>
  );
}

function DeactivateAccountPage({
  me,
  onBack,
  onToast,
}: {
  me: ProfileUser | null;
  onBack?: () => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDeactivate() {
    if (busy) return;
    if (!window.confirm("Deactivate your account? Sign in again any time to reactivate.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/user/deactivate", { method: "POST" });
      const data = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Could not deactivate the account.");
      onToast("success", data?.message ?? "Account deactivated.");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not deactivate the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Deactivate account" onBack={onBack}>
      <Card>
        <div className="sg-copy-card">
          <p>
            Temporarily hide your profile, posts, and stories. Other people will not be able to find you
            or send you new messages while your account is deactivated.
          </p>
          <p>
            <strong>Reactivation is automatic</strong> â€” sign back in as <strong>{me?.username ?? "your username"}</strong> any time
            and your account will return exactly as you left it.
          </p>
          <p>
            If you want to permanently remove your data instead, use <strong>Delete account</strong>.
          </p>
        </div>
      </Card>
      <button type="button" className="sg-primary-btn sg-primary-btn--danger" onClick={handleDeactivate} disabled={busy}>
        {busy ? "Deactivating..." : "Deactivate account"}
      </button>
    </Page>
  );
}

function ExportDataPage({
  onBack,
  onToast,
}: {
  onBack?: () => void;
  onToast: (kind: "error" | "success", message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/user/export-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not generate your data export.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `linksy-data-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onToast("success", "Data export downloaded.");
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not generate your data export.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Download my data" onBack={onBack}>
      <Card>
        <div className="sg-copy-card">
          <p>
            Get a JSON archive of your Linksy data â€” profile, posts, comments, likes, follows,
            saved items, drafts, stories, sent messages, notifications, blocks, and mutes.
          </p>
          <p>
            The file is generated on demand and download begins automatically. Keep it private â€” it
            contains your personal information.
          </p>
        </div>
      </Card>
      <button type="button" className="sg-primary-btn" onClick={handleDownload} disabled={busy}>
        {busy ? "Preparing..." : "Download JSON"}
      </button>
    </Page>
  );
}

const DEEP_LINK_PAGE_KEYS: ReadonlyArray<PageKey> = [
  "change-password",
  "security-overview",
  "two-factor",
  "passkeys",
  "sessions",
  "privacy",
  "billing",
  "export-data",
  "delete-account",
  "deactivate-account",
  "notifications",
  "language",
  "appearance",
  "edit-profile",
];

function resolveDeepLinkSection(raw: string | null | undefined): PageKey | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  return (DEEP_LINK_PAGE_KEYS as readonly string[]).includes(t) ? (t as PageKey) : null;
}

export function SettingsScreen() {
  const { language } = useLanguagePreferences();
  const sb = useMemo(() => settingsSidebarStrings(language), [language]);
  const sc = useMemo(() => settingsContentStrings(language), [language]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSection = useMemo(
    () => resolveDeepLinkSection(searchParams?.get("section")) ?? "edit-profile",
    // Re-derive only once on first mount; subsequent in-app nav is owned by setPage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [page, setPage] = useState<PageKey>(initialSection);
  const [search, setSearch] = useState("");
  const [me, setMe] = useState<ProfileUser | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    // Strip the ?section= param after consuming so refresh / back doesn't
    // re-pin the user to that page.
    if (searchParams?.has("section")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("section");
      const qs = params.toString();
      router.replace(qs ? `/settings?${qs}` : "/settings");
    }
    // Only run once on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.user) {
          const u = data.user as Partial<ProfileUser> & Omit<ProfileUser, "defaultAllowComments" | "defaultHideLikes"> & {
            defaultAllowComments?: boolean;
            defaultHideLikes?: boolean;
          };
          setMe({
            ...u,
            defaultAllowComments: u.defaultAllowComments !== false,
            defaultHideLikes: Boolean(u.defaultHideLikes),
            preferredLanguage: parseAppLanguage(
              (u as { preferredLanguage?: string | null }).preferredLanguage,
            ),
          });
        }
      })
      .catch(() => {
        // Ignore transient load failures and keep the current shell visible.
      });
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showToast(kind: "error" | "success", message: string) {
    setToast({ kind, message });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  const initials = me?.displayName?.slice(0, 2).toUpperCase() ?? "ME";

  const navSections = useMemo<
    Array<{
      items: Array<{ key: PageKey; icon: () => ReactNode; label: string }>;
      label: string;
    }>
  >(
    () => [
      {
        label: sb.secHowYouUse,
        items: [
          { key: "edit-profile", icon: IcUser, label: sb.itemEditProfile },
          { key: "notifications", icon: IcBell, label: sb.itemNotifications },
        ],
      },
      {
        label: sb.secWhoCanSee,
        items: [
          { key: "privacy", icon: IcLock, label: sb.itemPrivacy },
          { key: "blocked", icon: IcBan, label: sb.itemBlocked },
          { key: "close-circle", icon: IcUser, label: sb.itemCloseCircle },
          { key: "story", icon: IcCamera, label: sb.itemStory },
          { key: "messages", icon: IcMsg, label: sb.itemMessages },
          { key: "tags", icon: IcTag, label: sb.itemTags },
          { key: "comments", icon: IcTag, label: sb.itemComments },
          { key: "muted", icon: IcMute, label: sb.itemMuted },
        ],
      },
      {
        label: sb.secCreator,
        items: [
          { key: "creator-mode", icon: IcZap, label: sb.itemCreatorMode },
          { key: "billing", icon: IcCard, label: sb.itemBilling },
        ],
      },
      {
        label: sb.secMore,
        items: [
          { key: "appearance", icon: IcPalette, label: sb.itemAppearance },
          { key: "language", icon: IcGlobe, label: sb.itemLanguage },
          { key: "help", icon: IcHelp, label: sb.itemHelp },
        ],
      },
    ],
    [sb],
  );

  const allItems = navSections.flatMap((section) => section.items);
  const filtered = search.trim()
    ? allItems.filter((item) => item.label.toLowerCase().includes(search.toLowerCase()))
    : null;

  const nestedPageTitles = useMemo<Partial<Record<PageKey, string>>>(
    () => ({
      "change-password": sb.nestedPrivacy,
      "contact-support": sb.nestedHelp,
      "cookie-policy": sb.nestedHelp,
      "delete-account": sb.nestedPrivacy,
      "deactivate-account": sb.nestedPrivacy,
      "export-data": sb.nestedPrivacy,
      "help-center": sb.nestedHelp,
      "privacy-policy": sb.nestedHelp,
      "security-overview": sb.nestedPrivacy,
      "sessions": sb.nestedPrivacy,
      "two-factor": sb.nestedPrivacy,
      "passkeys": sb.nestedPrivacy,
      "developer": sb.nestedHelp,
    }),
    [sb],
  );

  const topLevelPageSet = new Set<PageKey>(
    allItems.filter((item) => item.key !== "billing").map((item) => item.key),
  );
  const onBack = topLevelPageSet.has(page)
    ? undefined
    : () => setPage(nestedPageTitles[page] === sb.nestedHelp ? "help" : "privacy");

  function renderPage() {
    switch (page) {
      case "edit-profile":
        return (
          <EditProfilePage
            me={me}
            onBack={onBack}
            onProfileUpdated={setMe}
            onToast={showToast}
          />
        );
      case "notifications":
        return <NotifPage onBack={onBack} onToast={showToast} />;
      case "privacy":
        return (
          <PrivacyPage
            me={me}
            onBack={onBack}
            onNavigate={setPage}
            onProfileUpdated={setMe}
            onToast={showToast}
          />
        );
      case "appearance":
        return <AppearancePage onBack={onBack} />;
      case "language":
        return (
          <LanguagePage onBack={onBack} me={me} onProfileUpdated={setMe} onToast={showToast} />
        );
      case "help":
        return <HelpPage onBack={onBack} onNavigate={setPage} sidebar={sb} content={sc} />;
      case "blocked":
        return <BlockedPage onBack={onBack} onToast={showToast} />;
      case "close-circle":
        return <CloseCirclePage onBack={onBack} onToast={showToast} />;
      case "story":
        return (
          <SimpleTogglePage
            title={sb.itemStory}
            onBack={onBack}
            storageKey="linksy-settings-story"
            items={[
              { label: sc.storyLocShow, desc: sc.storyLocShowDesc },
              { label: sc.storyAutoArchive },
              { label: sc.storyNearby },
            ]}
          />
        );
      case "messages":
        return (
          <MessageSettingsPage
            me={me}
            onBack={onBack}
            onProfileUpdated={setMe}
            onToast={showToast}
          />
        );
      case "tags":
        return (
          <SimpleTogglePage
            title={sb.itemTags}
            onBack={onBack}
            storageKey="linksy-settings-tags"
            items={[
              { label: sc.tagsAllowPost },
              { label: sc.tagsApproveFirst },
              { label: sc.tagsAllowMentions },
            ]}
          />
        );
      case "comments":
        return (
          <SimpleTogglePage
            title={sb.itemComments}
            onBack={onBack}
            storageKey="linksy-settings-comments"
            items={[
              { label: sc.commentsAllow },
              { label: sc.commentsEveryone },
              { label: sc.commentsFilter },
            ]}
          />
        );
      case "muted":
        return <MutedPage onBack={onBack} onToast={showToast} />;
      case "creator-mode":
        return (
          <Page title={sb.itemCreatorMode} onBack={onBack}>
            <CardLabel label={sc.creatorUnlockLabel} />
            <CreatorToggle />
            <Card>
              <div className="sg-copy-card">
                <p>{sc.creatorBody}</p>
              </div>
            </Card>
          </Page>
        );
      case "change-password":
        return (
          <ChangePasswordPage
            key={me?.hasPassword === false ? "set-pw" : "chg-pw"}
            me={me}
            onBack={onBack}
            onToast={showToast}
          />
        );
      case "security-overview":
        return <SecurityOverviewPage onBack={onBack} />;
      case "sessions":
        return <SessionsPage onBack={onBack} onToast={showToast} />;
      case "passkeys":
        return <PasskeysPage onBack={onBack} onToast={showToast} />;
      case "developer":
        return <DeveloperPage onBack={onBack} onToast={showToast} />;
      case "two-factor":
        return (
          <TwoFactorPage
            me={me}
            onBack={onBack}
            onProfileUpdated={setMe}
            onToast={showToast}
          />
        );
      case "delete-account":
        return <DeleteAccountPage me={me} onBack={onBack} onToast={showToast} />;
      case "deactivate-account":
        return <DeactivateAccountPage me={me} onBack={onBack} onToast={showToast} />;
      case "export-data":
        return <ExportDataPage onBack={onBack} onToast={showToast} />;
      case "help-center":
        return (
          <TextPage
            title={sc.textHelpCenterTitle}
            onBack={onBack}
            sections={[
              { heading: sc.textHelpCenterH1, body: sc.textHelpCenterB1 },
              { heading: sc.textHelpCenterH2, body: sc.textHelpCenterB2 },
            ]}
          />
        );
      case "privacy-policy":
        return (
          <TextPage
            title={sc.textPrivacyPolicyTitle}
            onBack={onBack}
            sections={[
              { heading: sc.textPrivacyPolicyH1, body: sc.textPrivacyPolicyB1 },
              { heading: sc.textPrivacyPolicyH2, body: sc.textPrivacyPolicyB2 },
            ]}
          />
        );
      case "billing":
        return null;
      case "cookie-policy":
        return (
          <TextPage
            title={sc.textCookiePolicyTitle}
            onBack={onBack}
            sections={[
              { heading: sc.textCookiePolicyH1, body: sc.textCookiePolicyB1 },
              { heading: sc.textCookiePolicyH2, body: sc.textCookiePolicyB2 },
            ]}
          />
        );
      case "contact-support":
        return <ContactSupportPage onBack={onBack} content={sc} />;
      default:
        return null;
    }
  }

  return (
    <>
      <div className="sg-root">
        <aside className="sg-sidebar">
          <div className="sg-sidebar-top">
            <h1 className="sg-sidebar-title">{sb.title}</h1>
          </div>

          <div className="sg-search-wrap">
            <span className="sg-search-ic"><IcSearch /></span>
            <input
              className="sg-search"
              placeholder={sb.searchPh}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <nav className="sg-nav">
            {!filtered ? (
              <div className="sg-nav-section">
                <p className="sg-nav-section-lbl">{sb.yourAccount}</p>
                <div className="sg-acenter">
                  <AvatarPreview avatarUrl={me?.avatarUrl ?? null} displayName={me?.displayName ?? "Me"} className="sg-acenter-av" />
                  <div className="sg-acenter-body">
                    <p className="sg-acenter-name">{me?.displayName ?? sb.loading}</p>
                    <p className="sg-acenter-uname">
                      @{me?.username ?? "linksy"} Â· {sb.accountSub}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {(filtered ? [{ label: sb.results, items: filtered }] : navSections).map((section) => (
              <div key={section.label} className="sg-nav-section">
                <p className="sg-nav-section-lbl">{section.label}</p>
                {section.items.map((item) =>
                  item.key === "billing" ? (
                    <button
                      key={item.key}
                      type="button"
                      className="sg-nav-item"
                      onClick={() => {
                        router.push("/settings/billing");
                        setSearch("");
                      }}
                    >
                      <span className="sg-nav-ic">{item.icon()}</span>
                      <span className="sg-nav-lbl">{item.label}</span>
                    </button>
                  ) : (
                    <button
                      key={item.key}
                      type="button"
                      className={`sg-nav-item${page === item.key ? " sg-nav-item--active" : ""}`}
                      onClick={() => {
                        setPage(item.key);
                        setSearch("");
                      }}
                    >
                      <span className="sg-nav-ic">{item.icon()}</span>
                      <span className="sg-nav-lbl">{item.label}</span>
                    </button>
                  ),
                )}
              </div>
            ))}
          </nav>

          <button type="button" className="sg-sidebar-logout" onClick={logout}>
            <IcLogout />
            <span>{sb.logOut}</span>
          </button>
        </aside>

        <main className="sg-content">{renderPage()}</main>
      </div>

      {toast ? (
        <div className={`sg-toast${toast.kind === "success" ? " sg-toast--success" : " sg-toast--error"}`}>
          {toast.kind === "success" ? <IcCheck /> : <IcInfo />}
          <span>{toast.message}</span>
        </div>
      ) : null}

      <style>{`
        .sg-root {
          display: flex;
          height: 100%;
          min-height: calc(100vh - 60px);
          background: var(--app-background);
        }

        .sg-sidebar {
          width: 300px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          min-height: 0;
          max-height: 100vh;
          background: var(--app-background);
        }

        .sg-sidebar-top {
          padding: 1.25rem 1.25rem 0.5rem;
        }

        .sg-sidebar-title {
          margin: 0;
          font-size: 1.35rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.03em;
        }

        .sg-search-wrap {
          position: relative;
          padding: 0.4rem 1rem 0.7rem;
        }

        .sg-search-ic {
          position: absolute;
          top: 50%;
          left: 1.7rem;
          transform: translateY(-50%);
          color: var(--muted);
          display: flex;
          pointer-events: none;
        }

        .sg-search {
          width: 100%;
          box-sizing: border-box;
          border: none;
          outline: none;
          border-radius: 999px;
          padding: 0.56rem 0.85rem 0.56rem 2.2rem;
          background: var(--app-card-soft);
          color: var(--text);
          font-size: 0.875rem;
          font-family: inherit;
        }

        .sg-search::placeholder {
          color: var(--muted);
        }

        .sg-acenter {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          padding: 0.7rem 0.8rem;
          border-radius: 12px;
          background: var(--app-card);
        }

        .sg-acenter-av {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--app-accent), #a78bfa);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          font-weight: 800;
          flex-shrink: 0;
        }

        .sg-acenter-av--image {
          display: block;
          object-fit: cover;
        }

        .sg-acenter-body {
          min-width: 0;
          flex: 1;
        }

        .sg-acenter-name {
          margin: 0 0 0.1rem;
          color: var(--text);
          font-size: 0.88rem;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sg-acenter-uname {
          margin: 0;
          color: var(--muted);
          font-size: 0.72rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sg-nav {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 0 0.75rem 1rem;
          scrollbar-width: thin;
          scrollbar-color: var(--app-border) transparent;
        }

        .sg-nav::-webkit-scrollbar {
          width: 4px;
        }

        .sg-nav::-webkit-scrollbar-thumb {
          background: var(--app-border);
          border-radius: 4px;
        }

        .sg-nav-section {
          margin-bottom: 0.4rem;
        }

        .sg-nav-section-lbl {
          margin: 0;
          padding: 0.85rem 0.55rem 0.35rem;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .sg-nav-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.7rem;
          border: none;
          background: transparent;
          color: var(--muted);
          font: inherit;
          text-align: left;
          padding: 0.68rem 0.8rem;
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
        }

        .sg-nav-item:hover {
          background: var(--app-card-soft);
          color: var(--text);
        }

        .sg-nav-item--active {
          background: var(--app-card);
          color: var(--text);
          font-weight: 600;
        }

        .sg-nav-ic,
        .sg-nav-lbl {
          display: flex;
          align-items: center;
        }

        .sg-nav-lbl {
          flex: 1;
        }

        .sg-sidebar-logout {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.7rem;
          margin-top: auto;
          padding: 0.85rem 1.4rem;
          border: none;
          background: transparent;
          color: #ef4444;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
        }

        .sg-sidebar-logout:hover {
          background: rgba(239, 68, 68, 0.08);
        }

        .sg-content {
          flex: 1;
          overflow-y: auto;
        }

        .sg-content::-webkit-scrollbar {
          width: 4px;
        }

        .sg-content::-webkit-scrollbar-thumb {
          background: var(--app-border);
          border-radius: 999px;
        }

        .sg-page {
          display: flex;
          flex-direction: column;
          min-height: 100%;
        }

        .sg-page-head {
          position: sticky;
          top: 0;
          z-index: 5;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1.1rem 1.5rem;
          backdrop-filter: blur(12px);
          background: color-mix(in srgb, var(--app-background) 88%, transparent);
        }

        .sg-back-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 50%;
          background: var(--app-card-soft);
          color: var(--text);
          cursor: pointer;
        }

        .sg-page-title {
          margin: 0;
          color: var(--text);
          font-size: 1.08rem;
          font-weight: 800;
        }

        .sg-page-body {
          width: min(100%, 760px);
          margin: 0 auto;
          padding: 1.5rem 2rem 2rem;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .sg-card-label {
          margin: 0;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .sg-card {
          background: var(--app-card);
          border-radius: 14px;
          overflow: hidden;
        }

        .sg-row {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.95rem 1.1rem;
        }

        .sg-row--btn {
          width: 100%;
          border: none;
          background: transparent;
          text-align: left;
          cursor: pointer;
          font: inherit;
          transition: background 0.14s ease;
        }

        .sg-row--btn:hover {
          background: var(--app-card-soft);
        }

        .sg-row-ic {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: var(--app-card-soft);
          color: var(--text);
          flex-shrink: 0;
        }

        .sg-row-ic--danger {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.08);
        }

        .sg-row-body {
          flex: 1;
          min-width: 0;
        }

        .sg-row-label {
          display: block;
          color: var(--text);
          font-size: 0.92rem;
          font-weight: 500;
        }

        .sg-row-desc {
          display: block;
          margin-top: 0.12rem;
          color: var(--muted);
          font-size: 0.75rem;
        }

        .sg-row-right,
        .sg-row-chev {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        .sg-row--danger .sg-row-label {
          color: #ef4444;
        }

        .sg-tog {
          position: relative;
          width: 44px;
          height: 26px;
          border: none;
          border-radius: 999px;
          background: var(--app-border);
          cursor: pointer;
          padding: 0;
        }

        .sg-tog--on {
          background: var(--app-accent);
        }

        .sg-tog-dot {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.24);
          transition: transform 0.2s ease;
        }

        .sg-tog--on .sg-tog-dot {
          transform: translateX(18px);
        }

        .sg-tog:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .sg-avatar-block {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.1rem;
          background: var(--app-card);
          border-radius: 14px;
        }

        .sg-big-av {
          width: 58px;
          height: 58px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--app-accent), #a78bfa);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.15rem;
          font-weight: 800;
          flex-shrink: 0;
        }

        .sg-big-av--image {
          display: block;
          object-fit: cover;
        }

        .sg-avatar-meta {
          min-width: 0;
          flex: 1;
        }

        .sg-avatar-name {
          margin: 0 0 0.12rem;
          color: var(--text);
          font-size: 0.95rem;
          font-weight: 700;
        }

        .sg-avatar-copy {
          margin: 0;
          color: var(--muted);
          font-size: 0.8rem;
        }

        .sg-av-change {
          margin-left: auto;
          border: none;
          border-radius: 10px;
          background: var(--app-accent);
          color: #ffffff;
          padding: 0.55rem 1rem;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
        }

        .sg-av-change:disabled,
        .sg-primary-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .sg-field {
          padding: 0.85rem 1.1rem;
        }

        .sg-field--alone {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .sg-field-lbl {
          display: block;
          margin-bottom: 0.34rem;
          color: var(--muted);
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .sg-field-in,
        .sg-field-ta {
          width: 100%;
          border: none;
          outline: none;
          background: transparent;
          color: var(--text);
          font: inherit;
        }

        .sg-field-ta {
          resize: none;
        }

        .sg-field-in--muted {
          color: var(--muted);
          cursor: not-allowed;
        }

        .sg-field-error {
          margin: .3rem 0 0;
          color: #f87171;
          font-size: .76rem;
          font-weight: 600;
        }
        .sg-field [aria-invalid="true"].sg-field-in {
          outline: 2px solid rgba(239, 68, 68, 0.35);
          outline-offset: -1px;
        }

        .sg-email-meta {
          margin-top: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.55rem;
        }

        .sg-email-badge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.2rem 0.6rem;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .sg-email-badge--ok {
          background: rgba(22, 163, 74, 0.14);
          color: #16a34a;
        }

        .sg-email-badge--warn {
          background: rgba(245, 158, 11, 0.17);
          color: #d97706;
        }

        .sg-inline-btn {
          border: none;
          background: transparent;
          color: var(--app-accent);
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          padding: 0.15rem 0.2rem;
        }

        .sg-inline-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .sg-field-count {
          color: var(--muted);
          font-size: 0.7rem;
          text-align: right;
        }

        .sg-primary-btn {
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          border: none;
          border-radius: 12px;
          background: var(--app-accent);
          color: #ffffff;
          padding: 0.8rem 1rem;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
        }

        .sg-primary-btn--danger {
          background: #dc2626;
        }

        .sg-primary-btn--secondary {
          background: var(--app-card-soft);
          color: var(--text);
        }

        .sg-theme-grid {
          display: flex;
          gap: 0.75rem;
          padding: 0.9rem;
        }

        .sg-theme-opt {
          position: relative;
          flex: 1;
          border: none;
          border-radius: 12px;
          padding: 0.8rem;
          background: var(--app-card-soft);
          color: var(--muted);
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.55rem;
        }

        .sg-theme-opt--on {
          background: rgb(var(--app-accent-rgb) / 0.12);
          color: var(--text);
        }

        .sg-theme-thumb {
          width: 80px;
          height: 48px;
          border-radius: 8px;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .sg-theme-thumb--dark {
          background: #0f172a;
        }

        .sg-theme-thumb--light {
          background: #f3f4f6;
        }

        .sg-th-bar {
          width: 100%;
          height: 7px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.34);
        }

        .sg-th-bar--sm {
          width: 55%;
        }

        .sg-theme-tick {
          position: absolute;
          top: 8px;
          right: 8px;
          color: var(--app-accent);
        }

        .sg-swatches {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem;
          padding: 1rem;
        }

        .sg-swatch {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          cursor: pointer;
          opacity: 0.8;
          transition: transform 0.16s ease, opacity 0.16s ease;
        }

        .sg-swatch--on {
          opacity: 1;
          transform: scale(1.12);
        }

        .sg-swatch--light {
          box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.12);
          color: #111827;
        }

        .sg-inline-accent {
          color: var(--app-accent);
          display: inline-flex;
          align-items: center;
        }

        .sg-theme-opt:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .sg-theme-opt-title {
          font-size: 0.92rem;
          font-weight: 700;
          color: inherit;
        }

        .sg-theme-opt-sub {
          font-size: 0.72rem;
          font-weight: 500;
          color: var(--muted);
          line-height: 1.4;
          text-align: center;
        }

        .sg-theme-opt--on .sg-theme-opt-sub {
          color: var(--text);
          opacity: 0.78;
        }

        .sg-empty {
          padding: 2.5rem 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.5rem;
        }

        .sg-empty-icon {
          width: 48px;
          height: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: var(--app-card-soft);
          color: var(--muted);
        }

        .sg-empty-title {
          margin: 0;
          color: var(--text);
          font-size: 0.96rem;
          font-weight: 700;
        }

        .sg-empty-copy,
        .sg-copy-card p {
          margin: 0;
          color: var(--muted);
          font-size: 0.84rem;
          line-height: 1.65;
        }

        .sg-blocked-list {
          display: flex;
          flex-direction: column;
        }

        .sg-blocked-row {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.9rem 1rem;
          border-bottom: 1px solid var(--app-border);
        }

        .sg-blocked-row:last-child {
          border-bottom: none;
        }

        .sg-blocked-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--app-accent), #111827);
          color: #ffffff;
          font-size: 0.78rem;
          font-weight: 800;
          object-fit: cover;
        }

        .sg-blocked-avatar--image {
          background: var(--app-card-soft);
        }

        .sg-blocked-meta {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.12rem;
        }

        .sg-blocked-name {
          color: var(--text);
          font-size: 0.9rem;
          font-weight: 750;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sg-blocked-sub {
          color: var(--muted);
          font-size: 0.78rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sg-unblock-btn {
          border: none;
          border-radius: 10px;
          background: var(--app-card-soft);
          color: var(--text);
          padding: 0.5rem 0.8rem;
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
        }

        .sg-unblock-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .sg-muted-row .sg-blocked-meta { gap: 0.3rem; }
        .sg-muted-flags { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.2rem; }
        .sg-muted-chip {
          font-size: 0.68rem;
          font-weight: 700;
          padding: 0.22rem 0.55rem;
          border-radius: 999px;
          border: 1px solid var(--app-border);
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          transition: background 0.12s, border-color 0.12s, color 0.12s;
        }
        .sg-muted-chip:hover:not(:disabled) {
          border-color: var(--app-accent);
          color: var(--text);
        }
        .sg-muted-chip--on {
          background: rgba(var(--app-accent-rgb), 0.12);
          border-color: var(--app-accent);
          color: var(--app-accent);
        }
        .sg-muted-chip:disabled { cursor: not-allowed; opacity: 0.6; }

        .sg-sessions-list {
          display: flex;
          flex-direction: column;
        }

        .sg-session-row {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.9rem 1rem;
          border-bottom: 1px solid var(--app-border);
        }

        .sg-session-row:last-child {
          border-bottom: none;
        }

        .sg-session-ic {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--app-card-soft);
          color: var(--text);
        }

        .sg-session-meta {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.18rem;
        }

        .sg-session-name {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text);
          font-size: 0.9rem;
          font-weight: 750;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sg-session-tag {
          display: inline-flex;
          align-items: center;
          padding: 0.1rem 0.45rem;
          border-radius: 999px;
          background: var(--app-accent);
          color: #ffffff;
          font-size: 0.66rem;
          font-weight: 800;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .sg-session-sub {
          color: var(--muted);
          font-size: 0.78rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sg-session-btn {
          border: none;
          border-radius: 10px;
          background: var(--app-card-soft);
          color: var(--text);
          padding: 0.5rem 0.8rem;
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
        }

        .sg-session-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .sg-2fa-secret {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          padding: 0.85rem 1rem;
          border-bottom: 1px solid var(--app-border);
        }

        .sg-2fa-code {
          flex: 1;
          font-family: ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace;
          font-size: 0.95rem;
          letter-spacing: 0.08em;
          color: var(--text);
          word-break: break-all;
        }

        .sg-2fa-otpauth {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 0.85rem 1rem;
        }

        .sg-2fa-link {
          color: var(--app-accent);
          font-size: 0.78rem;
          word-break: break-all;
          text-decoration: none;
        }

        .sg-2fa-qr-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.25rem 1rem;
          border-bottom: 1px solid var(--app-border);
        }
        .sg-2fa-qr {
          display: inline-block;
          padding: 0.75rem;
          background: #ffffff;
          border-radius: 14px;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 4px 18px rgba(0,0,0,0.35);
          line-height: 0;
        }
        .sg-2fa-qr svg { display: block; }

        .sg-2fa-link:hover {
          text-decoration: underline;
        }

        .sg-2fa-backups {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0.5rem;
          padding: 0.9rem 1rem;
        }

        .sg-2fa-backup-code {
          display: inline-flex;
          justify-content: center;
          border-radius: 8px;
          padding: 0.5rem 0.55rem;
          background: var(--app-card-soft);
          color: var(--text);
          font-size: 0.78rem;
          letter-spacing: 0.04em;
          font-family: ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace;
        }

        .sg-copy-block {
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }

        .sg-copy-card {
          padding: 1rem 1.1rem;
        }

        .sg-version {
          margin: 0;
          color: var(--muted);
          font-size: 0.72rem;
          text-align: center;
        }

        .sg-toast {
          position: fixed;
          bottom: 1.5rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 50;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.72rem 1rem;
          border-radius: 12px;
          box-shadow: 0 10px 32px rgba(0, 0, 0, 0.24);
          font-size: 0.84rem;
          font-weight: 600;
        }

        .sg-toast--success {
          background: #16a34a;
          color: #ffffff;
        }

        .sg-toast--error {
          background: #dc2626;
          color: #ffffff;
        }

        @media (max-width: 900px) {
          .sg-root {
            flex-direction: column;
            height: auto;
          }

          .sg-sidebar {
            width: 100%;
            max-height: none;
            border-bottom: 1px solid var(--app-border);
          }

          .sg-nav {
            overflow-y: visible;
            min-height: 0;
          }

          .sg-page-body {
            width: 100%;
            padding: 1.25rem 1rem 1.5rem;
          }
        }

        @media (max-width: 640px) {
          .sg-avatar-block {
            align-items: flex-start;
            flex-wrap: wrap;
          }

          .sg-av-change {
            margin-left: 0;
          }

          .sg-theme-grid {
            flex-direction: column;
          }
        }

        /* ── Phone refinements (≤480px) ─────────────────────────────────────
           The 900px/640px breakpoints above only handle the sidebar→top
           collapse and the avatar/theme flex direction. On a 360-400px phone
           the 1.5rem/2rem page-body padding eats too much horizontal space,
           and the field inputs inherit a font size that can trigger iOS
           zoom-on-focus. Pin both here. */
        @media (max-width: 480px) {
          .sg-page-head {
            padding-inline: 0.85rem;
            gap: 0.65rem;
          }
          .sg-page-body {
            padding: 1rem 0.85rem 1.5rem;
          }
          .sg-row {
            padding: 0.85rem;
            gap: 0.7rem;
          }
          .sg-row-ic {
            width: 32px;
            height: 32px;
          }
          .sg-field-in,
          .sg-field-ta {
            /* font: inherit cascades from a context that can sit below 16px
               on the password / 2FA pages. Pin explicitly to avoid the iOS
               auto-zoom-on-focus jump. */
            font-size: 16px;
          }
          .sg-page-title {
            font-size: 1rem;
          }
        }

        /* Touch-device tap targets — WCAG 2.5.5. Back button is 34×34 and
           the toggle pill is 44×26 — both below the 44×44 floor on a coarse
           pointer. Expand here without inflating the desktop density. */
        @media (pointer: coarse) {
          .sg-back-btn {
            width: 44px;
            height: 44px;
          }
          .sg-tog {
            min-width: 44px;
            min-height: 28px;
          }
        }

        /* Disable hover-transitions + toggle slide for reduced-motion. */
        @media (prefers-reduced-motion: reduce) {
          .sg-row--btn,
          .sg-primary-btn,
          .sg-back-btn,
          .sg-tog,
          .sg-tog-dot {
            transition: none !important;
          }
        }
      `}</style>
    </>
  );
}

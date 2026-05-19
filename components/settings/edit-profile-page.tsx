"use client";

import { broadcastCurrentUserAvatarUpdate } from "@/components/current-user-avatar";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editProfileFormSchema, type EditProfileFormValues } from "@/lib/schemas/settings-forms";
import { AVATAR_IMAGE_MAX_SIZE, AVATAR_IMAGE_TYPES, type ProfileUser, type ToastHandler } from "./types";
import { formatUploadSize } from "./helpers";
import { AvatarPreview, Card, CardLabel, Page } from "./primitives";

export function EditProfilePage({
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
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<EditProfileFormValues>({
    resolver: zodResolver(editProfileFormSchema),
    defaultValues: { displayName: "", bio: "" },
  });
  const displayName = watch("displayName");
  const bioVal = watch("bio");

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    reset({
      displayName: me?.displayName ?? "",
      bio: me?.bio ?? "",
    });
    setAvatarUrl(me?.avatarUrl ?? null);
  }, [me, reset]);


  async function handleAvatarChange(file: File | null) {
    if (!file) {
      return;
    }

    if (!AVATAR_IMAGE_TYPES.has(file.type)) {
      onToast("error", "Please choose a JPG, PNG, WebP, or GIF image.");
      return;
    }

    if (file.size > AVATAR_IMAGE_MAX_SIZE) {
      onToast("error", `Avatar must be ${formatUploadSize(AVATAR_IMAGE_MAX_SIZE)} or less.`);
      return;
    }

    setUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", "avatar");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json().catch(() => null)) as { error?: string; url?: string } | null;

      if (!response.ok || !data?.url) {
        throw new Error(data?.error ?? "Could not upload the avatar.");
      }

      setAvatarUrl(data.url);
      onToast("success", "Avatar uploaded. Save changes to keep it.");
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Avatar upload failed.");
    } finally {
      setUploadingAvatar(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  const save = handleSubmit(async (values) => {
    const trimmedName = values.displayName.trim();
    const trimmedBio = values.bio.trim();

    setSaving(true);

    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatarUrl,
          bio: trimmedBio,
          displayName: trimmedName,
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string; user?: ProfileUser } | null;

      if (!response.ok || !data?.user) {
        throw new Error(data?.error ?? "Could not save your profile.");
      }

      onProfileUpdated(data.user);
      broadcastCurrentUserAvatarUpdate(data.user);
      onToast("success", "Profile updated.");
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  });

  return (
    <Page title="Edit profile" onBack={onBack}>
      <div className="sg-avatar-block">
        <AvatarPreview
          avatarUrl={avatarUrl}
          displayName={displayName || me?.displayName || "Me"}
          className="sg-big-av"
        />
        <div className="sg-avatar-meta">
          <p className="sg-avatar-name">{me?.username ?? "loading..."}</p>
          <p className="sg-avatar-copy">{displayName || me?.displayName || "Your profile"}</p>
        </div>
        <button
          type="button"
          className="sg-av-change"
          onClick={() => inputRef.current?.click()}
          disabled={uploadingAvatar}
        >
          {uploadingAvatar ? "Uploading..." : "Change photo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(event) => handleAvatarChange(event.target.files?.[0] ?? null)}
        />
      </div>

      <CardLabel label="Basic info" />
      <Card>
        <div className="sg-field">
          <span className="sg-field-lbl">Display name</span>
          <input
            className="sg-field-in"
            placeholder="Your name"
            maxLength={80}
            {...register("displayName")}
          />
          {errors.displayName ? <p className="field-error">{errors.displayName.message}</p> : null}
        </div>
        <div className="sg-field">
          <span className="sg-field-lbl">Username</span>
          <input className="sg-field-in sg-field-in--muted" value={me?.username ?? ""} readOnly />
        </div>
        <div className="sg-field">
          <span className="sg-field-lbl">Email</span>
          <input className="sg-field-in sg-field-in--muted" value={me?.email ?? ""} readOnly />
        </div>
      </Card>

      <CardLabel label="Bio" />
      <Card>
        <div className="sg-field sg-field--alone">
          <textarea
            className="sg-field-ta"
            rows={4}
            placeholder="Write a short intro..."
            maxLength={150}
            {...register("bio")}
          />
          <span className="sg-field-count">{(bioVal ?? "").length}/150</span>
          {errors.bio ? <p className="field-error">{errors.bio.message}</p> : null}
        </div>
      </Card>

      <button type="button" className="sg-primary-btn" onClick={save} disabled={saving || uploadingAvatar}>
        {saving ? "Saving..." : "Save changes"}
      </button>
    </Page>
  );
}

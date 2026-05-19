import { newPasswordSchema } from "@/lib/password-policy";
import { z } from "zod";

export const editProfileFormSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required.").max(80),
  bio: z.string().max(150),
});

export type EditProfileFormValues = z.infer<typeof editProfileFormSchema>;

export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirmation do not match.",
    path: ["confirmPassword"],
  });

/** Google-only accounts setting a password for the first time (no current password). */
export const setFirstPasswordFormSchema = z
  .object({
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirmation do not match.",
    path: ["confirmPassword"],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;
export type SetFirstPasswordFormValues = z.infer<typeof setFirstPasswordFormSchema>;

/** "HH:MM" time-of-day string used in the quiet-hours form (HTML `<input type="time">`). */
const TIME_OF_DAY_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export const quietHoursFormSchema = z
  .object({
    enabled: z.boolean(),
    start: z.string().regex(TIME_OF_DAY_RE, "Use HH:MM (24h)."),
    end: z.string().regex(TIME_OF_DAY_RE, "Use HH:MM (24h)."),
    timezone: z.string().trim().min(1, "Pick a timezone."),
  })
  .refine((data) => !data.enabled || data.start !== data.end, {
    message: "Start and end must differ.",
    path: ["end"],
  })
  .refine(
    (data) => {
      if (!data.timezone) return true;
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: data.timezone });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid timezone.", path: ["timezone"] },
  );

export type QuietHoursFormValues = z.infer<typeof quietHoursFormSchema>;

export const twoFactorVerifyFormSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator."),
});

export type TwoFactorVerifyFormValues = z.infer<typeof twoFactorVerifyFormSchema>;

export const deleteAccountFormSchema = z.object({
  confirmation: z.string().trim().min(1, "Type your username to confirm."),
});

export type DeleteAccountFormValues = z.infer<typeof deleteAccountFormSchema>;

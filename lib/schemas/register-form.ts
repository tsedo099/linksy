import { newPasswordSchema } from "@/lib/password-policy";
import { z } from "zod";

/** Same `<input type="date">` constraints used by the API schema in `api-bodies.ts`. */
const birthDateString = z
  .string()
  .min(1, "Pick your date of birth.")
  .refine(
    (value) => {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return false;
      if (d.getTime() > Date.now()) return false;
      if (d.getUTCFullYear() < 1900) return false;
      return true;
    },
    { message: "Pick a valid date (not in the future)." },
  );

export const GENDER_VALUES = ["FEMALE", "MALE", "NON_BINARY", "UNDISCLOSED"] as const;
export type GenderValue = (typeof GENDER_VALUES)[number];

export const registerFormSchema = z.object({
  displayName: z.string().trim().min(1, "Enter your display name."),
  username: z
    .string()
    .trim()
    .min(1, "Enter a username.")
    .regex(/^[a-zA-Z0-9_.]{3,20}$/, "Use 3-20 characters with letters, numbers, _ or ."),
  email: z.string().trim().min(1, "Enter your email address.").email("Enter a valid email address."),
  password: newPasswordSchema,
  /** Date of birth — required at signup but **not** age-restricted. */
  birthDate: birthDateString,
  /** Gender — required, but `UNDISCLOSED` ("prefer not to say") is offered as a no-op choice. */
  gender: z.enum(GENDER_VALUES, { message: "Pick a gender option." }),
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

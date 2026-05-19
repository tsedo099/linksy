import { z } from "zod";

export const loginFormSchema = z.object({
  email: z.string().trim().min(1, "Enter your email or username."),
  password: z.string().min(1, "Password is required.").min(8, "Password must be at least 8 characters."),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

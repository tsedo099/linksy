import { RegisterScreen } from "@/components/register-screen";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a Linksy account.",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return <RegisterScreen />;
}

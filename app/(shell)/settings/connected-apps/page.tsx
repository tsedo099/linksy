import { ConnectedAppsScreen } from "@/components/connected-apps-screen";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connected apps",
  description: "Manage third-party apps with access to your Linksy account.",
};

export default function ConnectedAppsPage() {
  return <ConnectedAppsScreen />;
}

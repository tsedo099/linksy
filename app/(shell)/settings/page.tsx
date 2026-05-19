import { SettingsScreen } from "@/components/settings-screen";

export default function SettingsPage() {
  // Wrapping in `.linksy-settings-route` lets globals.css override the
  // AppShell's `overflow: hidden; height: 100vh` on `.feed-main` so the
  // settings page can scroll naturally on both desktop and mobile.
  return (
    <div className="linksy-settings-route">
      <SettingsScreen />
    </div>
  );
}

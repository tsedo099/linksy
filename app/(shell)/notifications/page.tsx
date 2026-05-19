import "../../notifications.css";
import { NotificationsScreen } from "@/components/notifications-screen";

export default function NotificationsPage() {
  // .linksy-settings-route is the existing CSS hook (globals.css :has()) that
  // overrides AppShell's inline overflow:hidden + height:100vh so the page
  // scrolls. Without it the .ntf-page content was hidden under the mobile
  // top/bottom chrome on phones (visible as a blank notifications screen).
  return (
    <div className="linksy-settings-route">
      <NotificationsScreen />
    </div>
  );
}

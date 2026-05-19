import "../../profile.css";
import { Suspense } from "react";
import { ProfileScreen } from "@/components/profile-screen";

export default function ProfilePage() {
  return (
    <div className="linksy-profile-route">
      <Suspense>
        <ProfileScreen />
      </Suspense>
    </div>
  );
}

import { CreateScreen } from "@/components/create-screen";
import { Suspense } from "react";

export default function CreatePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "50vh",
            display: "grid",
            placeItems: "center",
            color: "var(--muted)",
            fontWeight: 700,
          }}
        >
          Loading…
        </div>
      }
    >
      <CreateScreen />
    </Suspense>
  );
}

/** Shared skeleton for per-segment route `loading.tsx` (Suspense fallback). */
export default function SegmentRouteLoading() {
  return (
    <div className="ghost-loading" role="status" aria-live="polite" aria-label="Loading">
      <div className="ghost-loading__orb" aria-hidden="true" />
      <div className="ghost-loading__stack" aria-hidden="true">
        <div className="ghost-loading__line ghost-loading__line--lg" />
        <div className="ghost-loading__line ghost-loading__line--md" />
        <div className="ghost-loading__line ghost-loading__line--sm" />
      </div>
    </div>
  );
}

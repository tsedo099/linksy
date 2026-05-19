"use client";

export function SkeletonPostCard() {
  return (
    <div className="sk-post-card">
      <div className="sk-post-header">
        <div className="sk sk-avatar-sq" />
        <div className="sk-post-meta">
          <div className="sk sk-line" style={{ width: "8rem" }} />
          <div className="sk sk-line sk-line--sm" style={{ width: "5rem" }} />
        </div>
      </div>
      <div className="sk-post-body">
        <div className="sk sk-line" style={{ width: "100%" }} />
        <div className="sk sk-line" style={{ width: "82%" }} />
        <div className="sk sk-line" style={{ width: "55%" }} />
      </div>
      <div className="sk sk-image" />
      <div className="sk-post-actions">
        <div className="sk sk-pill" />
        <div className="sk sk-pill" />
        <div className="sk sk-pill" />
      </div>
    </div>
  );
}

export function SkeletonConvoItem() {
  return (
    <div className="sk-convo-item">
      <div className="sk sk-avatar-circle" />
      <div className="sk-convo-meta">
        <div className="sk sk-line" style={{ width: "7rem" }} />
        <div className="sk sk-line sk-line--sm" style={{ width: "11rem" }} />
      </div>
    </div>
  );
}

export function SkeletonMessage({ mine = false }: { mine?: boolean }) {
  return (
    <div className={`sk-msg-row${mine ? " sk-msg-row--mine" : ""}`}>
      {!mine && <div className="sk sk-avatar-sm" />}
      <div className={`sk sk-bubble${mine ? " sk-bubble--mine" : ""}`}
        style={{ width: `${mine ? 9 : 12}rem` }} />
    </div>
  );
}

export function SkeletonProfileHeader() {
  return (
    <div className="sk-profile-header">
      <div className="sk sk-avatar-lg" />
      <div className="sk sk-line" style={{ width: "8rem" }} />
      <div className="sk sk-line sk-line--sm" style={{ width: "5.5rem" }} />
      <div className="sk-profile-stats">
        {[0, 1, 2].map(i => (
          <div key={i} className="sk-stat">
            <div className="sk sk-line" style={{ width: "2.5rem" }} />
            <div className="sk sk-line sk-line--sm" style={{ width: "3.5rem" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonGridItem() {
  return <div className="sk sk-grid-item" />;
}

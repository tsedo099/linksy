"use client";

type PostLocationMapProps = {
  location: string;
  title?: string;
};

/** Google Maps embed via search query (no API key). */
export function PostLocationMap({ location, title = "Location" }: PostLocationMapProps) {
  const q = location.trim();
  if (!q) return null;
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
  const openHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

  return (
    <div className="post-loc-map-wrap">
      <div className="post-loc-map-frame-shell">
        <iframe
          title={title}
          className="post-loc-map-frame"
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
      <a className="post-loc-map-open" href={openHref} target="_blank" rel="noopener noreferrer">
        Open in Google Maps
      </a>
    </div>
  );
}

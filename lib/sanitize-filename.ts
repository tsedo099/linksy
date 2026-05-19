/**
 * Guards against traversal and odd bytes when deriving storage names from client input.
 * Prefer random UUID filenames; use this whenever a basename could be influenced by users (exports, uploads).
 */

const CONTROL_RE = /[\u0000-\u001f\u007f]/g;

/** Single path segment suitable for POSIX/Windows-ish storage (no slashes, "..", NUL). */
export function sanitizePathSegment(segment: string, maxLen = 160): string {
  let base = segment.replace(/\\/g, "/").split("/").pop() ?? segment;
  base = base.replace(CONTROL_RE, "").trim();
  if (base === "" || base === "." || base === "..") return "unnamed";

  /** Strip leading dots — avoids hidden / sensitive names on POSIX. */
  base = base.replace(/^\.+/, "");
  if (base === "") return "unnamed";

  /** Allow letters, digits, hyphen, underscore, ASCII dot; collapse repeats. */
  base = base.replace(/[^a-zA-Z0-9._\-]+/g, "_").replace(/_+/g, "_");
  base = base.replace(/^\.+|\.+$/g, "");

  if (base === "" || base === "." || base === "..") return "unnamed";
  return base.slice(0, maxLen);
}

/** Returns `name.ext` with a safe basename and alphanumeric extension only. */
export function sanitizeFilename(name: string, defaultExt = "bin", maxLen = 120): string {
  const trimmed = sanitizePathSegment(name, maxLen);
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot >= trimmed.length - 1) {
    return `${trimmed}.${defaultExt}`;
  }

  let base = trimmed.slice(0, dot);
  let ext = trimmed.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ext === "") ext = defaultExt.replace(/^\./, "");
  if (!/^[a-z0-9]{1,16}$/.test(ext)) ext = defaultExt.replace(/^\./, "");
  base = base.slice(0, Math.min(base.length, maxLen));

  return `${base}.${ext}`;
}

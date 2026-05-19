"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

type Suggestion = { label: string };

export function LocationAutocompleteInput({
  value,
  onChange,
  placeholder = "Search location",
  maxLength = 80,
  disabled = false,
  className = "",
  inputClassName = "",
  inputStyle,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  inputStyle?: CSSProperties;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateMenuRect = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  const fetchSuggestions = useCallback(async (query: string) => {
    const t = query.trim();
    if (t.length < 2) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`/api/locations/geocode?q=${encodeURIComponent(t)}`, {
        credentials: "include",
      });
      const data = (await r.json()) as { suggestions?: Suggestion[] };
      setItems(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  useLayoutEffect(() => {
    if (!open || (!loading && items.length === 0)) {
      setMenuRect(null);
      return;
    }
    updateMenuRect();
    const onScrollOrResize = () => updateMenuRect();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, loading, items, updateMenuRect]);

  function scheduleFetch(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(query);
    }, 260);
  }

  function onInputChange(raw: string) {
    const next = raw.slice(0, maxLength);
    onChange(next);
    setOpen(true);
    if (next.trim().length < 2) {
      setItems([]);
      return;
    }
    scheduleFetch(next);
  }

  return (
    <div
      ref={wrapRef}
      className={`loc-ac-wrap${className ? ` ${className}` : ""}`}
    >
      <input
        className={inputClassName}
        style={inputStyle}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => onInputChange(e.target.value)}
        onFocus={() => {
          setOpen(true);
          if (value.trim().length >= 2) void fetchSuggestions(value);
        }}
      />
      {open && (items.length > 0 || loading) && menuRect ? (
        <ul
          className="loc-ac-dd loc-ac-dd--fixed"
          role="listbox"
          style={{
            position: "fixed",
            top: menuRect.top,
            left: menuRect.left,
            width: menuRect.width,
          }}
        >
          {loading ? (
            <li className="loc-ac-li loc-ac-li--muted" role="presentation">
              Searching…
            </li>
          ) : null}
          {items.map((s, i) => (
            <li key={`${i}-${s.label.slice(0, 48)}`} role="option">
              <button
                type="button"
                className="loc-ac-opt"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.label.slice(0, maxLength));
                  setOpen(false);
                }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

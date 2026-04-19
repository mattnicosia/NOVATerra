import { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";

/* ────────────────────────────────────────────────────────
   AddressAutocomplete — Mapbox-powered address search

   Returns geocoded data: { address, city, state, zip, lat, lng, fullAddress }
   Uses Mapbox Search API (free tier: 100K req/month)
   ──────────────────────────────────────────────────────── */

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

export default function AddressAutocomplete({ value = "", onChange, onGeocode, onBlur, style }) {
  const C = useTheme();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch suggestions from Mapbox
  const fetchSuggestions = useCallback(async (text) => {
    if (!text || text.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?` +
        `access_token=${MAPBOX_TOKEN}&country=US&types=address&limit=5&autocomplete=true`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.features) {
        setSuggestions(data.features.map(f => ({
          fullAddress: f.place_name,
          address: f.text + (f.address ? ` ${f.address}` : ""),
          lng: f.center[0],
          lat: f.center[1],
          city: f.context?.find(c => c.id.startsWith("place"))?.text || "",
          state: f.context?.find(c => c.id.startsWith("region"))?.short_code?.replace("US-", "") || "",
          zip: f.context?.find(c => c.id.startsWith("postcode"))?.text || "",
        })));
        setShowDropdown(true);
        setSelectedIndex(-1);
      }
    } catch (err) {
      console.warn("[AddressAutocomplete] Fetch failed:", err.message);
    }
  }, []);

  // Debounced search
  const handleInput = useCallback((text) => {
    setQuery(text);
    onChange?.(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(text), 250);
  }, [onChange, fetchSuggestions]);

  // Select a suggestion
  const handleSelect = useCallback((suggestion) => {
    setQuery(suggestion.fullAddress);
    setShowDropdown(false);
    setSuggestions([]);
    onChange?.(suggestion.fullAddress);
    onGeocode?.({
      address: suggestion.fullAddress,
      city: suggestion.city,
      state: suggestion.state,
      zip: suggestion.zip,
      lat: suggestion.lat,
      lng: suggestion.lng,
    });
  }, [onChange, onGeocode]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!showDropdown || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }, [showDropdown, suggestions, selectedIndex, handleSelect]);

  const dk = C.isDark;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        value={query}
        onChange={e => handleInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        onBlur={onBlur}
        placeholder="Start typing an address..."
        style={{
          ...style,
          width: "100%",
        }}
      />

      {/* Geocoded badge */}
      {value && query === value && (
        <div style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 8,
          color: C.accent || "#00D4AA",
          fontFamily: "'Barlow Condensed', sans-serif",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          opacity: 0.7,
        }}>
          📍 Verified
        </div>
      )}

      {/* Suggestions dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 100,
          background: dk ? "#1E2228" : "#fff",
          border: `1px solid ${dk ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
          borderRadius: 4,
          marginTop: 2,
          overflow: "hidden",
          boxShadow: dk
            ? "0 8px 24px rgba(0,0,0,0.6)"
            : "0 8px 24px rgba(0,0,0,0.12)",
        }}>
          {suggestions.map((s, i) => (
            <div
              key={i}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                fontSize: 13,
                color: dk ? "#e0ddd5" : "#1A1D24",
                background: selectedIndex === i
                  ? (dk ? "rgba(0,212,170,0.08)" : "rgba(0,116,228,0.06)")
                  : "transparent",
                borderBottom: i < suggestions.length - 1
                  ? `1px solid ${dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`
                  : "none",
                transition: "background 0.1s",
              }}
            >
              <div style={{ fontWeight: 500 }}>{s.address}</div>
              <div style={{
                fontSize: 11,
                color: dk ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
                marginTop: 2,
              }}>
                {s.city}{s.city && s.state ? ", " : ""}{s.state} {s.zip}
              </div>
            </div>
          ))}
          <div style={{
            padding: "4px 12px",
            fontSize: 9,
            color: dk ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
            textAlign: "right",
          }}>
            Powered by Mapbox
          </div>
        </div>
      )}
    </div>
  );
}

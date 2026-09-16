"use client";

import { useState } from "react";

import type { SessionView } from "@/lib/types";

interface Props {
  slug: string;
  /** True once this participant has already set a location (FR-2.4). */
  hasLocation: boolean;
  onUpdated: (view: SessionView) => void;
}

export function LocationForm({ slug, hasLocation, onUpdated }: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(body: { query: string } | { lat: number; lng: number }) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${slug}/location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Something went wrong. Try again.");
        return;
      }
      setQuery("");
      onUpdated(data as SessionView);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      // FR-7.4 — no dead end, just fall through to typing.
      setError("This browser cannot share your location. Type an address instead.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) =>
        void submit({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () => {
        setBusy(false);
        setError("We could not get your location. Type an address instead.");
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <form
      className="card loc-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (query.trim()) void submit({ query: query.trim() });
      }}
    >
      <h2>{hasLocation ? "Change where you are starting from" : "Where are you starting from?"}</h2>

      <div className="row">
        <input
          id="origin"
          className="field"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Address, postcode, or landmark"
          autoComplete="off"
          disabled={busy}
          aria-label="Your starting location"
        />
        <button className="btn" type="submit" disabled={busy || !query.trim()}>
          {busy ? "Locating…" : "Set"}
        </button>
      </div>

      <div className="row">
        <button className="btn secondary small" type="button" onClick={useMyLocation} disabled={busy}>
          Use my current location
        </button>
      </div>

      {error ? <p className="banner warn">{error}</p> : null}

      <p className="privacy-note">
        Rounded to about 100 m before it is stored, shown to the other person only
        as an area, and deleted when this session expires.
      </p>
    </form>
  );
}

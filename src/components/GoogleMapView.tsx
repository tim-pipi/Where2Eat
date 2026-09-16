"use client";

import { useEffect, useRef, useState } from "react";

import type { SeatLabels } from "@/lib/labels";
import type { LatLng, Place } from "@/lib/types";

interface Props {
  apiKey: string;
  originA: LatLng;
  originB: LatLng;
  midpoint: LatLng;
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  labels: SeatLabels;
}

/* Minimal surface of the Maps JS API we actually touch. */
interface MapsGlobal {
  maps: {
    Map: new (el: HTMLElement, options: Record<string, unknown>) => GMap;
    LatLngBounds: new () => GBounds;
    Marker: new (options: Record<string, unknown>) => GMarker;
    Point: new (x: number, y: number) => unknown;
    importLibrary?: (name: string) => Promise<unknown>;
  };
}
interface GMap {
  fitBounds: (bounds: GBounds, padding: number) => void;
  panTo: (position: LatLng) => void;
}
interface GBounds {
  extend: (position: LatLng) => void;
}
interface GMarker {
  setMap: (map: GMap | null) => void;
  addListener: (event: string, handler: () => void) => void;
  setIcon: (icon: unknown) => void;
  setZIndex: (z: number) => void;
}

declare global {
  interface Window {
    google?: MapsGlobal;
    __w2eMapsPromise?: Promise<void>;
  }
}

/** Load the Maps JS API once per page, however many maps mount. */
function loadMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (window.__w2eMapsPromise) return window.__w2eMapsPromise;

  window.__w2eMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&v=weekly`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });

  return window.__w2eMapsPromise;
}

function pin(color: string, scale: number, ring: string): Record<string, unknown> {
  return {
    path: "M 0,0 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0",
    fillColor: color,
    fillOpacity: 1,
    strokeColor: ring,
    strokeWeight: 2,
    scale,
  };
}

export function GoogleMapView({
  apiKey,
  originA,
  originB,
  midpoint,
  places,
  selectedId,
  onSelect,
  labels,
}: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const markersRef = useRef<Map<string, GMarker>>(new Map());
  const [failed, setFailed] = useState(false);

  // Build the map and its markers. Re-runs when the places themselves change.
  useEffect(() => {
    let cancelled = false;

    loadMaps(apiKey)
      .then(() => {
        if (cancelled || !container.current || !window.google) return;
        const maps = window.google.maps;

        const map =
          mapRef.current ??
          new maps.Map(container.current, {
            center: midpoint,
            zoom: 14,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
        mapRef.current = map;

        for (const marker of markersRef.current.values()) marker.setMap(null);
        markersRef.current.clear();

        const bounds = new maps.LatLngBounds();

        const a = new maps.Marker({
          position: originA,
          map,
          title: `${labels.a} — starting point`,
          icon: pin("#0f6a5f", 1.15, "#ffffff"),
          zIndex: 30,
        });
        const b = new maps.Marker({
          position: originB,
          map,
          title: `${labels.b} — starting point`,
          icon: pin("#a1620d", 1.15, "#ffffff"),
          zIndex: 30,
        });
        const mid = new maps.Marker({
          position: midpoint,
          map,
          title: "Midpoint between you",
          icon: pin("#7c3a68", 1, "#ffffff"),
          zIndex: 25,
        });
        markersRef.current.set("__a", a);
        markersRef.current.set("__b", b);
        markersRef.current.set("__mid", mid);

        bounds.extend(originA);
        bounds.extend(originB);
        bounds.extend(midpoint);

        for (const place of places) {
          const marker = new maps.Marker({
            position: place.location,
            map,
            title: place.name,
            icon: pin("#ffffff", 0.7, "#7c3a68"),
            zIndex: 10,
          });
          marker.addListener("click", () => onSelect(place.id));
          markersRef.current.set(place.id, marker);
          bounds.extend(place.location);
        }

        // Open framed on both origins and the midpoint (FR-5.3).
        map.fitBounds(bounds, 56);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, originA, originB, midpoint, places, onSelect, labels]);

  // Reflect the current selection (FR-5.4).
  useEffect(() => {
    for (const place of places) {
      const marker = markersRef.current.get(place.id);
      if (!marker) continue;
      const selected = place.id === selectedId;
      marker.setIcon(pin(selected ? "#7c3a68" : "#ffffff", selected ? 1.05 : 0.7, selected ? "#ffffff" : "#7c3a68"));
      marker.setZIndex(selected ? 40 : 10);
    }
    if (selectedId) {
      const place = places.find((p) => p.id === selectedId);
      if (place) mapRef.current?.panTo(place.location);
    }
  }, [selectedId, places]);

  if (failed) {
    return (
      <div className="empty">
        <h2>The map could not load</h2>
        <p>The list below has everything, including how far each place is from each of you.</p>
      </div>
    );
  }

  return <div ref={container} className="map-canvas" />;
}

"use client";

import { useEffect, useRef, useState } from "react";

import type { SeatLabels } from "@/lib/labels";
import {
  loadMapsLibraries,
  MapsLoadError,
  type GMap,
  type GMarker,
} from "@/lib/maps-loader";
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
  const [error, setError] = useState<{ message: string; hint: string } | null>(null);

  // Labels only affect marker tooltips, so they are read through a ref rather
  // than a dependency — a new labels object each render would otherwise tear
  // down and rebuild the entire map.
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  useEffect(() => {
    let cancelled = false;

    loadMapsLibraries(apiKey)
      .then((maps) => {
        if (cancelled || !container.current) return;
        const names = labelsRef.current;

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

        markersRef.current.set(
          "__a",
          new maps.Marker({
            position: originA,
            map,
            title: `${names.a} — starting point`,
            icon: pin("#0f6a5f", 1.15, "#ffffff"),
            zIndex: 30,
          }),
        );
        markersRef.current.set(
          "__b",
          new maps.Marker({
            position: originB,
            map,
            title: `${names.b} — starting point`,
            icon: pin("#a1620d", 1.15, "#ffffff"),
            zIndex: 30,
          }),
        );
        markersRef.current.set(
          "__mid",
          new maps.Marker({
            position: midpoint,
            map,
            title: "Midpoint between you",
            icon: pin("#7c3a68", 1, "#ffffff"),
            zIndex: 25,
          }),
        );

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
      .catch((cause: unknown) => {
        if (cancelled) return;
        console.error("[where2eat] Google Maps failed to load:", cause);
        setError(
          cause instanceof MapsLoadError && cause.isAuthFailure
            ? {
                message: "Google rejected the map key",
                hint: "Check that this site is an allowed referrer for the browser key, that the Maps JavaScript API is enabled, and that billing is on for the project.",
              }
            : {
                message: "The map could not load",
                hint: "The list still has everything, including how far each place is from each of you.",
              },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, originA, originB, midpoint, places, onSelect]);

  // Reflect the current selection (FR-5.4).
  useEffect(() => {
    for (const place of places) {
      const marker = markersRef.current.get(place.id);
      if (!marker) continue;
      const selected = place.id === selectedId;
      marker.setIcon(
        pin(
          selected ? "#7c3a68" : "#ffffff",
          selected ? 1.05 : 0.7,
          selected ? "#ffffff" : "#7c3a68",
        ),
      );
      marker.setZIndex(selected ? 40 : 10);
    }
    if (selectedId) {
      const place = places.find((p) => p.id === selectedId);
      if (place) mapRef.current?.panTo(place.location);
    }
  }, [selectedId, places]);

  if (error) {
    return (
      <div className="empty">
        <h2>{error.message}</h2>
        <p>{error.hint}</p>
      </div>
    );
  }

  return <div ref={container} className="map-canvas" />;
}

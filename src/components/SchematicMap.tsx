"use client";

import { useMemo } from "react";

import type { SeatLabels } from "@/lib/labels";
import type { LatLng, Place } from "@/lib/types";

interface Props {
  originA: LatLng;
  originB: LatLng;
  midpoint: LatLng;
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  labels: SeatLabels;
}

const WIDTH = 600;
const HEIGHT = 460;
const PAD = 54;

/**
 * Fallback for when no Google Maps browser key is configured.
 *
 * Deliberately schematic rather than a different tile provider: Google's terms
 * do not allow Places data on a non-Google map, and a plain plot of the two
 * origins against the midpoint is honest about being a diagram, not a map.
 */
export function SchematicMap({
  originA,
  originB,
  midpoint,
  places,
  selectedId,
  onSelect,
  labels,
}: Props) {
  const project = useMemo(() => {
    const points = [originA, originB, midpoint, ...places.map((p) => p.location)];
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    // Guard against a zero-size span when everything coincides.
    const spanLat = Math.max(maxLat - minLat, 1e-4);
    const spanLng = Math.max(maxLng - minLng, 1e-4);

    // Keep the aspect honest: one degree of longitude is shorter than one of
    // latitude away from the equator.
    const lngScale = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const scale = Math.min(
      (WIDTH - PAD * 2) / (spanLng * lngScale),
      (HEIGHT - PAD * 2) / spanLat,
    );

    const centreLat = (minLat + maxLat) / 2;
    const centreLng = (minLng + maxLng) / 2;

    return (point: LatLng) => ({
      x: WIDTH / 2 + (point.lng - centreLng) * lngScale * scale,
      y: HEIGHT / 2 - (point.lat - centreLat) * scale,
    });
  }, [originA, originB, midpoint, places]);

  const a = project(originA);
  const b = project(originB);
  const m = project(midpoint);

  return (
    <svg
      className="map-canvas"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Schematic showing ${labels.a} and ${labels.b} starting points, the midpoint between them, and each suggested place.`}
    >
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="var(--surface-2)" />

      <line
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke="var(--ink-3)" strokeWidth="1.25" strokeDasharray="5 5" opacity="0.5"
      />
      <circle cx={m.x} cy={m.y} r="46" fill="var(--mid)" opacity="0.07" />

      {places.map((place) => {
        const point = project(place.location);
        const selected = place.id === selectedId;
        return (
          <g
            key={place.id}
            onClick={() => onSelect(selected ? null : place.id)}
            style={{ cursor: "pointer" }}
          >
            <title>{place.name}</title>
            <circle
              cx={point.x}
              cy={point.y}
              r={selected ? 8 : 5}
              fill={selected ? "var(--mid)" : "var(--surface)"}
              stroke="var(--mid)"
              strokeWidth={selected ? 2.5 : 1.5}
            />
          </g>
        );
      })}

      <circle cx={m.x} cy={m.y} r="7" fill="var(--mid)" />
      <circle cx={m.x} cy={m.y} r="12" fill="none" stroke="var(--mid)" strokeWidth="1.5" />

      <circle cx={a.x} cy={a.y} r="8" fill="var(--a)" stroke="var(--surface)" strokeWidth="2" />
      <circle cx={b.x} cy={b.y} r="8" fill="var(--b)" stroke="var(--surface)" strokeWidth="2" />

      <text
        x={a.x} y={a.y - 15} textAnchor="middle"
        fill="var(--a)" fontFamily="var(--mono)" fontSize="11" fontWeight="500"
      >
        {labels.a.toUpperCase()}
      </text>
      <text
        x={b.x} y={b.y - 15} textAnchor="middle"
        fill="var(--b)" fontFamily="var(--mono)" fontSize="11" fontWeight="500"
      >
        {labels.b.toUpperCase()}
      </text>
    </svg>
  );
}

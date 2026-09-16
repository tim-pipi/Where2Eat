"use client";

import { useEffect, useRef } from "react";

import { formatDistance } from "@/lib/geo";
import type { SeatLabels } from "@/lib/labels";
import type { Place } from "@/lib/types";

interface Props {
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Resolved per-seat wording, so "you" and "them" are never the wrong way round. */
  labels: SeatLabels;
}

export function PlaceList({ places, selectedId, onSelect, labels }: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // Selecting a marker on the map scrolls the list to match (FR-5.4).
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const node = listRef.current.querySelector(`[data-place-id="${CSS.escape(selectedId)}"]`);
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  if (places.length === 0) {
    return (
      <div className="card empty">
        <h2>Nothing found between you</h2>
        <p>
          The midpoint may be somewhere without many places to eat. Try moving one
          of your starting points.
        </p>
      </div>
    );
  }

  const furthest = Math.max(...places.flatMap((p) => [p.distanceFromA, p.distanceFromB]));

  return (
    <div className="place-list" ref={listRef}>
      {places.map((place, index) => {
        const selected = place.id === selectedId;
        // "Even" once the gap is under 400m — below that the difference is
        // smaller than the walk from the station, so calling it uneven is noise.
        const even = place.fairnessGap < 400;

        return (
          <button
            key={place.id}
            type="button"
            className="place"
            data-place-id={place.id}
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : place.id)}
          >
            <span className="rank">{String(index + 1).padStart(2, "0")}</span>

            <span>
              <span className="name">{place.name}</span>

              <span className="facts">
                {place.rating !== null ? (
                  <span className="rating">
                    ★ {place.rating.toFixed(1)}
                    {place.reviewCount !== null ? ` (${place.reviewCount.toLocaleString()})` : ""}
                  </span>
                ) : null}
                {place.category ? <span>{place.category}</span> : null}
                {place.priceLevel !== null && place.priceLevel > 0 ? (
                  <span>{"$".repeat(place.priceLevel)}</span>
                ) : null}
                {place.openNow !== null ? (
                  <span className={place.openNow ? "open" : "closed"}>
                    {place.openNow ? "Open now" : "Closed"}
                  </span>
                ) : null}
              </span>

              {/* Distance from each person, side by side (FR-4.6). */}
              <span className="walk">
                <span className="leg a">
                  <span className="seat-dot a" aria-hidden="true" />
                  <span>{labels.a}</span>
                  <span className="bar">
                    <i style={{ width: `${(place.distanceFromA / furthest) * 100}%` }} />
                  </span>
                  <span className="num">{formatDistance(place.distanceFromA)}</span>
                </span>
                <span className="leg b">
                  <span className="seat-dot b" aria-hidden="true" />
                  <span>{labels.b}</span>
                  <span className="bar">
                    <i style={{ width: `${(place.distanceFromB / furthest) * 100}%` }} />
                  </span>
                  <span className="num">{formatDistance(place.distanceFromB)}</span>
                </span>
              </span>

              <span className={even ? "fairness even" : "fairness"}>
                {even
                  ? "Evenly split"
                  : `${formatDistance(place.fairnessGap)} further for ${
                      place.distanceFromA > place.distanceFromB ? labels.aInline : labels.bInline
                    }`}
              </span>

              {selected && place.mapsUrl ? (
                <span style={{ display: "block", marginTop: 10 }}>
                  <a
                    className="btn secondary small"
                    href={place.mapsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(event) => event.stopPropagation()}
                    style={{ textDecoration: "none", display: "inline-block" }}
                  >
                    Open in Google Maps
                  </a>
                </span>
              ) : null}

              {selected && place.attributions.length > 0 ? (
                <span className="fairness" style={{ display: "block" }}>
                  {place.attributions.join(" · ")}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

import type { LatLng } from "./types";

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Geographic midpoint along the great circle (FR-3.2).
 *
 * Not the naive average of the coordinates: that drifts badly at high
 * latitudes and breaks outright across the antimeridian.
 */
export function midpoint(a: LatLng, b: LatLng): LatLng {
  const lat1 = toRad(a.lat);
  const lng1 = toRad(a.lng);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);

  const bx = Math.cos(lat2) * Math.cos(dLng);
  const by = Math.cos(lat2) * Math.sin(dLng);

  const lat3 = Math.atan2(
    Math.sin(lat1) + Math.sin(lat2),
    Math.sqrt((Math.cos(lat1) + bx) ** 2 + by ** 2),
  );
  const lng3 = lng1 + Math.atan2(by, Math.cos(lat1) + bx);

  return {
    lat: toDeg(lat3),
    // Normalise back into [-180, 180].
    lng: ((toDeg(lng3) + 540) % 360) - 180,
  };
}

/**
 * Search radius scaled to how far apart the two people are (FR-4.2):
 * 10% of the separation, clamped to 500m - 5km.
 */
export function searchRadiusFor(separationMetres: number): number {
  return Math.round(Math.min(5000, Math.max(500, separationMetres * 0.1)));
}

/**
 * Truncate to ~3dp (~100m) before storage or client exposure (PR-4).
 *
 * Rounds rather than floors so the error stays centred on the true point
 * instead of drifting consistently south-west.
 */
export function coarsen(point: LatLng): LatLng {
  return {
    lat: Math.round(point.lat * 1000) / 1000,
    lng: Math.round(point.lng * 1000) / 1000,
  };
}

/** Human-readable distance, tuned for glanceability rather than precision. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  if (metres < 10_000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres / 1000)} km`;
}

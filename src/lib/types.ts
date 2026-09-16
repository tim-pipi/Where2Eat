/** Shared domain types. These are the shapes the API speaks. */

export type Seat = "A" | "B";

export interface LatLng {
  lat: number;
  lng: number;
}

/** A participant as the *other* person is allowed to see them (PR-3). */
export interface PublicParticipant {
  seat: Seat;
  /** Approximate area label, never a precise street address. */
  areaLabel: string | null;
  /** Coordinates truncated to ~100m before they ever leave the server (PR-4). */
  location: LatLng | null;
  joinedAt: number;
}

export interface Place {
  id: string;
  name: string;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  /** Google price level, 0-4, where available. */
  priceLevel: number | null;
  openNow: boolean | null;
  address: string | null;
  location: LatLng;
  /** Metres from the computed meeting point. */
  distanceFromMidpoint: number;
  /** Metres from each participant, for the fairness display (FR-4.6). */
  distanceFromA: number;
  distanceFromB: number;
  /** |distanceFromA - distanceFromB| in metres. Lower is fairer. */
  fairnessGap: number;
  photoUrl: string | null;
  /** Google's required per-place attributions, if any.  */
  attributions: string[];
  mapsUrl: string | null;
  score: number;
}

export type SessionStatus = "waiting" | "ready" | "expired";

export interface SessionView {
  slug: string;
  status: SessionStatus;
  /** Which seat *you* hold in this session, or null if you are a spectator. */
  yourSeat: Seat | null;
  participants: PublicParticipant[];
  midpoint: LatLng | null;
  /** Straight-line distance between the two origins, in metres. */
  separation: number | null;
  /** Radius actually searched, in metres. */
  searchRadius: number | null;
  places: Place[];
  /** True when places came from fixtures because no Google key is configured. */
  demoMode: boolean;
  /** Surfaced verbatim so the UI can explain a degraded result honestly. */
  notice: string | null;
  expiresAt: number;
  /** Bumps on every state change, so clients can poll cheaply. */
  version: number;
}

import type { LatLng, Place, Seat } from "../types.ts";

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // FR-1.6

export interface StoredParticipant {
  seat: Seat;
  tokenHash: string;
  location: LatLng | null;
  areaLabel: string | null;
  joinedAt: number;
  /** Bumped on every write, and what the session's version is derived from. */
  updatedAt: number;
}

export interface StoredSession {
  slug: string;
  createdAt: number;
  expiresAt: number;
  participants: StoredParticipant[];
  version: number;
}

export interface CachedResults {
  /** Both origins, so changing a location invalidates immediately. */
  signature: string;
  places: Place[];
  notice: string | null;
  fetchedAt: number;
}

export interface SessionStore {
  /** Create a session and claim seat A for the creator. */
  create(): Promise<{ session: StoredSession; token: string }>;
  get(slug: string): Promise<StoredSession | null>;
  /** Claim the free seat, or null when both are taken (the caller spectates). */
  join(slug: string): Promise<{ session: StoredSession; token: string } | null>;
  setLocation(
    slug: string,
    seat: Seat,
    location: LatLng,
    areaLabel: string | null,
  ): Promise<StoredSession | null>;
  getResults(slug: string): Promise<CachedResults | null>;
  setResults(slug: string, results: CachedResults, ttlMs: number): Promise<void>;
  /** Human-readable backend name, for the health endpoint. */
  readonly kind: string;
}

/**
 * A session's version is the latest write across its participants, so it rises
 * monotonically without any shared counter that two writers could clobber.
 */
export function versionOf(createdAt: number, participants: StoredParticipant[]): number {
  return participants.reduce((latest, p) => Math.max(latest, p.updatedAt), createdAt);
}

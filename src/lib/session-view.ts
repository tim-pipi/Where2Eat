import { coarsen, haversine, midpoint, searchRadiusFor } from "./geo";
import { isDemoMode, searchPlaces } from "./places";
import { getStore, type StoredSession } from "./store";
import type { LatLng, Place, PublicParticipant, Seat, SessionView } from "./types";

const RESULT_TTL_MS = 10 * 60 * 1000;

export async function buildView(
  session: StoredSession,
  yourSeat: Seat | null,
): Promise<SessionView> {
  const participants: PublicParticipant[] = session.participants
    .map((p) => ({
      seat: p.seat,
      areaLabel: p.areaLabel,
      location: p.location,
      joinedAt: p.joinedAt,
    }))
    .sort((a, b) => a.seat.localeCompare(b.seat));

  const a = participants.find((p) => p.seat === "A")?.location ?? null;
  const b = participants.find((p) => p.seat === "B")?.location ?? null;

  const base = {
    slug: session.slug,
    yourSeat,
    participants,
    demoMode: isDemoMode(),
    expiresAt: session.expiresAt,
    version: session.version,
  };

  if (!a || !b) {
    return {
      ...base,
      status: "waiting" as const,
      midpoint: null,
      separation: null,
      searchRadius: null,
      places: [],
      notice: null,
    };
  }

  const centre = coarsen(midpoint(a, b));
  const separation = haversine(a, b);
  const searchRadius = searchRadiusFor(separation);

  let notice: string | null = null;
  if (separation < 1000) {
    // FR-3.4 — a midpoint between two points a few streets apart is noise.
    notice = "You are both starting from roughly the same place, so these are just the best spots nearby.";
  } else if (separation > 150_000) {
    // FR-3.5 — honest about the limits rather than confidently wrong.
    notice = `You are ${Math.round(separation / 1000)} km apart, so the midpoint may not be somewhere either of you wants to go.`;
  }

  const signature = `${a.lat},${a.lng}|${b.lat},${b.lng}`;
  const store = getStore();
  const cached = await store.getResults(session.slug);
  let places: Place[];

  if (cached && cached.signature === signature) {
    places = cached.places;
    notice = notice ?? cached.notice;
  } else {
    try {
      const result = await searchPlaces(centre, searchRadius, a, b);
      places = result.places;
      notice = notice ?? result.notice;
      // Cached so that polling clients never re-bill a Places search.
      await store.setResults(
        session.slug,
        { signature, places, notice: result.notice, fetchedAt: Date.now() },
        RESULT_TTL_MS,
      );
    } catch (error) {
      // FR-7.3 — serve whatever we have rather than a blank page.
      console.error("[where2eat] place search failed:", error);
      places = cached?.places ?? [];
      notice = places.length
        ? "Google Places is not responding, so these results may be a few minutes old."
        : "We could not reach Google Places just now. Try again in a moment.";
    }
  }

  return {
    ...base,
    status: "ready" as const,
    midpoint: centre,
    separation,
    searchRadius,
    places,
    notice,
  };
}

export function expiredView(slug: string): SessionView {
  return {
    slug,
    status: "expired",
    yourSeat: null,
    participants: [],
    midpoint: null,
    separation: null,
    searchRadius: null,
    places: [],
    demoMode: isDemoMode(),
    notice: null,
    expiresAt: 0,
    version: 0,
  };
}

export type { LatLng };

import { coarsen, haversine } from "./geo";
import type { LatLng, Place } from "./types";

const PLACES_ROOT = "https://places.googleapis.com/v1";
const GEOCODE_ROOT = "https://maps.googleapis.com/maps/api/geocode/json";

const serverKey = () => process.env.GOOGLE_MAPS_SERVER_KEY?.trim() || "";

/** No key configured → fixtures, so the app is runnable and demoable as-is. */
export const isDemoMode = () => serverKey() === "";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.currentOpeningHours.openNow",
  "places.primaryTypeDisplayName",
  "places.photos",
  "places.googleMapsUri",
  "places.attributions",
].join(",");

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  currentOpeningHours?: { openNow?: boolean };
  primaryTypeDisplayName?: { text?: string };
  photos?: { name?: string }[];
  googleMapsUri?: string;
  attributions?: { provider?: string }[];
}

export interface SearchResult {
  places: Place[];
  notice: string | null;
}

/**
 * Popular food places around the meeting point (FR-4.1).
 *
 * Widens the radius once if the first pass comes back thin — the midpoint of
 * two arbitrary points lands in a park, on water or on a motorway often enough
 * to matter (FR-3.6).
 */
export async function searchPlaces(
  centre: LatLng,
  radius: number,
  originA: LatLng,
  originB: LatLng,
): Promise<SearchResult> {
  if (isDemoMode()) {
    return { places: demoPlaces(centre, radius, originA, originB), notice: null };
  }

  let notice: string | null = null;
  let raw = await nearbySearch(centre, radius);

  if (raw.length < 5 && radius < 5000) {
    const widened = Math.min(5000, radius * 2.5);
    const second = await nearbySearch(centre, widened);
    if (second.length > raw.length) {
      raw = second;
      radius = widened;
      notice =
        "Not much right at the midpoint, so we widened the search a little.";
    }
  }

  const places = raw
    .map((p) => toPlace(p, centre, radius, originA, originB))
    .filter((p): p is Place => p !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30); // FR-4.3

  return { places, notice };
}

async function nearbySearch(centre: LatLng, radius: number): Promise<GooglePlace[]> {
  const response = await fetch(`${PLACES_ROOT}/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": serverKey(),
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: ["restaurant", "cafe", "bakery", "bar"],
      excludedTypes: ["lodging"],
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      locationRestriction: {
        circle: {
          center: { latitude: centre.lat, longitude: centre.lng },
          radius,
        },
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Places search failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as { places?: GooglePlace[] };
  return data.places ?? [];
}

function toPlace(
  raw: GooglePlace,
  centre: LatLng,
  radius: number,
  originA: LatLng,
  originB: LatLng,
): Place | null {
  if (!raw.location || !raw.id) return null;

  const location = { lat: raw.location.latitude, lng: raw.location.longitude };
  const distanceFromMidpoint = haversine(centre, location);
  const distanceFromA = haversine(originA, location);
  const distanceFromB = haversine(originB, location);
  const photo = raw.photos?.[0]?.name;

  return {
    id: raw.id,
    name: raw.displayName?.text ?? "Unnamed place",
    category: raw.primaryTypeDisplayName?.text ?? null,
    rating: raw.rating ?? null,
    reviewCount: raw.userRatingCount ?? null,
    priceLevel: raw.priceLevel ? (PRICE_LEVELS[raw.priceLevel] ?? null) : null,
    openNow: raw.currentOpeningHours?.openNow ?? null,
    address: raw.formattedAddress ?? null,
    location,
    distanceFromMidpoint,
    distanceFromA,
    distanceFromB,
    fairnessGap: Math.abs(distanceFromA - distanceFromB),
    // Proxied so the API key never reaches the browser.
    photoUrl: photo ? `/api/photo?name=${encodeURIComponent(photo)}` : null,
    attributions: (raw.attributions ?? [])
      .map((a) => a.provider)
      .filter((a): a is string => Boolean(a)),
    mapsUrl: raw.googleMapsUri ?? null,
    score: score({
      rating: raw.rating ?? null,
      reviewCount: raw.userRatingCount ?? null,
      distanceFromMidpoint,
      radius,
    }),
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * "Popular" as a blend of how good it is, how many people said so, and how
 * close it is to the middle (FR-4.4). Weights live here so they are one edit
 * away from being tuned.
 */
function score(input: {
  rating: number | null;
  reviewCount: number | null;
  distanceFromMidpoint: number;
  radius: number;
}): number {
  // 3.0 stars scores zero; 5.0 scores one. Below 3 adds nothing.
  const quality = input.rating === null ? 0.35 : clamp01((input.rating - 3) / 2);

  // Logarithmic: the gap between 10 and 100 reviews means far more than
  // the gap between 1000 and 1090.
  const reviews = input.reviewCount ?? 0;
  const popularity = clamp01(Math.log10(reviews + 1) / Math.log10(2000));

  const proximity = clamp01(1 - input.distanceFromMidpoint / Math.max(1, input.radius));

  return quality * 0.45 + popularity * 0.3 + proximity * 0.25;
}

// --- Geocoding -------------------------------------------------------------

export interface GeocodeResult {
  location: LatLng;
  label: string;
}

/** Resolve typed text to a point (FR-2.3). */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  if (isDemoMode()) return demoGeocode(query);

  const url = `${GEOCODE_ROOT}?address=${encodeURIComponent(query)}&key=${serverKey()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Geocoding failed (${response.status})`);

  const data = (await response.json()) as {
    status: string;
    results?: {
      formatted_address?: string;
      geometry?: { location?: { lat: number; lng: number } };
      address_components?: { long_name: string; types: string[] }[];
    }[];
  };

  const top = data.results?.[0];
  if (!top?.geometry?.location) return null;

  return {
    location: { lat: top.geometry.location.lat, lng: top.geometry.location.lng },
    label: areaLabelFrom(top.address_components, top.formatted_address),
  };
}

/** Coarse label for a pair of coordinates — never a street address (PR-3). */
export async function reverseGeocode(point: LatLng): Promise<string> {
  if (isDemoMode()) return demoAreaLabel(point);

  const url =
    `${GEOCODE_ROOT}?latlng=${point.lat},${point.lng}` +
    `&result_type=neighborhood|sublocality|locality|postal_town&key=${serverKey()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return demoAreaLabel(point);

  const data = (await response.json()) as {
    results?: { address_components?: { long_name: string; types: string[] }[] }[];
  };
  const components = data.results?.[0]?.address_components;
  return components ? areaLabelFrom(components, null) : demoAreaLabel(point);
}

/**
 * Pick the most specific *area* component available, in preference order.
 * Deliberately never reads street_number or route (PR-3).
 */
function areaLabelFrom(
  components: { long_name: string; types: string[] }[] | undefined,
  fallback: string | null | undefined,
): string {
  const preferred = [
    "neighborhood",
    "sublocality_level_1",
    "sublocality",
    "postal_town",
    "locality",
    "administrative_area_level_2",
    "administrative_area_level_1",
  ];
  for (const type of preferred) {
    const hit = components?.find((c) => c.types.includes(type));
    if (hit) return hit.long_name;
  }
  // Last resort: the coarsest half of a formatted address.
  if (fallback) {
    const parts = fallback.split(",").map((p) => p.trim());
    return parts.length > 1 ? parts.slice(-2).join(", ") : parts[0];
  }
  return "Unknown area";
}

// --- Demo mode -------------------------------------------------------------

const DEMO_NAMES: [string, string][] = [
  ["Golden Spoon Kitchen", "Cantonese"],
  ["Marumi Ramen Bar", "Ramen"],
  ["The Corner Prata", "Indian"],
  ["Casa Verde Trattoria", "Italian"],
  ["Hearth & Sourdough", "Bakery"],
  ["Third Rail Coffee", "Cafe"],
  ["Sultan's Table", "Middle Eastern"],
  ["Lucky Duck Noodles", "Vietnamese"],
  ["Ember Yakitori", "Japanese"],
  ["Plot 7 Greengrocer Cafe", "Vegetarian"],
  ["Bodega del Mar", "Spanish"],
  ["Northbridge Chophouse", "Steakhouse"],
  ["Mama Rosa Pizzeria", "Pizza"],
  ["Saffron & Salt", "Persian"],
  ["Little Seoul BBQ", "Korean"],
  ["The Tin Kettle", "Brunch"],
];

/**
 * Deterministic fixtures scattered around whatever midpoint we were given, so
 * demo mode works anywhere on earth and looks the same on both participants'
 * screens (they must agree — it is one shared session).
 */
function demoPlaces(
  centre: LatLng,
  radius: number,
  originA: LatLng,
  originB: LatLng,
): Place[] {
  const seed = Math.abs(Math.round(centre.lat * 1e4) ^ Math.round(centre.lng * 1e4));
  const rand = mulberry32(seed);
  const metresPerDegLat = 111_320;
  const metresPerDegLng = 111_320 * Math.max(0.1, Math.cos((centre.lat * Math.PI) / 180));

  return DEMO_NAMES.map(([name, category], index) => {
    const angle = rand() * Math.PI * 2;
    // sqrt keeps the scatter even across the disc instead of clustering centrally.
    const distance = Math.sqrt(rand()) * radius;
    const location = {
      lat: centre.lat + (Math.sin(angle) * distance) / metresPerDegLat,
      lng: centre.lng + (Math.cos(angle) * distance) / metresPerDegLng,
    };

    const rating = Math.round((3.4 + rand() * 1.6) * 10) / 10;
    const reviewCount = Math.round(20 + rand() ** 2 * 1800);
    const distanceFromMidpoint = haversine(centre, location);
    const distanceFromA = haversine(originA, location);
    const distanceFromB = haversine(originB, location);

    return {
      id: `demo-${index}`,
      name,
      category,
      rating,
      reviewCount,
      priceLevel: 1 + Math.floor(rand() * 3),
      openNow: rand() > 0.25,
      address: null,
      location,
      distanceFromMidpoint,
      distanceFromA,
      distanceFromB,
      fairnessGap: Math.abs(distanceFromA - distanceFromB),
      photoUrl: null,
      attributions: [],
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`,
      score: score({ rating, reviewCount, distanceFromMidpoint, radius }),
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Demo-mode geocoder. Understands "lat,lng" so the flow can be driven
 * precisely, and otherwise hashes the text to a stable point near London —
 * enough to exercise the midpoint maths without a Google key.
 */
function demoGeocode(query: string): GeocodeResult | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const pair = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (pair) {
    const lat = Number(pair[1]);
    const lng = Number(pair[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      const location = { lat, lng };
      return { location, label: demoAreaLabel(location) };
    }
  }

  let hash = 0;
  for (const char of trimmed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const rand = mulberry32(Math.abs(hash));
  const location = {
    lat: 51.5074 + (rand() - 0.5) * 0.18,
    lng: -0.1278 + (rand() - 0.5) * 0.3,
  };
  return { location, label: `${trimmed.slice(0, 40)} (demo)` };
}

function demoAreaLabel(point: LatLng): string {
  const coarse = coarsen(point);
  const ns = coarse.lat >= 0 ? "N" : "S";
  const ew = coarse.lng >= 0 ? "E" : "W";
  return `${Math.abs(coarse.lat).toFixed(2)}°${ns} ${Math.abs(coarse.lng).toFixed(2)}°${ew}`;
}

/** Small deterministic PRNG, so demo fixtures are stable per midpoint. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

import { NextResponse, type NextRequest } from "next/server";

import { seatCookieName } from "@/lib/cookies";
import { coarsen } from "@/lib/geo";
import { geocode, reverseGeocode } from "@/lib/places";
import { buildView, expiredView } from "@/lib/session-view";
import { getStore, seatFor } from "@/lib/store";

export const dynamic = "force-dynamic";

interface Body {
  /** Typed address. Mutually exclusive with lat/lng. */
  query?: string;
  /** Browser geolocation result (FR-2.2). */
  lat?: number;
  lng?: number;
}

/** Set (or change — FR-2.4) the caller's starting location. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const store = getStore();

  const session = await store.get(slug);
  if (!session) {
    return NextResponse.json(expiredView(slug), { status: 404 });
  }

  const seat = seatFor(session, request.cookies.get(seatCookieName(slug))?.value);
  if (!seat) {
    return NextResponse.json(
      { error: "This session already has two people in it." },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  let updated = null;

  try {
    if (typeof body.lat === "number" && typeof body.lng === "number") {
      if (!Number.isFinite(body.lat) || Math.abs(body.lat) > 90) {
        return NextResponse.json({ error: "That latitude is not valid." }, { status: 400 });
      }
      if (!Number.isFinite(body.lng) || Math.abs(body.lng) > 180) {
        return NextResponse.json({ error: "That longitude is not valid." }, { status: 400 });
      }
      // Coarsened before storage — we never hold a precise position (PR-4).
      const point = coarsen({ lat: body.lat, lng: body.lng });
      updated = await store.setLocation(slug, seat, point, await reverseGeocode(point));
    } else if (typeof body.query === "string" && body.query.trim()) {
      const resolved = await geocode(body.query.trim());
      if (!resolved) {
        // FR-2.6 — a dead end is a bug; say what to do instead.
        return NextResponse.json(
          { error: "We could not find that address. Try adding a city or postcode." },
          { status: 422 },
        );
      }
      updated = await store.setLocation(slug, seat, coarsen(resolved.location), resolved.label);
    } else {
      return NextResponse.json(
        { error: "Send either an address or a latitude and longitude." },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("[where2eat] location lookup failed:", error);
    return NextResponse.json(
      { error: "Looking up that location failed. Try again in a moment." },
      { status: 502 },
    );
  }

  if (!updated) {
    return NextResponse.json(expiredView(slug), { status: 404 });
  }

  return NextResponse.json(await buildView(updated, seat));
}

import { NextResponse } from "next/server";

import { isDemoMode } from "@/lib/places";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Confirms how a deployment is actually configured, without leaking key values.
 * Useful right after deploying: `storage` should read "upstash-redis" in
 * production, and "file" only ever locally.
 */
export async function GET() {
  let storage: string;
  try {
    storage = getStore().kind;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        storage: "unconfigured",
        error: error instanceof Error ? error.message : "Storage is not configured.",
      },
      { status: 503 },
    );
  }

  const placesConfigured = !isDemoMode();
  const mapConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim());

  // "file" holds state in one process, so it cannot back a multi-instance
  // deployment — that distinction is the whole point of this endpoint.
  const shared = storage !== "file";

  return NextResponse.json({
    ok: shared || !process.env.VERCEL,
    storage,
    shared,
    places: placesConfigured ? "google" : "demo-fixtures",
    map: mapConfigured ? "google" : "schematic-fallback",
    // A real map key with fixture data would plot invented restaurants on a
    // genuine Google map, which reads as real. Worth flagging loudly.
    warning:
      mapConfigured && !placesConfigured
        ? "Map key is set but Places is not: the map would show demo restaurants as if real."
        : undefined,
  });
}

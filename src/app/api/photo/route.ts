import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Proxies Google Place photos so the server key never reaches the browser.
 *
 * The `name` parameter is validated against the exact shape Google issues
 * (`places/<id>/photos/<ref>`) rather than passed through, so this cannot be
 * used to fetch arbitrary URLs.
 */
export async function GET(request: NextRequest) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY?.trim();
  if (!key) return new NextResponse("Photos unavailable", { status: 404 });

  const name = request.nextUrl.searchParams.get("name");
  if (!name || !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name)) {
    return new NextResponse("Bad photo reference", { status: 400 });
  }

  const upstream = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxHeightPx=400&maxWidthPx=600&key=${key}`,
    { cache: "no-store" },
  );

  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Photo unavailable", { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      // Google's terms allow caching the media itself; keep it short anyway.
      "Cache-Control": "public, max-age=3600",
    },
  });
}

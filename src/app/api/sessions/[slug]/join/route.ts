import { NextResponse, type NextRequest } from "next/server";

import { seatCookieName, setSeatCookie } from "@/lib/cookies";
import { buildView, expiredView } from "@/lib/session-view";
import { getStore, seatFor } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Take the free seat, if there is one. Callers who arrive after both seats are
 * filled get the same view without a seat — spectators (FR-1.4, FR-8.2).
 */
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

  const existing = seatFor(session, request.cookies.get(seatCookieName(slug))?.value);
  if (existing) {
    return NextResponse.json(await buildView(session, existing));
  }

  const claimed = await store.join(slug);
  if (!claimed) {
    return NextResponse.json(await buildView(session, null));
  }

  const response = NextResponse.json(
    await buildView(claimed.session, seatFor(claimed.session, claimed.token)),
  );
  setSeatCookie(response, slug, claimed.token);
  return response;
}

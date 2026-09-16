import { NextResponse, type NextRequest } from "next/server";

import { seatCookieName, setSeatCookie } from "@/lib/cookies";
import { buildView, expiredView } from "@/lib/session-view";
import { store } from "@/lib/store";

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
  const session = store.get(slug);
  if (!session) {
    return NextResponse.json(expiredView(slug), { status: 404 });
  }

  const existing = store.seatFor(session, request.cookies.get(seatCookieName(slug))?.value);
  if (existing) {
    return NextResponse.json(await buildView(session, existing));
  }

  const token = store.join(session);
  const view = await buildView(session, token ? store.seatFor(session, token) : null);
  const response = NextResponse.json(view);
  if (token) setSeatCookie(response, slug, token);
  return response;
}
